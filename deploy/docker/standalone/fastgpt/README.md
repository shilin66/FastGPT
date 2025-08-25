## 快速部署
1. docker compose 文件中mem0容器设置以下环境变量
```dotenv
# embedding模型访问配置
OPENAI_EMBEDDING_BASE_URL=
OPENAI_EMBEDDING_API_KEY=
EMBEDDING_MODEL=

# llm模型访问配置，需要支持json_object输出的模型
OPENAI_LLM_BASE_URL=
OPENAI_LLM_API_KEY=
LLM_MODEL=
```

2. 修改config.json以下属性
`docUrl`,`mcpServerProxyEndpoint`,`navbarItems[0].url`中ip替换为实际访问的ip。

3. 运行docker compose，等待所有容器启动成功
```bash

docker compose -f docker-compose-milvus.yml up -d
```

4. 启动成功后访问FastGpt http://ip:3000  
用户名：`root`  密码：`Uehfy.123@`