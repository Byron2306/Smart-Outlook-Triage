import { Page, Locator } from "playwright";

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  preview: string;
  date: string;
  isRead: boolean;
  isSelected: boolean;
}

export interface EmailFull {
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
}

export interface OutlookFolder {
  name: string;
  unreadCount?: number;
}

const OUTLOOK_URL = "https://outlook.live.com/mail/0/";
const OUTLOOK_OFFICE_URL = "https://outlook.office.com/mail/";

export class OutlookAutomation {
  constructor(private page: Page) {}

  private log(msg: string) {
    console.log(`[Outlook] ${msg}`);
  }

  async navigateToOutlook(): Promise<boolean> {
    this.log("Navigating to Outlook...");
    try {
      await this.page.goto(OUTLOOK_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await this.page.waitForTimeout(3000);
      return true;
    } catch (err) {
      this.log(`Navigation failed: ${err}`);
      return false;
    }
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      const url = this.page.url();
      if (url.includes("login.microsoftonline.com") || url.includes("login.live.com")) {
        return false;
      }
      const mailView = await this.page
        .locator('[role="main"], [data-app-section="ConversationContainer"], [aria-label*="Mail"], [aria-label*="message list"]')
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      return !!mailView;
    } catch {
      return false;
    }
  }

  async login(email: string, password: string): Promise<boolean> {
    this.log("Starting login flow...");
    try {
      await this.page.goto("https://login.live.com/", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await this.page.waitForTimeout(2000);

      const emailInput = this.page.locator('input[type="email"], input[name="loginfmt"]');
      await emailInput.waitFor({ state: "visible", timeout: 10000 });
      await emailInput.fill(email);
      await this.page.waitForTimeout(500);
      await emailInput.press("Enter");
      await this.page.waitForTimeout(3000);

      const passwordInput = this.page.locator('input[type="password"], input[name="passwd"]');
      await passwordInput.waitFor({ state: "visible", timeout: 10000 });
      await passwordInput.fill(password);
      await this.page.waitForTimeout(500);
      await passwordInput.press("Enter");
      await this.page.waitForTimeout(3000);

      const staySignedIn = this.page.locator('input[value="Yes"], button:has-text("Yes"), #idSIButton9');
      const hasStaySignedIn = await staySignedIn.first().isVisible({ timeout: 5000 }).catch(() => false);
      if (hasStaySignedIn) {
        await staySignedIn.first().click();
        await this.page.waitForTimeout(3000);
      }

      await this.navigateToOutlook();
      await this.page.waitForTimeout(5000);
      return await this.isLoggedIn();
    } catch (err) {
      this.log(`Login failed: ${err}`);
      return false;
    }
  }

  async getEmailList(maxCount = 15): Promise<EmailSummary[]> {
    this.log("Reading email list...");
    const emails: EmailSummary[] = [];

    try {
      const messageListSelectors = [
        '[role="listbox"] [role="option"]',
        '[aria-label*="message list"] [role="option"]',
        '[role="list"] [role="listitem"]',
        'div[data-convid]',
        '[aria-label*="Message list"] > div > div',
      ];

      let messageItems: Locator | null = null;
      for (const selector of messageListSelectors) {
        const loc = this.page.locator(selector);
        const count = await loc.count().catch(() => 0);
        if (count > 0) {
          messageItems = loc;
          this.log(`Found ${count} messages with selector: ${selector}`);
          break;
        }
      }

      if (!messageItems) {
        this.log("Could not find message list elements, trying accessibility tree...");
        return await this.getEmailListFromAccessibility(maxCount);
      }

      const count = Math.min(await messageItems.count(), maxCount);
      for (let i = 0; i < count; i++) {
        try {
          const item = messageItems.nth(i);
          const text = await item.innerText().catch(() => "");
          const ariaLabel = await item.getAttribute("aria-label").catch(() => "");
          const isSelected = await item.getAttribute("aria-selected").catch(() => "false");

          const lines = text.split("\n").filter((l: string) => l.trim());
          emails.push({
            id: `email-${i}`,
            from: lines[0] || "Unknown",
            subject: lines[1] || ariaLabel || "No subject",
            preview: lines.slice(2, 4).join(" ") || "",
            date: lines.find((l: string) => /\d{1,2}[/:]\d{2}|AM|PM|yesterday|today/i.test(l)) || "",
            isRead: !(await item.locator('[class*="unread"], [aria-label*="Unread"]').count().catch(() => 0)),
            isSelected: isSelected === "true",
          });
        } catch {
          continue;
        }
      }
    } catch (err) {
      this.log(`Error reading email list: ${err}`);
    }

    return emails;
  }

  private async getEmailListFromAccessibility(maxCount: number): Promise<EmailSummary[]> {
    const emails: EmailSummary[] = [];
    try {
      const snapshot = await this.page.locator("body").ariaSnapshot();
      const lines = snapshot.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        if (emails.length >= maxCount) break;
        if (line.includes("option") || line.includes("listitem")) {
          const nameMatch = line.match(/"([^"]+)"/);
          const name = nameMatch ? nameMatch[1] : line.trim();
          if (name.length > 10) {
            emails.push({
              id: `email-a11y-${emails.length}`,
              from: name.split(",")[0] || "Unknown",
              subject: name,
              preview: "",
              date: "",
              isRead: true,
              isSelected: false,
            });
          }
        }
      }
    } catch (err) {
      this.log(`Accessibility snapshot error: ${err}`);
    }
    return emails;
  }

  async openEmail(index: number): Promise<EmailFull | null> {
    this.log(`Opening email at index ${index}...`);
    try {
      const selectors = [
        '[role="listbox"] [role="option"]',
        '[aria-label*="message list"] [role="option"]',
        '[role="list"] [role="listitem"]',
        'div[data-convid]',
      ];

      for (const selector of selectors) {
        const items = this.page.locator(selector);
        const count = await items.count().catch(() => 0);
        if (count > index) {
          await items.nth(index).click();
          await this.page.waitForTimeout(2000);
          return await this.readOpenEmail();
        }
      }

      this.log("Could not locate email item to click");
      return null;
    } catch (err) {
      this.log(`Error opening email: ${err}`);
      return null;
    }
  }

  async readOpenEmail(): Promise<EmailFull | null> {
    this.log("Reading open email content...");
    try {
      await this.page.waitForTimeout(1500);

      const bodySelectors = [
        '[role="main"] [aria-label*="Message body"]',
        '[data-app-section="ConversationContainer"]',
        '[role="document"]',
        '.ReadMsgBody',
        'div[class*="BodyFragment"]',
        'div[aria-label*="body"]',
      ];

      let body = "";
      for (const selector of bodySelectors) {
        const el = this.page.locator(selector).first();
        const visible = await el.isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) {
          body = await el.innerText().catch(() => "");
          if (body.length > 20) break;
        }
      }

      const subjectSelectors = [
        '[role="heading"][aria-level="2"]',
        'span[class*="Subject"]',
        'h2',
      ];
      let subject = "";
      for (const selector of subjectSelectors) {
        const el = this.page.locator(selector).first();
        const text = await el.innerText({ timeout: 2000 }).catch(() => "");
        if (text.length > 2) {
          subject = text;
          break;
        }
      }

      const fromSelectors = [
        'span[class*="From"] span',
        'button[aria-label*="From"]',
        '[aria-label*="sender"]',
      ];
      let from = "";
      for (const selector of fromSelectors) {
        const el = this.page.locator(selector).first();
        const text = await el.innerText({ timeout: 2000 }).catch(() => "");
        if (text.length > 1) {
          from = text;
          break;
        }
      }

      return {
        from: from || "Unknown sender",
        to: "",
        subject: subject || "No subject",
        body: body || "Could not extract email body",
        date: "",
      };
    } catch (err) {
      this.log(`Error reading email: ${err}`);
      return null;
    }
  }

  async composeEmail(to: string, subject: string, body: string): Promise<boolean> {
    this.log(`Composing email to ${to}...`);
    try {
      const newMailBtn = this.page.locator(
        'button:has-text("New mail"), button:has-text("New message"), button[aria-label*="New mail"], button[aria-label*="New message"], button[aria-label*="Compose"]'
      );
      await newMailBtn.first().click();
      await this.page.waitForTimeout(2000);

      const toField = this.page.locator(
        'input[aria-label*="To"], div[aria-label*="To"] input, [role="combobox"][aria-label*="To"]'
      );
      await toField.first().waitFor({ state: "visible", timeout: 5000 });
      await toField.first().fill(to);
      await this.page.waitForTimeout(500);
      await toField.first().press("Tab");
      await this.page.waitForTimeout(1000);

      const subjectField = this.page.locator(
        'input[aria-label*="Subject"], input[placeholder*="Subject"]'
      );
      await subjectField.first().fill(subject);
      await this.page.waitForTimeout(500);

      const bodyField = this.page.locator(
        'div[aria-label*="Message body"][role="textbox"], div[contenteditable="true"][aria-label*="body"]'
      );
      await bodyField.first().click();
      await this.page.waitForTimeout(300);
      await this.page.keyboard.type(body, { delay: 10 });
      await this.page.waitForTimeout(500);

      this.log("Email composed (not sent yet)");
      return true;
    } catch (err) {
      this.log(`Error composing email: ${err}`);
      return false;
    }
  }

  async sendEmail(): Promise<boolean> {
    this.log("Sending email...");
    try {
      const sendBtn = this.page.locator(
        'button:has-text("Send"), button[aria-label*="Send"], button[title="Send"]'
      );
      await sendBtn.first().click();
      await this.page.waitForTimeout(3000);
      this.log("Email sent");
      return true;
    } catch (err) {
      this.log(`Error sending email: ${err}`);
      return false;
    }
  }

  async replyToEmail(body: string): Promise<boolean> {
    this.log("Replying to email...");
    try {
      const replyBtn = this.page.locator(
        'button:has-text("Reply"), button[aria-label*="Reply"][aria-label*="all" i] >> nth=0, button[aria-label="Reply"]'
      );
      await replyBtn.first().click();
      await this.page.waitForTimeout(2000);

      const bodyField = this.page.locator(
        'div[aria-label*="Message body"][role="textbox"], div[contenteditable="true"][aria-label*="body"]'
      );
      await bodyField.first().click();
      await this.page.waitForTimeout(300);
      await this.page.keyboard.type(body, { delay: 10 });
      await this.page.waitForTimeout(500);

      this.log("Reply composed (not sent yet)");
      return true;
    } catch (err) {
      this.log(`Error replying: ${err}`);
      return false;
    }
  }

  async scrollMailList(direction: "down" | "up" = "down"): Promise<void> {
    this.log(`Scrolling mail list ${direction}...`);
    const listSelectors = [
      '[role="listbox"]',
      '[aria-label*="message list"]',
      '[role="list"]',
    ];
    for (const selector of listSelectors) {
      const el = this.page.locator(selector).first();
      const visible = await el.isVisible({ timeout: 2000 }).catch(() => false);
      if (visible) {
        await el.evaluate(
          (node, dir) => {
            node.scrollTop += dir === "down" ? 500 : -500;
          },
          direction
        );
        await this.page.waitForTimeout(1000);
        return;
      }
    }
    const delta = direction === "down" ? 500 : -500;
    await this.page.mouse.wheel(0, delta);
    await this.page.waitForTimeout(1000);
  }

  async navigateToFolder(folderName: string): Promise<boolean> {
    this.log(`Navigating to folder: ${folderName}...`);
    try {
      const folderLink = this.page.locator(
        `a:has-text("${folderName}"), [role="treeitem"]:has-text("${folderName}"), [aria-label*="${folderName}"]`
      );
      const visible = await folderLink.first().isVisible({ timeout: 5000 }).catch(() => false);
      if (visible) {
        await folderLink.first().click();
        await this.page.waitForTimeout(2000);
        return true;
      }
      this.log(`Folder "${folderName}" not found`);
      return false;
    } catch (err) {
      this.log(`Error navigating to folder: ${err}`);
      return false;
    }
  }

  async getFolders(): Promise<OutlookFolder[]> {
    this.log("Getting folder list...");
    const folders: OutlookFolder[] = [];
    try {
      const folderItems = this.page.locator(
        '[role="tree"] [role="treeitem"], [aria-label*="Folder"] [role="treeitem"]'
      );
      const count = await folderItems.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const name = await folderItems.nth(i).innerText().catch(() => "");
        if (name.trim()) {
          folders.push({ name: name.trim().split("\n")[0] });
        }
      }
    } catch (err) {
      this.log(`Error getting folders: ${err}`);
    }
    return folders;
  }

  async searchEmails(query: string): Promise<void> {
    this.log(`Searching for: ${query}...`);
    try {
      const searchBox = this.page.locator(
        'input[aria-label*="Search"], input[placeholder*="Search"], [role="search"] input'
      );
      await searchBox.first().click();
      await this.page.waitForTimeout(500);
      await searchBox.first().fill(query);
      await this.page.waitForTimeout(300);
      await searchBox.first().press("Enter");
      await this.page.waitForTimeout(3000);
    } catch (err) {
      this.log(`Error searching: ${err}`);
    }
  }

  async moveToFolder(folderName: string): Promise<boolean> {
    this.log(`Moving selected email to folder: ${folderName}...`);
    try {
      await this.page.keyboard.press("v");
      await this.page.waitForTimeout(1500);

      const folderInput = this.page.locator('input[placeholder*="folder"], input[aria-label*="folder"]');
      const hasInput = await folderInput.first().isVisible({ timeout: 3000 }).catch(() => false);
      if (hasInput) {
        await folderInput.first().fill(folderName);
        await this.page.waitForTimeout(1000);
        const result = this.page.locator(`[role="option"]:has-text("${folderName}")`);
        const hasResult = await result.first().isVisible({ timeout: 3000 }).catch(() => false);
        if (hasResult) {
          await result.first().click();
          await this.page.waitForTimeout(1000);
          return true;
        }
      }

      const moreActions = this.page.locator('button[aria-label*="More"], button[aria-label*="actions"]');
      await moreActions.first().click();
      await this.page.waitForTimeout(1000);

      const moveOption = this.page.locator('[role="menuitem"]:has-text("Move")');
      await moveOption.first().click();
      await this.page.waitForTimeout(1000);

      const targetFolder = this.page.locator(`[role="treeitem"]:has-text("${folderName}"), [role="option"]:has-text("${folderName}")`);
      await targetFolder.first().click();
      await this.page.waitForTimeout(1000);
      return true;
    } catch (err) {
      this.log(`Error moving to folder: ${err}`);
      return false;
    }
  }

  async deleteEmail(): Promise<boolean> {
    this.log("Deleting selected email...");
    try {
      await this.page.keyboard.press("Delete");
      await this.page.waitForTimeout(1500);
      return true;
    } catch (err) {
      this.log(`Error deleting: ${err}`);
      return false;
    }
  }

  async markAsRead(): Promise<boolean> {
    this.log("Marking email as read...");
    try {
      const markReadBtn = this.page.locator(
        'button[aria-label*="Mark as read"], button:has-text("Mark as read")'
      );
      const visible = await markReadBtn.first().isVisible({ timeout: 3000 }).catch(() => false);
      if (visible) {
        await markReadBtn.first().click();
        await this.page.waitForTimeout(1000);
        return true;
      }
      await this.page.keyboard.press("q");
      await this.page.waitForTimeout(1000);
      return true;
    } catch (err) {
      this.log(`Error marking as read: ${err}`);
      return false;
    }
  }

  async getCurrentPageInfo(): Promise<{ url: string; title: string }> {
    return {
      url: this.page.url(),
      title: await this.page.title(),
    };
  }
}
