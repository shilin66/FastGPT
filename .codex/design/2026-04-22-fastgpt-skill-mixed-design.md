# FastGPT 混合型 Skill 方案设计

## 1. 背景

FastGPT 当前已经具备较完整的 App 基础设施：

- 团队级资源管理
- 目录、权限、版本、发布机制
- Agent 编辑页中的 Tool/Agent 引用能力
- PromptEditor 中的 Skill 选择与标签渲染雏形
- Agent 运行时的 tool 装配、计划和调度能力

但现有仓库中的 `skill` 仍然只是编辑器侧的早期能力，并未形成真正的产品闭环。目前缺少：

- 团队内 Skill 的创建、编辑、发布、复用
- Skill 作为独立资源的生命周期管理
- Agent 对 Skill 的正式引用关系
- Skill 的运行时解析与装配
- 面向大上下文场景的渐进式披露机制

本方案采用 **Skill 作为新的 AppType** 的方式实现完整闭环，并吸收 deepagentsjs 在 `SKILL.md` 规范、渐进式披露、`Match -> Read -> Execute` 运行时流程上的设计思想，但运行时、数据模型、权限和发布体系仍然以 FastGPT 自身架构为主。

---

## 2. 目标与边界

### 2.1 目标

实现“团队内可创建/编辑/发布 Skill，并在 Agent 应用里引用运行”的完整闭环。

Skill 的产品定位为：

- 一个可独立管理的团队资源
- 一个可被 Agent 引用的能力包
- 一个同时包含“指导内容”和“执行能力绑定”的混合对象
- 一个遵循 `SKILL.md` 组织方式并支持渐进式披露的运行时单元

### 2.2 非目标

第一期不覆盖以下能力：

- Skill 市场/公开社区分发
- Skill 的复杂可视化工作流编排器
- Skill 的自动化测试平台
- Skill 的运行指标分析平台
- 深层多级 Skill 编排优化

---

## 3. 产品定义

### 3.1 Skill 是什么

Skill 是一个可独立发布的团队资源，用于给 Agent 提供：

- 指导性上下文
- 规则与约束
- 绑定工具
- 绑定工作流工具
- 绑定知识库
- 绑定其他 Skill 依赖

Skill 在存储层属于 App 资源的一种新类型，在内容组织层遵循 `SKILL.md` 心智模型，在运行时通过“先匹配、再读取、再执行”的方式参与 Agent 调度。

### 3.2 Skill 的组织方式

借鉴 deepagentsjs 的 skill 目录规范，FastGPT 中每个 Skill 逻辑上包含以下内容：

1. 发现信息
   - `id`
   - `name`
   - `description`

2. 主说明文件
   - `SKILL.md`
   - YAML frontmatter
   - Markdown 正文

3. 附加资源
   - 参考文档 references
   - 模板 assets
   - 可执行脚本 scripts
   - 子 Skill 依赖

4. 执行绑定
   - tool bindings
   - dataset bindings
   - 运行参数

FastGPT 不强制把这些内容直接存成物理目录，但在产品语义和导入导出格式上保持该结构，方便后续兼容外部 skill 生态。

### 3.3 使用关系

- Skill 可以被团队创建与发布
- Agent 可以绑定多个 Skill
- Agent 运行时会解析 Skill 并合成最终运行上下文
- Skill 之间可以有依赖关系，但必须是无环图

### 3.4 运行时心智模型

Skill 在运行时遵循三段式流程：

1. Match
   - 通过 `name` 和 `description` 判断 Skill 是否匹配当前任务

2. Read
   - 若命中，则读取该 Skill 的 `SKILL.md` 主体、结构化规则块和绑定摘要

3. Execute
   - 按 Skill 指令执行，并在需要时访问 reference、脚本、工具、数据集等附加资源

这套流程是整个渐进式披露和上下文控制的核心。

---

## 4. 渐进式披露原则

### 5.1 总原则

渐进式披露的第一层只加载：

- `id`
- `name`
- `description`

不在初始阶段加载完整 `SKILL.md`、工具绑定、知识库、案例、参考文档。

