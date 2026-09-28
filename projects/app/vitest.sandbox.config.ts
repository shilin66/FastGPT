import { defineConfig } from 'vitest/config';
import appConfig from './vitest.config';

export default defineConfig({
  ...appConfig,
  test: {
    ...appConfig.test,
    setupFiles: [],
    globalSetup: [],
    env: { ...appConfig.test?.env, NODE_ENV: 'test' },
    coverage: { enabled: false },
    include: [
      'test/service/sandboxProxy*.test.ts',
      'test/service/sandboxCodeServerSession.test.ts'
    ],
    exclude: ['test/service/sandboxProxyHeartbeat.test.ts']
  }
});
