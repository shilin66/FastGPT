import { defineConfig } from 'vitest/config';
import appConfig from './vitest.config';

export default defineConfig({
  ...appConfig,
  test: {
    ...appConfig.test,
    environment: 'jsdom',
    setupFiles: [],
    globalSetup: [],
    include: ['test/**/*.dom.test.ts'],
    exclude: ['**/node_modules/**', '**/.git/**']
  }
});
