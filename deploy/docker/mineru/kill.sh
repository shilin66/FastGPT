#!/bin/bash

PORT=7434

# 获取监听指定端口的所有进程PID（跳过标题行）
PIDS=$(lsof -i :$PORT | awk 'NR>1 {print $2}' | sort -u)

if [ -z "$PIDS" ]; then
    echo "No processes found running on port $PORT."
    exit 0
fi

echo "Found processes to kill:"
lsof -i :$PORT

# 杀死所有相关进程
echo -e "\nKilling processes..."
for PID in $PIDS; do
    kill -9 $PID
    echo "Killed PID: $PID"
done

echo -e "\nVerifying processes after kill:"
lsof -i :$PORT || echo "No remaining processes found."
