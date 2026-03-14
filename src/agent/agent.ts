import { EventEmitter } from "events";
import { BrowserManager } from "./browser.js";
import { OutlookAutomation, EmailSummary, EmailFull } from "./outlook.js";
import * as gemini from "../ai/gemini.js";

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
  };
  private actionHistory: string[] = [];
  private shouldStop = false;
  private maxSteps = 30;

  constructor() {
    super();
    this.browser = new BrowserManager();
    this.browser.on("status", (data) => this.emitUpdate("info", data.status));
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
    if (this.state.logs.length > 200) {
      this.state.logs = this.state.logs.slice(-100);
    }
    this.emit("log", log);
    this.emit("state", this.getState());
  }

  private emitUpdate(type: AgentLog["type"], message: string, data?: any) {
    this.addLog(type, message, data);
  }

  async start(): Promise<void> {
    this.emitUpdate("info", "Launching browser...");
    const page = await this.browser.launch(true);
    this.outlook = new OutlookAutomation(page);
    this.state.status = "idle";
    this.emitUpdate("info", "Browser launched, ready for commands");
  }

  async login(email: string, password: string): Promise<boolean> {
    if (!this.outlook) await this.start();

    this.emitUpdate("action", "Logging into Outlook...");
    const success = await this.outlook!.login(email, password);

    if (success) {
      this.state.isLoggedIn = true;
      await this.browser.saveSession();
      this.emitUpdate("result", "Login successful, session saved");
    } else {
      this.state.isLoggedIn = false;
      this.state.status = "awaiting_login";
      this.emitUpdate("error", "Login failed - may need manual intervention for 2FA");
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
      this.emitUpdate("info", "Not logged in - credentials needed");
      this.state.status = "awaiting_login";
    }

    return loggedIn;
  }

  async executeAction(action: string, params?: Record<string, any>): Promise<any> {
    if (!this.outlook) throw new Error("Agent not started");

    this.emitUpdate("action", `Executing: ${action}`, params);

    try {
      let result: any;

      switch (action) {
        case "navigate_to_outlook":
          result = await this.outlook.navigateToOutlook();
          break;

        case "get_email_list": {
          const emails = await this.outlook.getEmailList(params?.maxCount || 15);
          this.state.emails = emails;
          result = emails;
          break;
        }

        case "open_email": {
          const email = await this.outlook.openEmail(params?.index ?? 0);
          this.state.currentEmail = email;
          result = email;
          break;
        }

        case "read_email": {
          const email = await this.outlook.readOpenEmail();
          this.state.currentEmail = email;
          result = email;
          break;
        }

        case "compose_email":
          result = await this.outlook.composeEmail(
            params?.to || "",
            params?.subject || "",
            params?.body || ""
          );
          break;

        case "reply_to_email":
          result = await this.outlook.replyToEmail(params?.body || "");
          break;

        case "send_email":
          result = await this.outlook.sendEmail();
          break;

        case "scroll_down":
          await this.outlook.scrollMailList("down");
          result = true;
          break;

        case "scroll_up":
          await this.outlook.scrollMailList("up");
          result = true;
          break;

        case "navigate_to_folder":
          result = await this.outlook.navigateToFolder(params?.name || "Inbox");
          break;

        case "search_emails":
          await this.outlook.searchEmails(params?.query || "");
          result = true;
          break;

        case "move_to_folder":
          result = await this.outlook.moveToFolder(params?.name || "");
          break;

        case "delete_email":
          result = await this.outlook.deleteEmail();
          break;

        case "mark_as_read":
          result = await this.outlook.markAsRead();
          break;

        case "get_folders": {
          const folders = await this.outlook.getFolders();
          result = folders;
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
            this.state.currentEmail.body.slice(0, 1000)
          );
          break;
        }

        case "summarize_inbox": {
          if (this.state.emails.length === 0) {
            const emails = await this.outlook.getEmailList(15);
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

        case "screenshot": {
          const buf = await this.browser.screenshot();
          result = buf ? `Screenshot captured (${buf.length} bytes)` : "Screenshot failed";
          break;
        }

        case "page_info": {
          const info = await this.outlook.getCurrentPageInfo();
          this.state.pageInfo = info;
          result = info;
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

    for (let step = 0; step < this.maxSteps && !this.shouldStop; step++) {
      try {
        const pageInfo = await this.outlook!.getCurrentPageInfo();
        this.state.pageInfo = pageInfo;

        const pageText = await this.browser.getPageText();
        const currentState = `URL: ${pageInfo.url}\nTitle: ${pageInfo.title}\nPage content (truncated): ${pageText.slice(0, 2000)}`;

        const decision = await gemini.decideNextAction(
          currentState,
          goal,
          this.actionHistory
        );

        this.emitUpdate("decision", `Step ${step + 1}: ${decision.action} - ${decision.reasoning}`);

        if (decision.action === "done") {
          this.emitUpdate("info", `Goal achieved: ${decision.reasoning}`);
          break;
        }

        if (decision.action === "wait") {
          this.emitUpdate("info", "Agent decided to wait");
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        const params = {
          ...decision.params,
          ...(decision.target ? { index: parseInt(decision.target) || 0, name: decision.target, query: decision.target, to: decision.target } : {}),
        };

        await this.executeAction(decision.action, params);
      } catch (err: any) {
        this.emitUpdate("error", `Step ${step + 1} error: ${err.message}`);
        if (step > 3) break;
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
