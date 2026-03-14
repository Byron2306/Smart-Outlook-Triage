import { chromium, Browser, BrowserContext, Page } from "playwright";
import path from "path";
import fs from "fs/promises";
import { EventEmitter } from "events";

const USER_DATA_DIR = path.resolve("browser-profile");
const SESSION_DIR = path.resolve("playwright-session");

/**
 * Uses launchPersistentContext to maintain a real Chrome profile directory.
 * This is the key to surviving Microsoft login — persistent profiles carry
 * all cookies, localStorage, IndexedDB, and service workers across restarts,
 * just like a real user's browser. No storageState dance needed.
 *
 * First login should be HEADED so the user can handle 2FA/CAPTCHAs manually.
 * After that, the saved profile means future launches (even headless) stay logged in.
 */
export class BrowserManager extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;
  private _isRunning = false;
  private _headless = true;

  get page(): Page | null {
    return this._page;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  private stealthScripts(): string {
    return `
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      window.navigator.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };

      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5].map(() => ({
          name: 'Chrome PDF Plugin',
          description: 'Portable Document Format',
          filename: 'internal-pdf-viewer',
          length: 1,
        })),
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.call(this, parameter);
      };
    `;
  }

  async launch(headless = true): Promise<Page> {
    if (this._page && this._isRunning) {
      return this._page;
    }

    this._headless = headless;
    await fs.mkdir(USER_DATA_DIR, { recursive: true });
    await fs.mkdir(SESSION_DIR, { recursive: true });

    this.emit("status", {
      type: "browser",
      status: headless ? "launching_headless" : "launching_headed",
    });

    this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-infobars",
        "--window-size=1440,900",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
      ],
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
      timezoneId: "Africa/Johannesburg",
      ignoreHTTPSErrors: true,
      bypassCSP: true,
    });

    await this.context.addInitScript(this.stealthScripts());

    const pages = this.context.pages();
    this._page = pages.length > 0 ? pages[0] : await this.context.newPage();
    this._isRunning = true;

    this._page.on("close", () => {
      if (this.context && this.context.pages().length === 0) {
        this._isRunning = false;
        this.emit("status", { type: "browser", status: "page_closed" });
      }
    });

    this.emit("status", { type: "browser", status: "launched" });
    return this._page;
  }

  async relaunchHeaded(): Promise<Page> {
    await this.close();
    return this.launch(false);
  }

  async relaunchHeadless(): Promise<Page> {
    await this.close();
    return this.launch(true);
  }

  async saveSessionBackup(): Promise<void> {
    try {
      const state = await this.context?.storageState();
      if (state) {
        await fs.writeFile(
          path.join(SESSION_DIR, "state-backup.json"),
          JSON.stringify(state, null, 2)
        );
      }
      this.emit("status", { type: "browser", status: "session_backed_up" });
    } catch (err) {
      console.error("Failed to backup session:", err);
    }
  }

  async screenshot(): Promise<Buffer | null> {
    if (!this._page) return null;
    return (await this._page.screenshot({ type: "jpeg", quality: 60 })) as Buffer;
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
    await this.saveSessionBackup();
    if (this.context) await this.context.close().catch(() => {});
    this._page = null;
    this.context = null;
    this.browser = null;
    this._isRunning = false;
    this.emit("status", { type: "browser", status: "closed" });
  }
}
