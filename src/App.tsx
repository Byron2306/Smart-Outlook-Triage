import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot,
  Mail,
  Play,
  Square,
  LogIn,
  Send,
  FolderOpen,
  Search,
  ScrollText,
  Eye,
  Trash2,
  CheckCheck,
  Sparkles,
  RefreshCw,
  Monitor,
  Terminal,
  ArrowDown,
  ArrowUp,
  Power,
  Zap,
} from "lucide-react";

interface AgentLog {
  timestamp: string;
  type: "action" | "result" | "error" | "info" | "decision";
  message: string;
  data?: any;
}

interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  preview: string;
  date: string;
  isRead: boolean;
}

interface AgentState {
  status: "idle" | "running" | "paused" | "error" | "awaiting_login";
  currentGoal: string | null;
  logs: AgentLog[];
  emails: EmailSummary[];
  currentEmail: any;
  isLoggedIn: boolean;
  pageInfo: { url: string; title: string } | null;
}

function App() {
  const [state, setState] = useState<AgentState>({
    status: "idle",
    currentGoal: null,
    logs: [],
    emails: [],
    currentEmail: null,
    isLoggedIn: false,
    pageInfo: null,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [goal, setGoal] = useState("");
  const [customAction, setCustomAction] = useState("");
  const [actionParams, setActionParams] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<"logs" | "emails" | "screenshot">("logs");

  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(connectWebSocket, 3000);
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "state") {
        setState(msg.data);
      } else if (msg.type === "log") {
        setState((prev) => ({
          ...prev,
          logs: [...prev.logs.slice(-199), msg.data],
        }));
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => wsRef.current?.close();
  }, [connectWebSocket]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.logs]);

  const api = async (endpoint: string, body?: any) => {
    const res = await fetch(`/api/agent/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };

  const handleStart = () => api("start");
  const handleLogin = () => api("login", { email, password });
  const handleCheckSession = () => api("check-session");
  const handleRun = () => goal && api("run", { goal });
  const handleStop = () => api("stop");
  const handleShutdown = () => api("shutdown");

  const handleAction = (action: string, params?: any) => {
    api("action", { action, params });
  };

  const handleCustomAction = () => {
    if (!customAction) return;
    let params;
    try {
      params = actionParams ? JSON.parse(actionParams) : undefined;
    } catch {
      params = { value: actionParams };
    }
    handleAction(customAction, params);
  };

  const refreshScreenshot = async () => {
    try {
      const res = await fetch("/api/agent/screenshot");
      if (res.ok) {
        const blob = await res.blob();
        setScreenshotUrl(URL.createObjectURL(blob));
      }
    } catch {}
  };

  const logTypeStyles: Record<string, string> = {
    action: "text-blue-400",
    result: "text-green-400",
    error: "text-red-400",
    info: "text-slate-400",
    decision: "text-amber-400",
  };

  const statusColors: Record<string, string> = {
    idle: "bg-slate-500",
    running: "bg-green-500 animate-pulse",
    paused: "bg-yellow-500",
    error: "bg-red-500",
    awaiting_login: "bg-orange-500 animate-pulse",
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Outlook Browser Agent</h1>
              <p className="text-xs text-slate-500">Playwright-powered email automation — no OAuth required</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColors[state.status]}`} />
            <span className="text-sm text-slate-400 capitalize">{state.status}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${connected ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
              {connected ? "WS Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto p-4 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Start / Login */}
          <section className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Power className="w-4 h-4" /> Connection
            </h2>
            <div className="space-y-2">
              <button onClick={handleStart} className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2">
                <Zap className="w-4 h-4" /> Launch Browser
              </button>
              <button onClick={handleCheckSession} className="w-full py-2 px-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Check Session
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <input
                type="email"
                placeholder="Outlook email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
              <button onClick={handleLogin} className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2">
                <LogIn className="w-4 h-4" /> Login to Outlook
              </button>
            </div>
            {state.isLoggedIn && (
              <div className="mt-2 text-xs text-green-400 flex items-center gap-1">
                <CheckCheck className="w-3 h-3" /> Logged in
              </div>
            )}
          </section>

          {/* Autonomous Agent */}
          <section className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Autonomous Agent
            </h2>
            <textarea
              placeholder='e.g. "Read my 5 newest emails and summarize them" or "Find emails from John and draft replies"'
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleRun}
                disabled={state.status === "running"}
                className="flex-1 py-2 px-3 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-700 disabled:opacity-50 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" /> Run
              </button>
              <button
                onClick={handleStop}
                className="py-2 px-3 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <Square className="w-4 h-4" /> Stop
              </button>
            </div>
            {state.currentGoal && (
              <div className="mt-2 text-xs text-violet-300 bg-violet-900/30 p-2 rounded-md">
                Goal: {state.currentGoal}
              </div>
            )}
          </section>

          {/* Quick Actions */}
          <section className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Quick Actions
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={<Mail className="w-3.5 h-3.5" />} label="Get Emails" onClick={() => handleAction("get_email_list")} />
              <ActionButton icon={<Eye className="w-3.5 h-3.5" />} label="Read Email" onClick={() => handleAction("read_email")} />
              <ActionButton icon={<FolderOpen className="w-3.5 h-3.5" />} label="Get Folders" onClick={() => handleAction("get_folders")} />
              <ActionButton icon={<ScrollText className="w-3.5 h-3.5" />} label="Summarize" onClick={() => handleAction("summarize_inbox")} />
              <ActionButton icon={<Sparkles className="w-3.5 h-3.5" />} label="Classify" onClick={() => handleAction("classify_email")} />
              <ActionButton icon={<Send className="w-3.5 h-3.5" />} label="Draft Reply" onClick={() => handleAction("generate_draft")} />
              <ActionButton icon={<ArrowDown className="w-3.5 h-3.5" />} label="Scroll Down" onClick={() => handleAction("scroll_down")} />
              <ActionButton icon={<ArrowUp className="w-3.5 h-3.5" />} label="Scroll Up" onClick={() => handleAction("scroll_up")} />
              <ActionButton icon={<CheckCheck className="w-3.5 h-3.5" />} label="Mark Read" onClick={() => handleAction("mark_as_read")} />
              <ActionButton icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" onClick={() => handleAction("delete_email")} />
              <ActionButton icon={<Monitor className="w-3.5 h-3.5" />} label="Screenshot" onClick={refreshScreenshot} />
              <ActionButton icon={<Search className="w-3.5 h-3.5" />} label="Page Info" onClick={() => handleAction("page_info")} />
            </div>
          </section>

          {/* Custom Action */}
          <section className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Terminal className="w-4 h-4" /> Custom Action
            </h2>
            <input
              placeholder="Action name"
              value={customAction}
              onChange={(e) => setCustomAction(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 mb-2"
            />
            <input
              placeholder='Params JSON, e.g. {"index": 0}'
              value={actionParams}
              onChange={(e) => setActionParams(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 mb-2"
            />
            <button onClick={handleCustomAction} className="w-full py-2 px-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition">
              Execute
            </button>
          </section>

          <button onClick={handleShutdown} className="w-full py-2 px-3 bg-red-900/50 hover:bg-red-900 border border-red-800 rounded-lg text-sm text-red-300 transition">
            Shutdown Agent
          </button>
        </aside>

        {/* Main Content */}
        <main className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-900 rounded-xl border border-slate-800 p-1">
            {(["logs", "emails", "screenshot"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if (tab === "screenshot") refreshScreenshot();
                }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium capitalize transition ${
                  activeTab === tab ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Logs Tab */}
          {activeTab === "logs" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 h-[calc(100vh-200px)] overflow-y-auto font-mono text-xs">
              {state.logs.length === 0 ? (
                <div className="text-slate-600 text-center py-20">
                  <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No activity yet. Launch the browser to get started.</p>
                </div>
              ) : (
                state.logs.map((log, i) => (
                  <div key={i} className="py-1.5 border-b border-slate-800/50 flex gap-2">
                    <span className="text-slate-600 shrink-0 w-20">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`shrink-0 w-16 uppercase font-bold ${logTypeStyles[log.type] || "text-slate-400"}`}>
                      {log.type}
                    </span>
                    <span className="text-slate-300 break-all">{log.message}</span>
                    {log.data && typeof log.data === "object" && (
                      <details className="ml-auto">
                        <summary className="text-slate-500 cursor-pointer hover:text-slate-300">data</summary>
                        <pre className="text-slate-500 mt-1 max-h-40 overflow-auto text-[10px]">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          )}

          {/* Emails Tab */}
          {activeTab === "emails" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 h-[calc(100vh-200px)] overflow-y-auto">
              {state.emails.length === 0 ? (
                <div className="text-slate-600 text-center py-20">
                  <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No emails loaded. Click "Get Emails" to fetch your inbox.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {state.emails.map((em, i) => (
                    <div
                      key={em.id}
                      onClick={() => handleAction("open_email", { index: i })}
                      className={`p-3 rounded-lg border cursor-pointer transition hover:bg-slate-800 ${
                        em.isRead ? "border-slate-800 bg-slate-900" : "border-blue-800 bg-blue-950/30"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className={`text-sm font-medium ${em.isRead ? "text-slate-300" : "text-white"}`}>
                          {em.from}
                        </span>
                        <span className="text-xs text-slate-500">{em.date}</span>
                      </div>
                      <div className="text-sm text-slate-400 mt-0.5">{em.subject}</div>
                      <div className="text-xs text-slate-600 mt-1 line-clamp-1">{em.preview}</div>
                    </div>
                  ))}
                </div>
              )}

              {state.currentEmail && (
                <div className="mt-4 p-4 bg-slate-800 rounded-lg border border-slate-700">
                  <h3 className="text-sm font-semibold mb-2 text-blue-400">Open Email</h3>
                  <div className="text-xs space-y-1">
                    <div><span className="text-slate-500">From:</span> {state.currentEmail.from}</div>
                    <div><span className="text-slate-500">Subject:</span> {state.currentEmail.subject}</div>
                    <div className="mt-2 text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {state.currentEmail.body}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Screenshot Tab */}
          {activeTab === "screenshot" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 h-[calc(100vh-200px)] overflow-y-auto">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-slate-400">Browser View</h3>
                <button onClick={refreshScreenshot} className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg transition flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
              {screenshotUrl ? (
                <img src={screenshotUrl} alt="Browser screenshot" className="w-full rounded-lg border border-slate-700" />
              ) : (
                <div className="text-slate-600 text-center py-20">
                  <Monitor className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No screenshot yet. Click Refresh to capture.</p>
                </div>
              )}
              {state.pageInfo && (
                <div className="mt-3 text-xs text-slate-500 space-y-1">
                  <div><span className="text-slate-600">URL:</span> {state.pageInfo.url}</div>
                  <div><span className="text-slate-600">Title:</span> {state.pageInfo.title}</div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="py-2 px-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs transition flex items-center justify-center gap-1.5"
    >
      {icon} {label}
    </button>
  );
}

export default App;
