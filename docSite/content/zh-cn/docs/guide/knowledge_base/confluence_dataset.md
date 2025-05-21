---
title: 'Confluence知识库'
description: 'ZenMeta接入Confluence知识库'
icon: 'language'
draft: false
toc: true
weight: 409
---


## 创建Confluence的Api Token

1. 打开conflunence，点击右上角头像，选择管理账户
![](/imgs/confluence1.png)
2. 选择安全性，点击【创建并管理API令牌】
![](/imgs/confluence2.png)
3. 点击【创建API令牌】
![](/imgs/confluence3.png)
4. 填入令牌名称和过期时间，然后点击【创建】
![](/imgs/confluence4.png)
5. 复制 API令牌
![](/imgs/confluence5.png)

## 创建ZenMeta的Confluence知识库
注意：这里配置的Confluence令牌是绑定在个人账号下，不区分团队
1. 在个人信息，点击【Confluence账号】
![](/imgs/confluence6.png)  
2. 配置Confluence账号和令牌，将刚才创建的api 令牌填入，点击【确认】
![](/imgs/confluence7.png)  

3. 创建Confluence知识库，进入知识库页面，点击【新建】，选择【Confluence】知识库，输入知识库名称，点击【确认创建】
![](/imgs/confluence8.png)
![](/imgs/confluence9.png)
4. 点击刚才创建的Confluence知识库，进入详情，点击【开始配置Confluence】
![](/imgs/confluence10.png)
5. 配置 Confluence空间和页面
![](/imgs/confluence11.png)
   
   配置项说明
   
   以下面这边文章为例
   ![](/imgs/confluence12.png)
   - 空间：浏览器地址栏上url ，spaces后面的字符串就是空间key
   
   - 页面ID: 浏览器地址栏上url ，pages后面的这串数字就是页面ID。页面ID是可选参数，如果不填写，将同步整个空间的所有页面
   
   - 同步子页面：可选参数，如果打开，将同步上面所填的页面ID下的所有子页面，否则只同步页面ID对应的页面
   
   - 定时同步: 如果打开，后台将会每小时同步一次confluence的内容。也可以手动同步：打开配置页 ，保持配置项不变，点击【开始同步】即可  
6. 同步完成
   ![](/imgs/confluence13.png)
## Tips
写Confluence时，如果文章中涉及到图片，可以添加替代文本，这样可以增加对图片的描述，后续使用使用知识库时，可以更加准确的索引到相关的图片，在回答中进行展示
![](/imgs/confluence14.png)