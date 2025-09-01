import base64
import os
import time
import asyncio
import io
import json
import traceback
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Dict, Optional, Annotated, Union, Any

import fitz
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from concurrent.futures import ProcessPoolExecutor
from pydantic import BaseModel, Field, validator
import torch
from contextlib import asynccontextmanager
import torch.multiprocessing as mp
import multiprocessing

from marker.output import text_from_rendered
from marker.converters.pdf import PdfConverter
from marker.converters.table import TableConverter
from marker.converters.ocr import OCRConverter
from marker.converters.extraction import ExtractionConverter
from marker.models import create_model_dict
from marker.config.parser import ConfigParser
from marker.settings import settings

# Configuration parameter model
class ProcessingParams(BaseModel):
    output_format: Annotated[
        str,
        Field(
            description="The format to output the text in. Can be 'markdown', 'json', 'html', or 'chunks'. Defaults to 'markdown'."
        ),
    ] = "markdown"
    page_range: Annotated[
        Optional[str],
        Field(
            description="Page range to convert, specify comma separated page numbers or ranges. Example: 0,5-10,20",
            example=None,
        ),
    ] = None
    force_ocr: Annotated[
        bool,
        Field(
            description="Force OCR on all pages of the PDF. Defaults to False. This can lead to worse results if you have good text in your PDFs."
        ),
    ] = False
    paginate_output: Annotated[
        bool,
        Field(
            description="Whether to paginate the output. Defaults to False. If set to True, each page of the output will be separated by a horizontal rule."
        ),
    ] = False
    use_llm: Annotated[
        bool,
        Field(
            description="Enable LLM processing for enhanced text extraction. Defaults to False."
        ),
    ] = False
    llm_service: Annotated[
        Optional[str],
        Field(
            description="LLM service class to use (e.g., 'marker.services.openai.OpenAIService'). Only used when use_llm is True."
        ),
    ] = None
    format_lines: Annotated[
        bool,
        Field(
            description="Reformat all lines using a local OCR model (inline math, underlines, bold, etc.). This will give very good quality math output."
        ),
    ] = False
    strip_existing_ocr: Annotated[
        bool,
        Field(
            description="Remove all existing OCR text in the document and re-OCR with surya."
        ),
    ] = False
    redo_inline_math: Annotated[
        bool,
        Field(
            description="If you want the absolute highest quality inline math conversion, use this along with use_llm."
        ),
    ] = False
    disable_image_extraction: Annotated[
        bool,
        Field(
            description="Don't extract images from the PDF. If you also specify use_llm, then images will be replaced with a description."
        ),
    ] = False
    converter_cls: Annotated[
        Optional[str],
        Field(
            description="Converter class to use. Options: 'marker.converters.pdf.PdfConverter' (default), 'marker.converters.table.TableConverter', 'marker.converters.ocr.OCRConverter', 'marker.converters.extraction.ExtractionConverter'"
        ),
    ] = None
    force_layout_block: Annotated[
        Optional[str],
        Field(
            description="Force layout detection to assume every page is a specific block type (e.g., 'Table')"
        ),
    ] = None
    keep_chars: Annotated[
        bool,
        Field(
            description="Keep individual characters and bounding boxes (for OCR converter)"
        ),
    ] = False
    block_correction_prompt: Annotated[
        Optional[str],
        Field(
            description="Optional prompt that will be used to correct the output of marker when LLM mode is active"
        ),
    ] = None
    page_schema: Annotated[
        Optional[Dict[str, Any]],
        Field(
            description="JSON schema for structured extraction (for extraction converter)"
        ),
    ] = None
    # LLM service specific parameters
    openai_api_key: Optional[str] = None
    openai_base_url: Optional[str] = None
    openai_model: Optional[str] = None
    gemini_api_key: Optional[str] = None
    vertex_project_id: Optional[str] = None
    ollama_base_url: Optional[str] = None
    ollama_model: Optional[str] = None
    claude_api_key: Optional[str] = None
    claude_model_name: Optional[str] = None
    azure_endpoint: Optional[str] = None
    azure_api_key: Optional[str] = None
    deployment_name: Optional[str] = None
    
    @validator('output_format')
    def validate_output_format(cls, v):
        valid_formats = ['markdown', 'json', 'html', 'chunks']
        if v not in valid_formats:
            raise ValueError(f'output_format must be one of {valid_formats}')
        return v

