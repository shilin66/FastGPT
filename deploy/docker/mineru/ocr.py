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
from base64 import b64encode
import zipfile
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any, Union, List
from functools import lru_cache
from fastapi import FastAPI, HTTPException, UploadFile, BackgroundTasks, File, Form, Depends
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from starlette.background import BackgroundTask
from loguru import logger
import click
from mineru.cli.common import aio_do_parse, read_fn, pdf_suffixes, image_suffixes
from mineru.version import __version__
from mineru.utils.guess_suffix_or_lang import guess_suffix_by_path

# Global configuration
# ==========================================


# Global configuration
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
SUPPORTED_EXTENSIONS = pdf_suffixes + image_suffixes
CLEANUP_DELAY = 60  # 1 minute delay for cleanup (reduced to prevent resource buildup)

# Constants for better readability
REQUEST_ID_LENGTH = 8
TEMP_DIR_PREFIX = "mineru_"
OUTPUT_DIR_NAME = "output"
IMAGE_DIR_NAME = "images"



# Runtime mode configuration - only one mode can be active at a time
RUNTIME_MODE = os.environ.get("MINERU_MODE", "hybrid").lower()  # hybrid, pipeline or vlm
SERVER_URL = os.environ.get("MINERU_SERVER_URL", None)  # For VLM client mode
VLM_BACKEND = os.environ.get("MINERU_VLM_BACKEND", "vlm-auto-engine")  # Default VLM backend
HYBRID_BACKEND = os.environ.get("MINERU_HYBRID_BACKEND", os.environ.get("MINERU_VLM_BACKEND", "hybrid-auto-engine"))

# Backend configurations
PIPELINE_BACKENDS = ["pipeline"]
HYBRID_BACKENDS = ["hybrid-auto-engine", "hybrid-http-client"]
# VLM backends should use the "vlm-" prefix format that aio_do_parse expects
VLM_BACKENDS = ["vlm-auto-engine", "vlm-http-client", "vlm-vllm-async-engine"]

# Determine active backends based on runtime mode
if RUNTIME_MODE == "pipeline":
    ACTIVE_BACKENDS = PIPELINE_BACKENDS
    DEFAULT_BACKEND = "pipeline"
    logger.info("Running in PIPELINE mode")
elif RUNTIME_MODE == "hybrid":
    ACTIVE_BACKENDS = HYBRID_BACKENDS
    DEFAULT_BACKEND = HYBRID_BACKEND if HYBRID_BACKEND in HYBRID_BACKENDS else "hybrid-auto-engine"
    logger.info(f"Running in HYBRID mode with backend: {DEFAULT_BACKEND}")
elif RUNTIME_MODE == "vlm":
    ACTIVE_BACKENDS = VLM_BACKENDS
    DEFAULT_BACKEND = VLM_BACKEND if VLM_BACKEND in VLM_BACKENDS else "vlm-auto-engine"
    logger.info(f"Running in VLM mode with backend: {DEFAULT_BACKEND}")
else:
    # Fallback to hybrid mode as default
    RUNTIME_MODE = "hybrid"
    ACTIVE_BACKENDS = HYBRID_BACKENDS
    DEFAULT_BACKEND = "hybrid-auto-engine"
    logger.warning(f"Unknown mode '{RUNTIME_MODE}', falling back to hybrid mode")

ALL_BACKENDS = PIPELINE_BACKENDS + HYBRID_BACKENDS + VLM_BACKENDS  # Keep for reference

# Backend-specific settings
BACKEND_CONFIGS = {
    "pipeline": {
        "supports_parse_method": True,
        "supports_formula_table": True,
        "default_parse_method": "pipeline",
        "result_subdir": lambda method: method,
        "model_output_suffix": "_model.json",
        "supports_ocr_lang": True,
    },
    
    "hybrid-auto-engine": {
        "supports_parse_method": True,
        "supports_formula_table": True,
        "default_parse_method": "auto",
        "result_subdir": lambda method: f"hybrid_{method}",
        "model_output_suffix": "_model.json",
        "supports_ocr_lang": True,
    },

    "hybrid-http-client": {
        "supports_parse_method": True,
        "supports_formula_table": True,
        "default_parse_method": "auto",
        "result_subdir": lambda method: f"hybrid_{method}",
        "model_output_suffix": "_model.json",
        "supports_ocr_lang": True,
        "requires_server_url": True,
    },

    "vlm-auto-engine": {
        "supports_parse_method": True,
        "supports_formula_table": True,
        "default_parse_method": "vlm",
        "result_subdir": lambda method: "vlm",
        "model_output_suffix": "_model.json",
        "supports_ocr_lang": True,
        "requires_gpu": True,
        "supports_server_params": True,        
    },

    "vlm-http-client": {
        "supports_parse_method": True,
        "supports_formula_table": True,
        "default_parse_method": "vlm",
        "result_subdir": lambda method: "vlm",
        "model_output_suffix": "_model.json",
        "supports_ocr_lang": True,
        "requires_server_url": True,
    },

    "vlm-vllm-async-engine": {
        "supports_parse_method": True,
        "supports_formula_table": True,
        "default_parse_method": "vlm",
        "result_subdir": lambda method: "vlm",
        "model_output_suffix": "_model.json",
        "supports_ocr_lang": True,
        "requires_gpu": True,
        "supports_server_params": True,        
    }
}

# Cache commonly used values for better performance
SUPPORTED_EXTENSIONS_SET = frozenset(SUPPORTED_EXTENSIONS)
PIPELINE_BACKENDS_SET = frozenset(PIPELINE_BACKENDS)
VLM_BACKENDS_SET = frozenset(VLM_BACKENDS)

# Global connection tracking
active_connections = set()
connection_lock = asyncio.Lock()

_request_semaphore: Optional[asyncio.Semaphore] = None

async def limit_concurrency():
    if _request_semaphore is not None:
        if _request_semaphore.locked():
            raise HTTPException(
                status_code=503,
                detail=f"Server is at maximum capacity: {os.getenv('MINERU_API_MAX_CONCURRENT_REQUESTS', 'unset')}. Please try again later."
            )
        async with _request_semaphore:
            yield
    else:
        yield

