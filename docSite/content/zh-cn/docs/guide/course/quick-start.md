---
title: '快速上手'
description: '快速体验 FastGPT 基础功能'
icon: 'rocket_launch'
draft: false
toc: true
weight: 102
---

更多使用技巧，[查看视频教程](https://www.bilibili.com/video/BV1sH4y1T7s9)


## 创建团队
新用户登录，默认在名为 Public 的公共团队中，我们在其中创建了一些公共的应用可供所有人使用。  
在公共团队中，没有创建应用与知识库的权限，所以如果需要构建自己的应用，请先创建团队。

在「账号」---「团队管理」中，点击「 + 」，输入团队名称，然后点击「创建」。
![](/imgs/create-team.png)

**切换**团队，有两个页面可以切换:
- 在「团队管理」页面切换  
  ![](/imgs/switch-team1.png)

- 在「个人信息」页面切换  
  ![](/imgs/switch-team2.png)

## 知识库

开始前，请准备一份测试电子文档，WORD、PDF、TXT、excel、markdown 都可以，比如公司休假制度、不涉密的销售说辞、产品知识等等。

这里使用 FastGPT 中文 README 文件为例。

首先我们需要创建一个知识库。

![](/imgs/create-rep.png)

知识库创建完之后我们需要上传一点内容。

上传内容这里有四种模式：
- 手动输入：手动输入问答对，是最精准的数据
- QA 拆分：选择文本文件，让AI自动生成问答对
- 直接分段：选择文本文件，直接将其按分段进行处理
- CSV 导入：批量导入问答对

这里，我们选择 QA 拆分，让 AI 自动生成问答，若问答质量不高，可以后期手动修改。

![](/imgs/upload-data.png)

点击上传后我们需要等待数据处理完成，直到我们上传的文件状态为可用。

![](/imgs/upload-data2.png)

## 应用

点击「应用」按钮来新建一个应用，这里有四个模板，我们选择「知识库 + 对话引导」。

![](/imgs/create-app.png)

应用创建后来再应用详情页找到「知识库」模块，把我们刚刚创建的知识库添加进去。

![](/imgs/create-app2.png)

添加完知识库后记得点击「保存并预览」，这样我们的应用就和知识库关联起来了。

![](/imgs/create-app3.png)

然后我们就可以愉快的开始聊天啦。

![](/imgs/create-app4.png)
