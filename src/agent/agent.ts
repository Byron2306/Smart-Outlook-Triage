import { EventEmitter } from "events";
import { BrowserManager } from "./browser.js";
import { OutlookAutomation, EmailSummary, EmailFull } from "./outlook.js";
import * as gemini from "../ai/gemini.js";
import * as research from "../knowledge/research.js";
import * as profile from "../knowledge/profile.js";

export interface AgentLog {
  timestamp: string;
  type: "action" | "result" | "error" | "info" | "decision";
  message: string;
  data?: any;
}

export interface AgentState {
  status: "idle" | "running" | "paused" | "error" | "awaiting_login";
  currentGoal: string | null;
  logs: AgentLog[];
  emails: EmailSummary[];
  currentEmail: EmailFull | null;
  isLoggedIn: boolean;
  pageInfo: { url: string; title: string } | null;
  profile: profile.UserProfile | null;
  recentPapers: research.Paper[];
}

export class OutlookAgent extends EventEmitter {
  private browser: BrowserManager;
  private outlook: OutlookAutomation | null = null;
  private state: AgentState = {
    status: "idle",
    currentGoal: null,
    logs: [],
    emails: [],
    currentEmail: null,
    isLoggedIn: false,
    pageInfo: null,
    profile: null,
    recentPapers: [],
  };
  private actionHistory: string[] = [];
  private shouldStop = false;
  private maxSteps = 50;

  constructor() {
    super();
    this.browser = new BrowserManager();
    this.browser.on("status", (data) => this.emitUpdate("info", data.status));
    this.loadProfileState();
  }

  private async loadProfileState() {
    this.state.profile = await profile.loadProfile();
  }

  getState(): AgentState {
    return { ...this.state };
  }