process_variables = {}
my_pool = None
app_data = {}
app = FastAPI()

def worker_init(counter, lock):
    num_gpus = torch.cuda.device_count()
    processes_per_gpu = int(os.environ.get('PROCESSES_PER_GPU', 1))
    with lock:
        worker_id = counter.value
        counter.value += 1
    if num_gpus == 0:
        device = 'cpu'
        device_id = 0
    else:
        device_id = worker_id // processes_per_gpu
        if device_id >= num_gpus:
            raise ValueError(f"Worker ID {worker_id} exceeds available GPUs ({num_gpus}).")
        device = f'cuda:{device_id}'
    
    # 基础配置参数
    config = {
        "output_format": "markdown",
        "pdftext_workers": 1
    }
    
    # 初始化转换器（不包含具体参数，将在处理时动态配置）
    pid = os.getpid()
    process_variables[pid] = {
        'device_id': device_id,
        'device': device,
        'models': None  # 将在首次使用时初始化
    }
    print(f"Worker {worker_id}: Initialized on {device}!")

# 每个进程独立的初始化函数
def init_converter(params_dict, device_id):
    """根据参数动态初始化转换器"""
    # 确保每个进程使用独立的GPU上下文
    if device_id > 0:
        os.environ["CUDA_VISIBLE_DEVICES"] = str(device_id)

    # 调试输出
    print(f"🔧 Worker {os.getpid()}: 初始化转换器，参数: {params_dict}")
    
    config_parser = ConfigParser(params_dict)
    config_dict = config_parser.generate_config_dict()
    config_dict["pdftext_workers"] = 1
    
    # 调试输出配置
    print(f"🔧 Worker {os.getpid()}: 生成的配置: use_llm={config_dict.get('use_llm', False)}")
    if config_dict.get('use_llm'):
        print(f"🔧 Worker {os.getpid()}: LLM服务: {config_dict.get('llm_service', 'None')}")
        llm_service = config_parser.get_llm_service()
        print(f"🔧 Worker {os.getpid()}: LLM服务对象: {type(llm_service).__name__ if llm_service else 'None'}")
    
    # 如果启用了 LLM 但没有指定服务，使用默认的 Gemini 服务
    if config_dict.get('use_llm') and not config_dict.get('llm_service'):
        config_dict['llm_service'] = 'marker.services.gemini.GoogleGeminiService'
        print(f"🔧 Worker {os.getpid()}: 使用默认 LLM 服务: Gemini")
    
    # 根据converter_cls参数选择转换器类型
    converter_cls_name = params_dict.get('converter_cls', 'marker.converters.pdf.PdfConverter')
    
    if converter_cls_name == 'marker.converters.table.TableConverter':
        converter_class = TableConverter
    elif converter_cls_name == 'marker.converters.ocr.OCRConverter':
        converter_class = OCRConverter
    elif converter_cls_name == 'marker.converters.extraction.ExtractionConverter':
        converter_class = ExtractionConverter
    else:
        converter_class = PdfConverter
    
    # 为extraction converter特殊处理
    print(f"🔧 Worker {os.getpid()}: 创建转换器，类型: {converter_class.__name__}")
    
    try:
        if converter_class == ExtractionConverter:
            converter = converter_class(
                config=config_dict,
                artifact_dict=create_model_dict(),
                llm_service=config_parser.get_llm_service(),
            )
        else:
            converter = converter_class(
                config=config_dict,
                artifact_dict=create_model_dict(),
                processor_list=config_parser.get_processors(),
                renderer=config_parser.get_renderer(),
                llm_service=config_parser.get_llm_service(),
            )
        
        print(f"🔧 Worker {os.getpid()}: 转换器创建成功")
        return converter
        
    except Exception as e:
        print(f"❌ Worker {os.getpid()}: 转换器创建失败: {str(e)}")
        print(f"❌ Worker {os.getpid()}: 错误详情: {traceback.format_exc()}")
        raise

