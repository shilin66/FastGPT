---
title: '快速上手'
description: '快速体验 ZenMeta 基础功能'
icon: 'rocket_launch'
draft: false
toc: true
weight: 102
---
## 创建团队
新用户登录，默认在名为 Zenlayer 的公共团队中，我们在其中创建了一些公共的应用可供所有人使用。  
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

这里使用 ZenMeta 中文 README 文件为例。

首先我们需要创建一个**通用知识库**。

![](/imgs/create-rep.png)

知识库创建完之后我们需要上传一点内容。

上传内容这里有四种模式：
- 手动数据集：手动输入问答对，是最精准的数据
- 文本数据集：选择文本文件，自动分片
- 表格数据集：批量导入问答对

这里，我们选择文本数据集，上传本地文件
![](/imgs/upload-file.png)

选择直接分块，使用默认规则
![](/imgs/param-setting.png)

分块预览
![](/imgs/data-preview.png)

上传知识库
![](/imgs/start-upload.png)


点击上传后我们需要等待数据处理完成，直到我们上传的文件状态为已就绪。

![](/imgs/upload-data2.png)

## 应用

点击「应用」按钮来新建一个「**简易应用**」，这里有四个模板，我们选择「知识库 + 对话引导」。

![](/imgs/create-app.png)

应用创建后来再应用详情页找到「知识库」模块，把我们刚刚创建的知识库添加进去。

![](/imgs/create-app2.png)

添加完知识库后记得点击「保存并发布」，这样我们的应用就构建好了

![](/imgs/create-app3.png)

然后我们就可以愉快的开始聊天啦。

![](/imgs/create-app4.png)
