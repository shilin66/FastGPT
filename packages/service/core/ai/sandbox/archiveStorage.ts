import { createHash } from 'node:crypto';
import { S3PrivateBucket } from '../../../common/s3/buckets/private';

export type SandboxArchiveReceipt = { key: string; size: number; hash: string; createdAt: Date };

const archivePrefix = (sandboxId: string) => `sandbox/archive/${encodeURIComponent(sandboxId)}/`;
export const getSandboxArchiveKey = (sandboxId: string, operationId: string) =>
  `${archivePrefix(sandboxId)}${operationId}.tar.gz`;
const assertArchiveKey = (sandboxId: string, key: string) => {
  if (
    !key.startsWith(archivePrefix(sandboxId)) ||
    !/^[a-f0-9-]{36}\.tar\.gz$/.test(key.slice(archivePrefix(sandboxId).length))
  )
    throw new Error('Sandbox archive ownership mismatch');
};

class SandboxArchiveStorage extends S3PrivateBucket {
  async list() {
    const { keys } = await this.client.listObjects({ prefix: 'sandbox/archive/' });
    return keys;
  }

  async upload(sandboxId: string, key: string, body: Buffer) {
    assertArchiveKey(sandboxId, key);
    await this.client.uploadObject({ key, body, contentType: 'application/gzip' });
    const confirmed = await this.download(sandboxId, key, body.length);
    if (
      createHash('sha256').update(new Uint8Array(confirmed)).digest('hex') !==
      createHash('sha256').update(new Uint8Array(body)).digest('hex')
    )
      throw new Error('Sandbox archive upload verification failed');
  }

  async download(sandboxId: string, key: string, maximum: number): Promise<Buffer> {
    assertArchiveKey(sandboxId, key);
    const response = await this.client.downloadObject({ key });
    if (!response.body) throw new Error('Sandbox archive is unavailable');
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of response.body) {
        const block = Buffer.from(chunk);
        size += block.length;
        if (size > maximum) throw new Error('Sandbox archive exceeds size limit');
        chunks.push(block);
      }
    } finally {
      response.body.destroy();
    }
    return Buffer.concat(
      chunks.map((chunk) => new Uint8Array(chunk)),
      size
    );
  }

  async remove(sandboxId: string, key: string) {
    assertArchiveKey(sandboxId, key);
    await this.client.deleteObject({ key });
    const confirmation = await this.client.checkObjectExists({ key });
    if (confirmation.exists !== false) throw new Error('Sandbox archive deletion not confirmed');
  }
}

let storage: SandboxArchiveStorage | undefined;
export const getSandboxArchiveStorage = () => (storage ??= new SandboxArchiveStorage());
