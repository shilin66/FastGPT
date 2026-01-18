#  安装conda
```bash

wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh

## 验证安装包(可选) 查看 sha256与官网是否一致 https://repo.anaconda.com/archive/
shasum -a 256 ~/Anaconda3-2025.06-0-Linux-x86_64.sh

bash ~/Anaconda3-2025.06-0-Linux-x86_64.sh

source ~/.bashrc
```

## 常用命令
| 功能      | 命令示例                                   | 说明                               |
| ------- | -------------------------------------- | -------------------------------- |
| 列出所有环境  | `conda env list` 或 `conda info --envs` | 查看当前系统中已创建的所有 Conda 环境。          |
| 创建新环境   | `conda create -n myenv python=3.10`    | 创建名为 `myenv`、Python 3.10 的新环境。   |
| 激活环境    | `conda activate myenv`                 | 切换到名为 `myenv` 的环境。               |
| 退出当前环境  | `conda deactivate`                     | 返回到 base 环境或系统默认 Python。         |
| 删除环境    | `conda env remove -n myenv`            | 删除名为 `myenv` 的环境（连同其中所有包）。       |
| 导出环境配置  | `conda env export > env.yml`           | 将当前环境配置（包括包和版本）导出到 `env.yml` 文件。 |
| 从文件创建环境 | `conda env create -f env.yml`          | 根据 `env.yml` 文件重建环境。             |


##  docker 安装配置
安装：https://docs.docker.com/engine/install/ubuntu/
配置数据目录存在/data/docker
```shell
cat > /etc/docker/daemon.json <<'EOF'
{
  "data-root": "/data/docker"
}
EOF
```

## screen

```shell
 apt install screen -y
 
 # 启动一个session
 screen -S mysession

 # 列出所有screen
 screen -ls
 
 # 从会话中“分离”（后台运行）
 Ctrl + A  然后按 D

 # 恢复会话
 screen -r mysession

```

## Qwen3
# vllm环境创建
```bash

conda create -n qwen3-32b python=3.12 -c https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main

## 安装 vllm
pip install vllm -i https://pypi.tuna.tsinghua.edu.cn/simple --extra-index-url https://download.pytorch.org/whl/cu128
```

创建 `qwen3.sh`
`chmod +x qwen3.sh`
```bash

#!/bin/bash
CUDA_VISIBLE_DEVICES=0,1
nohup vllm serve /data/Qwen3-32B-FP8 -tp 2 --port 38589 --api-key sk-jH6jShOekAcK1m9H2c397b44153f4fD6B9FeAb6c9f1fD311  --reasoning-parser qwen3 --served-model-name qwen3-32b --dtype auto --enable-prefix-caching --max-num-batched-tokens 4096  --enable-chunked-prefill --rope-scaling '{"factor": 4.0,"original_max_position_embeddings": 32768,"rope_type": "yarn"}'  --tokenizer /data/Qwen3-32B-FP8 --tool-call-parser hermes --enable-auto-tool-choice  > qwen3.out 2>&1 &
```

## GLM

```shell

#!/bin/bash
CUDA_VISIBLE_DEVICES=4,5,6,7 nohup vllm serve /data/models/GLM-4.1V-9B-Thinking  --port 38588 -tp 2 -dp 2 --api-key sk-W4auYmuBwDQv2d2aryLfV1wXqqdV2gxU1PnZJsgMZnqsN2Fb --enable-prefix-caching --max-num-batched-tokens 4096 --served-model-name GLM-4.1V-9B-Thinking --dtype auto  --enable-chunked-prefill --seed 8181 --chat-template chat_template.jinja  --chat-template-content-format openai  > vlm.out 2>&1 &
```

## Xinference
```bash

conda create -n xinference python=3.12 -c https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main
pip install "xinference[transformers]" -i https://pypi.tuna.tsinghua.edu.cn/simple


```
创建auth.json
```json
{
  "auth_config": {
    "algorithm": "HS256",
    "secret_key": "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7",
    "token_expire_in_minutes": 30
  },
  "user_config": [
    {
      "username": "root",
      "password": "dHeJHVNqw.W238",
      "permissions": [
        "admin"
      ],
      "api_keys": [
        "sk-72tkvudyGLPMi",
        "sk-ZOTLIY4gt9w11"
      ]
    }
  ]
}

```
```shell
vi /etc/systemd/system/xinference.service
```
```text
[Unit]
Description=xin
After=rc-local.service

[Service]
Type=simple
User=root
Group=root
Environment="XINFERENCE_HOME=/shzl/xin"
Environment="PATH=/root/miniforge3/envs/xin/bin:$PATH"
Environment="PYTHONPATH=/root/miniforge3/envs/xin/lib/python3.12/site-packages"
ExecStart=/root/miniforge3/envs/xin/bin/xinference-local --host 0.0.0.0  --port 9997 --auth-config /shzl/xin/authen.json --log-level info
Restart=always

[Install]
WantedBy=multi-user.target

```


## mineru

```shell
conda create -n mineru python=3.12 -c https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main
pip install --upgrade pip -i https://mirrors.aliyun.com/pypi/simple
pip install "mineru[all]"==2.1.4 -i https://mirrors.aliyun.com/pypi/simple

export MINERU_MODEL_SOURCE=modelscope
mineru-models-download

sudo apt update
sudo apt install fonts-noto-core
sudo apt install fonts-noto-cjk
fc-cache -fv
```

## marker pdf

