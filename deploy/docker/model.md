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
export CUDA_VISIBLE_DEVICES=0,1,2,3,4,5,6,7
nohup vllm serve /data/models/qwen3-32b -tp 8  --port 38589 --api-key sk-jH6jShOekAcK1m9H2c397b44153f4fD6B9FeAb6c9f1fD311  --reasoning-parser qwen3 --served-model-name qwen3-32b --dtype auto --enable-prefix-caching --max-num-batched-tokens 4096  --enable-chunked-prefill --rope-scaling '{"factor": 4.0,"original_max_position_embeddings": 32768,"rope_type": "yarn"}'  --rope-theta 1000000.0 --tokenizer /data/models/qwen3-32b --tool-call-parser hermes --enable-auto-tool-choice  > qwen3.out 2>&1 &```
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