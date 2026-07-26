import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'tools/**/*.test.ts'],
    // Replay fixtures walk a full match; the default 5s is tight on cold CI.
    testTimeout: 30_000,
  },
});
