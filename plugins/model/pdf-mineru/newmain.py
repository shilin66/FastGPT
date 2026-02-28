import json
import os
from glob import glob
import tempfile
import shutil
import re
import imghdr
import uvicorn
import base64
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from loguru import logger
from mineru.cli.common import convert_pdf_bytes_to_bytes_by_pypdfium2, prepare_env, read_fn
import copy
from mineru.data.data_reader_writer import FileBasedDataWriter
from mineru.utils.draw_bbox import draw_layout_bbox, draw_span_bbox
from mineru.utils.enum_class import MakeMode
from mineru.backend.vlm.vlm_analyze import aio_doc_analyze as aio_vlm_doc_analyze
from mineru.backend.pipeline.pipeline_analyze import doc_analyze as pipeline_doc_analyze
from mineru.backend.pipeline.pipeline_middle_json_mkcontent import union_make as pipeline_union_make
from mineru.backend.pipeline.model_json_to_middle_json import result_to_middle_json as pipeline_result_to_middle_json
from mineru.backend.vlm.vlm_middle_json_mkcontent import union_make as vlm_union_make
from mineru.utils.models_download_utils import auto_download_and_get_model_root_path

app = FastAPI()

pdf_extensions = [".pdf"]
office_extensions = [".ppt", ".pptx", ".doc", ".docx"]
image_extensions = [".png", ".jpg", ".jpeg", ".bmp"]


async def do_parse(
    output_dir,
    pdf_file_names: list[str],
    pdf_bytes_list: list[bytes],
    p_lang_list: list[str],
    backend="pipeline",  # 默认改为pipeline避免异步问题
    parse_method="auto",
    formula_enable=True,
    table_enable=True,
    server_url=None,
    f_draw_layout_bbox=True,
    f_draw_span_bbox=True,
    f_dump_md=True,
    f_dump_middle_json=True,
    f_dump_model_output=True,
    f_dump_orig_pdf=True,
    f_dump_content_list=True,
    f_make_md_mode=MakeMode.MM_MD,
    start_page_id=0,
    end_page_id=None,
):
    if backend == "pipeline":
        for idx, pdf_bytes in enumerate(pdf_bytes_list):
            new_pdf_bytes = convert_pdf_bytes_to_bytes_by_pypdfium2(pdf_bytes, start_page_id, end_page_id)
            pdf_bytes_list[idx] = new_pdf_bytes

        infer_results, all_image_lists, all_pdf_docs, lang_list, ocr_enabled_list = pipeline_doc_analyze(pdf_bytes_list, p_lang_list, parse_method=parse_method, formula_enable=formula_enable,table_enable=table_enable)

        for idx, model_list in enumerate(infer_results):
            model_json = copy.deepcopy(model_list)
            pdf_file_name = pdf_file_names[idx]
            local_image_dir, local_md_dir = prepare_env(output_dir, pdf_file_name, parse_method)
            image_writer, md_writer = FileBasedDataWriter(local_image_dir), FileBasedDataWriter(local_md_dir)

            images_list = all_image_lists[idx]
            pdf_doc = all_pdf_docs[idx]
            _lang = lang_list[idx]
            _ocr_enable = ocr_enabled_list[idx]
            middle_json = pipeline_result_to_middle_json(model_list, images_list, pdf_doc, image_writer, _lang, _ocr_enable, formula_enable)

            pdf_info = middle_json["pdf_info"]

            pdf_bytes = pdf_bytes_list[idx]
            if f_draw_layout_bbox:
                draw_layout_bbox(pdf_info, pdf_bytes, local_md_dir, f"{pdf_file_name}_layout.pdf")

            if f_draw_span_bbox:
                draw_span_bbox(pdf_info, pdf_bytes, local_md_dir, f"{pdf_file_name}_span.pdf")

            if f_dump_orig_pdf:
                md_writer.write(
                    f"{pdf_file_name}_origin.pdf",
                    pdf_bytes,
                )

            if f_dump_md:
                image_dir = str(os.path.basename(local_image_dir))
                md_content_str = pipeline_union_make(pdf_info, f_make_md_mode, image_dir)
                md_writer.write_string(
                    f"{pdf_file_name}.md",
                    md_content_str,
                )

            if f_dump_content_list:
                image_dir = str(os.path.basename(local_image_dir))
                content_list = pipeline_union_make(pdf_info, MakeMode.CONTENT_LIST, image_dir)
                md_writer.write_string(
                    f"{pdf_file_name}_content_list.json",
                    json.dumps(content_list, ensure_ascii=False, indent=4),
                )

            if f_dump_middle_json:
                md_writer.write_string(
                    f"{pdf_file_name}_middle.json",
                    json.dumps(middle_json, ensure_ascii=False, indent=4),
                )

            if f_dump_model_output:
                md_writer.write_string(
                    f"{pdf_file_name}_model.json",
                    json.dumps(model_json, ensure_ascii=False, indent=4),
                )

            logger.info(f"local output dir is {local_md_dir}")
    else:
        if backend.startswith("vlm-"):
            backend = backend[4:]

        f_draw_span_bbox = False
        parse_method = "vlm"
        for idx, pdf_bytes in enumerate(pdf_bytes_list):
            try:
                pdf_file_name = pdf_file_names[idx]
                pdf_bytes = convert_pdf_bytes_to_bytes_by_pypdfium2(pdf_bytes, start_page_id, end_page_id)
                local_image_dir, local_md_dir = prepare_env(output_dir, pdf_file_name, parse_method)
                image_writer, md_writer = FileBasedDataWriter(local_image_dir), FileBasedDataWriter(local_md_dir)

                logger.info(f"Starting VLM analysis for {pdf_file_name}")

                middle_json, infer_result = await aio_vlm_doc_analyze(
                    pdf_bytes, image_writer=image_writer, backend=backend, server_url=server_url
                )

                logger.info(f"Completed VLM analysis for {pdf_file_name}")

                pdf_info = middle_json["pdf_info"]

            except Exception as e:
                logger.error(f"Error in VLM analysis thread: {str(e)}")
                raise

            if f_draw_layout_bbox:
                draw_layout_bbox(pdf_info, pdf_bytes, local_md_dir, f"{pdf_file_name}_layout.pdf")

            if f_dump_orig_pdf:
                md_writer.write(
                    f"{pdf_file_name}_origin.pdf",
                    pdf_bytes,
                )

            if f_dump_md:
                image_dir = str(os.path.basename(local_image_dir))
                md_content_str = pipeline_union_make(pdf_info, f_make_md_mode, image_dir)
                md_writer.write_string(
                    f"{pdf_file_name}.md",
                    md_content_str,
                )

            if f_dump_content_list:
                image_dir = str(os.path.basename(local_image_dir))
                content_list = pipeline_union_make(pdf_info, MakeMode.CONTENT_LIST, image_dir)
                md_writer.write_string(
                    f"{pdf_file_name}_content_list.json",
                    json.dumps(content_list, ensure_ascii=False, indent=4),
                )

            if f_dump_middle_json:
                md_writer.write_string(
                    f"{pdf_file_name}_middle.json",
                    json.dumps(middle_json, ensure_ascii=False, indent=4),
                )

            if f_dump_model_output:
                model_output = ("\n" + "-" * 50 + "\n").join(infer_result)
                md_writer.write_string(
                    f"{pdf_file_name}_model_output.txt",
                    model_output

                )

            logger.info(f"local output dir is {local_md_dir}")

