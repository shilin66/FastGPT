export class AdminApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

type ApiEnvelope<T> = {
  code: number;
  data: T;
  message?: string;
};

export const apiRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init
  });
  const text = await response.text();
  let body: ApiEnvelope<T> | undefined;
  try {
    body = text ? (JSON.parse(text) as ApiEnvelope<T>) : undefined;
  } catch {
    body = undefined;
  }
  if (!response.ok || body?.code !== 200) {
    throw new AdminApiError(body?.message ?? '请求失败', response.status);
  }
  return body.data;
};

export const buildQuery = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return search.toString();
};