def get_converter_for_params(params_dict):
    """为给定参数获取或创建转换器"""
    pid = os.getpid()
    worker_info = process_variables.get(pid)
    
    if not worker_info:
        raise RuntimeError("Worker not properly initialized")
    
    # 创建参数的哈希键用于缓存
    param_key = json.dumps(params_dict, sort_keys=True)
    
    if 'converters' not in worker_info:
        worker_info['converters'] = {}
    
    # 如果已有相同参数的转换器，直接返回
    if param_key in worker_info['converters']:
        return worker_info['converters'][param_key]
    
    # 创建新的转换器
    converter = init_converter(params_dict, worker_info['device_id'])
    worker_info['converters'][param_key] = converter
    
    return converter


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 确保设备设置正确
    torch_device = os.environ.get('TORCH_DEVICE', 'auto')
    if torch_device == 'auto' or torch_device not in ['cpu', 'cuda', 'mps']:
        if torch.cuda.is_available():
            os.environ['TORCH_DEVICE'] = 'cuda'
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            os.environ['TORCH_DEVICE'] = 'mps'
        else:
            os.environ['TORCH_DEVICE'] = 'cpu'
    
    print(f"🔧 使用设备: {os.environ['TORCH_DEVICE']}")
    
    # Initialize shared model dictionary
    app_data["models"] = create_model_dict()
    
    try:
        mp.set_start_method('spawn')
    except RuntimeError:
        raise RuntimeError("Set start method to spawn twice. This may be a temporary issue with the script. Please try running it again.")
    
    global my_pool
    manager = multiprocessing.Manager()
    worker_counter = manager.Value('i', 0)
    worker_lock = manager.Lock()
    gpu_count = torch.cuda.device_count()
    my_pool = ProcessPoolExecutor(
        max_workers=gpu_count*int(os.environ.get('PROCESSES_PER_GPU', 1)), 
        initializer=worker_init, 
        initargs=(worker_counter, worker_lock)
    )
    
    yield
    
    # Cleanup
    if my_pool:
        my_pool.shutdown(wait=True)
    if "models" in app_data:
        del app_data["models"]
    print("Application shutdown, cleaning up...")

app.router.lifespan_context = lifespan

# 子进程处理单个PDF的核心函数
def process_pdf(pdf_path, params_dict, output_dir="./marker2-result"):
    try:
        print(f"📄 Worker {os.getpid()}: 处理PDF {pdf_path}")
        print(f"📄 Worker {os.getpid()}: 参数 use_llm={params_dict.get('use_llm', False)}")
        print(f"📄 Worker {os.getpid()}: 完整参数: {params_dict}")
        
        # 确保有基本的默认参数
        if not params_dict:
            params_dict = {
                "output_format": "markdown",
                "use_llm": False,
                "force_ocr": False,
                "format_lines": False
            }
            print(f"📄 Worker {os.getpid()}: 使用默认参数: {params_dict}")
        
        # 获取适合当前参数的转换器
        print(f"📄 Worker {os.getpid()}: 开始获取转换器...")
        converter = get_converter_for_params(params_dict)
        print(f"📄 Worker {os.getpid()}: 转换器获取成功: {type(converter).__name__}")
        
        # 执行GPU加速的转换
        print(f"📄 Worker {os.getpid()}: 开始执行转换...")
        rendered = converter(pdf_path)
        print(f"📄 Worker {os.getpid()}: 转换完成，结果类型: {type(rendered)}")
        
        # 根据输出格式处理结果
        output_format = params_dict.get('output_format', 'markdown')
        
        if output_format == 'json':
            # JSON格式直接返回rendered对象
            result_data = {
                "status": "success",
                "data": rendered.model_dump() if hasattr(rendered, 'model_dump') else rendered,
                "metadata": rendered.metadata if hasattr(rendered, 'metadata') else {},
                "output_path": output_dir
            }
        elif output_format == 'chunks':
            # Chunks格式
            text, _, images = text_from_rendered(rendered)
            result_data = {
                "status": "success",
                "chunks": rendered.model_dump() if hasattr(rendered, 'model_dump') else rendered,
                "text": text,
                "images": images,
                "metadata": rendered.metadata if hasattr(rendered, 'metadata') else {},
                "output_path": output_dir
            }
        else:
            # Markdown/HTML格式
            print(f"📄 Worker {os.getpid()}: 开始提取文本和图像...")
            text, _, images = text_from_rendered(rendered)
            print(f"📄 Worker {os.getpid()}: 文本提取完成，长度: {len(text) if text else 0}")
            print(f"📄 Worker {os.getpid()}: 图像数量: {len(images) if images else 0}")
            
            result_data = {
                "status": "success",
                "text": text,
                "images": images,
                "metadata": rendered.metadata if hasattr(rendered, 'metadata') else {},
                "output_path": output_dir
            }
        
        print(f"📄 Worker {os.getpid()}: 准备返回结果，状态: {result_data['status']}")
        return result_data
        
    except Exception as e:
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"❌ Worker {os.getpid()}: 处理异常: {error_msg}")
        print(f"❌ Worker {os.getpid()}: 异常详情: {error_trace}")
        return {"status": "error", "message": error_msg, "file": pdf_path, "traceback": error_trace}