async def parse_doc(
        path_list: list[Path],
        output_dir,
        lang="ch",
        backend="pipeline",  # 默认改为pipeline避免异步问题
        method="auto",
        server_url=None,
        start_page_id=0,
        end_page_id=None
):
    """
        Parameter description:
        path_list: List of document paths to be parsed, can be PDF or image files.
        output_dir: Output directory for storing parsing results.
        lang: Language option, default is 'ch', optional values include['ch', 'ch_server', 'ch_lite', 'en', 'korean', 'japan', 'chinese_cht', 'ta', 'te', 'ka']。
            Input the languages in the pdf (if known) to improve OCR accuracy.  Optional.
            Adapted only for the case where the backend is set to "pipeline"
        backend: the backend for parsing pdf:
            pipeline: More general.
            vlm-transformers: More general.
            vlm-sglang-engine: Faster(engine).
            vlm-sglang-client: Faster(client).
            without method specified, pipeline will be used by default.
        method: the method for parsing pdf:
            auto: Automatically determine the method based on the file type.
            txt: Use text extraction method.
            ocr: Use OCR method for image-based PDFs.
            Without method specified, 'auto' will be used by default.
            Adapted only for the case where the backend is set to "pipeline".
        server_url: When the backend is `sglang-client`, you need to specify the server_url, for example:`http://127.0.0.1:30000`
        start_page_id: Start page ID for parsing, default is 0
        end_page_id: End page ID for parsing, default is None (parse all pages until the end of the document)
    """
    try:
        file_name_list = []
        pdf_bytes_list = []
        lang_list = []
        for path in path_list:
            file_name = str(Path(path).stem)
            pdf_bytes = read_fn(path)
            file_name_list.append(file_name)
            pdf_bytes_list.append(pdf_bytes)
            lang_list.append(lang)
        await do_parse(
            output_dir=output_dir,
            pdf_file_names=file_name_list,
            pdf_bytes_list=pdf_bytes_list,
            p_lang_list=lang_list,
            backend=backend,
            parse_method=method,
            server_url=server_url,
            start_page_id=start_page_id,
            end_page_id=end_page_id
        )
    except Exception as e:
        logger.exception(e)


