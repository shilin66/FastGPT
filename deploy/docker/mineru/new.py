import json
import os
import uuid
import asyncio
from glob import glob
import tempfile
import shutil
import re
import imghdr
import uvicorn
import base64
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException, UploadFile, BackgroundTasks
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from mineru.cli.common import aio_do_parse, read_fn, pdf_suffixes, image_suffixes
from mineru.utils.cli_parser import arg_parse
from mineru.utils.enum_class import MakeMode
from mineru.version import __version__

# Global configuration
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
SUPPORTED_EXTENSIONS = pdf_suffixes + image_suffixes
CLEANUP_DELAY = 60  # 1 minute delay for cleanup (reduced to prevent resource buildup)

# Runtime mode configuration - only one mode can be active at a time
RUNTIME_MODE = os.environ.get("MINERU_MODE", "pipeline").lower()  # pipeline or vlm
SERVER_URL = os.environ.get("MINERU_SERVER_URL", None)  # For VLM client mode
VLM_BACKEND = os.environ.get("MINERU_VLM_BACKEND", "vlm-sglang-engine")  # Default VLM backend

# Backend configurations
PIPELINE_BACKENDS = ["pipeline"]
VLM_BACKENDS = ["vlm-transformers", "vlm-sglang-engine", "vlm-sglang-client"]

# Determine active backends based on runtime mode
if RUNTIME_MODE == "pipeline":
    ACTIVE_BACKENDS = PIPELINE_BACKENDS
    DEFAULT_BACKEND = "pipeline"
    logger.info("Running in PIPELINE mode")
elif RUNTIME_MODE == "vlm":
    ACTIVE_BACKENDS = [VLM_BACKEND] if VLM_BACKEND in VLM_BACKENDS else ["vlm-sglang-engine"]
    DEFAULT_BACKEND = ACTIVE_BACKENDS[0]
    logger.info(f"Running in VLM mode with backend: {DEFAULT_BACKEND}")
else:
    # Fallback to pipeline mode
    RUNTIME_MODE = "pipeline"
    ACTIVE_BACKENDS = PIPELINE_BACKENDS
    DEFAULT_BACKEND = "pipeline"
    logger.warning(f"Unknown mode '{RUNTIME_MODE}', falling back to pipeline mode")

ALL_BACKENDS = PIPELINE_BACKENDS + VLM_BACKENDS  # Keep for reference

# Backend-specific settings
BACKEND_CONFIGS = {
    "pipeline": {
        "supports_parse_method": True,
        "supports_formula_table": True,
        "default_parse_method": "auto",
        "result_subdir": lambda method: method,
        "model_output_suffix": "_model.json",
        "supports_ocr_lang": True,
    },
    "vlm-transformers": {
        "supports_parse_method": False,
        "supports_formula_table": False,
        "default_parse_method": "vlm",
        "result_subdir": lambda method: "vlm",
        "model_output_suffix": "_model_output.txt",
        "supports_ocr_lang": False,
        "requires_gpu": True,
    },
    "vlm-sglang-engine": {
        "supports_parse_method": False,
        "supports_formula_table": False,
        "default_parse_method": "vlm",
        "result_subdir": lambda method: "vlm",
        "model_output_suffix": "_model_output.txt",
        "supports_ocr_lang": False,
        "requires_gpu": True,
        "supports_server_params": True,
    },
    "vlm-sglang-client": {
        "supports_parse_method": False,
        "supports_formula_table": False,
        "default_parse_method": "vlm",
        "result_subdir": lambda method: "vlm",
        "model_output_suffix": "_model_output.txt",
        "supports_ocr_lang": False,
        "requires_server_url": True,
        "supports_server_params": True,
    }
}

# Global connection tracking
active_connections = set()
connection_lock = asyncio.Lock()

# Create FastAPI app with proper lifecycle management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting MinerU FastAPI server")

    # Start background cleanup task
    cleanup_task = asyncio.create_task(periodic_cleanup())

    try:
        yield
    finally:
        # Shutdown
        logger.info("Shutting down MinerU FastAPI server")

        # Cancel cleanup task
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass

        # Force close any remaining connections
        async with connection_lock:
            for conn in active_connections.copy():
                try:
                    await conn.close()
                except:
                    pass
            active_connections.clear()

        # Force garbage collection
        import gc
        gc.collect()

