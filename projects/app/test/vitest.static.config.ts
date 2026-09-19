import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/components/common/resizableRightPanelWidth.test.ts',
      'test/components/core/chat/**/*.test.tsx',
      'test/pageComponents/chat/**/*.test.ts',
      'test/pageComponents/dashboard/resourceListMenu.test.ts'
    ],
    coverage: {
      enabled: false
    }
  }
});
