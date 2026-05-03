# Workflow 交互续跑导致 `chatitems` 文档超过 MongoDB 16MB 限制问题分析

## 现象

页面报错：

```text
BSONObj size: 16922261 (0x1023695) is invalid. Size must be between 0 and 16793600 (16MB)
First element: update: "chatitems"
```

这说明后端在执行 MongoDB 对 `chatitems` 集合的 `update` 时，提交的更新后文档大小超过了 MongoDB 单文档 16MB 限制。

## 初步结论

这不是前端渲染错误，也不是 workflow 定义保存时报错，而是 `workflow` 运行过程中某条 AI 聊天记录被持续追加内容，最终单条 `chatitems` 文档膨胀到超过 16MB。

从当前代码看，最可能的触发路径是：

1. workflow 运行到了交互节点，例如表单输入、用户选择、Agent 追问、支付暂停等。
2. 服务端走 `updateInteractiveChat`，不是新建一条 AI chat item，而是更新最后一条 AI chat item。
3. 该更新会把新的 AI 返回内容、interactive 状态、部分记忆继续拼接回同一条 `chatitems` 文档。
4. 如果交互链很长，或者 interactive 内部状态本身很大，就会把该文档堆到 16MB 以上。

## 关键代码链路

### 1. workflow 接口在存在 interactive 时走更新逻辑

文件：

- `projects/app/src/pages/api/v1/chat/completions.ts`
- `projects/app/src/pages/api/v2/chat/completions.ts`

核心逻辑：

- 有 `interactive` 时：调用 `updateInteractiveChat({ interactive, ...params })`
- 没有 `interactive` 时：调用 `pushChatRecords(params)`

也就是说，交互续跑不是创建新的 AI chat item，而是更新现有最后一条 AI chat item。

### 2. `chatitems` 文档本身存储了 AI 消息数组 `value`

文件：`packages/service/core/chat/chatItemSchema.ts`

`chatitems` 文档包含：

- `value: []`
- `memories: Object`
- `citeCollectionIds: [String]`
- 以及其他反馈、耗时字段

`value` 本身是数组，AI 每次返回的 `text`、`reasoning`、`tools`、`interactive` 都放在这里。

### 3. 交互续跑会直接把新内容继续追加到同一条 chat item

文件：`packages/service/core/chat/saveChat.ts`

在 `updateInteractiveChat` 中，存在以下逻辑：

```ts
chatItem.value[chatItem.value.length - 1].interactive = interactive;

if (aiContent.value) {
  chatItem.value = chatItem.value ? [...chatItem.value, ...aiContent.value] : aiContent.value;
}

if (aiContent.memories) {
  chatItem.memories = {
    ...chatItem.memories,
    ...aiContent.memories
  };
}
```

然后执行：

```ts
await chatItem.save({ session });
```

这意味着：

- 最后一条 AI 消息上的 `interactive` 会被整体覆盖为最新 interactive 对象。
- 新一轮产生的 AI `value` 会被继续追加到同一条文档。
- `memories` 也会在同一条文档上持续合并。

如果某个 interactive 对象很大，或者持续多轮交互，文档会快速膨胀。

## 为什么 workflow 更容易触发

普通单轮问答通常走 `pushChatRecords`：

- 新建一条 Human chat item
- 新建一条 AI chat item
- 节点详情 `responseData` 额外拆到 `chat_item_responses`

这里已经刻意把 node response 从主文档拆分出去了，所以普通问答不太容易撞 16MB。

但交互式 workflow 续跑时，为了在同一条 AI 记录上延续交互态，会走 `updateInteractiveChat`，此时虽然 node response 也被放在 `chat_item_responses`，但以下数据仍然持续堆在主文档里：

- `chatItem.value`
- `value[].interactive`
- `memories`
- `citeCollectionIds`
- `customFeedbacks`

其中最危险的是 `interactive`。

## `interactive` 为什么可能非常大

文件：`packages/global/core/workflow/template/system/interactive/type.ts`

`WorkflowInteractiveResponseType` 包含：

- `entryNodeIds`
- `memoryEdges`
- `nodeOutputs`
- `skipNodeQueue`
- `usageId`
- 以及嵌套的 `params.childrenResponse`

文件：`packages/service/core/workflow/dispatch/index.ts`

在 `handleInteractiveResult` 中，系统会构造：

- `memoryEdges: this.data.runtimeEdges.map(...)`
- `nodeOutputs: 所有 runtime node outputs`
- `skipNodeQueue`

这几个字段都可能很大，尤其当 workflow：

- 节点很多
- 边很多
- 节点输出中带大文本或大 JSON
- 存在嵌套子流程、loop、toolChildrenInteractive

更关键的是，interactive 类型本身允许递归嵌套：

- `childrenInteractive.params.childrenResponse`
- `toolChildrenInteractive.params.childrenResponse`
- `loopInteractive.params.childrenResponse`

这意味着如果 workflow 里有子流程、工具调用子流程、循环交互，interactive 结构可能会形成很深的嵌套树，序列化后体积非常大。

## 高风险触发场景

以下场景最容易触发该问题：