def create_app():
    enable_docs = str(os.getenv("MINERU_API_ENABLE_FASTAPI_DOCS", "1")).lower() in ("1", "true", "yes")
    app = FastAPI(
        openapi_url="/openapi.json" if enable_docs else None,
        docs_url="/docs" if enable_docs else None,
        redoc_url="/redoc" if enable_docs else None,
        title="MinerU API",
        description="Document parsing API using MinerU",
        version=__version__,
        lifespan=lifespan
    )
    global _request_semaphore
    try:
        max_concurrent_requests = int(os.getenv("MINERU_API_MAX_CONCURRENT_REQUESTS", "0"))
    except ValueError:
        max_concurrent_requests = 0
    if max_concurrent_requests > 0:
        _request_semaphore = asyncio.Semaphore(max_concurrent_requests)
        logger.info(f"Request concurrency limited to {max_concurrent_requests}")
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app

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
    """Periodic cleanup of resources and connections with improved efficiency"""
    while True:
        try:
            await asyncio.sleep(300)  # Run every 5 minutes

            # Force garbage collection
            import gc
            collected = gc.collect()

            # Log connection status more efficiently
            async with connection_lock:
                conn_count = len(active_connections)
            logger.info(f"Periodic cleanup: {collected} objects collected, {conn_count} active connections")

        except asyncio.CancelledError:
            logger.info("Periodic cleanup task cancelled")
            break
        except Exception as e:
            logger.error(f"Error in periodic cleanup: {str(e)}")
            # Continue running even if there's an error

app = create_app()

