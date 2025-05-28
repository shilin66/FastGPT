---
title: "Teams 接入"
description: "Teams 接入ZenMeta 机器人"
icon: "chat"
draft: false
toc: true
weight: 514
---

## 创建 Azure Bot Service
这一步我们的目标需要拿到3个参数，分别如下：
- Microsoft App ID
- Microsoft App Secret
- Microsoft App Tenant ID（可选）
{{% alert icon="🤖 " context="success" %}}
没有创建权限的用户可找IT部门创建并提供配置上述3个参数
{{% /alert %}}

1. 打开[Azure Marketplace](https://portal.azure.com/#view/Microsoft_Azure_Marketplace/GalleryItemDetailsBladeNopdl/id/Microsoft.AzureBot)
开始创建Bot
![](/imgs/teams1.png)

根据实际情况确认下创建配置
![](/imgs/teams2.png)

创建完机器人跳转到配置页面，保存Microsoft App ID，如果是单租户类型，需要再填入相应的租户ID。   
点击「管理密码」    
![](/imgs/teams3.png)

创建App Secret
![](/imgs/teams4.png)

## 在 ZenMeta 中创建发布渠道
在 ZenMeta 中选择要接入的应用，在发布渠道页面，新建一个接入 Teams 机器人的发布渠道。
将前面拿到的参数填入配置弹窗中。
![](/imgs/teams5.png)
创建完成后，点击请求地址按钮，然后复制回调地址。
![](/imgs/teams6.png)

## 在Azure Bot 配置中添加回调地址

在刚才的配置页面，填入回调地址
![](/imgs/teams7.png)

## 创建Teams应用包

准备以下3个文件
![](/imgs/teams10.png)

应用部件清单文件: 配置详情请参考[官方文档](https://learn.microsoft.com/zh-cn/microsoftteams/platform/resources/schema/manifest-schema)     
-  manifest.json   

图标文件: 参考[官方文档](https://learn.microsoft.com/zh-cn/microsoftteams/platform/concepts/build-and-test/apps-package#app-icons)  
- color.png
- outline.png    

将这三个文件放在同一个目录中打包成`manifest.zip`文件，请注意只打包这3个文件，不可以连着目录一起打包。

这里提供一个简单的manifest.json文件，请根据实际情况修改。   
```JSON
{
  "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
  "manifestVersion": "1.19",
  "version": "1.0.0",
  "id": "填入应用的ID",
  "developer": {
    "name": "Zenlayer, Inc.",
    "websiteUrl": "https://www.zenlayer.com",
    "privacyUrl": "https://www.zenlayer.com/privacy-policy",
    "termsOfUseUrl": "https://www.zenlayer.com"
  },
  "icons": {
    "color": "color.png",
    "outline": "outline.png"
  },
  "name": {
    "short": "应用的短显示名称",
    "full": "如果完整应用名称超过 30 个字符，则使用应用的全名。 使用 full 具有更多空间的属性，例如应用目录或应用详细信息页"
  },
  "description": {
    "short": "应用体验的简短说明，在空间受限时使用",
    "full": "应用的完整说明"
  },
  "accentColor": "#FFFFFF",
  "bots": [
    {
      "botId": "也填入应用的ID",
      "scopes": [
        "personal",
        "groupChat",
        "team"
      ],
      "supportsFiles": false,
      "isNotificationOnly": false
    }
  ],
  "permissions": [
    "identity",
    "messageTeamMembers"
  ],
  "validDomains": [
    "token.botframework.com",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.zenlayer.win",
    "*.zenlayer.ai"
  ]
}
```

## 发布应用
在Teams客户端中上传manifest.zip文件
![](/imgs/teams8.png)
![](/imgs/teams9.png)     

这里有两种类型：
- 上传自定义应用：开发阶段可用，上传完之后仅自己可见
- 向你的组织提交应用：上传之后需要管理员审核，审核通过之后才能在组织中看到。管理员可以按需配置应用可见范围，请根据时间情况向管理员说明。

{{% alert icon="🤖 " context="success" %}}
上传组织应用并通过审核之后，可能需要等待一段时间后才能看到，等待时间未知，一般第二天可见
{{% /alert %}}