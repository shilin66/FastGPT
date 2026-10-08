export function getSandboxProxyCacheControl(input: {
  method?: string;
  path?: string;
  status?: number;
  upstream?: string;
}): string {
  const path = input.path?.split('?')[0] ?? '';
  if (
    !['GET', 'HEAD'].includes(input.method ?? '') ||
    input.status !== 200 ||
    /[%\\\x00-\x20]/.test(path) ||
    path.split('/').some((segment) => segment === '.' || segment === '..') ||
    !/^\/proxy\/8080\/stable-[a-f0-9]{40}\/static\/(?:out|node_modules)\//.test(path) ||
    !/\.(?:js|css|wasm|woff2?|ttf|svg|png|ico|json)$/.test(path) ||
    /(?:^|,)\s*no-(?:store|cache)\b/i.test(input.upstream ?? '')
  )
    return 'no-store';

  const maxAge = input.upstream?.match(/(?:^|,)\s*max-age=(\d+)\b/i)?.[1];
  if (maxAge && Number(maxAge) > 0) {
    return `private, max-age=${Math.min(Number(maxAge), 31_536_000)}`;
  }
  return 'no-store';
}