1. workflow 中有表单输入、用户选择、Agent 询问，并且用户已经进行了多轮交互。
2. workflow 中有 loop，`loopInteractive.params.loopResult` 持续累计。
3. workflow 中有子流程，`childrenResponse` 多层嵌套。
4. 某些节点输出很大，并被写入 `interactive.nodeOutputs`。
5. AI 带 `reasoning` 输出，且每轮 reasoning 文本很长。
6. `memories` 保存了较大的对象，例如完整消息、计划状态、工具上下文。
7. 文件解析、网页抓取、代码执行等节点产生了大段文本，并间接进入 interactive 或 memories。

## 为什么报错信息里是 `update: "chatitems"`

因为这里不是 `insert` 新文档失败，而是对现有 `chatitems` 的更新失败。

和代码对应的是：

- `updateInteractiveChat` 中 `await chatItem.save({ session })`
- 或者 Mongoose 最终发出的底层 `update`

MongoDB 在更新时会检查更新后的整条文档大小，只要超过 16MB 就会报这个错。

## 与当前实现的设计关系

当前实现其实已经意识到节点详情可能过大，所以把 `responseData` 从 `chatitems` 拆到了 `chat_item_responses`：

- `pushChatRecords`
- `updateInteractiveChat`

两处都在使用 `MongoChatItemResponse` 单独存储 node response。

但是交互场景下还有另一类大对象没有拆出去：

- interactive runtime state
- AI value 数组累积内容
- memories

所以这个问题更像是：

node response 拆分做了，但 interactive session state 仍然留在主文档里，随着交互次数增加仍可能击穿 16MB。

## 建议先做的现场排查

如果要确认是不是这个问题，可以直接查 MongoDB 里对应 chat item 的大小和字段分布。

建议重点看：

1. 出错时对应的 `chatId`
2. `chatitems` 中最后一条 AI 记录
3. 该记录的：
   - `value.length`
   - `value[value.length - 1].interactive`
   - `memories`
   - `citeCollectionIds`
4. 是否存在很大的：
   - `interactive.nodeOutputs`
   - `interactive.memoryEdges`
   - `interactive.params.childrenResponse`
   - `interactive.params.loopResult`
   - `value[].reasoning.content`

如果在 Mongo Shell 里排查，可优先用：

```js
Object.bsonsize(db.chatitems.findOne({ chatId: 'xxx', obj: 'AI' }))
```

以及：

```js
db.chatitems.findOne(
  { chatId: 'xxx', obj: 'AI' },
  { value: 1, memories: 1, citeCollectionIds: 1, dataId: 1 }
)
```

如果这个对象已经接近或超过 16MB，基本就能坐实。

## 修复方向

### 方向 1：不要在交互续跑时持续更新同一条 AI chat item

改为每次交互续跑都新建一条新的 AI chat item，而不是不断 append 到上一条。

优点：

- 最直接避免单文档无限膨胀。
- 与普通问答的数据模型更一致。

代价：

- 前端历史展示和交互恢复逻辑要适配多条 AI item 共同表示一次交互会话。

### 方向 2：拆分 interactive runtime state 到独立集合

把以下内容从 `chatitems.value[].interactive` 中拆出去：

- `memoryEdges`
- `nodeOutputs`
- `skipNodeQueue`
- `childrenResponse`
- loop 状态

主文档只保留一个轻量引用，例如 `interactiveStateId`。

优点：

- 保持现有 UI 交互模型不变。
- 从根上控制主文档大小。

代价：

- 改动范围比方向 1 大。
- 恢复上下文时要多一次查询。

### 方向 3：对 interactive 做瘦身

例如不保存或裁剪：

- `nodeOutputs` 中的大值
- 全量 `memoryEdges`
- 深层 `childrenResponse`
- `loopResult` 中的大对象

优点：

- 改动相对较小。

风险：

- 只是延后问题，不是彻底解决。
- 可能影响交互恢复正确性。

### 方向 4：限制 `memories`、`reasoning`、大文本字段持久化

例如：

- reasoning 仅保留摘要
- memories 只保留恢复所需键值
- 大文本只存预览，原文落独立集合或文件存储

这属于配套优化，不建议单独作为主修复手段。

## 根因判断

按当前代码结构，对根因的排序是：

1. `updateInteractiveChat` 持续更新同一条 AI chat item，导致 `value + interactive + memories` 累积膨胀。
2. `interactive` 内部包含 `memoryEdges`、`nodeOutputs`、`childrenResponse`、`loopResult`，体积远超普通文本消息。
3. 某个 workflow 节点输出了大对象，并被放进 `interactive.nodeOutputs` 或 `memories`。
4. 长 reasoning 或长工具输出进一步放大了文档体积。

## 结论

这次报错本质上是：

交互式 workflow 在续跑时，把越来越大的运行态持续写回同一条 `chatitems` 文档，最终触发 MongoDB 16MB 单文档限制。

如果进入修复阶段，建议优先比较两个方案：

1. 交互续跑改为新建 chat item。
2. interactive state 独立拆表。

从止血速度看，通常先评估方案 1；从长期模型设计看，方案 2 更稳。