### 4.2 三层披露模型

#### 第一层：发现层

仅用于“判断某个 Skill 是否可能适用”。

数据结构：

```ts
type SkillIndexItem = {
  id: string;
  name: string;
  description: string;
};
```

用途：

- 列表检索
- PromptEditor 自动补全
- Agent 绑定候选列表
- 运行时轻量匹配

#### 第二层：激活层

仅在 Skill 被真正绑定或命中后加载。

加载内容：

- `SKILL.md` 主体
- 结构化规则块
- 工具绑定摘要
- 数据集绑定摘要
- 子 Skill 依赖

#### 第三层：执行层

仅在实际执行确实需要时加载。

加载内容：

- reference 详情
- 大段附加文档
- 附件文件
- 大型知识资源
- 深层依赖内容

### 4.3 约束

- `list/search` 接口默认只能返回发现层
- 详情页才返回激活层
- 执行时才按需展开执行层
- 不允许在模型初始上下文中注入全部 Skill 正文

---

## 5. Skill 内容模型设计

### 5.1 `SKILL.md` 规范

FastGPT 的 Skill 内容组织吸收 deepagentsjs 的 `SKILL.md` 规范，建议每个 Skill 都具备一个逻辑上的主说明文件：

```md
---
name: data-analyst
description: Use when the user asks for structured data analysis, metric interpretation, or report generation from datasets.
---

# data-analyst

## Overview
...

## When To Use
...

## Instructions
...

## Tools
...

## References
...
```

约束如下：

- `name`：Skill 唯一名称，用于展示与导出
- `description`：用于 Match 阶段的唯一判定信息，必须清晰描述触发条件
- 正文：用于 Read 阶段
- references / scripts / assets：用于 Execute 阶段按需展开

FastGPT 内部可以将其拆成结构化字段存储，但对外导出、预览和兼容格式都应支持生成标准 `SKILL.md`。

### 5.2 结构化存储与 Markdown 的关系

Skill 内容建议采用“双表示”：

1. 存储态
   - 保存结构化字段，便于 UI 编辑、校验和运行时编译

2. 文档态
   - 保存或可生成 `SKILL.md`，便于预览、导出、导入和兼容外部规范

因此建议：

- 编辑器支持结构化编辑
- 同时维护 `markdown`
- 发布时将结构化内容编译为规范化 `SKILL.md`

### 5.3 数据模型设计

### 5.3.1 App 类型扩展

新增：

```ts
enum AppTypeEnum {
  ...
  skill = 'skill'
}
```

### 5.3.2 Skill 主体结构

建议在 `AppSchemaType` 中新增 `skillData` 字段。

```ts
type SkillReferenceType = 'text' | 'dataset' | 'file' | 'skill';

type SkillInstructionBlock = {
  identity?: string;
  whenToUse?: string;
  rules?: string;
  doNot?: string;
  outputFormat?: string;
};

type SkillReferenceItem = {
  id: string;
  type: SkillReferenceType;
  title: string;
  content?: string;
  datasetId?: string;
  fileId?: string;
  skillId?: string;
};

type SkillToolBinding = {
  id: string;
  config: Record<string, any>;
  inheritUpdate?: boolean;
};

type SkillDatasetBinding = {
  datasetId: string;
  mode?: 'quote' | 'search' | 'background';
};

type SkillDependency = {
  skillId: string;
  versionId?: string;
};

type SkillDataType = {
  name: string;
  description: string;
  markdown: string;
  instructionBlock?: SkillInstructionBlock;
  toolBindings: SkillToolBinding[];
  datasetBindings: SkillDatasetBinding[];
  references?: SkillReferenceItem[];
  dependencies?: SkillDependency[];
  scripts?: SkillScriptItem[];
  assets?: SkillAssetItem[];
  inputSchema?: Array<{
    key: string;
    label: string;
    valueType: string;
    required?: boolean;
    defaultValue?: any;
    description?: string;
  }>;
  outputContract?: {
    format?: 'text' | 'json' | 'markdown';
    schema?: string;
  };
};
```

  compiled?: {
    promptFragment?: string;
    triggerDescription?: string;
  };
};
```

补充资源类型定义：

```ts
type SkillScriptItem = {
  id: string;
  name: string;
  description?: string;
  runtime: 'node' | 'python' | 'shell';
  sourceCode: string;
  inputSchema?: Array<{
    key: string;
    label: string;
    valueType: string;
    required?: boolean;
    description?: string;
  }>;
  timeout?: number;
  enabled: boolean;
};

