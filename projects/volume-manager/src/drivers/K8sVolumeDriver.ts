import { readFileSync } from 'fs';
import type { IVolumeDriver, EnsureResult, VolumeAddressMode } from './IVolumeDriver';
import { toClaimName, toVolumeName } from '../utils/naming';
import { env } from '../env';
import { logDebug } from '../utils/logger';

const K8S_API = 'https://kubernetes.default.svc';
const TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

function readToken(): string {
  return readFileSync(TOKEN_PATH, 'utf-8').trim();
}

function fetchOpts(extra: RequestInit = {}): RequestInit {
  return { ...extra, tls: { ca: readFileSync(CA_PATH, 'utf-8') } } as RequestInit;
}

function pvcBody(name: string, sessionId: string, namespace: string): object {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name,
      namespace,
      labels: { 'fastgpt/session-id': sessionId }
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: env.VM_K8S_PVC_STORAGE_SIZE } },
      storageClassName: env.VM_K8S_PVC_STORAGE_CLASS
    }
  };
}

export class K8sVolumeDriver implements IVolumeDriver {
  private readonly namespace: string;
  private readonly prefix: string;

  constructor(
    namespace = env.VM_K8S_NAMESPACE,
    prefix = env.VM_VOLUME_NAME_PREFIX,
    private readonly waitTimeoutMs = 300000,
    private readonly pollIntervalMs = 500
  ) {
    this.namespace = namespace;
    this.prefix = prefix;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${readToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  private pvcUrl(name?: string): string {
    const base = `${K8S_API}/api/v1/namespaces/${this.namespace}/persistentvolumeclaims`;
    return name ? `${base}/${name}` : base;
  }

  async ensure(sessionId: string, mode: VolumeAddressMode = 'sessionId'): Promise<EnsureResult> {
    const name =
      mode === 'claimName' ? toClaimName(sessionId) : toVolumeName(this.prefix, sessionId);

    const deadline = Date.now() + this.waitTimeoutMs;
    let current = await this.readPvc(name);
    while (current?.deleting) {
      await this.poll(deadline, name);
      current = await this.readPvc(name);
    }
    if (current) return { claimName: name, created: false };

    const postUrl = this.pvcUrl();
    logDebug(`K8s POST PVC url=${postUrl} name=${name}`);
    const createRes = await fetch(
      postUrl,
      fetchOpts({
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(pvcBody(name, sessionId, this.namespace))
      })
    );
    logDebug(`K8s POST PVC status=${createRes.status}`);

    if (createRes.status === 409) {
      const existing = await this.readPvc(name);
      if (existing && !existing.deleting) return { claimName: name, created: false };
      throw new Error(`K8s PVC creation conflicted with a terminating or absent volume: ${name}`);
    }
    if (!createRes.ok) {
      const text = await createRes.text().catch(() => '');
      throw new Error(`K8s PVC create failed (${createRes.status}): ${text}`);
    }

    return { claimName: name, created: true };
  }

  async remove(sessionId: string, mode: VolumeAddressMode = 'sessionId'): Promise<void> {
    const name =
      mode === 'claimName' ? toClaimName(sessionId) : toVolumeName(this.prefix, sessionId);
    const current = await this.readPvc(name);
    if (!current) return;
    const deadline = Date.now() + this.waitTimeoutMs;
    if (!current.deleting) {
      const res = await fetch(
        this.pvcUrl(name),
        fetchOpts({
          method: 'DELETE',
          headers: this.headers(),
          body: JSON.stringify({
            apiVersion: 'v1',
            kind: 'DeleteOptions',
            preconditions: { uid: current.uid }
          })
        })
      );
      if (!res.ok && res.status !== 404) {
        const text = await res.text().catch(() => '');
        throw new Error(`K8s PVC delete failed (${res.status}): ${text}`);
      }
    }
    while (true) {
      const remaining = await this.readPvc(name);
      if (!remaining || remaining.uid !== current.uid) return;
      await this.poll(deadline, name);
    }
  }

  private async readPvc(name: string): Promise<{ uid: string; deleting: boolean } | undefined> {
    const res = await fetch(this.pvcUrl(name), fetchOpts({ headers: this.headers() }));
    if (res.status === 404) return;
    if (!res.ok)
      throw new Error(`K8s PVC GET failed (${res.status}): ${await res.text().catch(() => '')}`);
    const body: unknown = await res.json();
    if (!body || typeof body !== 'object' || !('metadata' in body))
      throw new Error('K8s PVC metadata missing');
    const metadata = body.metadata;
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      !('uid' in metadata) ||
      typeof metadata.uid !== 'string' ||
      !metadata.uid
    )
      throw new Error('K8s PVC UID missing');
    return {
      uid: metadata.uid,
      deleting: 'deletionTimestamp' in metadata && !!metadata.deletionTimestamp
    };
  }

  private async poll(deadline: number, name: string) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Timed out waiting for K8s PVC deletion: ${name}`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, this.pollIntervalMs)));
  }
}
