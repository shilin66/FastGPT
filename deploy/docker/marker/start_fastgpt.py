#!/usr/bin/env python3
"""
FastGPT 启动脚本
支持环境变量配置和命令行参数
"""

import os
import sys
import argparse
import uvicorn
from pathlib import Path

def setup_environment():
    """设置环境变量"""
    # 默认环境变量
    defaults = {
        'HOST': '0.0.0.0',
        'PORT': '7434',
        'PROCESSES_PER_GPU': '1',
        'LOG_LEVEL': 'info'
    }
    
    for key, value in defaults.items():
        if key not in os.environ:
            os.environ[key] = value
    
    # 设置正确的 TORCH_DEVICE
    if 'TORCH_DEVICE' not in os.environ or os.environ['TORCH_DEVICE'] == 'auto':
        try:
            import torch
            if torch.cuda.is_available():
                os.environ['TORCH_DEVICE'] = 'cuda'
            else:
                os.environ['TORCH_DEVICE'] = 'cpu'
        except ImportError:
            os.environ['TORCH_DEVICE'] = 'cpu'

def check_dependencies():
    """检查依赖项"""
    try:
        import torch
        import fastapi
        import marker
        print(f"✅ PyTorch: {torch.__version__}")
        print(f"✅ FastAPI: {fastapi.__version__}")
        print(f"✅ Marker: {marker.__version__ if hasattr(marker, '__version__') else 'installed'}")
        
        # 检查CUDA
        if torch.cuda.is_available():
            print(f"✅ CUDA: {torch.version.cuda}")
            print(f"✅ GPU数量: {torch.cuda.device_count()}")
            for i in range(torch.cuda.device_count()):
                gpu_name = torch.cuda.get_device_name(i)
                gpu_memory = torch.cuda.get_device_properties(i).total_memory / 1024**3
                print(f"   GPU {i}: {gpu_name} ({gpu_memory:.1f}GB)")
        else:
            print("⚠️  CUDA不可用，将使用CPU模式")
        
        return True
    except ImportError as e:
        print(f"❌ 缺少依赖: {e}")
        return False

def check_config_files():
    """检查配置文件"""
    config_file = Path("openai_ocr_config.json")
    if config_file.exists():
        print(f"✅ 配置文件: {config_file}")
        try:
            import json
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
            print(f"   预设配置数量: {len(config)}")
            print(f"   可用预设: {list(config.keys())}")
        except Exception as e:
            print(f"⚠️  配置文件格式错误: {e}")
    else:
        print(f"⚠️  配置文件不存在: {config_file}")

def main():
    parser = argparse.ArgumentParser(description='FastGPT API 服务器')
    parser.add_argument('--host', default=os.getenv('HOST', '0.0.0.0'), 
                       help='服务器主机地址 (默认: 0.0.0.0)')
    parser.add_argument('--port', type=int, default=int(os.getenv('PORT', '7434')), 
                       help='服务器端口 (默认: 7434)')
    parser.add_argument('--processes-per-gpu', type=int, 
                       default=int(os.getenv('PROCESSES_PER_GPU', '1')),
                       help='每个GPU的进程数 (默认: 1)')
    parser.add_argument('--log-level', default=os.getenv('LOG_LEVEL', 'info'),
                       choices=['debug', 'info', 'warning', 'error'],
                       help='日志级别 (默认: info)')
    parser.add_argument('--reload', action='store_true',
                       help='启用自动重载 (开发模式)')
    parser.add_argument('--check-only', action='store_true',
                       help='只检查环境，不启动服务器')
    
    args = parser.parse_args()
    
    print("🚀 FastGPT API 服务器启动")
    print("=" * 50)
    
    # 设置环境变量
    os.environ['HOST'] = args.host
    os.environ['PORT'] = str(args.port)
    os.environ['PROCESSES_PER_GPU'] = str(args.processes_per_gpu)
    os.environ['LOG_LEVEL'] = args.log_level
    
    setup_environment()
    
    # 检查依赖
    print("\n🔍 检查系统环境...")
    if not check_dependencies():
        print("\n❌ 环境检查失败，请安装必要的依赖")
        sys.exit(1)
    
    # 检查配置文件
    print("\n🔍 检查配置文件...")
    check_config_files()
    
    if args.check_only:
        print("\n✅ 环境检查完成")
        return
    
    # 显示启动信息
    print(f"\n🌐 服务器配置:")
    print(f"   主机: {args.host}")
    print(f"   端口: {args.port}")
    print(f"   每GPU进程数: {args.processes_per_gpu}")
    print(f"   日志级别: {args.log_level}")
    print(f"   自动重载: {'是' if args.reload else '否'}")
    
    print(f"\n📚 API文档:")
    print(f"   Swagger UI: http://{args.host}:{args.port}/docs")
    print(f"   ReDoc: http://{args.host}:{args.port}/redoc")
    print(f"   健康检查: http://{args.host}:{args.port}/v2/health")
    
    print(f"\n📖 使用示例:")
    print(f"   curl -X POST \"http://{args.host}:{args.port}/v2/parse/file\" \\")
    print(f"     -F \"file=@document.pdf\" \\")
    print(f"     -F \"output_format=markdown\"")
    
    print("\n" + "=" * 50)
    print("🎯 服务器启动中...")
    
    try:
        # 启动服务器
        uvicorn.run(
            "fastgpt:app",
            host=args.host,
            port=args.port,
            log_level=args.log_level,
            reload=args.reload,
            access_log=True
        )
    except KeyboardInterrupt:
        print("\n\n👋 服务器已停止")
    except Exception as e:
        print(f"\n❌ 服务器启动失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
