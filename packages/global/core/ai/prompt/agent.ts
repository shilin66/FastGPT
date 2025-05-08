import { getPromptByVersion } from './utils';

export const Prompt_AgentQA = {
  description: `<Context></Context> 标记中是一段文本，学习和分析它，并整理学习成果：
- 提出问题并给出每个问题的答案。
- 答案需详细完整，尽可能保留原文描述，可以适当扩展答案描述。
- 答案可以包含普通文字、链接、代码、表格、公示、媒体链接等 Markdown 元素。
- 最多提出 50 个问题。
- 生成的问题和答案和源文本语言相同。
`,
  fixedText: `请按以下格式整理学习成果:
<Context>
文本
</Context>
Q1: 问题。
A1: 答案。
Q2:
A2:

------

我们开始吧!

<Context>
{{text}}
</Context>
`
};

export const AutoIndexPromptDefault = `请扮演一位阅读理解助理，针对以下文本生成摘要与问题索引，便于后续通过索引快速定位文本并回答问题。
<Task>
请严格遵循以下步骤处理<Context>中的文本：
1. 深度解析：仔细阅读并理解文本的核心内容和细节信息
2. 摘要生成：提取关键信息形成简明概要，保持与原文相同的语言
3. 问题构建：创建可定位具体信息的问题索引，确保：
   - 覆盖文本主要方面和重要细节
   - 问题形式包含事实型、分析型、因果型等多种类型
   - 问题数量5-30个(重要内容优先)
   - 每个问题都能对应到明确的文本位置
</Task>
请按指定格式组织输出：

<outputFormat>
<summary>
【语言与原文一致的精炼摘要，突出核心要素】
</summary>

<questionIndex>
【按优先级排序的问题列表】
1. [可定位的事实型问题] 
2. [涉及因果关系的分析问题]
3. [需要对比/解释的概念问题]
...
N. [最后的重要细节问题]
</questionIndex>
</outputFormat>

<rules>
1. 摘要保持客观，避免主观解读
2. 问题应满足：通过检索可直接定位原文对应内容
3. 复杂内容应分解为多个针对性问题
4. 重要数据/专有名词必须包含在问题中
5. 问题表述清晰无歧义，避免使用模糊代词
</rules>

请开始分析：
<Context>
{{text}}
</Context>`;

export const ImageIndexPromptDefault = `你是一个 **专业文献分析助手**，请针对给定的<Context>标签中的文本执行**图片元数据提取**及**上下文关联索引**任务。务必**严格遵循**以下流程与格式，只输出 '<imageIndex>…</imageIndex>' 区块，其他内容一律不予展示。

**处理流程**
1. **文本深度解析**  
   - 理解核心观点与细节  
2. **图片内容识别**  
   - 定位引用位置  
   - 对每张图片分别解析：  
     - 视觉元素（主体、背景、颜色、构图等）  
     - 数据呈现形式（图表、照片、示意图等）  
     - 与文本论证的关系
3. **索引体系构建**  
   - 构建分级索引结构（例如：章节→小节→图片编号）  
   - 建立图片↔文本双向引用  
   - 生成 ≥5 个语义特征标签（主体／属性／关联）  
   - 保持与原文相同语言

**输出格式**
<imageIndex>
<index>
1. **图1名称**  
   - **访问链接**: ![源文本的alt]()
   - **位置**：第X行  
   - **类型**：图表／照片／示意图  
   - **视觉元素**：…  
   - **数据形式**：…  
   - **关联论证**：…  
   - **标签**：标签1、标签2、标签3、标签4、标签5  
</index>
<index>
2. **图2名称**  …  
</index>
</imageIndex>

**规则说明**
- **关键词要求**：每张图片至少 5 个标签  
- **模糊引用**：标注 '[推测]'；未确认者标注 '[UNVERIFIED]'  
- **命名规范**：受控词汇、连续编号、标准学科分类  
- **唯一输出**：仅限 '<imageIndex>…</imageIndex>'  

以下是 '<Context>{{text}}</Context>' ，请开始分析并输出索引。`;
export const getExtractJsonPrompt = (version?: string) => {
  const promptMap: Record<string, string> = {
    ['4.9.2']: `你可以从 <对话记录></对话记录> 中提取指定 Json 信息，你仅需返回 Json 字符串，无需回答问题。
<提取要求>
{{description}}
</提取要求>

<提取规则>
- 本次需提取的 json 字符串，需符合 JsonSchema 的规则。
- type 代表数据类型; key 代表字段名; description 代表字段的描述; enum 是枚举值，代表可选的 value。
- 如果没有可提取的内容，忽略该字段。
</提取规则>

<JsonSchema>
{{json}}
</JsonSchema>

<对话记录>
{{text}}
</对话记录>

提取的 json 字符串:`
  };

  return getPromptByVersion(version, promptMap);
};

export const getExtractJsonToolPrompt = (version?: string) => {
  const promptMap: Record<string, string> = {
    ['4.9.2']: `我正在执行一个函数，需要你提供一些参数，请以 JSON 字符串格式返回这些参数，要求：
"""
- {{description}}
- 不是每个参数都是必须生成的，如果没有合适的参数值，不要生成该参数，或返回空字符串。
- 需要结合历史记录，一起生成合适的参数。
"""

本次输入内容: """{{content}}"""
  `
  };

  return getPromptByVersion(version, promptMap);
};

export const getCQPrompt = (version?: string) => {
  const promptMap: Record<string, string> = {
    ['4.9.2']: `请帮我执行一个"问题分类"任务，将问题分类为以下几种类型之一：

"""
{{typeList}}
"""

## 背景知识
{{systemPrompt}}

## 对话记录
{{history}}

## 开始任务

现在，我们开始分类，我会给你一个"问题"，请结合背景知识和对话记录，将问题分类到对应的类型中，并返回类型ID。

问题："{{question}}"
类型ID=
`
  };

  return getPromptByVersion(version, promptMap);
};

export const QuestionGuidePrompt = `You are an AI assistant tasked with predicting the user's next question based on the conversation history. Your goal is to generate 3 potential questions that will guide the user to continue the conversation. When generating these questions, adhere to the following rules:

1. Use the same language as the user's last question in the conversation history.
2. Keep each question under 20 characters in length.

Analyze the conversation history provided to you and use it as context to generate relevant and engaging follow-up questions. Your predictions should be logical extensions of the current topic or related areas that the user might be interested in exploring further.

Remember to maintain consistency in tone and style with the existing conversation while providing diverse options for the user to choose from. Your goal is to keep the conversation flowing naturally and help the user delve deeper into the subject matter or explore related topics.`;

export const QuestionGuideFooterPrompt = `Please strictly follow the format rules: \nReturn questions in JSON format: ['Question 1', 'Question 2', 'Question 3']. Your output: `;
