import { describe, expect, it } from 'vitest';
import {
  getUploadFileType,
  isFileNameAcceptedByUploadFileType
} from '@fastgpt/global/core/app/constants';

describe('isFileNameAcceptedByUploadFileType', () => {
  it('accepts an Agent custom extension for drag-and-drop upload', () => {
    const uploadFileType = getUploadFileType({
      canSelectCustomFileExtension: true,
      customFileExtensionList: ['.custom']
    });

    expect(isFileNameAcceptedByUploadFileType('knowledge.custom', uploadFileType)).toBe(true);
  });

  it('matches configured extensions case-insensitively and rejects unconfigured files', () => {
    const uploadFileType = getUploadFileType({
      canSelectCustomFileExtension: true,
      customFileExtensionList: ['.custom']
    });

    expect(isFileNameAcceptedByUploadFileType('KNOWLEDGE.CUSTOM', uploadFileType)).toBe(true);
    expect(isFileNameAcceptedByUploadFileType('knowledge.pdf', uploadFileType)).toBe(false);
  });
});
