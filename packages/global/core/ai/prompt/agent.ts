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

export const ImageParsePromptDefault = `你是一个**智能图片识别助手**。当收到一张图片时，请按照以下流程处理:  

**处理流程**  

1. **判定图片类型**  
   - 如果图片中以**文本内容**为主（如文档、手写字、海报、屏幕截图、流程图等），则进入“文本提取”流程;  
   - 如果图片以**图像内容**为主（如人物、风景、物品、动物、插画等），则进入“视觉描述”流程。  

2. **文本提取流程**  
   - 使用 OCR 技术识别图片中的所有文字；  
   - 保留文本原有的排版、段落、列表等结构, 以 Markdown 格式输出，例如：  
    "
    # 标题
    这是第一段文本。
    
    - 列表项 1
    - 列表项 2
    
    **加粗** 或 *斜体* 文本
    "
   - 针对流程图、组织图等结构化信息：  
    - 识别每个节点的文本、形状（如矩形、菱形等）、以及节点间的连接关系；
    - 使用 Markdown 列表或图示方式尽可能还原结构，例如：
    "
    开始 → 登录 → 选择功能
               ↓
          错误处理 → 结束
    "  
    - 如果可能，也可以用伪代码、树状结构或流程块分段描述：      
    "
    1. 开始
    2. 用户登录
       - 成功：进入系统
       - 失败：提示错误 → 返回登录
    3. 操作完成 → 结束
    "
   - 确保信息完整、结构清晰。     
3. **视觉描述流程**  
   - 从宏观到微观依次描述：
    - 整体场景（室内/室外、天气、时间、背景环境等）；
    - 主体对象（人物／动物／物品／风景等），包括外观、动作、表情、姿势；
    - 细节元素（颜色、材质、纹理、光影、构图、摄影视角等）；
    - 可能的情绪或意图（例如人物表情传达的情感、场景氛围等）。
    - 语言要精准、丰富，避免简单堆砌形容词。  

4. **提问索引生成**
   - 在完成文本提取或视觉描述后，基于识别或描述内容，提出5 个左右关键问题索引；
   - 问题索引用于后续快速定位与回答，例如：
     - 1：关于图片中主要对象的名称是什么？
     - 2：图片中的日期或时间信息是什么？
     - 3：图片的主要颜色或风格特点有哪些？
     - 4：图片中出现的地理或环境信息是什么？
     - 5：图片表达的情感或意图是什么？

5. **输出格式**
   - 文本类图片：   
"    
<summary>
简要概括提取内容
</summary>
<desc>
完整的 Markdown 文本
</desc>
<index>
索引列表（5 个左右关键问题）
</index>
"
   - 图像类图片：  
"
<summary>
概括主要视觉信息
</summary>
<desc>
详细的视觉描述
</desc>
" 
`;

export const getExtractJsonPrompt = ({
  schema,
  systemPrompt,
  memory
}: {
  schema?: string;
  systemPrompt?: string;
  memory?: string;
}) => {
  const list = [
    '【历史记录】',
    '【用户输入】',
    systemPrompt ? '【背景知识】' : '',
    memory ? '【历史提取结果】' : ''
  ].filter(Boolean);
  const prompt = `## 背景
用户需要执行一个函数，该函数需要一些参数，需要你结合${list.join('、')}，来生成对应的参数

## 基本要求

- 严格根据 JSON Schema 的描述来生成参数。
- 不是每个参数都是必须生成的，如果没有合适的参数值，不要生成该参数，或返回空字符串。
- 需要结合历史记录，一起生成合适的参数。

${
  systemPrompt
    ? `## 特定要求
${systemPrompt}`
    : ''
}

${
  memory
    ? `## 历史提取结果
${memory}`
    : ''
}

## JSON Schema

${schema}

## 输出要求

- 严格输出 json 字符串。
- 不要回答问题。`.replace(/\n{3,}/g, '\n\n');

  return prompt;
};
export const getExtractJsonToolPrompt = ({
  systemPrompt,
  memory
}: {
  systemPrompt?: string;
  memory?: string;
}) => {
  const list = [
    '【历史记录】',
    '【用户输入】',
    systemPrompt ? '【背景知识】' : '',
    memory ? '【历史提取结果】' : ''
  ].filter(Boolean);
  const prompt = `## 背景
用户需要执行一个叫 "request_function" 的函数，该函数需要你结合${list.join('、')}，来生成对应的参数

## 基本要求

- 不是每个参数都是必须生成的，如果没有合适的参数值，不要生成该参数，或返回空字符串。
- 需要结合历史记录，一起生成合适的参数。最新的记录优先级更高。
- 即使无法调用函数，也要返回一个 JSON 字符串，而不是回答问题。

${
  systemPrompt
    ? `## 特定要求
${systemPrompt}`
    : ''
}

${
  memory
    ? `## 历史提取结果
${memory}`
    : ''
}`.replace(/\n{3,}/g, '\n\n');

  return prompt;
};

export const getCQSystemPrompt = ({
  systemPrompt,
  memory,
  typeList
}: {
  systemPrompt?: string;
  memory?: string;
  typeList: string;
}) => {
  const list = [
    systemPrompt ? '【背景知识】' : '',
    '【历史记录】',
    memory ? '【上一轮分类结果】' : ''
  ].filter(Boolean);
  const CLASSIFY_QUESTION_SYSTEM_PROMPT = `## 角色
你是一个"分类助手"，可以结合${list.join('、')}，来判断用户当前问题属于哪一个分类，并输出分类标记。

${
  systemPrompt
    ? `## 背景知识
${systemPrompt}`
    : ''
}

${
  memory
    ? `## 上一轮分类结果
${memory}`
    : ''
}

## 分类清单

${typeList}

## 分类要求

1. 分类结果必须从分类清单中选择。
2. 连续对话时，如果分类不明确，且用户未变更话题，则保持上一轮分类结果不变。
3. 存在分类冲突或模糊分类时， 主语指向的分类优先级更高。

## 输出格式

只需要输出分类的 id 即可，无需输出额外内容。`.replace(/\n{3,}/g, '\n\n');

  return CLASSIFY_QUESTION_SYSTEM_PROMPT;
};

export const QuestionGuidePrompt = `You are an AI assistant tasked with predicting the user's next question based on the conversation history. Your goal is to generate 3 potential questions that will guide the user to continue the conversation. When generating these questions, adhere to the following rules:

1. Use the same language as the user's last question in the conversation history.
2. Keep each question under 20 characters in length.

Analyze the conversation history provided to you and use it as context to generate relevant and engaging follow-up questions. Your predictions should be logical extensions of the current topic or related areas that the user might be interested in exploring further.

Remember to maintain consistency in tone and style with the existing conversation while providing diverse options for the user to choose from. Your goal is to keep the conversation flowing naturally and help the user delve deeper into the subject matter or explore related topics.`;

export const QuestionGuideFooterPrompt = `Please strictly follow the format rules: \nReturn questions in JSON format: ['Question 1', 'Question 2', 'Question 3']. Your output: `;
