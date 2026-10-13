# Agent Sandbox

镜像提供 Python、Node.js、code-server 和常用任务依赖，构建时安装依赖，沙箱启动后即可使用。

## 预装依赖

| 用途 | Python | Node.js |
| --- | --- | --- |
| 数据分析与图表 | numpy、pandas、scipy、matplotlib | lodash、dayjs |
| Excel 与 CSV | openpyxl、XlsxWriter（CSV 使用标准库或 pandas） | exceljs、csv-parse、csv-stringify |
| Word 与 PowerPoint | python-docx、python-pptx | docx、pptxgenjs |
| PDF | pypdf、pdfplumber、reportlab | pdf-lib |
| 图片 | Pillow | sharp |
| HTTP 与网页解析 | requests、httpx、beautifulsoup4、lxml | axios、cheerio |
| YAML 与数据校验 | PyYAML | yaml、zod |
| TypeScript 工具 | — | typescript、tsx |

Python 的直接依赖版本固定在 `requirements.txt`，Node.js 版本固定在 `nodejs/package.json`，其传递依赖由独立的 `nodejs/pnpm-lock.yaml` 锁定。

## 使用方式

Python 依赖安装在 `/opt/agent-sandbox/venv`。镜像已设置 `PATH`，`python`、`python3`、`pip`、`pip3` 默认使用这个环境，无需手动激活。matplotlib 默认使用适合无图形界面的 `Agg` 后端。

```bash
python3 -c 'import pandas as pd; print(pd.DataFrame({"value": [1, 2, 3]}))'
```

Node.js 依赖安装在 `/opt/agent-sandbox/nodejs/node_modules`，通过 `/node_modules` 符号链接支持不同工作目录中的 CommonJS `require` 和 ESM `import`，包括挂载卷内的脚本。项目自己的 `node_modules` 按 Node.js 的标准查找顺序优先使用。`tsx` 和 `tsc` 已加入 `PATH`。

```bash
node -e 'const ExcelJS = require("exceljs"); console.log(new ExcelJS.Workbook().worksheets.length)'
node --input-type=module -e 'import { parse } from "yaml"; console.log(parse("value: 3"))'
tsx script.ts
```

这些库用于文档的读取、生成和编辑。Office 文档转 PDF、浏览器自动化、OCR 和深度学习运行环境需要额外的工具或依赖。

## 构建与验证

在仓库根目录运行：

```bash
docker build -t fastgpt-agent-sandbox:latest projects/agent-sandbox
docker run --rm --entrypoint bash fastgpt-agent-sandbox:latest /opt/agent-sandbox/test/smoke.sh
```

构建会执行 `test/smoke.sh`，检查 Python 导入、数据处理、Excel／Word／PPT／PDF／PNG 生成和读取，以及 Node.js 的 CommonJS、ESM、原生图片模块和 TypeScript 执行。任何验证失败都会终止构建。测试使用临时工作目录并自动清理文件。

更新依赖后需重新构建镜像，并让部署配置使用新镜像标签。已有沙箱实例需要重建后才能获得新增库。

## 维护 Node.js 依赖

修改 `nodejs/package.json` 后，在该目录更新独立锁文件：

```bash
cd projects/agent-sandbox/nodejs
pnpm install --ignore-workspace --lockfile-only --ignore-scripts
```

`--ignore-workspace` 保持沙箱运行依赖独立于 FastGPT 的应用依赖。镜像构建使用 `--frozen-lockfile`，不会自动修改锁文件。仅允许 `esbuild` 和 `sharp` 执行所需的安装脚本。
