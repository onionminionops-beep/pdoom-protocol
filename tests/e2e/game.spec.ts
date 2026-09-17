import { expect, test, type Page } from "@playwright/test";
import type {} from "../../src/game/client/session";

// Diagnostics are read-only. All state changes below come from real UI inputs.
const snapshot = (page: Page) => page.evaluate(() => window.__pdoom!);
const observation = (page: Page) => page.evaluate(() => window.gameAgent!.getObservation("p1"));

async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function startMock(page: Page) {
  await page.goto("/play?dev=1");
  await page.getByLabel("P2 controller").selectOption("MOCK_AI");
  await page.getByRole("radio", { name: "Speedrunner", exact: true }).check();
  await page.getByRole("button", { name: /Start protocol/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect.poll(async () => (await snapshot(page))?.tick ?? 0).toBeGreaterThan(2);
  await page.locator("canvas").focus();
}

test("human controls, focus guards, remapping and fresh directive episode", async ({ page }) => {
  const errors: string[] = [];
  const api: string[] = [];
  const art: number[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/jev/")) api.push(request.url());
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/art/")) art.push(response.status());
  });
  await startMock(page);
  const initial = await snapshot(page);
  const modes = page.getByLabel("JEV mode", { exact: true });
  await expect(modes.locator("option")).toHaveCount(5);
  for (const directive of [
    "GUARDIAN",
    "MONSTER_SLAYER",
    "SCORE_HUNTER",
    "COLLECTOR",
    "SPEEDRUNNER",
  ]) {
    await modes.selectOption(directive);
    await expect.poll(async () => (await observation(page)).directive.id).toBe(directive);
    expect((await snapshot(page)).episodeId).toBe(initial.episodeId);
  }
  await page.locator("canvas").focus();
  await hold(page, "d", 450);
  expect((await snapshot(page)).players.p1.x).toBeGreaterThan(initial.players.p1.x + 20);
  expect((await snapshot(page)).players.p2.x).not.toBe(initial.players.p2.x);
  const ground = (await snapshot(page)).players.p1.y;
  await page.keyboard.down("Space");
  await expect.poll(async () => (await snapshot(page)).players.p1.y).toBeLessThan(ground - 20);
  await page.keyboard.up("Space");
  await page.keyboard.down("j");
  await expect.poll(async () => (await observation(page)).self.canShoot).toBe(false);
  await page.keyboard.up("j");
  await expect.poll(async () => (await observation(page)).self.canShoot).toBe(true);
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await observation(page)).self.canShoot).toBe(false);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Game paused" })).toBeVisible();
  const paused = await snapshot(page);
  await hold(page, "d", 500);
  expect(await snapshot(page)).toEqual(paused);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Remap right" }).click();
  await page.keyboard.press("a");
  await expect(
    page.getByText("That key is reserved or already assigned. Choose another."),
  ).toBeVisible();
  await page.keyboard.press("l");
  await expect(page.getByRole("button", { name: "Remap right" })).toContainText("L");
  await page.getByLabel("Colorblind-safe palette").check();
  await expect(page.getByLabel("Colorblind-safe palette")).toBeChecked();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Resume protocol" }).click();
  await expect(page.locator("canvas")).toBeFocused();
  const beforeD = (await snapshot(page)).players.p1.x;
  await hold(page, "d", 300);
  expect((await snapshot(page)).players.p1.x).toBe(beforeD);
  await hold(page, "l", 300);
  expect((await snapshot(page)).players.p1.x).toBeGreaterThan(beforeD + 20);
  await page.getByRole("button", { name: /Dev panel/ }).focus();
  await page.waitForTimeout(300); // Let velocity settle before checking focus suppression.
  const focusedX = (await snapshot(page)).players.p1.x;
  await hold(page, "l", 400);
  expect((await snapshot(page)).players.p1.x).toBe(focusedX);
  await page.keyboard.press("Escape");
  await page.getByLabel("Directive for next episode").selectOption("COLLECTOR");
  expect((await observation(page)).directive.id).toBe("SPEEDRUNNER");
  await page.getByRole("button", { name: "Restart episode" }).click();
  await expect.poll(async () => (await snapshot(page)).episodeId).not.toBe(initial.episodeId);
  expect((await snapshot(page)).tick).toBeLessThan(120);
  expect((await observation(page)).directive.id).toBe("COLLECTOR");
  expect((await observation(page)).self.health).toBe(100);
  expect(
    await page.evaluate(() => ({
      frozen: Object.isFrozen(window.__pdoom) && Object.isFrozen(window.__pdoom!.players.p1),
      keys: Object.keys(window.gameAgent!),
    })),
  ).toEqual({ frozen: true, keys: ["getObservation"] });
  expect(art.length).toBeGreaterThan(0);
  expect(art.every((status) => status === 200)).toBe(true);
  expect(api).toEqual([]);
  expect(errors).toEqual([]);
});

test("same recorded human replay completes under two offline directives", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await startMock(page);
  await page.keyboard.down("d");
  await page.keyboard.down("j");
  await hold(page, "Space", 600);
  await expect
    .poll(async () => (await snapshot(page)).tick, { timeout: 20_000 })
    .toBeGreaterThan(240);
  await page.keyboard.up("d");
  await page.keyboard.up("j");
  await page.getByRole("button", { name: /Dev panel/ }).click();
  await page.getByRole("button", { name: "Save human replay" }).click();
  const panel = page
    .getByRole("complementary", { name: "Developer panel" })
    .getByRole("region", { name: "Directive comparison", exact: true });
  const recorded = await panel.getByRole("status").innerText();
  expect(recorded).toMatch(/^Seed 42 · \d+\.\d seconds recorded$/);
  expect(Number(recorded.match(/· ([\d.]+)/)![1])).toBeGreaterThan(3);
  await expect(panel).toContainText("These results are not live Jev decisions.");
  let episode = (await snapshot(page)).episodeId;
  const complete = page.getByRole("dialog", { name: "Comparison complete" });
  for (const directive of ["Speedrunner", "Token Collector"]) {
    const controls = directive === "Speedrunner" ? panel : complete;
    await controls.getByRole("button", { name: `Run ${directive}`, exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).episodeId).not.toBe(episode);
    episode = (await snapshot(page)).episodeId;
    await expect(complete).toBeVisible();
    const row = complete
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: directive, exact: true }) });
    await expect(row).toContainText("replay complete");
    await expect(row).toContainText("Mock");
    expect(await panel.getByRole("status").innerText()).toBe(recorded);
  }
  await expect(complete.locator("tbody tr")).toHaveCount(2);
  const rows = await complete.locator("tbody tr").allTextContents();
  await test
    .info()
    .attach("comparison-metrics", { body: rows.join("\n"), contentType: "text/plain" });
  expect(errors).toEqual([]);
});
