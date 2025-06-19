# 单节点部署
## 部署 oneapi
```bash

cd oneapi
docker componse up -d
```

- 默认账号 `root` 密码 `123456`
- 首次登录需要 root 密码
- 配置模型渠道
- 创建令牌，fastgpt和 ai search 会使用到

## 部署 fastgpt
修改 docker-compose.yml 文件中fastgpt环境变量
```
- OPENAI_BASE_URL=
- CHAT_API_KEY=
```

启动容器
```bash

cd fastgpt
docker componse up -d 
```
- 默认账号密码在docker compose.yml 中配置的环境变量
- 在 root账号下，创建一个API 密钥，用于 AI 搜索

## 部署 AI 搜索

#### 修改 config.toml
```
# 改成 oneapi创建的令牌
OPENAI= ""
# 改成 fastgpt创建的令牌
FASTGPT= ""
# 改成 fastgpt的URL
FASTGPT_URL= ""
# 改成 oneapi的URL，加上/v1后缀
OPENAI_BASE_URL= ""
# 创建 fastgpt用到的 mongodb uri
MONGODB_URI= "mongodb://Aijei3Dene2nv:nue8He7H3aqq@98.98.76.227:27017/perplexica?authSource=admin&directConnection=true"
```

#### 修改 config.json
```json5
{
    // ip 和 port是后续 nginx运行的 ip和端口
    "apiUrl": "http://ip:8619/perplexica/api", 
    "wsUrl": "ws://ip:8619/perplexica",
    "basePath": "pSearch"
}
```

## 配置nginx
使用 nginx目录下的 ai.conf