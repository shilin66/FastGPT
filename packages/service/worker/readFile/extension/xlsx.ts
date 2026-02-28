import { CUSTOM_SPLIT_SIGN } from '@fastgpt/global/common/string/textSplitter';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import xlsx from 'node-xlsx';
import Papa from 'papaparse';

// 【新增】辅助函数：用于转义单元格内容中的换行符和 |
// 将实际的换行符 \n 和 | 替换为字符串 \\n \|，防止其破坏 Markdown 表格的行结构
const escapeNewlines = (cell: unknown): string => {
  // 1. 先转义换行符，防止破坏行结构
  let content = String(cell).replace(/\n/g, '\\n');

  // 2. 接着转义竖线 |，防止被识别为列分隔符
  content = content.replace(/\|/g, '\\|');

  return content;
};

export const readXlsxRawText = async ({
  buffer
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const result = xlsx.parse(buffer, {
    skipHidden: false,
    defval: ''
  });

  const format2Csv = result.map(({ name, data }) => {
    return {
      title: `#${name}`,
      csvText: data.map((item) => item.join(',')).join('\n')
    };
  });

  const rawText = format2Csv.map((item) => item.csvText).join('\n');

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
    .filter(Boolean)
    .join(CUSTOM_SPLIT_SIGN);

  return {
    rawText: rawText,
    formatText
  };
};