# --- FastAPI接口实现 ---
async def process_single_file(file: UploadFile, params_dict: Dict, output_dir: str) -> Dict:
    """异步处理单个文件"""
    try:
        global my_pool
        # 保存上传文件到临时目录
        temp_path = Path(output_dir) / file.filename
        with open(temp_path, "wb") as buffer:
            buffer.write(await file.read())
        
        # 获取文档页数
        pdf_document = fitz.open(temp_path)
        total_pages = pdf_document.page_count
        pdf_document.close()
        
        # 提交到进程池处理
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            my_pool,
            process_pdf,
            str(temp_path),
            params_dict,
            output_dir
        )

        # 转换为响应格式
        response = {
            "filename": file.filename,
            "status": result["status"],
            "output_path": result.get("output_path", output_dir),
            "pages": total_pages,
        }
        
        if result["status"] == "success":
            response.update({
                "text": result.get("text", ""),
                "images": result.get("images", {}),
                "metadata": result.get("metadata", {}),
                "data": result.get("data"),  # For JSON output
                "chunks": result.get("chunks")  # For chunks output
            })
        else:
            response["error"] = result.get("message", "Unknown error")
            response["traceback"] = result.get("traceback", "")
        
        return response
        
    except Exception as e:
        return {
            "filename": file.filename,
            "status": "error",
            "error": f"处理异常: {str(e)}",
            "traceback": traceback.format_exc()
        }

def encode_images(images):
    """Encode images to base64 using marker settings"""
    encoded = {}
    for k, v in images.items():
        byte_stream = io.BytesIO()
        v.save(byte_stream, format=settings.OUTPUT_IMAGE_FORMAT)
        encoded[k] = base64.b64encode(byte_stream.getvalue()).decode(
            settings.OUTPUT_ENCODING
        )
    return encoded

def img_to_base64(img_path):
    with open(img_path, "rb") as img_file:
        return base64.b64encode(img_file.read()).decode('utf-8')
def embed_images_as_base64(md_content, images_dict):
    """Embed images as base64 data URIs in markdown content"""
    if not images_dict:
        return md_content
        
    # Encode images to base64
    encoded_images = encode_images(images_dict)
    
    lines = md_content.split('\n')
    new_lines = []
    for line in lines:
        if line.startswith("![") and "](" in line and ")" in line:
            start_idx = line.index("](") + 2
            end_idx = line.index(")", start_idx)
            img_rel_path = line[start_idx:end_idx]

            img_name = os.path.basename(img_rel_path)
            # Remove extension and look for the image in encoded_images
            img_key = os.path.splitext(img_name)[0]
            
            if img_key in encoded_images:
                img_base64 = encoded_images[img_key]
                new_line = f'![](data:image/{settings.OUTPUT_IMAGE_FORMAT.lower()};base64,{img_base64})'
                new_lines.append(new_line)
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)
    return '\n'.join(new_lines)

