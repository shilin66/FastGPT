---
title: "HTTP 请求"
description: "ZenMeta HTTP 模块介绍"
icon: "http"
draft: false
toc: true
weight: 252
---

## 特点

- 可重复添加
- 手动配置
- 触发执行
- 核中核模块

![](/imgs/http1.png)

## 介绍

HTTP 模块会向对应的地址发送一个 `HTTP` 请求，实际操作与 Postman 和 ApiFox 这类直流工具使用差不多。

- Params 为路径请求参数，GET请求中用的居多。
- Body 为请求体，POST/PUT请求中用的居多。
- Headers 为请求头，用于传递一些特殊的信息。  
- 自定义变量中可以接收前方节点的输出作为变量
- 变量来自于`全局变量`、`系统变量`、`前方节点输出`

## 参数结构

### 系统变量说明

你可以将鼠标放置在`请求参数`旁边的问号中，里面会提示你可用的变量。

- appId: 应用的ID
- chatId: 当前对话的ID，测试模式下不存在。
- responseChatItemId: 当前对话中，响应的消息ID，测试模式下不存在。
- variables: 当前对话的全局变量。
- cTime: 当前时间。
- histories: 历史记录（默认最多取10条，无法修改长度）

### Params, Headers

不多描述，使用方法和Postman, ApiFox 基本一致。



### Body

只有特定请求类型下会生效。

可以写一个`自定义的 Json`，并通过 / 来引入变量。例如：

{{< tabs tabTotal="3" >}}
{{< tab tabName="假设有一组变量" >}}
{{< markdownify >}}

```json
{
  "username": "字符串",
  "uid": 123
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< tab tabName="Http 模块中的Body声明" >}}
{{< markdownify >}}

- 输入  `/` 会弹出可用变量列表，选择想要的变量即可。
- 注意，在 Body 中，你如果引用`字符串`，则需要加上`""`。

|||
|---|---|
|![](/imgs/http2.png)|![](/imgs/http3.png)|

{{< /markdownify >}}
{{< /tab >}}
{{< tab tabName="最终得到的解析" >}}
{{< markdownify >}}

```json
{
  "string": "Tom",
  "uid": 123
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}

### 如何获取返回值

如图所示，ZenMeta可以添加多个返回值，这个返回值并不代表接口的返回值，而是代表`如何解析接口返回值`，可以通过 `JSON path` 的语法，来`提取`接口响应的值。
![](/imgs/http4.png)
语法可以参考: https://github.com/JSONPath-Plus/JSONPath?tab=readme-ov-file

{{< tabs tabTotal="2" >}}
{{< tab tabName="接口响应示例" >}}
{{< markdownify >}}

```json
{
  "message": "测试",
  "data":{
      "user": {
        "name": "xxx",
        "age": 12
      },
      "list": [
        {
          "name": "xxx",
          "age": 50
        },
        [{ "test": 22 }]
      ],
      "psw": "xxx"
  }
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< tab tabName="提取示例" >}}
{{< markdownify >}}

```json
{
  "$.message": "测试",
  "$.data.user": { "name": "xxx", "age": 12 },
  "$.data.user.name": "xxx",
  "$.data.user.age": 12,
  "$.data.list": [ { "name": "xxx", "age": 50 }, [{ "test": 22 }] ],
  "$.data.list[0]": { "name": "xxx", "age": 50 },
  "$.data.list[0].name": "xxx",
  "$.data.list[0].age": 50,
  "$.data.list[1]": [ { "test": 22 } ],
  "$.data.list[1][0]": { "test": 22 },
  "$.data.list[1][0].test": 22,
  "$.data.psw": "xxx"
}
```

{{< /markdownify >}}
{{< /tab >}}
{{< /tabs >}}


你可以配置对应的`key`来从`ZenMeta 转化后的格式`获取需要的值，该规则遵守 JS 的对象取值规则。例如：

1. 获取`message`的内容，那么你可以配置`message`的`key`为`message`，这样就可以获取到`message`的内容。
2. 获取`user的name`，则`key`可以为：`data.user.name`。
3. 获取list中第二个元素，则`key`可以为：`data.list[1]`，然后输出类型选择字符串，则获自动获取到`[ { "test": 22 } ]`的`json`字符串。

### 自动格式化输出

ZenMeta加入了出参格式化功能，主要以`json`格式化成`字符串`为主。如果你的输出类型选择了`字符串`，则会将`HTTP`对应`key`的值，转成`json`字符串进行输出。因此，未来你可以直接从`HTTP`接口输出内容至`文本加工`中，然后拼接适当的提示词，最终输入给`AI对话`。


{{% alert context="warning" %}}
HTTP模块非常强大，你可以对接一些公开的API，来提高编排的功能。
{{% /alert %}}

## 作用

通过 HTTP 模块你可以无限扩展，比如：
- 操作数据库
- 调用外部数据源
- 执行联网搜索
- 发送邮箱
- ......