```shell
pip install marker-pdf[full]

```
xinference launch -e http://192.168.16.2:9997  -ak sk-72tkvudyGLPMi --model-name bge-m3 --model-type embedding --replica 1 --n-gpu auto --gpu-idx 0 --download_hub modelscope --model-path /home/nvme01/models/BAAI/bge-m3 --model-engine vllm --model-format pytorch --quantization none --worker-ip 192.168.16.2

CUDA_VISIBLE_DEVICES=4,5 \
VLLM_ATTENTION_BACKEND=DUAL_CHUNK_FLASH_ATTN VLLM_USE_V1=0 \
nohup vllm serve /data/model/Qwen3-30B-A3B-Instruct-2507-FP8/ \
--tensor-parallel-size 2 \
--max-model-len 98304 \
--enable-chunked-prefill \
--max-num-batched-tokens 98304 \
--enforce-eager \
--max-num-seqs 64 \
--gpu-memory-utilization 0.85 &>30B-A3B.log &


CUDA_VISIBLE_DEVICES=4,5 \
VLLM_ATTENTION_BACKEND=DUAL_CHUNK_FLASH_ATTN VLLM_USE_V1=0 \
vllm serve /data/model/Qwen3-30B-A3B-Instruct-2507-FP8/ \
--tensor-parallel-size 2 \
--max-model-len 98304 \
--enable-chunked-prefill \
--max-num-batched-tokens 98304 \
--enforce-eager \
--max-num-seqs 64 \
--gpu-memory-utilization 

CUDA_VISIBLE_DEVICES=4,5  VLLM_USE_V1=0 nohup vllm serve /data/Qwen3-30B-A3B-Instruct-2507-FP8/  --port 38001 --api-key sk-SBwKcDv111IateoguD82706747f034818984cD731De0a13Ab --tensor-parallel-size 2 --max-model-len 80000 --enable-chunked-prefill --max-num-batched-tokens 98304 --enforce-eager --max-num-seqs 64 &>30B-A3B.log &

CUDA_VISIBLE_DEVICES=6,7 nohup vllm serve /data/DeepSeek-R1-Distill-Qwen-32B-FP8 --port 38003 --api-key sk-SBwKcDv111IateoguD82706747f034818984cD731De0a13Ab --tensor-parallel-size 2 --max-model-len 32768 --enable-chunked-prefill --max-num-batched-tokens 4096  --max-num-seqs 64 &>deepseek.log &

Initializing a V1 LLM engine (v0.13.0) with config: model='/data/DeepSeek-R1-Distill-Qwen-32B-FP8', speculative_config=None, tokenizer='/data/DeepSeek-R1-Distill-Qwen-32B-FP8', skip_tokenizer_init=False, tokenizer_mode=auto, revision=None, tokenizer_revision=None, trust_remote_code=False, dtype=torch.bfloat16, max_seq_len=16384, download_dir=None, load_format=auto, tensor_parallel_size=2, pipeline_parallel_size=1, data_parallel_size=1, disable_custom_all_reduce=False, quantization=fp8, enforce_eager=False, kv_cache_dtype=auto, device_config=cuda, structured_outputs_config=StructuredOutputsConfig(backend='auto', disable_fallback=False, disable_any_whitespace=False, disable_additional_properties=False, reasoning_parser='', reasoning_parser_plugin='', enable_in_reasoning=False), observability_config=ObservabilityConfig(show_hidden_metrics_for_version=None, otlp_traces_endpoint=None, collect_detailed_traces=None, kv_cache_metrics=False, kv_cache_metrics_sample=0.01, cudagraph_metrics=False, enable_layerwise_nvtx_tracing=False), seed=0, served_model_name=/data/DeepSeek-R1-Distill-Qwen-32B-FP8, enable_prefix_caching=True, enable_chunked_prefill=True, pooler_config=None, compilation_config={'level': None, 'mode': <CompilationMode.VLLM_COMPILE: 3>, 'debug_dump_path': None, 'cache_dir': '', 'compile_cache_save_format': 'binary', 'backend': 'inductor', 'custom_ops': ['none'], 'splitting_ops': ['vllm::unified_attention', 'vllm::unified_attention_with_output', 'vllm::unified_mla_attention', 'vllm::unified_mla_attention_with_output', 'vllm::mamba_mixer2', 'vllm::mamba_mixer', 'vllm::short_conv', 'vllm::linear_attention', 'vllm::plamo2_mamba_mixer', 'vllm::gdn_attention_core', 'vllm::kda_attention', 'vllm::sparse_attn_indexer'], 'compile_mm_encoder': False, 'compile_sizes': [], 'compile_ranges_split_points': [4096], 'inductor_compile_config': {'enable_auto_functionalized_v2': False, 'combo_kernels': True, 'benchmark_combo_kernel': True}, 'inductor_passes': {}, 'cudagraph_mode': <CUDAGraphMode.FULL_AND_PIECEWISE: (2, 1)>, 'cudagraph_num_of_warmups': 1, 'cudagraph_capture_sizes': [1, 2, 4, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 128], 'cudagraph_copy_inputs': False, 'cudagraph_specialize_lora': True, 'use_inductor_graph_partition': False, 'pass_config': {'fuse_norm_quant': False, 'fuse_act_quant': False, 'fuse_attn_quant': False, 'eliminate_noops': True, 'enable_sp': False, 'fuse_gemm_comms': False, 'fuse_allreduce_rms': False}, 'max_cudagraph_capture_size': 128, 'dynamic_shapes_config': {'type': <DynamicShapesType.BACKED: 'backed'>, 'evaluate_guards': False}, 'local_cache_dir': None}