import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@hypermarket\/core$/,
        replacement: path.resolve(__dirname, 'packages/core/src/index.ts')
      },
      {
        find: /^@hypermarket\/core\/(.*)$/,
        replacement: path.resolve(__dirname, 'packages/core/src/$1')
      },
      {
        find: /^@hypermarket\/contracts$/,
        replacement: path.resolve(__dirname, 'packages/contracts/src/index.ts')
      },
      {
        find: /^@hypermarket\/contracts\/(.*)$/,
        replacement: path.resolve(__dirname, 'packages/contracts/src/$1')
      },
      {
        find: /^@hypermarket\/modules$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/tenancy$/,
        replacement: path.resolve(__dirname, 'packages/modules/modules/tenancy/src/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/(.*)$/,
        replacement: path.resolve(__dirname, 'packages/modules/modules/$1')
      }
    ]
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20000
  }
});
