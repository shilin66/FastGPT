目标机器 172.16.128.59


## 1.GPU资源规划  ??L20 主机待装驱动  CPU是否为信创
root@ubuntu:~# uname -a
Linux ubuntu 5.15.0-161-generic #171-Ubuntu SMP Sat Oct 11 08:17:01 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux
apt源仓库
#ubuntu 22.04 LTS
wget  http://10.172.4.123:22080/sources_22.04.list -O /etc/apt/sources.list

NVIDIA CUDA Version和Driver Version版本对应关系
https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/index.html

CUDA Toolkit  Toolkit Driver Version
CUDA 12.8 GA  >=570.26

NVIDIA Driver Version驱动下载地址
https://download.nvidia.com/XFree86/Linux-x86_64/

Data Center Driver for Ubuntu 22.04 570.195.03 | Linux 64-bit Ubuntu 22.04   待下载
https://www.nvidia.cn/drivers/details/255919/

CUDA Toolkit 12.8 Downloads   待下载
https://developer.nvidia.com/cuda-12-8-0-download-archive?target_os=Linux&target_arch=x86_64&Distribution=Ubuntu&target_version=22.04&target_type=deb_local
下载链接
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-ubuntu2204.pin
wget https://developer.download.nvidia.com/compute/cuda/12.8.0/local_installers/cuda-repo-ubuntu2204-12-8-local_12.8.0-570.86.10-1_amd64.deb



##查看显卡信息
nvidia-smi


| GPU | 显存  | 数量 | 模型                                     | ip             |
|-----|-----|----|----------------------------------------|----------------|
| L20 | 48G | 2  | Qwen3-30B-A3B-Thinking-2507-FP8        | 172.16.128.59  |
| L20 | 48G | 2  | Qwen3-30B-A3B-Instruct-2507-FP8        | 172.16.128.59  |
| A40 | 48G | 1  | MiMo-VL-7B-RL-2508                     | 10.164.193.91  | 
| A40 | 48G | 1  | Qwen3-Embedding-8B & Qwen3-Reranker-8B | 10.164.193.91  |
| T4  | 16G | 4  | mineru                                 | 10.164.200.130 |     

需要下载上述相关模型文件的tensorflow对应版本

Qwen3-30B-A3B-Thinking-2507-FP8模型的tensorflow对应版本下载地址
Qwen3-VL-32B-Instruct-FP8模型的tensorflow对应版本下载地址
Qwen3-Embedding-8B模型的tensorflow对应版本下载地址
Qwen3-Reranker-8B模型的tensorflow对应版本下载地址
mineru模型的tensorflow对应版本下载地址

## 2.环境与依赖
- 建议使用anaconda或者uv进行虚拟环境管理，以下为anaconda的一些使用说明：

### 安装Miniconda
```shell

# 参考https://www.anaconda.com/docs/getting-started/miniconda/install
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash ~/Miniconda3-latest-Linux-x86_64.sh
source ~/.bashrc
```

### 常用命令

| 功能      | 命令示例                                   | 说明                               |
|---------|----------------------------------------|----------------------------------|
| 列出所有环境  | `conda env list` 或 `conda info --envs` | 查看当前系统中已创建的所有 Conda 环境。          |
| 创建新环境   | `conda create -n myenv python=3.12`    | 创建名为 `myenv`、Python 3.12 的新环境。   |
| 激活环境    | `conda activate myenv`                 | 切换到名为 `myenv` 的环境。               |
| 退出当前环境  | `conda deactivate`                     | 返回到 base 环境或系统默认 Python。         |
| 删除环境    | `conda env remove -n myenv`            | 删除名为 `myenv` 的环境（连同其中所有包）。       |
| 导出环境配置  | `conda env export > env.yml`           | 将当前环境配置（包括包和版本）导出到 `env.yml` 文件。 |
| 从文件创建环境 | `conda env create -f env.yml`          | 根据 `env.yml` 文件重建环境。             |

