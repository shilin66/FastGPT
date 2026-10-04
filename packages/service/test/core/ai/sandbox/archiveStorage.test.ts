import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import {
  getSandboxArchiveKey,
  getSandboxArchiveStorage
} from '@fastgpt/service/core/ai/sandbox/archiveStorage';

const remote = vi.hoisted(() => ({
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  exists: vi.fn(),
  list: vi.fn()
}));
vi.mock('@fastgpt/service/common/s3/buckets/private', () => ({
  S3PrivateBucket: class {
    client = {
      uploadObject: remote.upload,
      downloadObject: remote.download,
      deleteObject: remote.remove,
      checkObjectExists: remote.exists,
      listObjects: remote.list
    };
  }
}));
const sandboxId = 'owned-workspace';
const key = getSandboxArchiveKey(sandboxId, randomUUID());
const data = Buffer.from('完整归档');
beforeEach(() => {
  vi.resetAllMocks();
  remote.download.mockImplementation(async () => ({ body: Readable.from([data]) }));
  remote.exists.mockResolvedValue({ exists: false });
});

describe('verified private sandbox archive storage', () => {
  it('lists only the sandbox archive namespace for reverse audit', async () => {
    remote.list.mockResolvedValue({ keys: [key] });
    expect(await getSandboxArchiveStorage().list()).toEqual([key]);
    expect(remote.list).toHaveBeenCalledWith({ prefix: 'sandbox/archive/' });
  });
  it('reads back the uploaded bytes and rejects corrupt receipts', async () => {
    await getSandboxArchiveStorage().upload(sandboxId, key, data);
    expect(remote.upload).toHaveBeenCalledOnce();
    expect(remote.download).toHaveBeenCalledOnce();
    remote.download.mockResolvedValueOnce({ body: Readable.from([Buffer.from('corrupt')]) });
    await expect(getSandboxArchiveStorage().upload(sandboxId, key, data)).rejects.toThrow(
      'verification failed'
    );
  });
  it('bounds downloaded archive bytes', async () => {
    await expect(getSandboxArchiveStorage().download(sandboxId, key, 1)).rejects.toThrow(
      'size limit'
    );
  });
  it.each([true, undefined])(
    'retains cleanup failure when deletion cannot be confirmed: %s',
    async (exists) => {
      remote.exists.mockResolvedValueOnce({ exists });
      await expect(getSandboxArchiveStorage().remove(sandboxId, key)).rejects.toThrow(
        'deletion not confirmed'
      );
    }
  );
  it('awaits and confirms deletion', async () => {
    await getSandboxArchiveStorage().remove(sandboxId, key);
    expect(remote.remove).toHaveBeenCalledWith({ key });
    expect(remote.exists).toHaveBeenCalledWith({ key });
  });
  it('rejects an archive belonging to another sandbox before dispatch', async () => {
    await expect(getSandboxArchiveStorage().remove('other-workspace', key)).rejects.toThrow(
      'ownership mismatch'
    );
    expect(remote.remove).not.toHaveBeenCalled();
  });
});
