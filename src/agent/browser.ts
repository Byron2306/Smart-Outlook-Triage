import { chromium, Browser, BrowserContext, Page } from "playwright";
import path from "path";
import fs from "fs/promises";
import { EventEmitter } from "events";

const SESSION_DIR = path.resolve("playwright-session");

export class BrowserManager extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;
  private _isRunning = false;

  get page(): Page | null {
    return this._page;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  async launch(headless = true): Promise<Page> {
    if (this._page && this._isRunning) {
      return this._page;
    }

    await fs.mkdir(SESSION_DIR, { recursive: true });

    this.browser = await chromium.launch({
      headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    this.context = await this.browser.newContext({
      storageState: await this.loadSession(),
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
      timezoneId: "Africa/Johannesburg",
    });

    this._page = await this.context.newPage();
    this._isRunning = true;

    this._page.on("close", () => {
      this._isRunning = false;
      this.emit("status", { type: "browser", status: "page_closed" });
    });

    this.emit("status", { type: "browser", status: "launched" });
    return this._page;
  }

  async saveSession(): Promise<void> {
    if (!this.context) return;
    try {
      const state = await this.context.storageState();
      await fs.writeFile(
        path.join(SESSION_DIR, "state.json"),
        JSON.stringify(state, null, 2)
      );
      this.emit("status", { type: "browser", status: "session_saved" });
    } catch (err) {
      console.error("Failed to save session:", err);
    }
  }

  private async loadSession(): Promise<any | undefined> {
    try {
      const statePath = path.join(SESSION_DIR, "state.json");
      await fs.access(statePath);
      const data = await fs.readFile(statePath, "utf-8");
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  async screenshot(): Promise<Buffer | null> {
    if (!this._page) return null;
    return await this._page.screenshot({ type: "jpeg", quality: 60 });
  }

  async getPageText(): Promise<string> {
    if (!this._page) return "";
    return await this._page.innerText("body").catch(() => "");
  }

  async getAccessibilityTree(): Promise<string> {
    if (!this._page) return "";
    try {
      return await this._page.locator("body").ariaSnapshot();
    } catch {
      return await this.getPageText();
    }
  }

  async close(): Promise<void> {
    await this.saveSession();
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    this._page = null;
    this.context = null;
    this.browser = null;
    this._isRunning = false;
    this.emit("status", { type: "browser", status: "closed" });
  }
}