def encode_image(image_path):
    """Encode image using base64"""
    with open(image_path, "rb") as image_file:  # 以二进制模式读取
        image_data = image_file.read()
        return base64.b64encode(image_data).decode('utf-8').replace('\n', '')  # 解码为字符串

def get_mime_type(image_path):
    """动态检测图片MIME类型"""
    img_type = imghdr.what(image_path)
    return f"image/{img_type}" if img_type else "application/octet-stream"

@app.post(
    "/v2/parse/file",
    tags=["projects"],
    summary="Parse files using new API interface",
)
async def file_parse(
    file: UploadFile,
    backend: str = "vlm-sglang-engine",
    parse_method: str = "auto",
    lang: str = "ch",
    start_page_id: int = 0,
    end_page_id: int = None,
):
    """
    Parse uploaded file using new API interface.

    Args:
        file: The file to be parsed (PDF or image)
        backend: The backend to use (pipeline or vlm-*)
        parse_method: Parsing method (auto, txt, ocr)
        lang: Document language
        start_page_id: Start page ID
        end_page_id: End page ID
    """
    try:
        # Create temp directory with timestamp
        temp_dir = tempfile.mkdtemp(prefix="mineru_")
        logger.info(f"Created temp directory: {temp_dir}")

        # Save uploaded file with original filename
        temp_file = os.path.join(temp_dir, file.filename)
        logger.info(f"Saving uploaded file to: {temp_file}")

        with open(temp_file, "wb") as f:
            file_content = await file.read()
            f.write(file_content)
            logger.info(f"Saved {len(file_content)} bytes to temp file")

        # Parse file using new API
        output_dir = os.path.join(temp_dir, "output")
        file_name = os.path.splitext(file.filename)[0]

        await parse_doc(
            path_list=[Path(temp_file)],
            output_dir=output_dir,
            lang=lang,
            backend=backend,
            method=parse_method,
            start_page_id=start_page_id,
            end_page_id=end_page_id
        )

        # Get results - adjust paths to match parse_doc output structure
        result_dir = os.path.join(output_dir, f"{file_name}") if backend.startswith("pipeline") else os.path.join(output_dir, f"{file_name}/vlm")
        md_file = os.path.join(result_dir, f"{file_name}.md")
        image_dir = os.path.join(result_dir, "images")

        if not os.path.exists(md_file):
            raise FileNotFoundError(f"Output file not found: {md_file}")

        # Read markdown content
        with open(md_file, "r", encoding="utf-8") as f:
            md_content = f.read()

        # Process images
        data = {"images": {}}
        if os.path.exists(image_dir):
            image_paths = glob(f"{image_dir}/*.jpg")
            for image_path in image_paths:
                filename = os.path.basename(image_path)
                mime_type = get_mime_type(image_path)
                base64_str = encode_image(image_path)
                data["images"][filename] = f"data:{mime_type};base64,{base64_str}"

            # Replace image paths in markdown
            def replace_image(match):
                original_path = match.group(1)
                filename = original_path.split('/')[-1]
                if filename in data['images']:
                    return f'![{filename}]({data["images"][filename]})'
                return match.group(0)

            pattern = re.compile(r'!\[\]\((images/.*?)\)')
            md_content = pattern.sub(replace_image, md_content)

        # Get page count from model json
        model_json_file = os.path.join(output_dir, file_name, f"{file_name}_model.json")
        page_count = 0
        if os.path.exists(model_json_file):
            with open(model_json_file, "r", encoding="utf-8") as f:
                model_json = json.load(f)
                page_count = len(model_json)

        # Clean up with error handling
        try:
            logger.info(f"Cleaning up temp directory: {temp_dir}")
            shutil.rmtree(temp_dir)
            logger.info("Temp directory cleaned up successfully")
        except Exception as e:
            logger.error(f"Error cleaning up temp directory: {str(e)}")
            # Try to remove individual files if directory removal fails
            for root, dirs, files in os.walk(temp_dir, topdown=False):
                for name in files:
                    try:
                        os.remove(os.path.join(root, name))
                    except Exception as e:
                        logger.error(f"Failed to remove file {name}: {str(e)}")
                for name in dirs:
                    try:
                        os.rmdir(os.path.join(root, name))
                    except Exception as e:
                        logger.error(f"Failed to remove directory {name}: {str(e)}")

        return {
            "success": True,
            "message": "",
            "markdown": md_content,
            "pages": page_count,
        }

    except Exception as e:
        logger.exception(e)
        return JSONResponse(content={
                "success": False,
                "message": "",
                "error": f"Internal server error: {str(e)}"
            }, status_code=500)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7434)