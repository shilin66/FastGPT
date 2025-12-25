import { CUSTOM_SPLIT_SIGN } from '@fastgpt/global/common/string/textSplitter';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import * as XLSX from 'xlsx'; // 确保你已经安装了 xlsx (建议使用 CDN 版本)

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
      const header = data[0]; // 获取表头
      if (!header || header.length === 0) return null;

      // 生成 Markdown 表头
      const headerStr = `| ${header.join(' | ')} |`;
      // 生成 Markdown 分隔线 | --- | --- |
      const divider = `| ${header.map(() => '---').join(' | ')} |`;

      // 生成表格内容
      const body = data
        .slice(1)
        .map((row) => {
          // 确保每一行的数据长度和表头对齐 (防止有些行数据少于表头导致 Markdown 错位)
          // 虽然你原本的代码没做这个处理，但在 sheet_to_json 中 defval 已处理了空值，通常没问题
          return `| ${row.map((cell) => String(cell).replace(/\n/g, '\\n')).join(' | ')} |`;
        })
        .join('\n');

      return `${headerStr}\n${divider}\n${body}`;
    })
    .filter(Boolean) // 过滤掉 null/undefined (比如空 sheet)
    .join(CUSTOM_SPLIT_SIGN);

  return {
    rawText,
    formatText
  };
};