type SkillAssetItem = {
  id: string;
  name: string;
  description?: string;
  assetType: 'template' | 'image' | 'json' | 'binary' | 'text';
  mimeType: string;
  usageMode?: 'read-only' | 'template-render' | 'script-input';
  bucket: string;
  key: string;
  size?: number;
  hash?: string;
};
```

### 5.3.3 App 存储策略

`MongoApp` 中：

- 通用字段继续复用
- `type = skill`
- `modules/edges` 第一阶段保留为空
- `chatConfig` 可复用基础能力配置
- 新增 `skillData`

`MongoAppVersion` 中：

- 保存 `skillData` 快照
- 支持发布版和自动保存版
- `assets` 只保存 S3 对象索引信息，不保存文件二进制内容

### 5.3.4 导入导出格式

为了兼容外部 skill 生态，建议 Skill 在后续支持以下格式：

导出结构：

```text
skill-name/
├── SKILL.md
├── references/
├── scripts/
└── assets/
```

导入流程：

1. 读取 `SKILL.md`
2. 解析 frontmatter 中的 `name` 与 `description`
3. 解析正文
4. 将 references/scripts/assets 映射到 `skillData`
5. 生成 FastGPT Skill 资源

### 5.3.5 Agent 侧引用结构

当前 Agent 已有 `selectedTools`，需新增 `selectedSkills`：

```ts
type SelectedSkillItemType = {
  skillId: string;
  versionId?: string;
  enabled: boolean;
  priority?: number;
  customVars?: Record<string, any>;
  toolPolicy?: 'inherit' | 'disable' | 'custom';
};
```

Agent 持久化时保存引用关系，而不是把 Skill 内容直接写死到 Agent 中。

---

## 6. 前端方案

### 6.1 资源入口

在团队资源体系中新增 Skill 入口，与 Agent、Tool 并列。

建议页面：

- Skill 列表页
- Skill 创建页
- Skill 编辑页
- Skill 版本页

### 6.2 Skill 列表页

功能：

- 目录浏览
- 搜索
- 类型筛选
- 发布状态展示
- 权限展示
- 最近更新时间

数据只加载发现层：

- `id`
- `name`
- `description`
- `avatar`
- `updateTime`
- `permission`

### 6.3 Skill 编辑页

建议采用 Tab 化编辑，避免一次性加载全部内容。

Tab 划分：

1. 基本信息
   - 名称
   - 图标
   - 简介
   - 所属目录

2. 指导内容
   - `name` / `description`
   - Markdown 编辑
   - 结构化规则块编辑
   - `SKILL.md` 预览

3. 执行能力
   - 绑定工具
   - 绑定工作流工具
   - 绑定知识库
   - 依赖其他 Skill

4. 资源
   - References
   - Scripts
   - Assets

5. 调试与预览
   - 预览合成后的 Skill 内容
   - 预览绑定能力摘要
   - 单 Skill 调试输入

6. 版本与发布
   - 自动保存
   - 发布版本
   - 历史版本

### 6.3.1 References 设计

`reference` 是“读给模型看的材料”，适合管理规则文档、示例、说明文本。

前端字段：

- `title`
- `summary`
- `content`
- `contentType`
- `loadPolicy`
- `maxInjectLength`

交互建议：

- 左侧 reference 列表
- 右侧正文编辑器
- Markdown 预览
- 运行时读取预览

### 6.3.2 Scripts 设计

`script` 是“给系统执行的逻辑”，用于做数据处理、格式转换、模板渲染等操作。

前端字段：

- `name`
- `description`
- `runtime`
- `sourceCode`
- `inputSchema`
- `timeout`
- `enabled`

交互建议：

- 代码编辑器
- 参数定义面板
- 测试运行按钮
- 输出日志面板

第一期仅支持轻量脚本，不做复杂依赖管理。

### 6.3.3 Assets 设计

`asset` 是“执行时要拿来用的静态资源”，不是给模型直接阅读的正文。

典型内容：

- Markdown/HTML 模板
- JSON 模板
- 图片
- 二进制模板文件
- 被脚本消费的默认输入文件

前端字段：

- `name`
- `description`
- `assetType`
- `mimeType`
- `usageMode`
- 上传文件

交互建议：

- 文本类资源使用文本编辑器或 JSON 编辑器
- 图片类资源使用缩略图预览
- 二进制资源展示元数据和替换入口
- 所有 asset 都显示 S3 存储状态和文件大小

### 6.3.4 资源模块整体形态

建议在 Skill 编辑页中将资源区拆成三个 Tab：

- `References`
- `Scripts`
- `Assets`

每个 Tab 提供：

- 列表
- 新建
- 编辑
- 删除
- 预览或测试

### 6.4 Agent 编辑页

Agent 编辑页新增 `Skills` 配置区域。

交互包括：

- 选择 Skill
- 选择发布版本
- 启用/禁用
- 调整优先级
- 查看 Skill 详情
- 配置 tool policy

### 6.5 PromptEditor 集成

当前已有：

- `SkillPickerPlugin`
- `SkillLabelPlugin`

需要从“工具别名/子 App 选择器”升级为“正式 Skill 选择器”。

建议：

- `@` 选择器显示 Skill 发现层数据
- 插入形式仍使用 `{{@skillId@}}`
- 标签点击后打开 Skill 配置抽屉
- 标签渲染基于 `selectedSkills`

### 6.6 前端渐进式披露

遵循如下规则：

- 列表页只拉取发现层
- 点开 Skill 抽屉时才拉详情
- 编辑页每个 Tab 懒加载
- 调试页手动触发预览
- reference 内容点击后再取详情

---

## 7. 后端接口方案

### 7.1 Skill 资源接口

建议新增 `/core/skill/*` 风格接口，内部可复用 App controller：

- `POST /api/core/skill/create`
- `POST /api/core/skill/update`
- `POST /api/core/skill/list`
- `GET /api/core/skill/detail`
- `POST /api/core/skill/delete`

### 7.2 版本接口

- `POST /api/core/skill/version/publish`
- `POST /api/core/skill/version/list`
- `GET /api/core/skill/version/detail`

### 7.3 运行辅助接口

- `POST /api/core/skill/previewRuntime`
- `POST /api/core/skill/debugRun`
- `POST /api/core/skill/resolveDependencies`
- `GET /api/core/skill/resource/detail`
- `POST /api/core/skill/reference/create`
- `POST /api/core/skill/reference/update`
- `POST /api/core/skill/reference/delete`
- `POST /api/core/skill/script/create`
- `POST /api/core/skill/script/update`
- `POST /api/core/skill/script/delete`
- `POST /api/core/skill/asset/presign`
- `POST /api/core/skill/asset/create`
- `POST /api/core/skill/asset/delete`

### 7.4 查询原则

#### `skill/list`

返回发现层：

```ts
type SkillListItem = {
  id: string;
  name: string;
  description: string;
  avatar: string;
  updateTime: Date;
  permission: AppPermission;
};
```

#### `skill/detail`

返回激活层：

- markdown
- instructionBlock
- toolBindings
- datasetBindings
- dependencies

#### `skill/resource/detail`

返回执行层的单个资源详情。

#### `skill/asset/presign`

返回 S3 预签名上传信息。

#### `skill/asset/create`

在前端完成 S3 上传后，写入 asset 元数据到 Skill 草稿。

---

## 8. 运行时设计

### 8.1 总体流程

在 Agent 正式进入 `dispatchRunAgent` 之前，新增 Skill 解析阶段。

流程如下：

1. 读取 Agent 配置
2. 获取 `selectedSkills`
3. 加载对应 Skill 已发布版本
4. 校验权限与版本有效性
5. 展开 Skill 依赖
6. 编译 Skill 为运行时结构
7. 合并 Prompt、Tool、Dataset
8. 交给现有 Agent 调度链执行

### 8.2 核心运行时流程

运行时采用三阶段：

1. Match
   - 读取 Agent 已绑定 Skill 的 `name/description`
   - 判断哪些 Skill 需要进入当前请求上下文

2. Read
   - 加载命中 Skill 的 `SKILL.md` 主体、结构化规则块、工具绑定摘要、数据集摘要
   - 编译为运行时片段

3. Execute
   - 按编译结果参与 Prompt 合并和 Tool/Dataset 合并
   - 在需要时再加载 reference / script / file 等执行层内容

### 8.3 新增核心函数

#### `matchSkills`

负责基于 Agent 绑定列表与当前请求上下文，确定进入本轮运行的 Skill 集合。

```ts
type MatchedSkillItem = {
  skillId: string;
  versionId: string;
  matched: boolean;
  reason?: string;
};
```

#### `resolveSkills`

负责把 Agent 引用的多个 Skill 解析为中间结构。

```ts
type ResolvedSkillRuntime = {
  prompts: Array<{
    skillId: string;
    versionId: string;
    content: string;
    priority: number;
  }>;
  tools: SkillToolBinding[];
  datasets: SkillDatasetBinding[];
  lazyResources: Array<{
    skillId: string;
    resourceId: string;
    title: string;
    type: string;
  }>;
  debugInfo: {
    mergedSkillIds: string[];
    skippedSkillIds: string[];
  };
};
```

#### `compileSkill`

负责把单个 Skill 从存储态编译为运行态。

```ts
type CompiledSkillRuntime = {
  promptFragment: string;
  tools: SkillToolBinding[];
  datasets: SkillDatasetBinding[];
  lazyResources: Array<{
    id: string;
    title: string;
    type: string;
  }>;
};
```

建议 `compileSkill` 做两件事：

1. 把 `SKILL.md`/结构化字段编译成适合模型消费的 prompt 片段
2. 把工具、知识库、依赖整理成最小运行集合

### 8.3 Skill 能力调用机制

Skill 命中后，不应直接“执行 Skill”，而应先将 Skill 编译为当前请求的运行时能力包。

能力包包含三类能力：

1. Prompt 能力
   - 来自 `SKILL.md` 和 `instructionBlock`
   - 用于影响模型的行为、约束和输出格式

2. Tool 能力
   - 来自 `toolBindings`
   - 合并进当前 Agent 的 runtime tool registry

3. Resource 能力
   - 来自 `references`、`scripts`、`assets`
   - 以延迟工具形式暴露，在需要时按需访问

建议运行时中间结构：

```ts
type ActivatedSkillRuntime = {
  skillId: string;
  versionId: string;
  promptFragment: string;
  toolBindings: SkillToolBinding[];
  datasetBindings: SkillDatasetBinding[];
  references: Array<{
    id: string;
    title: string;
    type: 'text' | 'dataset' | 'file' | 'skill';
  }>;
  scripts: Array<{
    id: string;
    name: string;
    runtime: 'node' | 'python' | 'shell';
  }>;
  assets: Array<{
    id: string;
    name: string;
    assetType: string;
  }>;
};
```

### 8.4 命中 Skill 后的能力调用链路

推荐链路如下：

1. Agent 收到用户请求
2. `matchSkills` 基于 `name/description` 判断命中 Skill
3. `resolveSkills` 读取命中 Skill 的激活层内容
4. `compileSkill` 生成：
   - `promptFragment`
   - `toolBindings`
   - `datasetBindings`
   - `lazyResources`
5. 将 `promptFragment` 合并进 system prompt
6. 将 `toolBindings` 合并进当前 runtime tools
7. 将 `datasetBindings` 合并进 dataset search 配置
8. 将 `references/scripts/assets` 注册成内部可调用能力
9. 模型开始推理
10. 推理过程中按需调用 Skill 资源能力

### 8.5 Skill 内部资源调用接口

建议不要只提供一个笼统的 `read_skill_resource`，而是拆成明确接口：

- `read_skill_reference`
- `run_skill_script`
- `read_skill_asset`

这样更便于权限、安全和日志管理。

#### `read_skill_reference`

用途：

- 读取 skill 中某条 reference 的正文
- 供模型在需要时按需补充知识

#### `run_skill_script`

用途：

- 执行 skill 中定义的脚本
- 返回脚本输出结果

约束：

- 必须走沙箱
- 必须校验 timeout 和参数 schema

#### `read_skill_asset`

用途：

- 获取某个 asset 的元数据
- 获取 asset 的下载地址或文本内容
- 供模板渲染、脚本输入或资源读取使用

对于文本型 asset，可以选择：

- 直接回传内容

对于大文件或二进制 asset：

- 返回签名后的 S3 读取地址

### 8.6 Prompt 合并策略

推荐顺序：

1. 平台基础 system prompt
2. Agent 自身 system prompt
3. Skill prompt fragments（按 priority）
4. 数据集补充约束
5. 运行时安全约束

Skill 注入内容不应直接使用整篇 Markdown，而应优先使用：

- `instructionBlock`
- 或从 `markdown` 提炼后的核心片段

### 8.7 Tool 合并策略

Skill 绑定工具通过现有 `getAgentRuntimeTools` 链路装配。

合并规则：

- Agent 自身 `selectedTools`
- Skill `toolBindings`
- 去重
- 校验权限
- 校验配置完整性

Skill 的工具能力不单独发明一套调用机制，而是复用现有 Agent Tool 调度链。

### 8.8 Dataset 合并策略

Skill 可绑定知识库。

合并规则：

- Agent 自身 dataset 配置优先
- Skill dataset 作为增强项
- 可按 `mode` 决定是否写入主搜索集或背景引用集

### 8.9 References / Scripts / Assets 的运行时消费方式

#### References

- 用于 prompt 补充或按需读取正文
- 通过 `read_skill_reference` 访问

#### Scripts

- 用于执行数据处理和格式转换
- 通过 `run_skill_script` 访问

#### Assets

- 用于模板读取、素材注入、脚本输入
- 通过 `read_skill_asset` 访问

### 8.10 执行层按需展开

当模型执行中需要更深内容时，通过内部资源接口加载：

- reference 正文
- 深层文档
- script
- asset
- 子 skill 内容

这样保持执行期上下文尽量小。

---

### 8.8 运行时伪代码

```ts
async function buildAgentSkillRuntime(params: {
  selectedSkills: SelectedSkillItemType[];
  query: string;
  teamId: string;
  tmbId: string;
}) {
  const matchedSkills = await matchSkills(params.selectedSkills, params.query);
  const resolvedSkills = await resolveSkills(matchedSkills);
  const compiledSkills = await Promise.all(resolvedSkills.map(compileSkill));

  return {
    promptFragments: compiledSkills.map((item) => item.promptFragment),
    tools: compiledSkills.flatMap((item) => item.tools),
    datasets: compiledSkills.flatMap((item) => item.datasets),
    lazyResources: compiledSkills.flatMap((item) => item.lazyResources)
  };
}
```

---

## 9. 权限与发布策略

### 9.1 权限

完全复用现有 App 权限模型：

- 创建者默认拥有全部权限
- 团队成员可授予读/写/管理权限
- 引用 Skill 至少需要读权限
- 发布 Skill 需要写权限

### 9.2 发布规则

采用“草稿 + 发布版”双态：

- 草稿保存在 `MongoApp`
- 发布版保存在 `MongoAppVersion`

规则：

- Agent 默认引用 Skill 的发布版
- 可选择锁定到指定版本
- 不建议默认跟随最新版

### 9.3 删除与引用保护

删除 Skill 前需要检查引用关系：

- 若已有 Agent 引用，默认禁止硬删除
- 可先归档/隐藏
- 保留历史版本供回溯

### 9.4 审计

复用现有 App 审计日志体系，新增 Skill 对应事件：

- 创建 Skill
- 更新 Skill
- 发布 Skill
- 删除 Skill

---

## 10. 风险与约束

### 10.1 概念边界风险

Skill 和 Tool 容易混淆。

约束定义：

- Tool 是执行单元
- Skill 是能力包
- Skill 可以绑定 Tool，但不是 Tool 的别名

### 10.2 Prompt 膨胀风险

如果直接注入完整 Skill Markdown，会导致上下文膨胀。

控制策略：

- 第一层只暴露 `name + description`
- 激活时优先注入结构化规则块
- reference 严格按需展开
- 发布时增加长度检查

### 10.3 依赖循环风险

Skill 可以依赖 Skill，存在循环引用可能。

控制策略：

- 发布时做依赖 DAG 校验
- 运行时再做一次防御性检测
- 检测到循环直接跳过并告警

### 10.4 线上稳定性风险

Skill 更新可能影响已经上线的 Agent。

控制策略：

- 默认锁定发布版本
- Agent 不自动追最新
- 调试环境可选“跟随最新”

---

## 11. 第一阶段实施范围

建议第一期只交付以下能力：

1. 新增 `AppTypeEnum.skill`
2. 新增 `skillData` 模型
3. 实现 Skill 列表/创建/编辑/发布页面
4. Agent 编辑页支持绑定 Skill
5. PromptEditor Skill 标签接入真实 Skill 数据
6. 运行时支持 Skill Prompt 合并
7. 运行时支持 Skill 工具绑定合并
8. 版本锁定与权限校验

第一期暂不做：

- Skill 市场
- Skill 复杂编排
- Skill 指标分析
- Skill 自动测试中心

---

## 12. 分阶段实施建议

### 阶段 1：数据层

- 扩展 `AppTypeEnum.skill`
- 扩展 `AppSchemaType.skillData`
- 扩展 `MongoAppVersion` 存储 Skill 快照
- 新增 Skill CRUD/Publish API

### 阶段 2：前端管理层

- Skill 列表页
- Skill 编辑页
- Skill 发布页
- Skill 版本页

### 阶段 3：Agent 集成层

- Agent 表单新增 `selectedSkills`
- Skill 选择器与标签渲染接入真实数据
- Skill 配置抽屉

### 阶段 4：运行时层

- `resolveSkills`
- `compileSkill`
- Prompt 合并
- Tool/Dataset 合并
- 依赖校验

---

## 13. 推荐落地原则

为了保证与 FastGPT 现有架构一致，建议遵循以下原则：

1. Skill 必须复用 App 基础设施，不单独再造一套资源系统。
2. 渐进式披露第一层必须只暴露 `name` 和 `description`。
3. Skill 内容组织应遵循 `SKILL.md + references/scripts/assets` 的逻辑模型。
4. 运行时应遵循 `Match -> Read -> Execute`。
5. Skill 正文与资源内容必须延迟加载。
6. Agent 只保存 Skill 引用关系，不直接冗余存正文。
7. 运行时统一通过 `matchSkills + resolveSkills + compileSkill` 进行装配。
8. 默认版本锁定，保证线上 Agent 稳定。

---

## 14. TODO

- [ ] 明确 `skillData` 在 `AppSchemaType` 与 `MongoAppVersion` 中的最终字段定义
- [ ] 明确 Skill 编辑页是“Markdown 优先”还是“结构化配置优先”
- [ ] 明确 Agent 中 `selectedSkills` 的最终表单结构
- [ ] 设计 `resolveSkills` 与 `compileSkill` 的代码落点
- [ ] 明确 Skill 与 Dataset 合并时的优先级策略
- [ ] 明确 Skill 依赖循环的错误提示与前端交互
- [ ] 评估是否需要为 Skill 增加独立审计事件枚举
- [ ] 明确 `read_skill_reference / run_skill_script / read_skill_asset` 的 tool schema
- [ ] 明确 S3 asset 上传、替换、删除时的垃圾回收策略