# Connection tracking middleware
@app.middleware("http")
async def connection_tracking_middleware(request, call_next):
    """Track and manage HTTP connections with improved efficiency"""
    connection_id = uuid.uuid4().hex[:REQUEST_ID_LENGTH]

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
    try:
        mcr = int(os.getenv("MINERU_API_MAX_CONCURRENT_REQUESTS", "0"))
    except ValueError:
        mcr = 0
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
            "concurrency_limit": mcr if mcr > 0 else None,
            "supports_all_backends": True,
            "supports_all_file_types": SUPPORTED_EXTENSIONS
        },
        "mode_info": {
            "current_mode": RUNTIME_MODE,
            "description": "Pipeline OCR-based processing" if RUNTIME_MODE == "pipeline" else f"VLM-based processing using {DEFAULT_BACKEND}",
            "available_backends": ACTIVE_BACKENDS,
            "environment_variables": {
                "MINERU_MODE": "Set to 'pipeline' or 'vlm' to choose processing mode",
                "MINERU_VLM_BACKEND": "Choose VLM backend (must use vlm- prefix: vlm-vllm-async-engine)",
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
            return b64encode(f.read()).decode()
    except Exception as e:
        logger.error(f"Failed to encode image {image_path}: {str(e)}")
        return None

def get_infer_result(file_suffix_identifier: str, pdf_name: str, parse_dir: str) -> Optional[str]:
    """Read inference result from result file with error handling"""
    try:
        result_file_path = os.path.join(parse_dir, f"{pdf_name}{file_suffix_identifier}")
        logger.debug(f"Trying to read: {result_file_path}")
        logger.debug(f"File exists: {os.path.exists(result_file_path)}")
        
        if os.path.exists(result_file_path):
            with open(result_file_path, "r", encoding="utf-8") as fp:
                content = fp.read()
                logger.debug(f"Successfully read {len(content)} bytes from {file_suffix_identifier}")
                return content
        else:
            logger.warning(f"File not found: {result_file_path}")
    except Exception as e:
        logger.error(f"Failed to read result file {result_file_path}: {str(e)}")
    return None

async def cleanup_directory(directory_path: str, delay: int = 0):
    """Unified cleanup function with optional delay"""
    try:
        if delay > 0:
            await asyncio.sleep(delay)
        
        if safe_cleanup_directory(directory_path):
            if delay == 0: logger.debug(f"Immediate cleanup successful for {directory_path}")
        else:
            if delay == 0: logger.warning(f"Immediate cleanup failed for {directory_path}")
    except Exception as e:
        logger.error(f"Error in cleanup (delay={delay}): {str(e)}")
    finally:
        import gc
        gc.collect()


async def delayed_cleanup(directory_path: str):
    """Wrapper for delayed cleanup task"""
    await cleanup_directory(directory_path, delay=CLEANUP_DELAY)


async def immediate_cleanup(directory_path: str):
    """Wrapper for immediate cleanup task"""
    await cleanup_directory(directory_path, delay=0)


def safe_cleanup_directory(directory_path: str) -> bool:
    """Safely clean up directory with proper error handling and improved efficiency"""
    if not os.path.exists(directory_path):
        return True

    try:
        logger.debug(f"Cleaning up directory: {directory_path}")
        # Try to remove the entire directory first
        shutil.rmtree(directory_path, ignore_errors=False)
        logger.debug("Directory cleaned up successfully")
        return True
    except PermissionError as e:
        logger.warning(f"Permission error cleaning up directory: {str(e)}")
        # Try to fix permissions and retry
        try:
            for root, dirs, files in os.walk(directory_path, topdown=False):
                for name in files + dirs:  # Handle both files and directories
                    try:
                        path = os.path.join(root, name)
                        os.chmod(path, 0o777)  # Ensure write permissions
                    except Exception:
                        pass  # Ignore errors when changing permissions
            # Final attempt to remove the directory
            shutil.rmtree(directory_path, ignore_errors=True)
            return True
        except Exception as perm_error:
            logger.error(f"Failed to cleanup directory after permission fix: {str(perm_error)}")
            return False
    except Exception as e:
        logger.error(f"Error cleaning up directory: {str(e)}")
        # Last resort: try to remove individual files with error ignoring
        shutil.rmtree(directory_path, ignore_errors=True)
        # Check if directory still exists
        if os.path.exists(directory_path):
            logger.error(f"Failed to completely remove directory: {directory_path}")
            return False
        return True

def validate_file_size(file_content: bytes) -> bool:
    """Validate file size efficiently"""
    # Use direct comparison without creating len() overhead for large files
    return len(file_content) <= MAX_FILE_SIZE


async def validate_file_size_async(file: UploadFile) -> bool:
    """
    异步验证文件大小，避免将整个文件加载到内存中
    对于大文件更高效
    """
    # 对于较小的文件，直接读取
    if file.size and file.size <= MAX_FILE_SIZE:
        return True
    
    # 对于大小未知或较大的文件，需要读取检查
    if not file.size:
        # 读取文件检查大小
        content = await file.read()
        file.file.seek(0)  # 重置文件指针
        return len(content) <= MAX_FILE_SIZE
    
    return False


def get_file_info(
    file: Optional[UploadFile] = None,
    file_path: Optional[Union[str, Path]] = None,
    guess_suffix: bool = False,
) -> Dict[str, Any]:
    try:
        if file_path is not None:
            p = Path(file_path)
            suffix = p.suffix.lower() if p.suffix else ""
            if guess_suffix:
                try:
                    guessed = guess_suffix_by_path(p)
                    if guessed:
                        suffix = f".{guessed}"
                except Exception as e:
                    logger.warning(f"Error guessing file suffix: {e}")
            return {
                "filename": p.name,
                "stem": p.stem,
                "suffix": suffix,
                "size": p.stat().st_size if p.exists() else 0,
            }

        if file is None:
            return {"filename": "unknown", "stem": "unknown", "suffix": "", "size": 0}

        p = Path(file.filename or "unknown")
        return {
            "filename": file.filename or "unknown",
            "stem": p.stem,
            "suffix": p.suffix.lower() if p.suffix else "",
            "size": getattr(file, "size", 0) or 0,
        }
    except Exception as e:
        logger.warning(f"Error extracting file info: {e}")
        fallback_filename = getattr(file, "filename", "unknown") if file is not None else "unknown"
        fallback_size = getattr(file, "size", 0) if file is not None else 0
        return {
            "filename": fallback_filename or "unknown",
            "stem": "unknown",
            "suffix": "",
            "size": fallback_size or 0,
        }


def validate_backend_config(backend: str, parse_method: str, server_url: Optional[str]) -> Dict[str, Any]:
    """Validate backend configuration and return adjusted parameters"""
    if backend == "hybrid":
        backend = "hybrid-auto-engine"
    elif backend == "vlm":
        backend = "vlm-auto-engine"
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

@lru_cache(maxsize=128)
def get_result_directory_cached(output_dir: str, file_name: str, backend: str, parse_method: str) -> str:
    """缓存版本的获取结果目录函数，提高重复请求的性能"""
    config = BACKEND_CONFIGS[backend]
    subdir = config["result_subdir"](parse_method)
    return os.path.join(output_dir, file_name, subdir)


def get_result_directory(output_dir: str, file_name: str, backend: str, parse_method: str) -> str:
    """Get the result directory path based on backend type with caching for better performance"""
    # 对于高并发场景，可以使用缓存版本
    # return get_result_directory_cached(output_dir, file_name, backend, parse_method)
    # 为了简单起见，我们直接返回计算结果
    config = BACKEND_CONFIGS[backend]
    subdir = config["result_subdir"](parse_method)
    return os.path.join(output_dir, file_name, subdir)


@lru_cache(maxsize=64)
def get_model_output_suffix_cached(backend: str) -> str:
    """缓存版本的获取模型输出后缀函数"""
    return BACKEND_CONFIGS[backend]["model_output_suffix"]


def get_model_output_suffix(backend: str) -> str:
    """Get the model output file suffix based on backend"""
    # 对于高并发场景，可以使用缓存版本
    # return get_model_output_suffix_cached(backend)
    # 为了简单起见，我们直接返回计算结果
    return BACKEND_CONFIGS[backend]["model_output_suffix"]


def prepare_backend_params(backend: str, **kwargs) -> Dict[str, Any]:
    """Prepare parameters specific to backend type with improved efficiency"""
    config = BACKEND_CONFIGS[backend]
    params = {}

    # Common parameters - use dictionary comprehension for better performance
    common_params = {
        "start_page_id", "end_page_id"
    }
    
    # Filter and add common parameters that exist in kwargs
    params.update({k: v for k, v in kwargs.items() if k in common_params})

    # Backend-specific parameters
    # 转发 VLLM 并行相关参数到使用 VLLM 的后端（包括 hybrid-* 内部的 vllm-async 引擎）
    uses_vllm = (backend in VLM_BACKENDS_SET) or (backend in frozenset(HYBRID_BACKENDS))
    if uses_vllm:
        vlm_engine_params = {
            "tensor_parallel_size",
            "data_parallel_size",
            "pipeline_parallel_size",
            "distributed_executor_backend",
            "gpu_memory_utilization",
            "max_model_len",
            "enforce_eager",
            "trust_remote_code",
            "port",
            "logits_processors",
            "enable_torch_compile",
        }
        params.update({k: v for k, v in kwargs.items() if k in vlm_engine_params})

    # Pipeline-specific parameters (excluding formula_enable and table_enable as they're passed separately)
    if backend in PIPELINE_BACKENDS:
        # These are handled separately in the aio_do_parse call
        pass

    return params


def get_mime_type(image_path):
    """Dynamically detect image MIME type with enhanced format support"""
    # 首先尝试使用imghdr
    img_type = imghdr.what(image_path)
    if img_type:
        return f"image/{img_type}"
    
    # Fallback: 基于文件扩展名
    ext = os.path.splitext(image_path)[1].lower().lstrip('.')
    mime_map = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'webp': 'image/webp',
        'tiff': 'image/tiff',
        'tif': 'image/tiff',
        'jp2': 'image/jp2',
    }
    return mime_map.get(ext, 'application/octet-stream')


async def process_images_async(image_dir: str, backend: str = "pipeline", request_id: str = "unknown") -> Dict[str, str]:
    """
    增强的异步图片处理，支持更多格式和更好的错误处理
    
    Args:
        image_dir: 图像目录路径
        backend: 后端类型（用于调试日志）
        request_id: 请求ID用于日志追踪
        
    Returns:
        Dict[str, str]: 图像文件名到base64编码的映射
    """
    # 扩展支持的图片格式
    image_extensions = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp', 'tiff', 'tif', 'jp2']
    image_patterns = [f"*.{ext}" for ext in image_extensions]
    
    image_paths = []
    for pattern in image_patterns:
        image_paths.extend(glob(os.path.join(image_dir, pattern)))
    
    if not image_paths:
        logger.debug(f"[{request_id}] No images found in {image_dir}")
        return {}
    
    logger.info(f"[{request_id}] Found {len(image_paths)} images in {image_dir} for backend {backend}")
    
    images_data = {}
    failed_count = 0
    
    for image_path in image_paths:
        try:
            # 验证文件存在且可读
            if not os.path.exists(image_path):
                logger.warning(f"[{request_id}] Image file not found: {image_path}")
                failed_count += 1
                continue
            
            if not os.access(image_path, os.R_OK):
                logger.warning(f"[{request_id}] Image file not readable: {image_path}")
                failed_count += 1
                continue
            
            filename = os.path.basename(image_path)
            base64_str = encode_image(image_path)
            
            if base64_str:
                mime_type = get_mime_type(image_path)
                images_data[filename] = f"data:{mime_type};base64,{base64_str}"
                logger.debug(f"[{request_id}] Successfully processed image: {filename} ({mime_type})")
            else:
                logger.warning(f"[{request_id}] Failed to encode image: {filename}")
                failed_count += 1
                
        except Exception as e:
            logger.error(f"[{request_id}] Error processing image {image_path}: {str(e)}")
            failed_count += 1
            continue
    
    if failed_count > 0:
        logger.warning(f"[{request_id}] Failed to process {failed_count} out of {len(image_paths)} images")
    
    logger.info(f"[{request_id}] Successfully processed {len(images_data)} images")
    return images_data


def replace_markdown_images(markdown_content: str, images_data: Dict[str, str], 
                           request_id: str = "unknown") -> str:
    """
    增强的Markdown图片替换函数
    
    支持多种图片引用格式：
    - ![](images/xxx.jpg)
    - ![alt text](images/xxx.jpg)
    - ![](./images/xxx.jpg)
    - ![](_xxx_images/xxx.jpg)
    
    Args:
        markdown_content: 原始Markdown内容
        images_data: 图片文件名到base64 data URI的映射
        request_id: 请求ID用于日志
        
    Returns:
        str: 替换后的Markdown内容
    """
    if not markdown_content or not images_data:
        return markdown_content
    
    replaced_count = 0
    failed_refs = []
    
    def replace_image(match):
        nonlocal replaced_count
        
        # 提取alt文本和图片路径
        # match.group(1) 是 alt 文本, match.group(2) 是路径
        alt_text = match.group(1) if match.lastindex >= 1 else ""
        image_path = match.group(2) if match.lastindex >= 2 else match.group(1)
        
        # 提取文件名（支持不同路径格式）
        # 处理路径如: images/xxx.jpg, ./images/xxx.jpg, _stem_images/xxx.jpg
        filename = image_path.split('/')[-1]
        
        if filename in images_data:
            replaced_count += 1
            # 保留原有的alt文本，如果没有则使用文件名
            display_alt = alt_text if alt_text else filename
            return f'![{display_alt}]({images_data[filename]})'
        else:
            # 记录未找到的图片引用
            if filename not in failed_refs:
                failed_refs.append(filename)
            logger.debug(f"[{request_id}] Image not found in data: {filename}")
            return match.group(0)  # 保持原样
    
    # 支持多种Markdown图片格式
    # Pattern 1: ![alt text](path) or ![](path) - 标准格式
    # Pattern 2: 相对路径 ./images/
    # Pattern 3: 特定命名模式 _xxx_images/
    patterns = [
        r'!\[([^\]]*)\]\(([^)]*?/?images/[^)]+)\)',  # 带或不带alt文本的标准路径
        r'!\[([^\]]*)\]\((\./[^)]*?/?images/[^)]+)\)',  # 相对路径
        r'!\[([^\]]*)\]\(([^)]*?_images/[^)]+)\)',  # 特定命名模式
    ]
    
    result = markdown_content
    for pattern in patterns:
        result = re.sub(pattern, replace_image, result)
    
    if replaced_count > 0:
        logger.info(f"[{request_id}] Replaced {replaced_count} image references in markdown")
    
    if failed_refs:
        unique_failed = list(set(failed_refs))
        logger.warning(f"[{request_id}] Could not find {len(unique_failed)} images: {unique_failed[:5]}...")
    
    return result






def validate_and_fix_images(response_data: dict, request_id: str = "unknown") -> dict:
    """
    验证并诊断图片路径问题
    
    检查:
    1. markdown中的图片引用是否有对应的images数据
    2. 空路径图片的处理
    3. 缺失图片的详细日志记录
    
    Args:
        response_data: 响应数据字典
        request_id: 请求ID用于日志
        
    Returns:
        dict: 更新后的响应数据（添加diagnostics信息）
    """
    if "markdown" not in response_data:
        return response_data
    
    markdown = response_data.get("markdown", "")
    images_data = response_data.get("images", {})
    
    # 统计信息
    stats = {
        "total_refs": 0,
        "empty_refs": 0,
        "missing_refs": 0,
        "valid_refs": 0,
        "data_uri_refs": 0,
    }
    
    # 检测空路径图片引用 ![xxx]() 或 ![]()
    empty_pattern = r'!\[([^\]]*)\]\(\s*\)'
    empty_refs = re.findall(empty_pattern, markdown)
    stats["empty_refs"] = len(empty_refs)
    
    if empty_refs:
        logger.warning(
            f"[{request_id}] Found {len(empty_refs)} empty image references - "
            "likely due to image_path generation failure in VLM backend"
        )
    
    # 检测所有图片引用
    all_refs_pattern = r'!\[([^\]]*)\]\(([^)]+)\)'
    all_refs = re.findall(all_refs_pattern, markdown)
    stats["total_refs"] = len(all_refs)
    
    missing_images = []
    for alt, path in all_refs:
        # 跳过已经是data URI的引用
        if path.startswith('data:'):
            stats["data_uri_refs"] += 1
            stats["valid_refs"] += 1
            continue
        
        # 检查文件路径引用
        if 'images/' in path or '_images/' in path:
            filename = path.split('/')[-1]
            if filename in images_data:
                stats["valid_refs"] += 1
            else:
                stats["missing_refs"] += 1
                missing_images.append({
                    "filename": filename,
                    "alt": alt,
                    "path": path
                })
    
    # 记录缺失的图片
    if missing_images:
        logger.warning(
            f"[{request_id}] Found {len(missing_images)} referenced images not in data: "
            f"{[img['filename'] for img in missing_images[:5]]}"
        )
    
    # 添加诊断信息到响应
    if "diagnostics" not in response_data:
        response_data["diagnostics"] = {}
    
    response_data["diagnostics"]["images"] = {
        "total_references": stats["total_refs"],
        "empty_references": stats["empty_refs"],
        "missing_references": stats["missing_refs"],
        "valid_references": stats["valid_refs"],
        "data_uri_references": stats["data_uri_refs"],
        "total_image_files": len(images_data),
        "missing_details": missing_images[:10] if missing_images else [],
    }
    
    # 记录汇总信息
    logger.info(
        f"[{request_id}] Image diagnostics: "
        f"refs={stats['total_refs']}, valid={stats['valid_refs']}, "
        f"empty={stats['empty_refs']}, missing={stats['missing_refs']}, "
        f"files={len(images_data)}"
    )
    
    return response_data


def collect_text_for_extraction(data: Dict[str, Any]) -> str:
    parts = []
    m = data.get("md_content") or data.get("markdown") or ""
    if isinstance(m, str) and m:
        parts.append(m)
    cl = data.get("content_list")
    if isinstance(cl, str) and cl.strip():
        try:
            arr = json.loads(cl)
            if isinstance(arr, list):
                for it in arr:
                    if isinstance(it, dict):
                        t = it.get("content") or it.get("text") or ""
                        if isinstance(t, str) and t:
                            parts.append(t)
        except Exception:
            pass
    return "\n".join(parts)


def _normalize_line(s: str) -> str:
    return re.sub(r'\s+', ' ', s or '').strip()


def extract_generic_kv_from_text(text: str) -> Dict[str, str]:
    if not isinstance(text, str) or not text:
        return {}
    kv: Dict[str, str] = {}
    for raw in text.splitlines():
        line = _normalize_line(raw)
        if not line or len(line) < 3:
            continue
        m = re.match(r'([^:=：]{1,64})\s*[：:=]\s*(.+)', line)
        if m:
            key = _normalize_line(m.group(1))
            val = _normalize_line(m.group(2))
            if key and val:
                kv[key] = val
            continue
        m = re.match(r'(.{1,64})\s*[-—]\s*(.+)', line)
        if m:
            key = _normalize_line(m.group(1))
            val = _normalize_line(m.group(2))
            if key and val:
                kv[key] = val
    return kv


def _strip_html(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    cleaned = re.sub(r'<[^>]+>', ' ', cleaned)
    return _normalize_line(cleaned)


def extract_generic_kv_from_table_html(table_html: str) -> Dict[str, str]:
    if not isinstance(table_html, str) or not table_html.strip():
        return {}
    kv: Dict[str, str] = {}
    rows = re.split(r'</tr>', table_html, flags=re.IGNORECASE)
    for row in rows:
        cells = re.split(r'</t[dh]>', row, flags=re.IGNORECASE)
        values = []
        for c in cells:
            txt = _strip_html(c)
            if txt:
                values.append(txt)
        if len(values) == 2:
            k, v = values
            if k and v:
                kv[k] = v
        elif len(values) >= 3:
            k, v = values[0], values[1]
            if k and v:
                kv[k] = v
    return kv


def extract_generic_kv_from_content_list(content_list_str: Optional[str]) -> Dict[str, str]:
    if not isinstance(content_list_str, str) or not content_list_str.strip():
        return {}
    try:
        data = json.loads(content_list_str)
    except Exception:
        return {}
    if not isinstance(data, list):
        return {}
    kv: Dict[str, str] = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        t = item.get("text") or item.get("content") or ""
        if isinstance(t, str) and t:
            kv.update(extract_generic_kv_from_text(t))
        tb = item.get("table_body")
        if isinstance(tb, str) and tb:
            kv.update(extract_generic_kv_from_table_html(tb))
    return kv


def extract_generic_dates_and_amounts(text: str) -> Dict[str, Any]:
    if not isinstance(text, str) or not text:
        return {"dates": [], "amounts": []}
    ds1 = re.findall(r'\b[0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}\b', text)
    ds2 = re.findall(r'[0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日', text)
    amounts = re.findall(r'¥\s?[0-9]+(?:\.[0-9]{2})?', text)
    return {"dates": list(set(ds1 + ds2)), "amounts": list(set(amounts))}


def extract_generic_metadata(markdown: Optional[str], content_list_str: Optional[str]) -> Dict[str, Any]:
    md = markdown or ""
    kv_md = extract_generic_kv_from_text(md)
    kv_cl = extract_generic_kv_from_content_list(content_list_str)
    kv = {**kv_cl, **kv_md}
    agg_text = md
    if isinstance(content_list_str, str) and content_list_str.strip():
        try:
            arr = json.loads(content_list_str)
            if isinstance(arr, list):
                for it in arr:
                    t = it.get("text") or it.get("content") or ""
                    if isinstance(t, str):
                        agg_text += "\n" + t
        except Exception:
            pass
    extra = extract_generic_dates_and_amounts(agg_text)
    meta: Dict[str, Any] = {}
    if kv:
        meta["key_value_pairs"] = kv
    if extra.get("dates"):
        meta["dates"] = extra["dates"]
    if extra.get("amounts"):
        meta["amounts"] = extra["amounts"]
    return meta


def extract_invoice_info(text: str) -> Dict[str, Any]:
    return {}


def augment_markdown_with_invoice_info(md: str, info: Dict[str, Any]) -> str:
    return md or ""


def sanitize_filename(filename: str) -> str:
    """
    格式化化压缩文件的文件名
    移除路径遍历字符, 保留 Unicode 字母、数字、._- 
    禁止隐藏文件
    """
    sanitized = re.sub(r'[/\\\.]{2,}|[/\\]', '', filename)
    sanitized = re.sub(r'[^\w.-]', '_', sanitized, flags=re.UNICODE)
    if sanitized.startswith('.'):
        sanitized = '_' + sanitized[1:]
    return sanitized or 'unnamed'


def cleanup_file(file_path: str) -> None:
    """清理临时 zip 文件"""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        logger.warning(f"fail clean file {file_path}: {e}")


async def create_zip_response(
    output_dir: str,
    file_info: Dict[str, Any],
    actual_backend: str,
    actual_parse_method: str,
    return_md: bool,
    return_middle_json: bool,
    return_model_output: bool,
    return_content_list: bool,
    return_images: bool,
    request_id: str
) -> FileResponse:
    """创建ZIP格式的响应文件"""
    zip_fd, zip_path = tempfile.mkstemp(suffix=".zip", prefix="mineru_results_")
    os.close(zip_fd)
    
    try:
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            pdf_name = file_info['stem']
            safe_pdf_name = sanitize_filename(pdf_name)
            
            # 确定解析目录
            if actual_backend.startswith("pipeline"):
                parse_dir = os.path.join(output_dir, pdf_name, actual_parse_method)
            elif actual_backend.startswith("vlm"):
                parse_dir = os.path.join(output_dir, pdf_name, "vlm")
            elif actual_backend.startswith("hybrid"):
                parse_dir = os.path.join(output_dir, pdf_name, f"hybrid_{actual_parse_method}")

            # 检查解析目录是否存在
            if not os.path.exists(parse_dir):
                raise FileNotFoundError(f"Parse directory not found: {parse_dir}")

            # 写入文本类结果
            if return_md:
                path = os.path.join(parse_dir, f"{pdf_name}.md")
                if os.path.exists(path):
                    zf.write(path, arcname=os.path.join(safe_pdf_name, f"{safe_pdf_name}.md"))

            if return_middle_json:
                path = os.path.join(parse_dir, f"{pdf_name}_middle.json")
                if os.path.exists(path):
                    zf.write(path, arcname=os.path.join(safe_pdf_name, f"{safe_pdf_name}_middle.json"))

            if return_model_output:
                # Both pipeline and VLM backends use _model.json
                path = os.path.join(parse_dir, f"{pdf_name}_model.json")
                if os.path.exists(path):
                    zf.write(path, arcname=os.path.join(safe_pdf_name, os.path.basename(path)))

            if return_content_list:
                path = os.path.join(parse_dir, f"{pdf_name}_content_list.json")
                if os.path.exists(path):
                    zf.write(path, arcname=os.path.join(safe_pdf_name, f"{safe_pdf_name}_content_list.json"))

            diag_path = os.path.join(parse_dir, f"{pdf_name}_diagnostics.json")
            if os.path.exists(diag_path):
                zf.write(diag_path, arcname=os.path.join(safe_pdf_name, f"{safe_pdf_name}_diagnostics.json"))

            # 写入图片
            if return_images:
                images_dir = os.path.join(parse_dir, "images")
                if os.path.exists(images_dir):
                    # 扩展支持的图像格式
                    image_extensions = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp', 'tiff', 'tif', 'jp2']
                    image_paths = []
                    
                    for ext in image_extensions:
                        pattern = os.path.join(images_dir, f"*.{ext}")
                        image_paths.extend(glob(pattern))
                    
                    logger.info(f"[{request_id}] Found {len(image_paths)} images for ZIP in {images_dir}")
                    
                    added_count = 0
                    for image_path in image_paths:
                        try:
                            if os.path.exists(image_path) and os.access(image_path, os.R_OK):
                                zf.write(
                                    image_path, 
                                    arcname=os.path.join(safe_pdf_name, "images", os.path.basename(image_path))
                                )
                                added_count += 1
                            else:
                                logger.warning(f"[{request_id}] Cannot access image: {image_path}")
                        except Exception as e:
                            logger.warning(f"[{request_id}] Failed to add image to ZIP: {image_path}, error: {e}")
                    
                    logger.info(f"[{request_id}] Added {added_count} images to ZIP")

        return FileResponse(
            path=zip_path,
            media_type="application/zip",
            filename="results.zip",
            background=BackgroundTask(cleanup_file, zip_path)
        )
    except Exception as e:
        # 如果创建ZIP文件失败，确保清理已创建的文件
        try:
            if os.path.exists(zip_path):
                os.remove(zip_path)
        except:
            pass
        logger.error(f"[{request_id}] Failed to create ZIP response: {str(e)}")
        raise


@app.post(
    "/v2/parse/file",
    tags=["projects"],
    summary="Parse files using new API interface",
    dependencies=[Depends(limit_concurrency)],
)
async def file_parse(
        background_tasks: BackgroundTasks,
        files: Optional[List[UploadFile]] = File(None),
        file: Optional[UploadFile] = File(None),
        output_dir: str = Form("./output"),
        backend: str = DEFAULT_BACKEND,
        parse_method: str = Form("auto"),
        lang: str = Form("ch"),
        formula_enable: bool = True,
        table_enable: bool = True,
        return_md: bool = True,
        return_middle_json: bool = True,
        return_model_output: bool = False,
        return_content_list: bool = True,
        return_images: bool = True,
        response_format_zip: bool = False,
        start_page_id: int = 0,
        tensor_parallel_size: int = 1,
        data_parallel_size: int = 1,
        end_page_id: int = 99999,
        temperature: float = 0.0,
        #top_p: float = 0.0,
        #top_k: int = 1,
        #repetition_penalty: float = 1.05,
        server_url: Optional[str] = None,
        force_vlm_ocr_enable: bool = Form(False),
        force_pipeline_enable: bool = Form(False),
):
    """
    Unified document parsing interface with enhanced robustness and resource management.
    Supports all document types and backends without concurrency restrictions.
    """
    temp_dir = None
    request_id = uuid.uuid4().hex[:REQUEST_ID_LENGTH]

    try:
        try:
            backend_validation = validate_backend_config(backend, parse_method, server_url)
            actual_backend = backend_validation["backend"]
            actual_parse_method = backend_validation["parse_method"]
            backend_config = backend_validation["config"]
            if "warning" in backend_validation:
                logger.warning(f"[{request_id}] {backend_validation['warning']}")
        except ValueError as e:
            return JSONResponse(status_code=400, content={"error": str(e)})

        temp_dir = tempfile.mkdtemp(prefix=f"{TEMP_DIR_PREFIX}{actual_backend}_{request_id}_")
        output_dir = os.path.join(temp_dir, OUTPUT_DIR_NAME)

        input_files = files if files else ([file] if file is not None else [])
        if not input_files:
            await immediate_cleanup(temp_dir)
            return JSONResponse(status_code=400, content={"error": "No file uploaded"})

        pdf_file_names = []
        pdf_bytes_list = []

        for uf in input_files:
            content = await uf.read()
            if not validate_file_size(content):
                await immediate_cleanup(temp_dir)
                return JSONResponse(status_code=413, content={"error": f"File too large. Maximum size: {MAX_FILE_SIZE / (1024*1024):.1f}MB"})
            temp_file_path = os.path.join(temp_dir, Path(uf.filename).name)
            with open(temp_file_path, "wb") as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            info = get_file_info(file_path=temp_file_path, guess_suffix=True)
            pdf_bytes = read_fn(temp_file_path)
            pdf_file_names.append(info["stem"])
            pdf_bytes_list.append(pdf_bytes)

        actual_server_url = backend_validation.get("server_url", server_url)

        backend_params = prepare_backend_params(
            actual_backend,
            start_page_id=start_page_id,
            end_page_id=end_page_id,
            tensor_parallel_size=tensor_parallel_size,
            data_parallel_size=data_parallel_size,
            server_url=actual_server_url,
        )

        actual_lang = lang if backend_config.get("supports_ocr_lang", True) else "ch"

        if actual_backend in VLM_BACKENDS_SET:
            os.environ['MINERU_VLM_FORMULA_ENABLE'] = str(formula_enable).lower()
            os.environ['MINERU_VLM_TABLE_ENABLE'] = str(table_enable).lower()

        prev_force_vlm = os.environ.get("MINERU_FORCE_VLM_OCR_ENABLE")
        prev_force_pipeline = os.environ.get("MINERU_HYBRID_FORCE_PIPELINE_ENABLE")
        if force_vlm_ocr_enable:
            os.environ["MINERU_FORCE_VLM_OCR_ENABLE"] = "1"
        if force_pipeline_enable:
            os.environ["MINERU_HYBRID_FORCE_PIPELINE_ENABLE"] = "1"

        await aio_do_parse(
            output_dir,
            pdf_file_names,
            pdf_bytes_list,
            [actual_lang] * len(pdf_file_names),
            backend=actual_backend,
            parse_method=actual_parse_method,
            formula_enable=formula_enable,
            table_enable=table_enable,
            server_url=actual_server_url,
            **backend_params
        )

        if response_format_zip:
            zip_fd, zip_path = tempfile.mkstemp(suffix=".zip", prefix="mineru_results_")
            os.close(zip_fd)
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for pdf_name in pdf_file_names:
                    safe_pdf_name = sanitize_filename(pdf_name)
                    if actual_backend.startswith("pipeline"):
                        parse_dir = os.path.join(output_dir, pdf_name, actual_parse_method)
                    elif actual_backend.startswith("vlm"):
                        parse_dir = os.path.join(output_dir, pdf_name, "vlm")
                    else:
                        parse_dir = os.path.join(output_dir, pdf_name, f"hybrid_{actual_parse_method}")
                    if not os.path.exists(parse_dir):
                        continue
                    if return_md:
                        path = os.path.join(parse_dir, f"{pdf_name}.md")
                        if os.path.exists(path):
                            zf.write(path, arcname=os.path.join(safe_pdf_name, f"{safe_pdf_name}.md"))
                    if return_middle_json:
                        path = os.path.join(parse_dir, f"{pdf_name}_middle.json")
                        if os.path.exists(path):
                            zf.write(path, arcname=os.path.join(safe_pdf_name, f"{safe_pdf_name}_middle.json"))
                    if return_model_output:
                        path = os.path.join(parse_dir, f"{pdf_name}_model.json")
                        if os.path.exists(path):
                            zf.write(path, arcname=os.path.join(safe_pdf_name, os.path.basename(path)))
                    if return_content_list:
                        path = os.path.join(parse_dir, f"{pdf_name}_content_list.json")
                        if os.path.exists(path):
                            zf.write(path, arcname=os.path.join(safe_pdf_name, f"{safe_pdf_name}_content_list.json"))
                    if return_images:
                        images_dir = os.path.join(parse_dir, "images")
                        if os.path.exists(images_dir):
                            image_extensions = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp', 'tiff', 'tif', 'jp2']
                            image_paths = []
                            for ext in image_extensions:
                                image_paths.extend(glob(os.path.join(images_dir, f"*.{ext}")))
                            for image_path in image_paths:
                                zf.write(image_path, arcname=os.path.join(safe_pdf_name, "images", os.path.basename(image_path)))
            if prev_force_vlm is None:
                os.environ.pop("MINERU_FORCE_VLM_OCR_ENABLE", None)
            else:
                os.environ["MINERU_FORCE_VLM_OCR_ENABLE"] = prev_force_vlm
            if prev_force_pipeline is None:
                os.environ.pop("MINERU_HYBRID_FORCE_PIPELINE_ENABLE", None)
            else:
                os.environ["MINERU_HYBRID_FORCE_PIPELINE_ENABLE"] = prev_force_pipeline
            background_tasks.add_task(delayed_cleanup, temp_dir)
            return FileResponse(path=zip_path, media_type="application/zip", filename="results.zip", background=BackgroundTask(cleanup_file, zip_path))

        result_dict = {}
        for pdf_name in pdf_file_names:
            data = {}
            if actual_backend.startswith("pipeline"):
                parse_dir = os.path.join(output_dir, pdf_name, actual_parse_method)
            elif actual_backend.startswith("vlm"):
                parse_dir = os.path.join(output_dir, pdf_name, "vlm")
            else:
                parse_dir = os.path.join(output_dir, pdf_name, f"hybrid_{actual_parse_method}")
            if os.path.exists(parse_dir):
                if return_md:
                    md_val = get_infer_result(".md", pdf_name, parse_dir) or ""
                    data["md_content"] = md_val
                    data["markdown"] = md_val
                if return_middle_json:
                    data["middle_json"] = get_infer_result("_middle.json", pdf_name, parse_dir)
                if return_model_output:
                    data["model_output"] = get_infer_result("_model.json", pdf_name, parse_dir)
                if return_content_list:
                    data["content_list"] = get_infer_result("_content_list.json", pdf_name, parse_dir)
                if return_images:
                    images_dir = os.path.join(parse_dir, "images")
                    try:
                        images_data = await process_images_async(
                            images_dir,
                            backend=actual_backend,
                            request_id=request_id
                        )
                        if images_data:
                            data["images"] = images_data
                            if "markdown" in data and data["markdown"]:
                                data["markdown"] = replace_markdown_images(
                                    data["markdown"],
                                    images_data,
                                    request_id
                                )
                            data = validate_and_fix_images(data, request_id)
                    except Exception:
                        pass
                try:
                    gen_meta = extract_generic_metadata(
                        data.get("markdown") or "",
                        data.get("content_list")
                    )
                    if gen_meta:
                        data["metadata"] = gen_meta
                except Exception:
                    pass
            result_dict[pdf_name] = data
        if prev_force_vlm is None:
            os.environ.pop("MINERU_FORCE_VLM_OCR_ENABLE", None)
        else:
            os.environ["MINERU_FORCE_VLM_OCR_ENABLE"] = prev_force_vlm
        if prev_force_pipeline is None:
            os.environ.pop("MINERU_HYBRID_FORCE_PIPELINE_ENABLE", None)
        else:
            os.environ["MINERU_HYBRID_FORCE_PIPELINE_ENABLE"] = prev_force_pipeline
        payload = {"backend": actual_backend, "version": __version__, "results": result_dict, "success": True, "message": ""}
        if len(pdf_file_names) == 1:
            single_name = pdf_file_names[0]
            single = result_dict.get(single_name, {})
            payload["markdown"] = single.get("markdown", "") or ""
            payload["md_content"] = payload["markdown"]
            payload["images"] = single.get("images") or {}
            if "content_list" in single:
                payload["content_list"] = single["content_list"]
            if "model_output" in single:
                payload["model_output"] = single["model_output"]
            pages = 0
            cl = single.get("content_list")
            if isinstance(cl, str) and cl.strip():
                try:
                    content_data = json.loads(cl)
                    if content_data and isinstance(content_data, list):
                        pages = content_data[-1].get('page_idx', 0) + 1
                except Exception:
                    pages = 0
            payload["pages"] = pages
            if "metadata" in single:
                payload["metadata"] = single["metadata"]
        else:
            payload["markdown"] = ""
            payload["md_content"] = ""
            payload["images"] = {}
            payload["pages"] = 0
        background_tasks.add_task(delayed_cleanup, temp_dir)
        return JSONResponse(status_code=200, content=payload)

    except HTTPException:
        # Re-raise HTTP exceptions
        if temp_dir:
            await immediate_cleanup(temp_dir)
        raise
    except Exception as e:
        logger.exception(f"[{request_id}] Error processing files: {str(e)}")
        prev_force_vlm = os.environ.get("MINERU_FORCE_VLM_OCR_ENABLE")
        prev_force_pipeline = os.environ.get("MINERU_HYBRID_FORCE_PIPELINE_ENABLE")
        if prev_force_vlm is None:
            os.environ.pop("MINERU_FORCE_VLM_OCR_ENABLE", None)
        else:
            os.environ["MINERU_FORCE_VLM_OCR_ENABLE"] = prev_force_vlm
        if prev_force_pipeline is None:
            os.environ.pop("MINERU_HYBRID_FORCE_PIPELINE_ENABLE", None)
        else:
            os.environ["MINERU_HYBRID_FORCE_PIPELINE_ENABLE"] = prev_force_pipeline
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
                "command": "MINERU_MODE=vlm MINERU_VLM_BACKEND=vlm-vllm-async-engine python new.py",
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
                "current": VLM_BACKEND if RUNTIME_MODE == "vlm" else None,
                "note": "Use 'vlm-' prefix format (e.g., vlm-vllm-async-engine)"
            },
            "MINERU_SERVER_URL": {
                "description": "Server URL for VLM client mode",
                "example": "http://127.0.0.1:30000",
                "current": SERVER_URL
            },

        }
    }

@click.command()
@click.option('--host', default='0.0.0.0')
@click.option('--port', default=7434, type=int)
@click.option('--reload', is_flag=True)
@click.option('--max-concurrent-requests', default=0, type=int)
def main(host, port, reload, max_concurrent_requests):
    os.environ["MINERU_API_MAX_CONCURRENT_REQUESTS"] = str(max_concurrent_requests or 0)
    uvicorn.run("ocr:app", host=host, port=port, reload=reload)

if __name__ == "__main__":
    main()
