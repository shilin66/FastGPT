---
title: "MCP 服务"
description: "快速了解 ZenMeta MCP server"
icon: "extension"
draft: false
toc: true
weight: 270
---

## MCP server 介绍

MCP 协议（Model Context Protocol），是由 Anthropic 在 2024年 11 月初发布的协议。它的目的在于统一 AI 模型与外部系统之间的通信方式，从而简化 AI 模型与外部系统之间的通信问题。随着 OpenAI 官宣支持 MCP 协议，越来越多的 AI 厂商开始支持 MCP 协议。

MCP 协议主要包含 Client 和 Server 两部分。简单来说，Client 是使用 AI 模型的一方，它通过 MCP Client 可以给模型提供一些调用外部系统的能能力；Server 是提供外部系统调用的一方，也就是实际运行外部系统的一方。

ZenMeta MCP Server 功能允许你选择`多个`在 ZenMeta 上构建好的应用，以 MCP 协议对外提供调用 ZenMeta 应用的能力。

目前 ZenMeta 提供的 MCP server 为 SSE 通信协议，未来将会替换成 `HTTP streamable`。

## ZenMeta 使用 MCP server

### 1. 创建 MCP server

登录 ZenMeta 后，打开`工作台`，点击`MCP server`，即可进入管理页面，这里可以看到你创建的所有 MCP server，以及他们管理的应用数量。

![创建 MCP server](/imgs/mcp_server1.png)

可以自定义 MCP server 名称和选择关联的应用

| | |
|---|---|
| ![](/imgs/mcp_server2.png) | ![](/imgs/mcp_server3.png) |

### 2. 获取 MCP server 地址

创建好 MCP server 后，可以直接点击`开始使用`，即可获取 MCP server 访问地址。支持 SSE 协议的访问地址，以及 HTTP streamable 协议的访问地址。

| | |
|---|---|
| ![](/imgs/mcp_server4.png) | ![](/imgs/mcp_server5.png) |

#### 3. 使用 MCP server

可以在支持 MCP 协议的客户端使用这些地址，来调用 ZenMeta 应用，例如：`Cursor`、`Cherry Studio`。