### vllm安装

```shell
# 创建虚拟环境
conda create -n vllm python=3.12 
# 激活虚拟环境
conda activate vllm
# 安装 vllm
pip install vllm
```
vllm下载链接
https://pypi.org/project/vllm/0.10.0/#files

### lmdeploy安装
```shell
# 创建虚拟环境
conda create -n lmdeploy python=3.12 
# 激活虚拟环境
conda activate lmdeploy
# 安装 vllm
pip install lmdeploy
```
lmdeploy下载链接
https://pypi.org/project/lmdeploy/#history


## 3.模型下载（Modelscope / Hugging Face）
- 国内优先 modelscope，外网优先 Hugging Face
- 建议下载到统一目录，例如 /model/xxx
### 以下为modelscope下载模型示例：
``` shell
# 创建并激活虚拟环境
conda create -n modelscope python=3.12
conda activate modelscope
# 安装 modelscope
pip install modelscope
# 下载模型
modelscope models download Qwen/Qwen3-30B-A3B-Thinking-2507-FP8 --local_dir /model/Qwen3-30B-A3B-Thinking-2507-FP8
modelscope models download Qwen/Qwen3-30B-A3B-Instruct-2507-FP8 --local_dir /model/Qwen3-30B-A3B-Instruct-2507-FP8
modelscope models download XiaomiMiMo/MiMo-VL-7B-RL-2508        --local_dir /model/MiMo-VL-7B-RL-2508
modelscope models download Qwen/Qwen3-Embedding-8B              --local_dir /model/Qwen3-Embedding-8B
modelscope models download Qwen/Qwen3-Reranker-8B               --local_dir /model/Qwen3-Reranker-8B
modelscope models download OpenDataLab/MinerU2.5-2509-1.2B      --local_dir /model/MinerU2.5-2509-1.2B
```

## 4.部署模型
### Qwen3-30B-A3B-Thinking-2507-FP8部署
```shell
# lmdeploy
CUDA_VISIBLE_DEVICES=0,1,2,3 nohup lmdeploy serve api_server /model/Qwen3-30B-A3B-Thinking-2507-FP8 --quant-policy 8  --server-port 38000 --api-keys sk-nHfo3jUTit4mzpZk37De9bFbC9144bFa9546Aa540c74DfE0  --tp 4  --model-name Qwen3-30B-A3B-Thinking  --enable-prefix-caching --cache-max-entry-count 0.2 --session-len 131072  --log-level INFO    --backend turbomind &> qwen3-thinking.log &

# vllm
CUDA_VISIBLE_DEVICES=0,1,2,3 nohup vllm serve  /model/Qwen3-30B-A3B-Thinking-2507-FP8  -tp 4 --port 38000 --api-key sk-nHfo3jUTit4mzpZk37De9bFbC9144bFa9546Aa540c74DfE0 --gpu-memory-utilization 0.95 --enable-reasoning --reasoning-parser deepseek_r1 --served-model-name Qwen3-30B-A3B-Thinking --dtype auto  --kv-cache-dtype fp8  --enable-prefix-caching --max-num-batched-tokens 4096  --enable-chunked-prefill --max-model-len 131072  > qwen3.out 2>&1 &
```

