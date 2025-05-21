---
title: "SearXNG 搜索插件配置与使用说明"
description: "ZenMeta SearXNG 搜索插件配置指南"
icon: "search"
draft: false
toc: true
weight: 303
---

[SearXNG](https://github.com/searxng/searxng)是一款免费的互联网元搜索引擎，它汇总了来自各种搜索服务和数据库的结果。它不会跟踪或分析用户。用户可以自行部署它进行使用。本文介绍 Searxng 的部署以及接入 ZenMeta 插件。


## 1. 部署应用

ZenMeta平台已经自带了一个SearXNG 搜索插件，地址为：`http://fastgpt-perplexica-searxng:8080`

也可使用Docker 自行部署，可以直接参考 [SearXNG 官方教程](https://github.com/searxng/searxng)。自行部署的需要公网可访问才能在 ZenMeta 中使用。


## 2. ZenMeta 使用

将SearXNG的地址填入 ZenMeta 的 SearXNG 插件的 URL 中。
![](/imgs/searxng1.png)
## 返回格式

* 成功时返回搜索结果数组：

```Bash
{
  "result": "[{\"title\":\"标题1\",\"link\":\"链接1\",\"snippet\":\"摘要1\"}, ...]"
}
```

* 搜索结果为空时会返回友好提示：

```Bash
{
  "result": "[]",
  "error": {
    "message": "No search results",
    "code": 500
  }
}
```

* 失败时通过 Promise.reject 可能返回错误信息：

```Bash
- "缺少查询参数"
- "缺少url"
- "Failed to fetch data from Search XNG"
```

一般问题来源于参数缺失与服务部署，如有更多问题可在用户群提问。

## FAQ

### 无搜索结果

1. 先直接打开外网地址，测试是否可以正常搜索。
2. 检查是否有超时的搜索引擎，通过 API 调用时不会返回结果。