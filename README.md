<div align="center">


# ZenMeta


ZenMeta 是一个 AI Agent 构建平台，提供开箱即用的数据处理、模型调用等能力，同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的应用场景！

</div>



## 🛸 在线使用

- 🌍 ：[ops.zenlayer.ai](https://ops.zenlayer.ai/)


## 💡 RoadMap

`1` 应用编排能力
   - [x] 对话工作流、插件工作流
   - [x] 工具调用
   - [x] Code sandbox
   - [x] 循环调用
   - [x] 用户选择
   - [x] 表单输入

`2` 知识库能力
   - [x] 多库复用，混用
   - [x] chunk 记录修改和删除
   - [x] 支持手动输入，直接分段，QA 拆分导入
   - [x] 支持 txt，md，html，pdf，docx，pptx，csv，xlsx (有需要更多可 PR file loader)，支持 url 读取、CSV 批量导入
   - [x] 混合检索 & 重排
   - [x] API 知识库
   - [ ] 自定义文件读取服务
   - [ ] 自定义分块服务
  
`3` 应用调试能力
   - [x] 知识库单点搜索测试
   - [x] 对话时反馈引用并可修改与删除
   - [x] 完整上下文呈现
   - [x] 完整模块中间值呈现
   - [ ] 高级编排 DeBug 模式
  
`4` OpenAPI 接口
   - [x] completions 接口 (chat 模式对齐 GPT 接口)
   - [x] 知识库 CRUD
   - [x] 对话 CRUD
  
`5` 运营能力
   - [x] 免登录分享窗口
   - [x] Iframe 一键嵌入
   - [x] 聊天窗口嵌入支持自定义 Icon，默认打开，拖拽等功能
   - [x] 统一查阅对话记录，并对数据进行标注
   
`6` 其他
   - [x] 可视化模型配置。
   - [x] 支持语音输入和输出 (可配置语音输入语音回答)
   - [x] 模糊输入提示
   - [x] 模板市场



## 👨‍💻 开发

项目技术栈：NextJs + TS + ChakraUI + MongoDB + PostgreSQL (PG Vector 插件)/Milvus