### Qwen3-30B-A3B-Instruct-2507-FP8部署
```shell
# lmdeploy
CUDA_VISIBLE_DEVICES=4,5,6,7 nohup lmdeploy serve api_server /model/Qwen3-30B-A3B-Instruct-2507-FP8 --quant-policy 8  --server-port 38001 --api-keys sk-nHfo3jUTit4mzpZk37De9bFbC9144bFa9546Aa540c74DfE0  --tp 4  --model-name Qwen3-30B-A3B-Instruct  --enable-prefix-caching --cache-max-entry-count 0.2  --session-len 131072 --log-level INFO  --backend turbomind &> qwen3-instruct.log &

# vllm
CUDA_VISIBLE_DEVICES=4,5,6,7 nohup vllm serve  /model/Qwen3-30B-A3B-Instruct-2507-FP8  -tp 4 --port 38001 --api-key sk-nHfo3jUTit4mzpZk37De9bFbC9144bFa9546Aa540c74DfE0 --gpu-memory-utilization 0.95 --served-model-name Qwen3-30B-A3B-Instruct --dtype auto  --kv-cache-dtype fp8  --enable-prefix-caching --max-num-batched-tokens 4096  --enable-chunked-prefill --max-model-len 131072  > qwen3.out 2>&1 &

```

### MiMo-VL-7B-RL-2508部署
```shell
# vllm
CUDA_VISIBLE_DEVICES=0 nohup vllm serve /model/MiMo-VL-7B-RL-2508 --port 38000 --api-key sk-5NQ8OTOo8e1rMBm224590f72E8A2415692432cA3B2646d4e  -api-key sk-jH6jShOekAcK1m9H2c397b44153f4fD6B9FeAb6c9f1fD311  --served-model-name MiMo-VL-7B-RL-2508 --dtype auto --seed 538 --max-num-seqs 50 --enable-prefix-caching --enable-chunked-prefill > mimo.out 2>&1 &
```


### Qwen3-Embedding-8B部署
```shell
# vllm
CUDA_VISIBLE_DEVICES=1 nohup vllm serve  /model/Qwen3-Embedding-8B   --port 28681 --api-key sk-SwKcDv111IateoguD82706747f034818984cD731De0a13Ab --served-model-name Qwen3-Embedding-8B --task embed  &> embedding.log &

```

### Qwen3-Reranker-8B部署
```shell
# vllm
CUDA_VISIBLE_DEVICES=1 nohup vllm serve /model/Qwen3-Reranker-8B  --port 28680 --api-key sk-SwKcDv111IateoguD82706747f034818984cD731De0a13Ab --served-model-name Qwen3-Reranker-8B --hf_overrides '{"architectures": ["Qwen3ForSequenceClassification"],"classifier_from_token": ["no", "yes"],"is_original_qwen3_reranker": true}'   &> qwen3-rerank.log &

```

### MinerU部署

```shell
# 创建虚拟环境与安装依赖
conda create -n mineru python=3.12
conda activate mineru
pip install --upgrade pip
pip install "mineru[all]"

```
- 在root目录下创建`mineru.json`，注意`models-dir.vlm`的路径,内容如下：
```json
{
    "bucket_info":{
        "bucket-name-1":["ak", "sk", "endpoint"],
        "bucket-name-2":["ak", "sk", "endpoint"]
    },
    "latex-delimiter-config": {
        "display": {
            "left": "$$",
            "right": "$$"
        },
        "inline": {
            "left": "$",
            "right": "$"
        }
    },
    "llm-aided-config": {
        "title_aided": {
            "api_key": "your_api_key",
            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "model": "qwen3-next-80b-a3b-instruct",
            "enable_thinking": false,
            "enable": false
        }
    },
    "models-dir": {
        "pipeline": "",
        "vlm": "/model/MinerU2.5-2509-1.2B"
    },
    "config_version": "1.3.1"
}
```
- `new.py`是启动脚本
#### 启动mineru
```shell
CUDA_VISIBLE_DEVICES=0,1,2,3 MINERU_MODEL_SOURCE=local MINERU_MODE=vlm MINERU_VLM_BACKEND=vllm-async-engine nohup python new.py &> pdf.log &
```
- 首次仅启动服务进程不加载模型，需要调用一次接口后，才加载模型，所以首次调用接口会耗时较长，后续即可正常使用，不会重复加载模型
```shell
# curl调用示例
curl --location 'http://localhost:7434/v2/parse/file' --form 'file=@"/xxxx.pdf"'
```