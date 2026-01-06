import { CUSTOM_SPLIT_SIGN } from '@fastgpt/global/common/string/textSplitter';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import * as XLSX from 'xlsx'; // 确保你已经安装了 xlsx (建议使用 CDN 版本)

// 【新增】辅助函数：用于转义单元格内容中的换行符和 |
// 将实际的换行符 \n 和 | 替换为字符串 \\n \|，防止其破坏 Markdown 表格的行结构
const escapeNewlines = (cell: unknown): string => {
  // 1. 先转义换行符，防止破坏行结构
  let content = String(cell).replace(/\n/g, '\\n');

  // 2. 接着转义竖线 |，防止被识别为列分隔符
  content = content.replace(/\|/g, '\\|');

  return content;
};

export const readXlsRawText = async ({
  buffer
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  // 1. 使用 SheetJS 读取 Buffer
  // type: 'buffer' 显式告诉库输入的是 buffer 数据
  // cellDates: true 可以将日期数字转为 JS Date 对象，可视需求开启，默认是 false (即 Excel 序列号)
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  // 2. 将 SheetJS 的数据结构转换为类似 node-xlsx 的结构 [{name: 'Sheet1', data: [][]}, ...]
  const result = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    // sheet_to_json 使用 { header: 1 } 会返回二维数组格式 [[A1, B1], [A2, B2]]
    // defval: '' 保证空单元格被填充为空字符串，而不是 undefined，这与 node-xlsx 行为一致
    const data = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false // 可选：是否包含空行，node-xlsx 默认通常包含
    }) as any[][];

    return { name, data };
  });

  // ---------------- 下面的逻辑复用你原本的代码逻辑 ----------------

  // 3. 生成 CSV 格式 (Raw Text)
  const format2Csv = result.map(({ name, data }) => {
    return {
      title: `#${name}`,
      // 注意：这里保留了你原本的简易 CSV 逻辑 (直接用逗号连接)。
      // 如果单元格内容本身包含逗号，这种方式会破坏格式。
      // 如果想更严谨，可以使用 XLSX.utils.sheet_to_csv(worksheet)
      csvText: data.map((item) => item.join(',')).join('\n')
    };
  });

  const rawText = format2Csv.map((item) => item.csvText).join('\n');

  // 4. 生成 Markdown 表格格式 (Format Text)
  const formatText = result
    .map(({ data }) => {
      // 原始的 header 是一个数组
      const rawHeader = data[0];
      if (!rawHeader) return;

      // 【修改点 1】：对表头中的每个单元格内容进行换行符转义
      const header = rawHeader.map(escapeNewlines);

      // 数据行从第二行开始
      const dataRows = data.slice(1);

      const formatText = `| ${header.join(' | ')} |
| ${header.map(() => '---').join(' | ')} |
${dataRows
  .map(
    (row) =>
      // 【修改点 2】：使用新的 escapeNewlines 辅助函数处理数据行，以增强代码一致性
      // 原有代码中的 .replace(/\n/g, '\\n') 逻辑是正确的，这里只是使用辅助函数封装
      `| ${row.map((cell) => escapeNewlines(cell)).join(' | ')} |`
  )
  .join('\n')}`;

      return formatText;
    })
    .filter(Boolean) // 过滤掉 null/undefined (比如空 sheet)
    .join(CUSTOM_SPLIT_SIGN);

  return {
    rawText,
    formatText
  };
};
