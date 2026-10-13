import type { I18nStringType } from '../../../common/i18n/type';
import { hashStr } from '../../../common/string/tools';
import type { ChatCompletionTool } from '../llm/type';
import z from 'zod';

// ---- 沙盒状态 ----
export const SandboxStatusEnum = {
  provisioning: 'provisioning',
  running: 'running',
  stopping: 'stopping',
  stopped: 'stopped',
  archiving: 'archiving',
  archived: 'archived',
  restoring: 'restoring',
  deleting: 'deleting',
  failed: 'failed'
} as const;
export type SandboxStatusType = (typeof SandboxStatusEnum)[keyof typeof SandboxStatusEnum];

// ---- 暂停阈值（分钟） ----
export const SANDBOX_SUSPEND_MINUTES = 60;

// ---- sandboxId 生成 ----
export const generateSandboxId = (appId: string, userId: string, chatId: string): string => {
  return hashStr(`${appId}-${userId}-${chatId}`).slice(0, 16);
};

// Tool
export const SANDBOX_NAME: I18nStringType = {
  'zh-CN': '虚拟机',
  'zh-Hant': '虛擬機',
  en: 'Sandbox'
};
export const SANDBOX_ICON = 'core/app/sandbox/sandbox' as const;
export const SANDBOX_TOOL_NAME = 'sandbox_shell';
export const SandboxShellToolSchema = z.object({
  command: z.string(),
  timeout: z.number().optional()
});
export const SANDBOX_SHELL_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_TOOL_NAME,
    description: '在独立 Linux 虚拟机环境中执行 shell 命令，支持文件操作、代码运行、包安装等',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令' },
        timeout: {
          type: 'number',
          description: '超时秒数',
          max: 600,
          min: 1
        }
      },
      required: ['command']
    }
  }
};

export const SANDBOX_READ_FILE_TOOL_NAME: I18nStringType = {
  'zh-CN': '虚拟机/获取文件链接',
  'zh-Hant': '虛擬機/獲取文件鏈接',
  en: 'Sandbox/Get File URL'
};
export const SANDBOX_GET_FILE_URL_TOOL_NAME = 'sandbox_get_file_url';
export const SandboxGetFileUrlToolSchema = z.object({
  paths: z.array(z.string())
});
export const SANDBOX_GET_FILE_URL_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SANDBOX_GET_FILE_URL_TOOL_NAME,
    description: '从虚拟机读取指定文件，上传至云存储，返回 2 小时有效期的访问链接',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: {
            type: 'string',
            description: '文件访问路径，例如: output.csv'
          },
          description: '文件访问路径，例如: ["output.csv", "output.txt"]'
        }
      },
      required: ['paths']
    }
  }
};

export const SANDBOX_TOOLS: ChatCompletionTool[] = [SANDBOX_SHELL_TOOL, SANDBOX_GET_FILE_URL_TOOL];

export const SANDBOX_RUNTIME_PROMPT = `Runtime and dependencies:
- Run Python scripts with python3 from PATH. In the current FastGPT agent-sandbox image, python/python3 and pip/pip3 use the shared environment at /opt/agent-sandbox/venv; no manual activation is needed.
- Keep the default PATH and do not hardcode /usr/bin/python3. Create or activate a separate Python environment only when the task requires isolated dependencies, as it may not include the preinstalled libraries.
- Prefer preinstalled libraries. If a required Python package is missing, install it with python3 -m pip install <package> so installation uses the same interpreter as the script.
- Preinstalled Python packages: numpy, pandas, scipy, matplotlib, openpyxl, XlsxWriter, python-docx, python-pptx, pypdf, pdfplumber, reportlab, Pillow, requests, httpx, beautifulsoup4, lxml, PyYAML.
- Python import names include PIL for Pillow, docx for python-docx, pptx for python-pptx, bs4 for beautifulsoup4, and yaml for PyYAML. Matplotlib defaults to the headless Agg backend.
- Run JavaScript with node and TypeScript with tsx; tsc is available from PATH.
- Preinstalled Node.js packages: axios, cheerio, csv-parse, csv-stringify, dayjs, docx, exceljs, lodash, pdf-lib, pptxgenjs, sharp, tsx, typescript, yaml, zod.
- Shared Node.js libraries support CommonJS require and ESM import from the workspace; project-local node_modules take precedence. Install additional project dependencies with pnpm in the project directory.
- Older or custom sandbox images may differ. If a command or import fails, inspect command -v python3, python3 -m pip --version, or the relevant Node.js import before installing missing dependencies.`;

export const SANDBOX_SYSTEM_PROMPT = `你拥有一个独立的 Linux 沙盒环境，可通过 ${SANDBOX_TOOL_NAME} 工具执行命令：
- 常用命令：bash / python3 / node / git / curl
- 可根据任务需要安装软件包（apt / python3 -m pip / pnpm）
- 生成的文件内容都保存在当前目录下即可
- 若需要将生成的文件分享给用户，可使用 ${SANDBOX_GET_FILE_URL_TOOL_NAME} 工具获取文件的临时访问链接

${SANDBOX_RUNTIME_PROMPT}`;
