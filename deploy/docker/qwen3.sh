#!/bin/bash
export CUDA_VISIBLE_DEVICES=0,1,2,6
nohup vllm serve  /home/nvme01/models/Qwen/Qwen3-32B-FP8  -tp 4  --port 38589 --api-key sk-jH6jShOekAcK1m9H2c397b44153f4fD6B9FeAb6c9f1fD311  --reasoning-parser qwen3 --served-model-name Qwen3-32B --dtype auto  --enable-prefix-caching --max-num-batched-tokens 4096  --enable-chunked-prefill --rope-scaling '{"factor": 4.0,"original_max_position_embeddings": 32768,"rope_type": "yarn"}'  --rope-theta 1000000.0 --tokenizer /home/nvme01/models/Qwen/Qwen3-32B-FP8 --tool-call-parser hermes --enable-auto-tool-choice > qwen3.out 2>&1 &