async def periodic_cleanup():
    """Periodic cleanup of resources and connections"""
    while True:
        try:
            await asyncio.sleep(300)  # Run every 5 minutes

            # Force garbage collection
            import gc
            collected = gc.collect()

            # Log connection status
            try:
                async with connection_lock:
                    conn_count = len(active_connections)
                logger.info(f"Periodic cleanup: {collected} objects collected, {conn_count} active connections")
            except Exception as log_error:
                logger.error(f"Error logging connection status: {log_error}")

        except asyncio.CancelledError:
            logger.info("Periodic cleanup task cancelled")
            break
        except Exception as e:
            logger.error(f"Error in periodic cleanup: {str(e)}")
            # Continue running even if there's an error

app = FastAPI(
    title="MinerU API",
    description="Document parsing API using MinerU",
    version=__version__,
    lifespan=lifespan
)

# Connection tracking middleware
@app.middleware("http")
async def connection_tracking_middleware(request, call_next):
    """Track and manage HTTP connections"""
    connection_id = uuid.uuid4().hex[:8]

    try:
        # Add connection to tracking
        async with connection_lock:
            active_connections.add(connection_id)

        # Process request
        response = await call_next(request)

        # Ensure response is properly closed to prevent CLOSE_WAIT
        if hasattr(response, 'headers'):
            response.headers["Connection"] = "close"
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"

        return response

    except Exception as e:
        logger.error(f"Connection {connection_id} error: {str(e)}")
        raise
    finally:
        # Always remove connection from tracking
        try:
            async with connection_lock:
                active_connections.discard(connection_id)
        except Exception as cleanup_error:
            logger.error(f"Error removing connection {connection_id}: {cleanup_error}")

