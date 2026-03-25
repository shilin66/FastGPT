import { detect } from 'jschardet';

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const detectFileEncoding = (buffer: Buffer) => {
  return detect(buffer.slice(0, 200))?.encoding?.toLocaleLowerCase();
};
// export const detectFileEncodingByPath = async (path: string) => {
//   // Get 64KB file head
//   const MAX_BYTES = 64 * 1024;
//   const buffer = Buffer.alloc(MAX_BYTES);
//
//   const fd = await fs.promises.open(path, 'r');
//   try {
//     // Read file head
//     // @ts-ignore
//     const { bytesRead } = await fd.read(buffer, 0, MAX_BYTES, 0);
//     const actualBuffer = buffer.slice(0, bytesRead);
//
//     return detect(actualBuffer)?.encoding?.toLocaleLowerCase();
//   } finally {
//     await fd.close();
//   }
// };

// Url => user upload file type
// export const parseUrlToFileType = async (
//   url: string
// ): Promise<UserChatItemFileItemType | undefined> => {
//   if (typeof url !== 'string') return;
//
//   // Handle base64 image
//   if (url.startsWith('data:')) {
//     const matches = url.match(/^data:([^;]+);base64,/);
//     if (!matches) return;
//
//     const mimeType = matches[1].toLowerCase();
//     if (!mimeType.startsWith('image/')) return;
//
//     const extension = mimeType.split('/')[1];
//     return {
//       type: ChatFileTypeEnum.image,
//       name: `image.${extension}`,
//       url
//     };
//   }
//
//   try {
//     const parseUrl = new URL(url, 'http://localhost:3000');
//
//     // Get filename from URL
//     const filename = await (async () => {
//       // Here is a S3 Object Key
//       if (url.startsWith('chat/')) {
//         const basename = path.basename(url);
//         // Return empty if no extension
//         return basename.includes('.') ? basename : '';
//       }
//
//       const fromParam = parseUrl.searchParams.get('filename');
//       if (fromParam) {
//         return fromParam;
//       }
//       const basename = path.basename(parseUrl.pathname);
//       const filename = basename.includes('.') ? basename : '';
//       if (!filename) {
//         return await getFileNameFromHttpUrlHeader(url);
//       }
//
//       return filename;
//     })();
//     const extension = filename?.split('.').pop()?.toLowerCase() || '';
//
//     if (extension && imageFileType.includes(extension)) {
//       // Default to file type for non-extension files
//       return {
//         type: ChatFileTypeEnum.image,
//         name: filename || 'null',
//         url
//       };
//     }
//     // If it's a document type, return as file, otherwise treat as image
//     return {
//       type: ChatFileTypeEnum.file,
//       name: filename || 'null',
//       url
//     };
//   } catch (error) {
//     return {
//       type: ChatFileTypeEnum.file,
//       name: url,
//       url
//     };
//   }
// };

export const getFileNameFromHttpUrlHeader = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, { method: 'HEAD' }); // 使用 HEAD 请求只获取 Header，速度更快

    // 1. 获取 Content-Disposition 头
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
      let fileName = '';

      // A. 优先尝试 RFC 5987 标准 (filename*=UTF-8''...)
      const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;\n]+)/i);
      if (utf8Match && utf8Match[1]) {
        fileName = utf8Match[1];
      }
      // B. 其次尝试传统 filename 属性
      else {
        const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (fileNameMatch && fileNameMatch[1]) {
          fileName = fileNameMatch[1].replace(/['"]/g, '');
        }
      }

      if (fileName) {
        // 核心步骤：对提取到的文件名进行解码（如 %E6%B9%9B -> 湛）
        try {
          return decodeURIComponent(fileName);
        } catch (e) {
          // 如果解码失败（可能包含不合规的%号），直接返回原样字符
          return fileName;
        }
      }
    }

    return '';
  } catch (error) {
    console.error('获取失败:', error);
    return '';
  }
};