'''
    curl --location --request POST "http://localhost:7434/v2/parse/file" \
    --header "Authorization: Bearer your_access_token" \
    --form "file=@./file/chinese_test.pdf"
'''
@app.post("/v2/parse/file")
async def process_pdfs(
    file: Optional[UploadFile] = File(default=None),
    files: Optional[list[UploadFile]] = File(default=None),
    # 基础参数
    output_format: Optional[str] = Form(default=None),
    page_range: Optional[str] = Form(default=None),
    force_ocr: Optional[bool] = Form(default=None),
    paginate_output: Optional[bool] = Form(default=None),
    
    # LLM相关参数
    use_llm: Optional[bool] = Form(default=None),
    llm_service: Optional[str] = Form(default=None),
    format_lines: Optional[bool] = Form(default=None),
    strip_existing_ocr: Optional[bool] = Form(default=None),
    redo_inline_math: Optional[bool] = Form(default=None),
    disable_image_extraction: Optional[bool] = Form(default=None),
    block_correction_prompt: Optional[str] = Form(default=None),
    
    # 转换器相关参数
    converter_cls: Optional[str] = Form(default=None),
    force_layout_block: Optional[str] = Form(default=None),
    keep_chars: Optional[bool] = Form(default=None),
    
    # 结构化提取参数
    page_schema: Optional[str] = Form(default=None),  # JSON字符串
    
    # LLM服务配置参数
    openai_api_key: Optional[str] = Form(default=None),
    openai_base_url: Optional[str] = Form(default=None),
    openai_model: Optional[str] = Form(default=None),
    gemini_api_key: Optional[str] = Form(default=None),
    vertex_project_id: Optional[str] = Form(default=None),
    ollama_base_url: Optional[str] = Form(default=None),
    ollama_model: Optional[str] = Form(default=None),
    claude_api_key: Optional[str] = Form(default=None),
    claude_model_name: Optional[str] = Form(default=None),
    azure_endpoint: Optional[str] = Form(default=None),
    azure_api_key: Optional[str] = Form(default=None),
    deployment_name: Optional[str] = Form(default=None),
    
    # 预设配置
    config_preset: Optional[str] = Form(default=None),  # 从openai_ocr_config.json加载预设
    
    # 特殊功能参数
    action: Optional[str] = Form(default=None)  # 特殊操作: "health", "list_presets", "get_preset"
):
    """处理PDF文件的统一接口，支持文件处理、配置查询、健康检查等功能"""
    s_time = time.time()
    
    print(f"🚀 API: 收到请求，action={action}, file={'存在' if file else '不存在'}, files={'存在' if files else '不存在'}")
    
    # 处理特殊操作
    if action == "health":
        # 健康检查
        gpu_count = torch.cuda.device_count()
        return {
            "success": True,
            "action": "health",
            "status": "healthy",
            "gpu_count": gpu_count,
            "cuda_available": torch.cuda.is_available(),
            "worker_count": my_pool._max_workers if my_pool else 0,
            "supported_formats": ["markdown", "json", "html", "chunks"],
            "supported_converters": [
                "marker.converters.pdf.PdfConverter",
                "marker.converters.table.TableConverter", 
                "marker.converters.ocr.OCRConverter",
                "marker.converters.extraction.ExtractionConverter"
            ]
        }
    
    elif action == "list_presets":
        # 获取所有配置预设
        try:
            with open("openai_ocr_config.json", "r", encoding="utf-8") as f:
                presets = json.load(f)
            return {
                "success": True,
                "action": "list_presets",
                "presets": list(presets.keys()),
                "configs": presets
            }
        except FileNotFoundError:
            return {
                "success": False,
                "action": "list_presets",
                "error": "配置文件 openai_ocr_config.json 不存在"
            }
        except Exception as e:
            return {
                "success": False,
                "action": "list_presets",
                "error": f"读取配置文件失败: {str(e)}"
            }
    
    elif action == "get_preset":
        # 获取特定的配置预设
        if not config_preset:
            raise HTTPException(status_code=400, detail="使用 get_preset 操作时必须提供 config_preset 参数")
        
        try:
            with open("openai_ocr_config.json", "r", encoding="utf-8") as f:
                presets = json.load(f)
            if config_preset in presets:
                return {
                    "success": True,
                    "action": "get_preset",
                    "preset_name": config_preset,
                    "config": presets[config_preset]
                }
            else:
                raise HTTPException(status_code=404, detail=f"预设配置 '{config_preset}' 不存在")
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="配置文件 openai_ocr_config.json 不存在")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"读取配置文件失败: {str(e)}")
    
    # 验证文件处理输入
    if not file and not files:
        raise HTTPException(status_code=400, detail="必须提供 file 或 files 参数，或使用 action 参数进行配置查询")
    
    if file and files:
        raise HTTPException(status_code=400, detail="不能同时提供 file 和 files 参数")
    
    # 确定处理模式
    is_batch = files is not None
    file_list = files if is_batch else [file]
    
    if is_batch and len(file_list) > 10:
        raise HTTPException(status_code=400, detail="批量处理最多支持10个文件")
    
    try:
        # 构建参数字典，设置默认值
        params_dict = {
            "output_format": "markdown",
            "use_llm": False,
            "force_ocr": False,
            "format_lines": False,
            "strip_existing_ocr": False,
            "redo_inline_math": False,
            "disable_image_extraction": False,
            "paginate_output": False,
            "keep_chars": False
        }
        
        # 加载预设配置（如果未指定则使用默认预设）
        default_preset = "基础markdown转换"  # 默认预设
        actual_preset = config_preset or default_preset
        
        print(f"🔧 API: 接收到的 config_preset 参数: {config_preset}")
        print(f"🔧 API: 实际使用的预设: {actual_preset}")
        
        try:
            print(f"🔧 API: 尝试读取配置文件 openai_ocr_config.json...")
            with open("openai_ocr_config.json", "r", encoding="utf-8") as f:
                presets = json.load(f)
            print(f"🔧 API: 配置文件读取成功，包含 {len(presets)} 个预设")
            
            if actual_preset in presets:
                preset_config = presets[actual_preset]
                print(f"🔧 API: 找到预设配置: {preset_config}")
                params_dict.update(preset_config)
                if config_preset:
                    print(f"🔧 API: 用户指定预设配置 '{actual_preset}' 加载成功")
                else:
                    print(f"🔧 API: 使用默认预设配置 '{actual_preset}' 加载成功")
            else:
                print(f"🔧 API: 可用预设: {list(presets.keys())}")
                if config_preset:
                    raise HTTPException(status_code=400, detail=f"预设配置 '{config_preset}' 不存在")
                else:
                    print(f"⚠️  API: 默认预设 '{default_preset}' 不存在，使用基础默认参数")
                    
        except FileNotFoundError:
            print(f"🔧 API: 配置文件 openai_ocr_config.json 不存在")
            if config_preset:
                raise HTTPException(status_code=400, detail="配置文件 openai_ocr_config.json 不存在")
            else:
                print(f"⚠️  API: 配置文件不存在，使用基础默认参数")
        except Exception as e:
            print(f"❌ API: 读取配置文件时发生异常: {str(e)}")
            print(f"❌ API: 异常详情: {traceback.format_exc()}")
            if config_preset:
                raise HTTPException(status_code=500, detail=f"读取配置文件失败: {str(e)}")
            else:
                print(f"⚠️  API: 配置文件读取失败，使用基础默认参数")
        
        # 用表单参数覆盖预设配置
        # 构建表单参数字典，只包含非None的值
        form_params = {}
        
        # 字符串参数 - 只有非None时才添加
        if output_format is not None:
            form_params["output_format"] = output_format
        if page_range is not None:
            form_params["page_range"] = page_range
        if llm_service is not None:
            form_params["llm_service"] = llm_service
        if block_correction_prompt is not None:
            form_params["block_correction_prompt"] = block_correction_prompt
        if converter_cls is not None:
            form_params["converter_cls"] = converter_cls
        if force_layout_block is not None:
            form_params["force_layout_block"] = force_layout_block
        
        # LLM服务配置参数 - 只有非None时才添加
        if openai_api_key is not None:
            form_params["openai_api_key"] = openai_api_key
        if openai_base_url is not None:
            form_params["openai_base_url"] = openai_base_url
        if openai_model is not None:
            form_params["openai_model"] = openai_model
        if gemini_api_key is not None:
            form_params["gemini_api_key"] = gemini_api_key
        if vertex_project_id is not None:
            form_params["vertex_project_id"] = vertex_project_id
        if ollama_base_url is not None:
            form_params["ollama_base_url"] = ollama_base_url
        if ollama_model is not None:
            form_params["ollama_model"] = ollama_model
        if claude_api_key is not None:
            form_params["claude_api_key"] = claude_api_key
        if claude_model_name is not None:
            form_params["claude_model_name"] = claude_model_name
        if azure_endpoint is not None:
            form_params["azure_endpoint"] = azure_endpoint
        if azure_api_key is not None:
            form_params["azure_api_key"] = azure_api_key
        if deployment_name is not None:
            form_params["deployment_name"] = deployment_name
        
        # 布尔参数 - 只有显式传递True时才覆盖预设
        # 这样可以避免默认的False值覆盖预设配置中的True值
        if force_ocr is True:
            form_params["force_ocr"] = force_ocr
        if paginate_output is True:
            form_params["paginate_output"] = paginate_output
        if use_llm is True:
            form_params["use_llm"] = use_llm
        if format_lines is True:
            form_params["format_lines"] = format_lines
        if strip_existing_ocr is True:
            form_params["strip_existing_ocr"] = strip_existing_ocr
        if redo_inline_math is True:
            form_params["redo_inline_math"] = redo_inline_math
        if disable_image_extraction is True:
            form_params["disable_image_extraction"] = disable_image_extraction
        if keep_chars is True:
            form_params["keep_chars"] = keep_chars
        
        # 添加调试输出
        print(f"🔧 API: 预设配置加载后的参数: {params_dict}")
        print(f"🔧 API: 显式传递的表单参数: {form_params}")
        
        # 用表单参数更新预设配置
        params_dict.update(form_params)
        
        print(f"🔧 API: 最终参数字典: {params_dict}")
        
        # 处理page_schema JSON字符串
        if page_schema:
            try:
                params_dict["page_schema"] = json.loads(page_schema)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="page_schema 必须是有效的JSON字符串")
        
        # 验证输出格式
        valid_formats = ['markdown', 'json', 'html', 'chunks']
        if params_dict.get('output_format', 'markdown') not in valid_formats:
            raise HTTPException(status_code=400, detail=f"output_format 必须是以下之一: {valid_formats}")
        
        # 处理文件（单文件或批量）
        if is_batch:
            # 批量处理
            results = []
            total_processing_time = 0
            
            for current_file in file_list:
                file_start_time = time.time()
                try:
                    with TemporaryDirectory() as temp_dir:
                        temp_path = Path(temp_dir) / current_file.filename
                        with open(temp_path, "wb") as buffer:
                            buffer.write(await current_file.read())
                        
                        # 获取文档页数
                        pdf_document = fitz.open(temp_path)
                        total_pages = pdf_document.page_count
                        pdf_document.close()
                        
                        # 提交到进程池处理
                        loop = asyncio.get_running_loop()
                        file_result = await loop.run_in_executor(
                            my_pool,
                            process_pdf,
                            str(temp_path),
                            params_dict,
                            temp_dir
                        )
                        
                        file_processing_time = time.time() - file_start_time
                        total_processing_time += file_processing_time
                        
                        if file_result.get("status") == "success":
                            # 构建单文件响应
                            file_response = {
                                "filename": current_file.filename,
                                "success": True,
                                "pages": total_pages,
                                "processing_time": file_processing_time,
                                "output_format": params_dict.get('output_format', 'markdown')
                            }
                            
                            output_format = params_dict.get('output_format', 'markdown')
                            
                            if output_format == 'json':
                                file_response["data"] = file_result.get("data")
                                file_response["metadata"] = file_result.get("metadata", {})
                            elif output_format == 'chunks':
                                file_response["chunks"] = file_result.get("chunks")
                                file_response["metadata"] = file_result.get("metadata", {})
                                if file_result.get("text"):
                                    file_response["text"] = file_result["text"]
                            else:
                                # markdown 或 html 格式
                                text = file_result.get("text", "")
                                images = file_result.get("images", {})
                                
                                if output_format == 'markdown' and images:
                                    # 嵌入base64图像
                                    text = embed_images_as_base64(text, images)
                                
                                file_response["text"] = text
                                file_response["markdown"] = text  # 保持向后兼容
                                file_response["images"] = images
                                file_response["metadata"] = file_result.get("metadata", {})
                            
                            results.append(file_response)
                        else:
                            results.append({
                                "filename": current_file.filename,
                                "success": False,
                                "error": file_result.get("message", "Unknown error"),
                                "traceback": file_result.get("traceback", ""),
                                "processing_time": file_processing_time
                            })
                            
                except Exception as e:
                    results.append({
                        "filename": current_file.filename,
                        "success": False,
                        "error": f"处理异常: {str(e)}",
                        "traceback": traceback.format_exc(),
                        "processing_time": time.time() - file_start_time
                    })
            
            # 返回批量处理结果
            return {
                "success": True,
                "message": "",
                "batch": True,
                "total_files": len(file_list),
                "total_processing_time": total_processing_time,
                "results": results
            }
        
        else:
            # 单文件处理
            with TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir) / file.filename
                with open(temp_path, "wb") as buffer:
                    buffer.write(await file.read())
                
                # 获取文档页数
                pdf_document = fitz.open(temp_path)
                total_pages = pdf_document.page_count
                pdf_document.close()
                
                # 提交到进程池处理
                loop = asyncio.get_running_loop()
                results = await loop.run_in_executor(
                    my_pool,
                    process_pdf,
                    str(temp_path),
                    params_dict,
                    temp_dir
                )
                
                processing_time = time.time() - s_time
                
                if results.get("status") != "success":
                    return {
                        "success": False,
                        "message": "",
                        "error": results.get("message", "Unknown error"),
                        "traceback": results.get("traceback", ""),
                        "processing_time": processing_time
                    }
                
                # 根据输出格式构建响应
                response = {
                    "success": True,
                    "message": "",
                    "batch": False,
                    "pages": total_pages,
                    "processing_time": processing_time,
                    "output_format": params_dict.get('output_format', 'markdown')
                }
                
                output_format = params_dict.get('output_format', 'markdown')
                
                if output_format == 'json':
                    response["data"] = results.get("data")
                    response["metadata"] = results.get("metadata", {})
                elif output_format == 'chunks':
                    response["chunks"] = results.get("chunks")
                    response["metadata"] = results.get("metadata", {})
                    if results.get("text"):
                        response["text"] = results["text"]
                else:
                    # markdown 或 html 格式
                    text = results.get("text", "")
                    images = results.get("images", {})
                    
                    if output_format == 'markdown' and images:
                        # 嵌入base64图像
                        text = embed_images_as_base64(text, images)
                    
                    response["text"] = text
                    response["markdown"] = text  # 保持向后兼容
                    response["images"] = images
                    response["metadata"] = results.get("metadata", {})
                
                return response
            
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "message": "",
            "error": f"处理异常: {str(e)}",
            "traceback": traceback.format_exc(),
            "processing_time": time.time() - s_time
        }






if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7434)
