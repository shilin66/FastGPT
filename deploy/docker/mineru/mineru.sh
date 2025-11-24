export MINERU_MODEL_SOURCE=local
CUDA_VISIBLE_DEVICES=1,2  MINERU_MODE=vlm MINERU_VLM_BACKEND=vllm-async-engine nohup python new.py &> pdf.log &