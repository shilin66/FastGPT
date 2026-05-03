# Workflow 并行执行能力回移植到 v4.14.10 设计

## 背景

目标：将当前分支 `v4.14.11` 中 Workflow 的“并行执行（parallelRun）”能力回移植到 `v4.14.10`。

约束：
- 这是一次跨小版本回移植，不适合直接把 `v4.14.11` 的所有 workflow 变更整体带入。
- `v4.14.11` 中与 workflow 同期合入了 Agent、ToolSet、runtime schema、sandbox 等多组改动，需要剥离，只保留并行执行最小闭环。
- 需要兼容 `v4.14.10` 已有的 Loop 能力和已有流程数据。

## 现状分析

当前分支中，并行执行不是单文件改动，而是一个跨层特性：

1. 全局定义层
- 新增 `FlowNodeTypeEnum.parallelRun`
- 将 `loopStart/loopEnd` 抽象为 `nestedStart/nestedEnd`，但字符串值仍然分别是 `'loopStart'`、`'loopEnd'`
- 新增并行节点输入输出定义：
  - `parallelRunMaxConcurrency`
  - `parallelRunMaxRetryTimes`
  - `parallelSuccessResults`
  - `parallelFullResults`
  - `parallelStatus`
- 新增 `ParallelRunStatusEnum`
- 新增并行节点模板 `packages/global/core/workflow/template/system/parallelRun/parallelRun.ts`

2. 后端执行层
- `dispatch/constants.ts` 注册 `parallelRun`
- 新增：
  - `dispatch/parallelRun/runParallelRun.ts`
  - `dispatch/parallelRun/service.ts`
  - `dispatch/loop/service.ts`
- `dispatch/utils.ts` 增加嵌套工作流公共能力：
  - `safePoints`
  - `injectNestedStartInputs`
- `dispatch/index.ts` 有一处 usage 汇总修正，但这不是并行执行必选依赖，需要结合 `v4.14.10` 代码判断是否保留

3. 前端画布层
- 注册 `parallelRun` 节点组件
- 新增 `NodeParallelRun.tsx`
- `NodeLoopEnd.tsx` 支持根据父节点类型动态回写输出类型
- `useWorkflow.tsx`、`NodeTemplates/list.tsx` 支持：
  - 并行容器视为嵌套父节点
  - 禁止在并行容器中放交互节点（`userSelect`、`formInput`）
  - 创建并行容器时自动附带开始/结束子节点
- 新增并行节点图标与中英文案

4. 测试层
- 新增后端并行执行单测
- 新增前端工作流嵌套节点行为测试

## 关键判断

`parallelRun` 的核心回移植不需要把 `v4.14.11` 的以下内容一并带入：
- Agent 新节点及其 UI
- ToolSet schema 重写
- runtime type/zod 大规模重构
- sandbox 生命周期 SSE 扩展
- 其他与 workflow 无关的 UI/图标扩展

因此应采用“手工回移植最小闭环”，而不是直接 cherry-pick 整个版本差异。

## 回移植方案

### 方案目标

在 `v4.14.10` 中补齐以下用户可见能力：
- 画布中可创建“并行执行”节点
- 并行节点可容纳一组子流程
- 输入数组后按并发数执行子流程
- 单任务失败可按配置重试
- 输出成功结果、完整结果、整体状态
- 禁止在并行节点内部放交互式节点

### 最小改动范围

#### 一、全局定义

建议回移植这些文件中的并行相关片段：

- `packages/global/core/workflow/constants.ts`
- `packages/global/core/workflow/node/constant.ts`
- `packages/global/core/workflow/template/constants.ts`
- `packages/global/core/workflow/template/input.ts`
- `packages/global/core/workflow/template/system/loop/loop.ts`
- `packages/global/core/workflow/template/system/loop/loopStart.ts`
- `packages/global/core/workflow/template/system/loop/loopEnd.ts`
- `packages/global/core/workflow/template/system/parallelRun/parallelRun.ts`

处理原则：
- 保留 `loopStart/loopEnd` 的底层字符串兼容性
- 允许代码层改为 `nestedStart/nestedEnd` 别名，避免 Loop 和 Parallel 共享逻辑时继续分叉
- 只迁入并行节点真正依赖的常量，不引入 Agent/Skill/Tool 新增字段

#### 二、后端执行

建议回移植这些文件：

- `packages/service/core/workflow/dispatch/constants.ts`
- `packages/service/core/workflow/dispatch/loop/service.ts`
- `packages/service/core/workflow/dispatch/parallelRun/runParallelRun.ts`
- `packages/service/core/workflow/dispatch/parallelRun/service.ts`
- `packages/service/core/workflow/dispatch/utils.ts`

可选评估文件：
- `packages/service/core/workflow/dispatch/index.ts`
- `packages/service/core/workflow/dispatch/type.ts`

处理原则：
- 先对照 `v4.14.10` 当前 `runLoop` 实现，提炼出与 `parallelRun` 共用的嵌套子流程执行逻辑
- `parallelRun` 使用独立 dispatcher，不修改现有 Loop 语义
- 如果 `v4.14.10` 的 usage 汇总逻辑会导致并行子流程计费或 debug 展示缺失，再最小量修正 `dispatch/index.ts`
- 避免把 `rewriteRuntimeWorkFlow(teamId)` 等与 ToolSet/MCP 相关的新依赖带进来

