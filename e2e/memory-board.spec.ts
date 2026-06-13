import { test, expect, type Page } from "@playwright/test";

/**
 * 在宽屏布局的主作用域内执行回调，避开窄屏/中屏同步渲染的副本。
 * 当前 Layout 使用 `.min-[900px]:flex` 作为宽屏容器，e2e 默认桌面尺寸下命中它。
 */
async function inWideScope(page: Page, fn: (scope: HTMLElement) => Promise<void> | void) {
  await page.evaluate(async (cbSrc) => {
    const el = document.querySelector<HTMLElement>(".min-\\[900px\\]\\:flex");
    if (!el) throw new Error("wide layout scope not found");
    // eslint-disable-next-line no-new-func
    const cb = new Function("scope", cbSrc) as (scope: HTMLElement) => Promise<void> | void;
    await cb(el);
  }, fn.toString());
}

test.beforeEach(async ({ page }) => {
  // 每个用例都从空白 localStorage 起步，避免互相串扰
  await page.addInitScript(() => {
    localStorage.clear();
  });
});

test.describe("头部右上角统计与连接指示器", () => {
  test("统计区在桌面尺寸可见且包含 repos/sessions", async ({ page }) => {
    await page.goto("/");
    const stats = page.locator('[data-testid="header-stats"]').first();
    await expect(stats).toBeVisible();
    await expect(stats).toContainText("repos");
    await expect(stats).toContainText("sessions");
  });

  test("连接状态指示器可见（保留状态点，不再显示 Connected 文案）", async ({ page }) => {
    await page.goto("/");
    const connected = page.locator('[data-testid="header-connected"]').first();
    await expect(connected).toBeVisible();
    // 文案已移除，只保留状态点
    await expect(connected).not.toContainText("Connected");
  });
});

test.describe("文案修正", () => {
  test("仓库级目录入口不再声称查看整个仓库源码结构", async ({ page }) => {
    await page.goto("/");
    // 选择首个仓库以触发 SessionList 渲染“仓库级目录”入口
    await page.locator('[data-testid^="repo-item-"]').first().click();
    const entryButton = page
      .getByRole("button", { name: /仓库级目录/ })
      .first();
    await expect(entryButton).toBeVisible();
    await expect(entryButton).toContainText("记忆文件目录");
    // 不应再包含原始误导文案
    await expect(entryButton).not.toContainText("整个仓库的文件结构");
  });
});

test.describe("预览行为", () => {
  test("目录选中后会关闭文件预览并展示已选中目录空态", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-testid^="repo-item-"]').first().click();
    await page.locator('[data-testid^="session-item-"]').first().click();
    // 等待文件树加载
    await expect(page.locator('[data-testid="sort-control-file-tree"]').first()).toBeVisible();

    // 先点一个文件，确保预览出现
    await inWideScope(page, (scope) => {
      const files = Array.from(scope.querySelectorAll<HTMLButtonElement>("button"));
      const headerFile = files.find((b) => /Header\.tsx/i.test(b.textContent || ""));
      headerFile?.click();
    });
    await expect(page.locator('[data-testid="file-preview-close"]').first()).toBeVisible();

    // 再点击一个目录节点
    await inWideScope(page, (scope) => {
      const dirs = Array.from(scope.querySelectorAll<HTMLButtonElement>("button"));
      const publicDir = dirs.find((b) => (b.textContent || "").trim() === "public");
      publicDir?.click();
    });
    // 应当进入“已选中目录”空态，关闭按钮不可见
    await expect(page.locator('[data-testid="file-preview-empty"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="file-preview-empty"]').first()).toContainText("已选中目录");
    await expect(page.locator('[data-testid="file-preview-close"]')).toHaveCount(0);
  });

  test("可以手动点击关闭按钮收起当前预览", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-testid^="repo-item-"]').first().click();
    await page.locator('[data-testid^="session-item-"]').first().click();
    await inWideScope(page, (scope) => {
      const files = Array.from(scope.querySelectorAll<HTMLButtonElement>("button"));
      const headerFile = files.find((b) => /Header\.tsx/i.test(b.textContent || ""));
      headerFile?.click();
    });
    const closeBtn = page.locator('[data-testid="file-preview-close"]').first();
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    // 关闭按钮不应再出现，且容器内出现“预览面板已收起”占位
    await expect(page.locator('[data-testid="file-preview-close"]')).toHaveCount(0);
    await expect(page.getByText("预览面板已收起").first()).toBeVisible();
  });

  test("预览总开关关闭后切换图标状态并持久化到 localStorage", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-testid^="repo-item-"]').first().click();
    await page.locator('[data-testid^="session-item-"]').first().click();

    const toggle = page.locator('[data-testid="preview-toggle"]').first();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    const stored = await page.evaluate(() =>
      localStorage.getItem("memory-board:ui-preferences")
    );
    expect(stored).toContain('"enableFilePreview":false');
  });
});

test.describe("排序", () => {
  test("仓库列表支持名称升序与创建时间升序切换", async ({ page }) => {
    await page.goto("/");
    const sortBy = page.locator('[data-testid="sort-by-repo"]').first();
    const directionBtn = page.locator('[data-testid="sort-direction-repo"]').first();

    // 默认名称升序：按名字排序
    await expect(sortBy).toHaveValue("name");
    await expect(directionBtn).toHaveAttribute(
      "title",
      expect.stringContaining("升序")
    );

    // 切换到创建时间
    await sortBy.selectOption("createdAt");
    await expect(sortBy).toHaveValue("createdAt");

    // 切换方向到降序
    await directionBtn.click();
    await expect(directionBtn).toHaveAttribute(
      "title",
      expect.stringContaining("降序")
    );
  });

  test("文件树排序控件支持名称 / 创建时间 / 更新时间三种字段", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-testid^="repo-item-"]').first().click();
    await page.locator('[data-testid^="session-item-"]').first().click();
    const sortBy = page.locator('[data-testid="sort-by-file-tree"]').first();
    await expect(sortBy).toHaveValue("name");
    await sortBy.selectOption("createdAt");
    await expect(sortBy).toHaveValue("createdAt");
    await sortBy.selectOption("updatedAt");
    await expect(sortBy).toHaveValue("updatedAt");
  });
});

test.describe("钉选", () => {
  test("仓库钉选后出现在 Pinned 分组顶部", async ({ page }) => {
    await page.goto("/");
    // 钉选第一个仓库
    await page.locator('[data-testid^="pin-repo-"]').first().click();
    // 应出现 Pinned 分组标题
    await expect(page.locator("span").filter({ hasText: /^Pinned$/ }).first()).toBeVisible();
    // 取消钉选
    await page.locator('[data-testid^="pin-repo-"]').first().click();
    await expect(page.locator("span").filter({ hasText: /^Pinned$/ })).toHaveCount(0);
  });

  test("钉选状态会持久化到 localStorage", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-testid^="pin-repo-"]').first().click();
    const stored = await page.evaluate(() =>
      localStorage.getItem("memory-board:workspace-state")
    );
    expect(stored).toContain("pinnedRepoIds");
    expect(stored).not.toContain('"pinnedRepoIds":[]');
  });
});
