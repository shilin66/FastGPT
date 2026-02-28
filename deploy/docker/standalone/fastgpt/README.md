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

5. asn_test 部署
```bash

docker run -d -p 5000:5000 --cap-add=NET_RAW  --name as_test ghcr.io/shilin66/as-path-app:latest
```

6. monitoring_api 部署
```bash

docker run -d --name monitoring_api -p 6000:9000 ghcr.io/shilin66/monitoring-api:latest
```

7. searxng 部署

将settings.yml文件复制到/etc/searxng目录下。
如果宿主机的网络不能访问google。则需要将settings.yml文件中的engines里的google的配置去掉，仅保留bing。
```bash
docker run -d --name searxng -v /etc/searxng:/etc/searxng -p 4000:8080 docker.io/searxng/searxng:latest
```

8. antv 部署

```bash
git clone https://github.com/antvis/mcp-server-chart.git
cd mcp-server-chart/docker
docker compose up -d
```