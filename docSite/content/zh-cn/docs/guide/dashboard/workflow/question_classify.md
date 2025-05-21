---
title: "问题分类"
description: "ZenMeta 问题分类模块介绍"
icon: "quiz"
draft: false
toc: true
weight: 238
---

## 特点

- 可重复添加
- 有外部输入
- 需要手动配置
- 触发执行
- function_call 模块

![](/imgs/cq1.png)

## 功能

可以将用户的问题进行分类，分类后执行不同操作。在一些较模糊的场景中，分类效果不是很明显。

## 参数说明

### 系统提示词

被放置在对话最前面，可用于补充说明分类内容的定义。例如问题会被分为：

1. UserInfoQuery: 查询用户信息
2. UserInfoUpdate: 更新用户信息，启用/禁用用户等
3. UserLicenseQuery: 查询用户许可证
4. UserLicenseUpdate: 更新用户许可证
5. UserDeviceQuery: 用户设备查询
6. Other: 其它

可以放置一些提示词，用于补充分类内容的定义。

```
UserInfoQuery: 查询用户信息
UserInfoUpate: 更新用户信息，启用/禁用用户等
UserLicenseQuery: 查询用户许可证
UserLicenseUpdate: 更新用户许可证
UserDeviceQuery: 用户设备查询
Other: 其它
```

### 聊天记录

适当增加一些聊天记录，可以联系上下文进行分类。

### 用户问题

用户输入的内容。