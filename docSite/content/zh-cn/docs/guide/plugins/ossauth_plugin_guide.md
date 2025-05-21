---
title: "OssAuth 插件填写说明"
description: "如何配置和使用 OssAuth 插件"
icon: "oss"
draft: false
toc: true
weight: 310
---

## 获取 oss 加密密码
1. 打开 oss 登录页，使用密码登录，并且按 F12 打开控制台 
![](/imgs/oss1.png)
2. 浏览器控制台中找到 login 请求，复制请求body中的 password字段 
![](/imgs/oss2.png)

# 填写账号密码到OssAuth插件中

![](/imgs/oss3.png)

插件有3个返回字段，分别是：
- token用于oss3.0的api调用, header添加 `Authorization: Bearer {token}`
- zenlayerWeb用于oss2.0 /zenlayer_web的api调用, 添加到`cookie`中
- zenlayerWebNew用于oss2.0 /zenlayer_web_new的api调用, 添加到`cookie`