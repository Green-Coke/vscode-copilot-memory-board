import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 配置：用于验证 Memory Board GUI 的关键交互，依赖视觉判断的程度最小。
 *
 * 用例通过 data-testid 锚点断言 DOM/状态，不依赖截图对比，便于无视觉能力的执行模型验证。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5175",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm --filter @memory-board/gui dev -- --port 5175 --strictPort",
    url: "http://localhost:5175",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