#### 三、前端画布

建议回移植这些文件中的并行相关片段：

- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/index.tsx`
- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/NodeParallelRun.tsx`
- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/NodeLoopEnd.tsx`
- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/components/NodeTemplates/list.tsx`
- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useWorkflow.tsx`
- 如 `v4.14.10` 中尚未具备通用嵌套容器能力，则补充 `useNestedNode.ts`

处理原则：
- 只迁入 `parallelRun` 所需 UI 能力
- `useWorkflow.tsx` 中如存在与并行执行无关的性能优化代码，拆分后仅保留“嵌套父节点识别”和“并行容器内节点约束”
- 不迁入 Agent 节点注册等无关变更

#### 四、文案与图标

建议回移植：
- `packages/web/i18n/zh-CN/workflow.json`
- `packages/web/i18n/en/workflow.json`
- `packages/web/i18n/zh-Hant/workflow.json`
- `packages/web/components/common/Icon/constants.ts`
- `packages/web/components/common/Icon/icons/core/workflow/template/parallelRun.svg`
- `packages/web/components/common/Icon/icons/core/workflow/template/parallelRunLinear.tsx`

仅保留并行节点相关资源。

#### 五、测试

建议至少补这两类测试：

1. 后端
- `test/cases/service/core/workflow/dispatch/parallelRun/service.test.ts`

2. 前端
- 并行节点创建与嵌套约束测试
- 如 `v4.14.10` 前端测试环境较重，可先补后端测试，前端以手动验证兜底

## 兼容性与风险

### 1. 枚举重命名风险

`v4.14.11` 把 `loopStart/loopEnd` 的代码枚举名改成了 `nestedStart/nestedEnd`，但值未变。

风险：
- `v4.14.10` 里如果有大量地方直接依赖 `FlowNodeTypeEnum.loopStart/loopEnd` 成员名，整包替换会引发较大编译面。

应对：
- 回移植时优先保留旧成员，新增别名，或做最小兼容映射。
- 目标是“并行节点可复用 Loop 的开始/结束节点”，而不是强推全仓统一重构。

### 2. 后端 runtime 类型漂移

`v4.14.11` 的 `runtime/type.ts` 做了大改，直接搬运风险很高。

应对：
- 不整体迁移 type 重构。
- 只在 `parallelRun` 新增实现所需的最小类型补丁。

### 3. 前端 hooks 混入无关优化

`useWorkflow.tsx` 在 `v4.14.11` 不只有并行逻辑，还混入了吸附线性能优化。

应对：
- 只提取并行容器识别、父子节点归属、交互节点禁入等必要逻辑。
- 不顺手带入无关重构。

### 4. 调试详情与计费聚合

并行子任务执行后，debug detail、assistantResponses、usagePush 聚合是否与 `v4.14.10` 当前展示兼容，需要实测。

应对：
- 优先保证执行结果正确
- 再检查 debug 面板与计费累计是否存在重复或缺失

## 实施步骤

1. 在 `v4.14.10` 分支建立回移植工作分支。
2. 回移植 global 并行节点定义，保证前后端编译基线一致。
3. 回移植后端 `parallelRun` dispatcher 和共用嵌套执行工具。
4. 回移植前端节点注册、节点渲染、画布嵌套约束。
5. 补并行执行文案和图标。
6. 运行定向测试并做一次手工 workflow 验证。
7. 如发现计费/调试展示兼容问题，再做第二轮最小修正。

## 验证计划

### 自动化

- `pnpm test -- test/cases/service/core/workflow/dispatch/parallelRun/service.test.ts`
- 若前端测试可用，再补 workflow 画布相关定向测试

### 手工验证

1. 创建一个并行执行节点，输入数组 `[1,2,3]`
2. 子流程内接简单处理节点和结束节点
3. 验证：
- 并发执行成功
- 成功结果数组顺序与输入一致
- 完整结果数组长度等于输入长度
- 失败时状态为 `partial_success` 或 `failed`
- 并行节点内部不能加入 `userSelect` / `formInput`
- Loop 原有行为不回归

## 结论

这次回移植可行，但不建议直接整体 cherry-pick `v4.14.11` 的 workflow 差异。推荐采用“最小闭环手工回移植”：
- 只迁入 `parallelRun` 节点定义
- 只迁入并行子流程执行器与必要的嵌套公共工具
- 只迁入前端并行节点与容器限制逻辑
- 严格排除 Agent、ToolSet、runtime schema 重构等无关改动

---

## TODO

- [ ] 在 `v4.14.10` 基线上确认 `loopStart/loopEnd` 的最小兼容改法
- [ ] 梳理 `parallelRun` 后端依赖，形成精确修改文件清单
- [ ] 梳理前端画布所需最小改动，排除 `useWorkflow` 无关优化
- [ ] 回移植并行节点文案与图标
- [ ] 增加后端并行执行测试
- [ ] 做一次手工 workflow 验证