  private addLog(type: AgentLog["type"], message: string, data?: any) {
    const log: AgentLog = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data,
    };
    this.state.logs.push(log);
    if (this.state.logs.length > 300) {
      this.state.logs = this.state.logs.slice(-200);
    }
    this.emit("log", log);
    this.emit("state", this.getState());
  }

  private emitUpdate(type: AgentLog["type"], message: string, data?: any) {
    this.addLog(type, message, data);
  }

  async start(headless = true): Promise<void> {
    this.emitUpdate("info", `Launching browser (${headless ? "headless" : "headed"})...`);
    const page = await this.browser.launch(headless);
    this.outlook = new OutlookAutomation(page);
    this.state.status = "idle";
    this.emitUpdate("info", "Browser launched, ready for commands");
  }

  async startHeaded(): Promise<void> {
    return this.start(false);
  }

  async login(email: string, password: string): Promise<boolean> {
    if (!this.outlook) await this.start();

    this.emitUpdate("action", "Logging into Outlook...");
    const success = await this.outlook!.login(email, password);

    if (success) {
      this.state.isLoggedIn = true;
      await this.browser.saveSessionBackup();
      this.emitUpdate("result", "Login successful, session saved");
    } else {
      this.state.isLoggedIn = false;
      this.state.status = "awaiting_login";
      this.emitUpdate(
        "error",
        "Login may have been blocked. Try 'Launch Headed' to log in manually with a visible browser, then 'Switch to Headless' once logged in."
      );
    }

    return success;
  }

  async checkSession(): Promise<boolean> {
    if (!this.outlook) await this.start();

    await this.outlook!.navigateToOutlook();
    const loggedIn = await this.outlook!.isLoggedIn();
    this.state.isLoggedIn = loggedIn;

    if (loggedIn) {
      this.emitUpdate("info", "Session is active, logged into Outlook");
    } else {
      this.emitUpdate("info", "Not logged in — use 'Launch Headed' for first-time login");
      this.state.status = "awaiting_login";
    }

    return loggedIn;
  }

  async switchToHeadless(): Promise<void> {
    this.emitUpdate("info", "Switching to headless mode (preserving session)...");
    const page = await this.browser.relaunchHeadless();
    this.outlook = new OutlookAutomation(page);
    this.emitUpdate("info", "Now running headless. Session should be preserved from headed login.");
  }

  async switchToHeaded(): Promise<void> {
    this.emitUpdate("info", "Switching to headed mode...");
    const page = await this.browser.relaunchHeaded();
    this.outlook = new OutlookAutomation(page);
    this.emitUpdate("info", "Running in headed mode — you can see and interact with the browser.");
  }

  async executeAction(action: string, params?: Record<string, any>): Promise<any> {
    if (!this.outlook && action !== "update_profile" && action !== "get_profile" && action !== "recall") {
      throw new Error("Agent not started — launch browser first");
    }

    this.emitUpdate("action", `Executing: ${action}`, params);

    try {
      let result: any;

      switch (action) {
        case "navigate_to_outlook":
          result = await this.outlook!.navigateToOutlook();
          break;

        case "get_email_list": {
          const emails = await this.outlook!.getEmailList(params?.maxCount || 15);
          this.state.emails = emails;
          result = emails;
          break;
        }

        case "open_email": {
          const email = await this.outlook!.openEmail(params?.index ?? 0);
          this.state.currentEmail = email;
          if (email) {
            await profile.addMemory({
              type: "email_thread",
              summary: `Read email from ${email.from}: "${email.subject}"`,
              details: email.body.slice(0, 500),
              tags: [email.from, email.subject],
            });
          }
          result = email;
          break;
        }

        case "read_email": {
          const email = await this.outlook!.readOpenEmail();
          this.state.currentEmail = email;
          result = email;
          break;
        }

        case "compose_email":
          result = await this.outlook!.composeEmail(
            params?.to || "",
            params?.subject || "",
            params?.body || ""
          );
          if (result) {
            await profile.addMemory({
              type: "email_thread",
              summary: `Composed email to ${params?.to}: "${params?.subject}"`,
              details: (params?.body || "").slice(0, 300),
              tags: [params?.to || "", params?.subject || ""],
            });
          }
          break;

        case "reply_to_email":
          result = await this.outlook!.replyToEmail(params?.body || "");
          break;

        case "send_email":
          result = await this.outlook!.sendEmail();
          break;

        case "scroll_down":
          await this.outlook!.scrollMailList("down");
          result = true;
          break;

        case "scroll_up":
          await this.outlook!.scrollMailList("up");
          result = true;
          break;

        case "navigate_to_folder":
          result = await this.outlook!.navigateToFolder(params?.name || "Inbox");
          break;

        case "search_emails":
          await this.outlook!.searchEmails(params?.query || "");
          result = true;
          break;

        case "move_to_folder":
          result = await this.outlook!.moveToFolder(params?.name || "");
          break;

        case "delete_email":
          result = await this.outlook!.deleteEmail();
          break;

        case "mark_as_read":
          result = await this.outlook!.markAsRead();
          break;

        case "get_folders": {
          result = await this.outlook!.getFolders();
          break;
        }

        case "classify_email": {
          if (!this.state.currentEmail) {
            result = { error: "No email currently open" };
            break;
          }
          result = await gemini.classifyEmail(
            this.state.currentEmail.from,
            this.state.currentEmail.subject,
            this.state.currentEmail.body.slice(0, 500)
          );
          break;
        }

        case "generate_draft": {
          if (!this.state.currentEmail) {
            result = { error: "No email currently open" };
            break;
          }
          result = await gemini.generateDraft(
            this.state.currentEmail.from,
            this.state.currentEmail.subject,
            this.state.currentEmail.body.slice(0, 2000)
          );
          break;
        }

        case "analyze_context": {
          if (!this.state.currentEmail) {
            result = { error: "No email currently open" };
            break;
          }
          result = await gemini.analyzeEmailContext(
            this.state.currentEmail.from,
            this.state.currentEmail.subject,
            this.state.currentEmail.body.slice(0, 2000)
          );
          await profile.addMemory({
            type: "context",
            summary: `Analyzed context for "${this.state.currentEmail.subject}" from ${this.state.currentEmail.from}`,
            details: JSON.stringify(result).slice(0, 500),
            tags: [this.state.currentEmail.from, this.state.currentEmail.subject],
          });
          break;
        }

        case "summarize_inbox": {
          if (this.state.emails.length === 0) {
            const emails = await this.outlook!.getEmailList(15);
            this.state.emails = emails;
          }
          const emailData = this.state.emails.map((e) => ({
            from: e.from,
            subject: e.subject,
            preview: e.preview,
          }));
          result = await gemini.summarizeEmails(emailData);
          break;
        }

        case "search_papers": {
          const papers = await research.searchPapers(params?.query || "", params?.limit || 5);
          this.state.recentPapers = papers;
          result = { papers, formatted: research.formatPapersForContext(papers) };
          await profile.addMemory({
            type: "research",
            summary: `Searched papers: "${params?.query}"`,
            details: research.formatPapersForContext(papers).slice(0, 500),
            tags: ["research", params?.query || ""],
          });
          break;
        }

        case "get_author_papers": {
          const papers = await research.getAuthorPapers(params?.name || "");
          this.state.recentPapers = papers;
          result = { papers, formatted: research.formatPapersForContext(papers) };
          break;
        }

        case "scout_web": {
          result = await research.scoutWebPresence(params?.name || "", this.browser.page || undefined);
          break;
        }

        case "remember": {
          await profile.addMemory({
            type: (params?.type as any) || "context",
            summary: params?.summary || "",
            details: params?.details || "",
            tags: params?.tags || [],
          });
          result = { saved: true };
          break;
        }

        case "recall": {
          const memories = await profile.searchMemory(params?.query || "", params?.limit || 10);
          result = memories;
          break;
        }

        case "learn_contact": {
          if (params?.email && params?.name) {
            await profile.upsertContact({
              name: params.name,
              email: params.email,
              relationship: params.relationship || "unknown",
              context: params.context || "",
              notes: params.notes || "",
            });
            result = { saved: true };
          } else {
            result = { error: "Need at least name and email" };
          }
          break;
        }

        case "navigate_to_url": {
          if (this.browser.page && params?.url) {
            await this.browser.page.goto(params.url, { waitUntil: "domcontentloaded", timeout: 20000 });
            await this.browser.page.waitForTimeout(2000);
            result = { url: this.browser.page.url(), title: await this.browser.page.title() };
          } else {
            result = { error: "No page or URL" };
          }
          break;
        }

        case "fill_form": {
          if (!this.browser.page) {
            result = { error: "No page available" };
            break;
          }
          const pageText = await this.browser.getPageText();
          result = await gemini.analyzeDocumentForFilling(
            pageText.slice(0, 3000),
            params?.context || ""
          );
          break;
        }

        case "fill_field": {
          if (!this.browser.page) {
            result = { error: "No page available" };
            break;
          }
          const selector = params?.selector || "";
          const value = params?.value || "";
          try {
            const el = this.browser.page.locator(selector).first();
            await el.click();
            await el.fill(value);
            result = { filled: true, selector, value };
          } catch (err: any) {
            result = { error: `Could not fill "${selector}": ${err.message}` };
          }
          break;
        }

        case "update_profile": {
          const current = await profile.loadProfile();
          const updated = { ...current, ...params };
          await profile.saveProfile(updated);
          this.state.profile = updated;
          result = updated;
          break;
        }

        case "get_profile": {
          result = await profile.loadProfile();
          this.state.profile = result;
          break;
        }

        case "screenshot": {
          const buf = await this.browser.screenshot();
          result = buf ? `Screenshot captured (${buf.length} bytes)` : "Screenshot failed";
          break;
        }

        case "page_info": {
          const info = await this.outlook!.getCurrentPageInfo();
          this.state.pageInfo = info;
          result = info;
          break;
        }

        case "get_page_text": {
          result = await this.browser.getPageText();
          result = (result as string).slice(0, 5000);
          break;
        }

        default:
          result = { error: `Unknown action: ${action}` };
      }

      this.emitUpdate("result", `Result for ${action}`, result);
      this.actionHistory.push(`${action}: ${JSON.stringify(result).slice(0, 200)}`);
      return result;
    } catch (err: any) {
      this.emitUpdate("error", `Error executing ${action}: ${err.message}`);
      return { error: err.message };
    }
  }

  async runAutonomous(goal: string): Promise<void> {
    if (!this.outlook) await this.start();

    this.state.status = "running";
    this.state.currentGoal = goal;
    this.shouldStop = false;
    this.emitUpdate("info", `Starting autonomous run: "${goal}"`);

    const prof = await profile.loadProfile();
    const extraCtx = prof.name ? `User: ${prof.name} (${prof.role} at ${prof.organization})` : "";

    for (let step = 0; step < this.maxSteps && !this.shouldStop; step++) {
      try {
        const pageInfo = await this.outlook!.getCurrentPageInfo();
        this.state.pageInfo = pageInfo;

        const pageText = await this.browser.getPageText();
        const currentState = `URL: ${pageInfo.url}\nTitle: ${pageInfo.title}\nVisible content (truncated): ${pageText.slice(0, 3000)}`;

        const decision = await gemini.decideNextAction(
          currentState,
          goal,
          this.actionHistory,
          extraCtx
        );

        this.emitUpdate("decision", `Step ${step + 1}: ${decision.action} — ${decision.reasoning}`);

        if (decision.action === "done") {
          this.emitUpdate("info", `Goal achieved: ${decision.reasoning}`);
          break;
        }

        if (decision.action === "wait") {
          this.emitUpdate("info", "Agent decided to wait");
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        const params: Record<string, any> = { ...decision.params };
        if (decision.target) {
          const parsed = parseInt(decision.target);
          if (!isNaN(parsed)) params.index = parsed;
          params.name = decision.target;
          params.query = decision.target;
          params.url = decision.target;
        }

        await this.executeAction(decision.action, params);
      } catch (err: any) {
        this.emitUpdate("error", `Step ${step + 1} error: ${err.message}`);
        if (step > 5) break;
      }
    }

    this.state.status = "idle";
    this.state.currentGoal = null;
    this.emitUpdate("info", "Autonomous run finished");
  }

  stop() {
    this.shouldStop = true;
    this.state.status = "idle";
    this.state.currentGoal = null;
    this.emitUpdate("info", "Agent stopped by user");
  }

  async shutdown(): Promise<void> {
    this.stop();
    await this.browser.close();
    this.emitUpdate("info", "Agent shut down");
  }

  async getScreenshot(): Promise<Buffer | null> {
    return this.browser.screenshot();
  }
}
