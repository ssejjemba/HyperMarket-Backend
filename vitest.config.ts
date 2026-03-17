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
        find: /^@hypermarket\/core\/dev\/otpSink$/,
        replacement: path.resolve(__dirname, 'packages/core/dev/otpSink.ts')
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
        replacement: path.resolve(__dirname, 'packages/modules/src/tenancy/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/catalog$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/catalog/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/orders$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/orders/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/payments$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/payments/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/notifications$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/notifications/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/media$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/media/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/templates$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/templates/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/publishing$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/publishing/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/iaa\/testkit$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/iaa/testkit.ts')
      },
      {
        find: /^@hypermarket\/modules\/iaa\/persistence$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/iaa/otp/persistence/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/iaa\/otp-sender$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/iaa/otp/integrations/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/iaa\/otp-service$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/iaa/otp/OtpChallengeService.ts')
      },
      {
        find: /^@hypermarket\/modules\/iaa\/user$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/iaa/user/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/iaa\/membership$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/iaa/membership/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/iaa\/observability$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/iaa/observability/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/iaa$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/iaa/index.ts')
      },
      {
        find: /^@hypermarket\/modules\/(.*)$/,
        replacement: path.resolve(__dirname, 'packages/modules/src/$1/index.ts')
      }
    ]
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20000,
    // Integration tests share a single Postgres instance; running test files
    // in parallel causes concurrent DELETE-all + INSERT races on shared tables.
    fileParallelism: false
  }
});