# Add middleware for better performance and security
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure as needed for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Enhanced health check endpoint"""
    try:
        # Check if temp directory can be created
        test_dir = tempfile.mkdtemp(prefix="health_check_")
        safe_cleanup_directory(test_dir)

        health_info = {
            "status": "healthy",
            "version": __version__,
            "runtime_mode": RUNTIME_MODE,
            "active_backends": ACTIVE_BACKENDS,
            "default_backend": DEFAULT_BACKEND,
            "max_file_size_mb": MAX_FILE_SIZE / (1024*1024),
            "supported_extensions": SUPPORTED_EXTENSIONS
        }

        # Add VLM-specific health info
        if RUNTIME_MODE == "vlm":
            health_info["vlm_backend"] = DEFAULT_BACKEND
            if SERVER_URL:
                health_info["server_url"] = SERVER_URL
                health_info["server_configured"] = True
            else:
                health_info["server_configured"] = False
                if DEFAULT_BACKEND == "vlm-sglang-client":
                    health_info["warning"] = "VLM client mode requires server_url"

        return health_info

    except Exception as e:
        return JSONResponse(
            content={
                "status": "unhealthy",
                "error": str(e),
                "version": __version__,
                "runtime_mode": RUNTIME_MODE
            },
            status_code=503
        )

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "MinerU Document Parsing API - Unified Interface",
        "version": __version__,
        "runtime_mode": RUNTIME_MODE,
        "active_backends": ACTIVE_BACKENDS,
        "default_backend": DEFAULT_BACKEND,
        "parse_endpoint": "/v2/parse/file",
        "docs": "/docs",
        "health": "/health",
        "features": {
            "unified_interface": True,
            "no_concurrency_limits": True,
            "supports_all_backends": True,
            "supports_all_file_types": SUPPORTED_EXTENSIONS
        },
        "mode_info": {
            "current_mode": RUNTIME_MODE,
            "description": "Pipeline OCR-based processing" if RUNTIME_MODE == "pipeline" else f"VLM-based processing using {DEFAULT_BACKEND}",
            "available_backends": ACTIVE_BACKENDS,
            "environment_variables": {
                "MINERU_MODE": "Set to 'pipeline' or 'vlm' to choose processing mode",
                "MINERU_VLM_BACKEND": "Choose VLM backend (vlm-transformers, vlm-sglang-engine, vlm-sglang-client)",
                "MINERU_SERVER_URL": "Server URL for VLM client mode (e.g., http://127.0.0.1:30000)"
            }
        }
    }

@app.get("/backends")
async def get_backends():
    """Get detailed backend information"""
    return {
        "runtime_mode": RUNTIME_MODE,
        "active_backends": ACTIVE_BACKENDS,
        "default_backend": DEFAULT_BACKEND,
        "all_backends": ALL_BACKENDS,
        "pipeline_backends": PIPELINE_BACKENDS,
        "vlm_backends": VLM_BACKENDS,
        "backend_configs": {k: v for k, v in BACKEND_CONFIGS.items() if k in ACTIVE_BACKENDS},
        "inactive_backends": [b for b in ALL_BACKENDS if b not in ACTIVE_BACKENDS],
        "server_url": SERVER_URL if RUNTIME_MODE == "vlm" else None
    }

@app.get("/backends/{backend}/config")
async def get_backend_config(backend: str):
    """Get configuration details for a specific backend"""
    if backend not in ALL_BACKENDS:
        return JSONResponse(
            status_code=404,
            content={"error": f"Backend '{backend}' not found. All backends: {ALL_BACKENDS}"}
        )

    if backend not in ACTIVE_BACKENDS:
        return JSONResponse(
            status_code=400,
            content={
                "error": f"Backend '{backend}' not available in {RUNTIME_MODE} mode",
                "active_backends": ACTIVE_BACKENDS,
                "runtime_mode": RUNTIME_MODE,
                "note": f"To use '{backend}', restart server with appropriate MINERU_MODE environment variable"
            }
        )

    config = BACKEND_CONFIGS[backend]

    # Build parameter recommendations
    recommended_params = {
        "required": [],
        "optional": [],
        "not_supported": []
    }

    # Common parameters
    common_params = ["start_page_id", "end_page_id", "tp_size", "dp_size", "enable_torch_compile"]
    recommended_params["optional"].extend(common_params)

    # Backend-specific parameters
    if config.get("requires_server_url"):
        recommended_params["required"].append("server_url")
    elif "server_url" not in recommended_params["required"]:
        recommended_params["optional"].append("server_url")

    if config.get("supports_parse_method"):
        recommended_params["optional"].append("parse_method")
        recommended_params["parse_methods"] = ["auto", "txt", "ocr"]
    else:
        recommended_params["not_supported"].append("parse_method")
        recommended_params["fixed_parse_method"] = config["default_parse_method"]

    if config.get("supports_formula_table"):
        recommended_params["optional"].extend(["formula_enable", "table_enable"])
    else:
        recommended_params["not_supported"].extend(["formula_enable", "table_enable"])

    if config.get("supports_ocr_lang"):
        recommended_params["optional"].append("lang")
        recommended_params["supported_languages"] = ["ch", "en", "korean", "japan", "chinese_cht", "ta", "te", "ka"]
    else:
        recommended_params["not_supported"].append("lang")

    if config.get("supports_server_params"):
        vlm_params = ["temperature", "top_p", "top_k", "repetition_penalty",
                      "presence_penalty", "no_repeat_ngram_size", "max_new_tokens"]
        recommended_params["optional"].extend(vlm_params)
    else:
        vlm_params = ["temperature", "top_p", "top_k", "repetition_penalty",
                      "presence_penalty", "no_repeat_ngram_size", "max_new_tokens"]
        recommended_params["not_supported"].extend(vlm_params)

    return {
        "backend": backend,
        "config": config,
        "parameters": recommended_params,
        "example_usage": {
            "basic": f"POST /v2/parse/file with backend={backend}",
            "with_params": get_example_params(backend, config)
        }
    }

def get_example_params(backend: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """Generate example parameters for a backend"""
    example = {"backend": backend}

    if config.get("supports_parse_method"):
        example["parse_method"] = "auto"

    if config.get("supports_formula_table"):
        example["formula_enable"] = True
        example["table_enable"] = True

    if config.get("supports_ocr_lang"):
        example["lang"] = "ch"

    if config.get("requires_server_url"):
        example["server_url"] = "http://127.0.0.1:30000"

    if config.get("supports_server_params"):
        example.update({
            "temperature": 0.0001,
            "top_p": 0.8,
            "max_new_tokens": 8192
        })

    return example

def encode_image(image_path: str) -> Optional[str]:
    """Encode image using base64 with error handling"""
    try:
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except Exception as e:
        logger.error(f"Failed to encode image {image_path}: {str(e)}")
        return None

def get_infer_result(file_suffix_identifier: str, pdf_name: str, parse_dir: str) -> Optional[str]:
    """Read inference result from result file with error handling"""
    try:
        result_file_path = os.path.join(parse_dir, f"{pdf_name}{file_suffix_identifier}")
        if os.path.exists(result_file_path):
            with open(result_file_path, "r", encoding="utf-8") as fp:
                return fp.read()
    except Exception as e:
        logger.error(f"Failed to read result file {result_file_path}: {str(e)}")
    return None

async def delayed_cleanup(directory_path: str, delay: int = CLEANUP_DELAY):
    """Delayed cleanup of directory to allow for any pending operations"""
    try:
        await asyncio.sleep(delay)
        safe_cleanup_directory(directory_path)
    except Exception as e:
        logger.error(f"Error in delayed cleanup: {str(e)}")
    finally:
        # Force garbage collection to free memory
        import gc
        gc.collect()

async def immediate_cleanup(directory_path: str):
    """Immediate cleanup for error cases"""
    try:
        safe_cleanup_directory(directory_path)
    except Exception as e:
        logger.error(f"Error in immediate cleanup: {str(e)}")
    finally:
        import gc
        gc.collect()

def safe_cleanup_directory(directory_path: str) -> bool:
    """Safely clean up directory with proper error handling"""
    if not os.path.exists(directory_path):
        return True

    try:
        logger.debug(f"Cleaning up directory: {directory_path}")
        shutil.rmtree(directory_path)
        logger.debug("Directory cleaned up successfully")
        return True
    except Exception as e:
        logger.error(f"Error cleaning up directory: {str(e)}")
        # Try to remove individual files if directory removal fails
        try:
            for root, dirs, files in os.walk(directory_path, topdown=False):
                for name in files:
                    try:
                        file_path = os.path.join(root, name)
                        os.chmod(file_path, 0o777)  # Change permissions if needed
                        os.remove(file_path)
                    except Exception as file_error:
                        logger.error(f"Failed to remove file {name}: {str(file_error)}")
                for name in dirs:
                    try:
                        dir_path = os.path.join(root, name)
                        os.chmod(dir_path, 0o777)  # Change permissions if needed
                        os.rmdir(dir_path)
                    except Exception as dir_error:
                        logger.error(f"Failed to remove directory {name}: {str(dir_error)}")
            return True
        except Exception as cleanup_error:
            logger.error(f"Failed to cleanup individual files: {str(cleanup_error)}")
            return False

def validate_file_size(file_content: bytes) -> bool:
    """Validate file size"""
    return len(file_content) <= MAX_FILE_SIZE

def get_file_info(file: UploadFile) -> Dict[str, Any]:
    """Extract file information"""
    file_path = Path(file.filename)
    return {
        "filename": file.filename,
        "stem": file_path.stem,
        "suffix": file_path.suffix.lower(),
        "size": file.size if hasattr(file, 'size') else 0
    }

def validate_backend_config(backend: str, parse_method: str, server_url: Optional[str]) -> Dict[str, Any]:
    """Validate backend configuration and return adjusted parameters"""
    # Check if backend is available in current runtime mode
    if backend not in ACTIVE_BACKENDS:
        if backend in ALL_BACKENDS:
            # Backend exists but not active in current mode
            raise ValueError(f"Backend '{backend}' not available in {RUNTIME_MODE} mode. Available backends: {ACTIVE_BACKENDS}")
        else:
            # Backend doesn't exist at all
            raise ValueError(f"Unknown backend: {backend}. Available backends: {ACTIVE_BACKENDS}")

    config = BACKEND_CONFIGS[backend]
    result = {"backend": backend, "config": config}

    # Adjust parse method based on backend
    if not config["supports_parse_method"]:
        result["parse_method"] = config["default_parse_method"]
        if parse_method != "auto" and parse_method != config["default_parse_method"]:
            result["warning"] = f"Parse method '{parse_method}' not supported by {backend}, using '{config['default_parse_method']}'"
    else:
        result["parse_method"] = parse_method

    # Check server URL requirement
    if config.get("requires_server_url"):
        # Use environment variable if not provided in request
        actual_server_url = server_url or SERVER_URL
        if not actual_server_url:
            raise ValueError(f"Backend '{backend}' requires server_url parameter or MINERU_SERVER_URL environment variable")
        result["server_url"] = actual_server_url

    return result

def get_result_directory(output_dir: str, file_name: str, backend: str, parse_method: str) -> str:
    """Get the result directory path based on backend type"""
    config = BACKEND_CONFIGS[backend]
    subdir = config["result_subdir"](parse_method)
    return os.path.join(output_dir, file_name, subdir)

def get_model_output_suffix(backend: str) -> str:
    """Get the model output file suffix based on backend"""
    return BACKEND_CONFIGS[backend]["model_output_suffix"]

def prepare_backend_params(backend: str, **kwargs) -> Dict[str, Any]:
    """Prepare parameters specific to backend type"""
    config = BACKEND_CONFIGS[backend]
    params = {}

    # Common parameters
    common_params = [
        "start_page_id", "end_page_id", "tp_size", "dp_size",
        "enable_torch_compile", "server_url", "mem_fraction_static",
    ]

    for param in common_params:
        if param in kwargs:
            params[param] = kwargs[param]

    # Backend-specific parameters
    if backend in VLM_BACKENDS and config.get("supports_server_params"):
        # VLM backends support additional generation parameters
        vlm_params = [
            "temperature", "top_p", "top_k", "repetition_penalty",
            "presence_penalty", "no_repeat_ngram_size", "max_new_tokens"
        ]
        for param in vlm_params:
            if param in kwargs:
                params[param] = kwargs[param]

    # Pipeline-specific parameters
    if backend in PIPELINE_BACKENDS:
        if config["supports_formula_table"]:
            params["formula_enable"] = kwargs.get("formula_enable", True)
            params["table_enable"] = kwargs.get("table_enable", True)

    return params


def get_mime_type(image_path):
    """Dynamically detect image MIME type"""
    img_type = imghdr.what(image_path)
    return f"image/{img_type}" if img_type else "application/octet-stream"

@app.post(
    "/v2/parse/file",
    tags=["projects"],
    summary="Parse files using new API interface",
)
async def file_parse(
        background_tasks: BackgroundTasks,
        file: UploadFile,
        backend: str = DEFAULT_BACKEND,
        parse_method: str = "auto",
        lang: str = "ch",
        formula_enable: bool = True,
        table_enable: bool = True,
        return_md: bool = True,
        return_middle_json: bool = False,
        return_model_output: bool = False,
        return_content_list: bool = True,
        return_images: bool = True,
        start_page_id: int = 0,
        tp_size: int = 1,
        dp_size: int = 2,
        enable_torch_compile: bool = True,
        end_page_id: int = 99999,
        server_url: Optional[str] = None,
        temperature: float = 0.0001,
        top_p: float = 0.8,
        top_k: int = 20,
        mem_fraction_static: float= 0.3,
        repetition_penalty: float = 1.05,
        presence_penalty: float = 0.0,
        no_repeat_ngram_size: int = 100,
        max_new_tokens: int = 8192,
):
    """
    Unified document parsing interface with enhanced robustness and resource management.
    Supports all document types and backends without concurrency restrictions.
    """
    temp_dir = None
    request_id = uuid.uuid4().hex[:8]

    try:
        # Get file information
        file_info = get_file_info(file)
        logger.info(f"[{request_id}] Processing file: {file_info['filename']} with backend: {backend}")

        # Validate backend configuration
        try:
            backend_validation = validate_backend_config(backend, parse_method, server_url)
            actual_backend = backend_validation["backend"]
            actual_parse_method = backend_validation["parse_method"]
            backend_config = backend_validation["config"]

            if "warning" in backend_validation:
                logger.warning(f"[{request_id}] {backend_validation['warning']}")

        except ValueError as e:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": str(e)}
            )

        # Validate file type
        if file_info['suffix'] not in SUPPORTED_EXTENSIONS:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": f"Unsupported file type: {file_info['suffix']}. Supported: {SUPPORTED_EXTENSIONS}"
                }
            )

        # Read file content
        file_content = await file.read()

        # Validate file size
        if not validate_file_size(file_content):
            return JSONResponse(
                status_code=413,
                content={
                    "success": False,
                    "error": f"File too large. Maximum size: {MAX_FILE_SIZE / (1024*1024):.1f}MB"
                }
            )

        # Create unique temp directory
        temp_dir = tempfile.mkdtemp(prefix=f"mineru_{actual_backend}_{request_id}_")
        logger.info(f"[{request_id}] Created temp directory: {temp_dir}")

        # Save uploaded file with explicit file handle management
        temp_file = os.path.join(temp_dir, file_info['filename'])
        try:
            with open(temp_file, "wb") as f:
                f.write(file_content)
                f.flush()  # Ensure data is written
                os.fsync(f.fileno())  # Force write to disk
        except Exception as e:
            logger.error(f"[{request_id}] Failed to save file: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

        logger.info(f"[{request_id}] Saved {len(file_content)} bytes to {temp_file}")

        # Clear file content from memory immediately
        del file_content

        # Process file using aio_do_parse
        try:
            pdf_bytes = read_fn(temp_file)
        except Exception as e:
            logger.error(f"[{request_id}] Failed to read file: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

        # Create output directory
        output_dir = os.path.join(temp_dir, "output")

        # Use server URL from validation result if available
        actual_server_url = backend_validation.get("server_url", server_url)

        # Prepare backend-specific parameters
        backend_params = prepare_backend_params(
            actual_backend,
            start_page_id=start_page_id,
            end_page_id=end_page_id,
            tp_size=tp_size,
            dp_size=dp_size,
            enable_torch_compile=enable_torch_compile,
            server_url=actual_server_url,
            formula_enable=formula_enable,
            table_enable=table_enable,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            repetition_penalty=repetition_penalty,
            presence_penalty=presence_penalty,
            no_repeat_ngram_size=no_repeat_ngram_size,
            mem_fraction_static=mem_fraction_static,
            max_new_tokens=max_new_tokens,
        )

        # Adjust language parameter for backend compatibility
        actual_lang = lang if backend_config.get("supports_ocr_lang", True) else "ch"

        # Parse document
        logger.info(f"[{request_id}] Starting document parsing with backend: {actual_backend}, method: {actual_parse_method}")
        await aio_do_parse(
            output_dir=output_dir,
            pdf_file_names=[file_info['stem']],
            pdf_bytes_list=[pdf_bytes],
            p_lang_list=[actual_lang],
            backend=actual_backend,
            parse_method=actual_parse_method,
            f_draw_layout_bbox=False,
            f_draw_span_bbox=False,
            f_dump_md=return_md,
            f_dump_middle_json=return_middle_json,
            f_dump_model_output=return_model_output,
            f_dump_orig_pdf=False,
            f_dump_content_list=return_content_list,
            **backend_params
        )
        logger.info(f"[{request_id}] Document parsing completed")

        # Get result directory using backend-aware function
        result_dir = get_result_directory(output_dir, file_info['stem'], actual_backend, actual_parse_method)

        if not os.path.exists(result_dir):
            raise FileNotFoundError(f"Result directory not found: {result_dir}")

        # Build response data efficiently
        response_data = {
            "success": True,
            "backend": actual_backend,
            "parse_method": actual_parse_method,
            "version": __version__,
            "filename": file_info['filename'],
            "request_id": request_id,
        }

        # Add backend-specific information
        if "warning" in backend_validation:
            response_data["warning"] = backend_validation["warning"]

        # Get markdown content
        if return_md:
            md_content = get_infer_result(".md", file_info['stem'], result_dir)
            if md_content:
                response_data["markdown"] = md_content

        # Get other requested outputs
        if return_middle_json:
            middle_json = get_infer_result("_middle.json", file_info['stem'], result_dir)
            if middle_json:
                response_data["middle_json"] = middle_json

        if return_model_output:
            model_suffix = get_model_output_suffix(actual_backend)
            model_output = get_infer_result(model_suffix, file_info['stem'], result_dir)
            if model_output:
                response_data["model_output"] = model_output

        if return_content_list:
            content_list = get_infer_result("_content_list.json", file_info['stem'], result_dir)
            if content_list:
                response_data["content_list"] = content_list
                # Extract page count safely
                try:
                    content_data = json.loads(content_list)
                    if content_data and isinstance(content_data, list):
                        response_data["pages"] = content_data[-1].get('page_idx', 0) + 1
                    else:
                        response_data["pages"] = 0
                except (json.JSONDecodeError, KeyError, IndexError) as e:
                    logger.warning(f"[{request_id}] Failed to extract page count: {str(e)}")
                    response_data["pages"] = 0

        # Get images efficiently
        if return_images:
            image_dir = os.path.join(result_dir, "images")
            if os.path.exists(image_dir):
                try:
                    # Support multiple image formats
                    image_patterns = ["*.jpg", "*.jpeg", "*.png", "*.bmp"]
                    image_paths = []
                    for pattern in image_patterns:
                        image_paths.extend(glob(f"{image_dir}/{pattern}"))

                    images_data = {}
                    for image_path in image_paths:
                        filename = os.path.basename(image_path)
                        base64_str = encode_image(image_path)
                        if base64_str:  # Only add if encoding succeeded
                            mime_type = get_mime_type(image_path)
                            images_data[filename] = f"data:{mime_type};base64,{base64_str}"

                    if images_data:
                        response_data["images"] = images_data

                        # Replace image paths in markdown if present
                        if "markdown" in response_data:
                            def replace_image(match):
                                original_path = match.group(1)
                                filename = original_path.split('/')[-1]
                                return f'![{filename}]({images_data[filename]})' if filename in images_data else match.group(0)

                            pattern = re.compile(r'!\[\]\((images/.*?)\)')
                            response_data["markdown"] = pattern.sub(replace_image, response_data["markdown"])

                except Exception as e:
                    logger.error(f"[{request_id}] Error processing images: {str(e)}")
                    # Continue without images rather than failing

        # Schedule delayed cleanup
        background_tasks.add_task(delayed_cleanup, temp_dir)
        logger.info(f"[{request_id}] Processing completed successfully")

        return JSONResponse(content=response_data, status_code=200)

    except HTTPException:
        # Re-raise HTTP exceptions
        if temp_dir:
            await immediate_cleanup(temp_dir)
        raise
    except Exception as e:
        logger.exception(f"[{request_id}] Error processing file {file.filename}: {str(e)}")
        if temp_dir:
            await immediate_cleanup(temp_dir)
        return JSONResponse(
            content={
                "success": False,
                "error": f"Failed to process file: {str(e)}",
                "request_id": request_id
            },
            status_code=500
        )



@app.get("/metrics")
async def get_metrics():
    """Basic metrics endpoint"""
    try:
        import psutil
        async with connection_lock:
            active_conn_count = len(active_connections)

        return {
            "cpu_percent": psutil.cpu_percent(),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_usage": psutil.disk_usage('/').percent,
            "active_connections": active_conn_count,
            "version": __version__,
            "max_file_size_mb": MAX_FILE_SIZE / (1024*1024),
            "supported_extensions": SUPPORTED_EXTENSIONS
        }
    except ImportError:
        async with connection_lock:
            active_conn_count = len(active_connections)

        return {
            "active_connections": active_conn_count,
            "version": __version__,
            "max_file_size_mb": MAX_FILE_SIZE / (1024*1024),
            "supported_extensions": SUPPORTED_EXTENSIONS,
            "note": "Install psutil for system metrics"
        }

@app.post("/admin/cleanup")
async def force_cleanup():
    """Force cleanup of resources (admin endpoint)"""
    try:
        # Force garbage collection
        import gc
        gc.collect()

        # Get connection count
        async with connection_lock:
            conn_count = len(active_connections)

        return {
            "success": True,
            "message": "Cleanup completed",
            "active_connections": conn_count
        }
    except Exception as e:
        return JSONResponse(
            content={"success": False, "error": str(e)},
            status_code=500
        )

@app.get("/mode/switch")
async def get_mode_switch_info():
    """Get information about switching modes"""
    return {
        "current_mode": RUNTIME_MODE,
        "active_backends": ACTIVE_BACKENDS,
        "switch_instructions": {
            "to_pipeline": {
                "command": "MINERU_MODE=pipeline python mineru.py",
                "description": "Switch to traditional OCR-based processing",
                "features": ["formula", "table", "multiple_parse_methods", "ocr_languages"]
            },
            "to_vlm": {
                "command": "MINERU_MODE=vlm MINERU_VLM_BACKEND=vlm-sglang-engine python mineru.py",
                "description": "Switch to VLM-based processing",
                "features": ["advanced_reasoning", "complex_layouts", "generation_parameters"],
                "backends": VLM_BACKENDS,
                "note": "May require GPU and/or server URL"
            }
        },
        "environment_variables": {
            "MINERU_MODE": {
                "description": "Set processing mode",
                "values": ["pipeline", "vlm"],
                "current": RUNTIME_MODE
            },
            "MINERU_VLM_BACKEND": {
                "description": "Choose VLM backend when in VLM mode",
                "values": VLM_BACKENDS,
                "current": VLM_BACKEND if RUNTIME_MODE == "vlm" else None
            },
            "MINERU_SERVER_URL": {
                "description": "Server URL for VLM client mode",
                "example": "http://127.0.0.1:30000",
                "current": SERVER_URL
            }
        }
    }

if __name__ == "__main__":
    # Configure logging
    logger.remove()  # Remove default handler
    logger.add(
        lambda msg: print(msg, end=""),
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level="INFO"
    )

    # Display startup configuration
    logger.info("=" * 60)
    logger.info("MinerU FastAPI Server Starting")
    logger.info("=" * 60)
    logger.info(f"Runtime Mode: {RUNTIME_MODE.upper()}")
    logger.info(f"Active Backends: {ACTIVE_BACKENDS}")
    logger.info(f"Default Backend: {DEFAULT_BACKEND}")

    if RUNTIME_MODE == "vlm":
        logger.info(f"VLM Backend: {VLM_BACKEND}")
        if SERVER_URL:
            logger.info(f"Server URL: {SERVER_URL}")
        else:
            logger.warning("No server URL configured (MINERU_SERVER_URL)")
            if DEFAULT_BACKEND == "vlm-sglang-client":
                logger.error("VLM client mode requires server URL!")

    logger.info(f"CUDA_VISIBLE_DEVICES: {os.environ.get('CUDA_VISIBLE_DEVICES', 'Not set')}")
    logger.info(f"Max file size: {MAX_FILE_SIZE / (1024*1024):.1f}MB")
    logger.info(f"Supported extensions: {SUPPORTED_EXTENSIONS}")
    logger.info("=" * 60)
    logger.info("Server endpoints:")
    logger.info("  Main API: http://0.0.0.0:7434")
    logger.info("  Parse endpoint: http://0.0.0.0:7434/v2/parse/file")
    logger.info("  Documentation: http://0.0.0.0:7434/docs")
    logger.info("  Health check: http://0.0.0.0:7434/health")
    logger.info("  Backend info: http://0.0.0.0:7434/backends")
    logger.info("  Mode switch info: http://0.0.0.0:7434/mode/switch")
    logger.info("  Metrics: http://0.0.0.0:7434/metrics")
    logger.info("=" * 60)

    # Mode switching instructions
    logger.info("To switch modes:")
    logger.info("  Pipeline mode: MINERU_MODE=pipeline python mineru.py")
    logger.info("  VLM mode: MINERU_MODE=vlm MINERU_VLM_BACKEND=vlm-sglang-engine python mineru.py")
    logger.info("=" * 60)

    # Validate configuration
    config_valid = True
    if RUNTIME_MODE == "vlm":
        if DEFAULT_BACKEND == "vlm-sglang-client" and not SERVER_URL:
            logger.error("ERROR: VLM client mode requires MINERU_SERVER_URL environment variable")
            logger.error("Example: MINERU_SERVER_URL=http://127.0.0.1:30000")
            config_valid = False

        if DEFAULT_BACKEND not in VLM_BACKENDS:
            logger.error(f"ERROR: Invalid VLM backend '{DEFAULT_BACKEND}'. Valid options: {VLM_BACKENDS}")
            config_valid = False

    if not config_valid:
        logger.error("Configuration validation failed. Please fix the above errors and restart.")
        exit(1)

    logger.info("Configuration validated successfully. Starting server...")

    # System-level TCP optimization recommendations
    logger.info("For optimal connection handling, consider these system settings:")
    logger.info("  echo 1 > /proc/sys/net/ipv4/tcp_tw_reuse")
    logger.info("  echo 1 > /proc/sys/net/ipv4/tcp_fin_timeout")
    logger.info("  echo 65536 > /proc/sys/net/core/somaxconn")

    # Start server without concurrency restrictions
    server_config = {
        "host": "0.0.0.0",
        "port": 7434,
        "access_log": False,
        "use_colors": True,
        "workers": 1,
    }

    # Add optional parameters if supported (without concurrency limits)
    try:
        import inspect
        uvicorn_run_params = inspect.signature(uvicorn.run).parameters

        if "timeout_keep_alive" in uvicorn_run_params:
            server_config["timeout_keep_alive"] = 30

        if "loop" in uvicorn_run_params:
            server_config["loop"] = "asyncio"

        if "http" in uvicorn_run_params:
            server_config["http"] = "h11"

        logger.info(f"Starting server with config: {list(server_config.keys())}")
        uvicorn.run(app, **server_config)

    except Exception as e:
        # Ultimate fallback - minimal configuration
        logger.warning(f"Using minimal server configuration due to: {e}")
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=7434,
            access_log=False,
            workers=1,
        )