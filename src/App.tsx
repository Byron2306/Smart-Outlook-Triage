import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot, Mail, Play, Square, LogIn, Send, FolderOpen, Search,
  ScrollText, Eye, Trash2, CheckCheck, Sparkles, RefreshCw,
  Monitor, Terminal, ArrowDown, ArrowUp, Power, Zap,
  User, BookOpen, Brain, FileText, Globe, Plus, Save,
  MonitorUp, MonitorOff, AlertCircle, ChevronDown,
} from "lucide-react";

interface AgentLog {
  timestamp: string;
  type: "action" | "result" | "error" | "info" | "decision";
  message: string;
  data?: any;
}

interface EmailSummary {
  id: string; from: string; subject: string; preview: string;
  date: string; isRead: boolean;
}

interface UserProfile {
  name: string; email: string; role: string; organization: string;
  department: string; studentNumber?: string; bio: string;
  expertise: string[]; currentProjects: string[];
  communication: { tone: string; signOff: string; language: string };
  customFolders: string[]; notes: string;
}

interface AgentState {
  status: "idle" | "running" | "paused" | "error" | "awaiting_login";
  currentGoal: string | null; logs: AgentLog[]; emails: EmailSummary[];
  currentEmail: any; isLoggedIn: boolean;
  pageInfo: { url: string; title: string } | null;
  profile: UserProfile | null; recentPapers: any[];
}

const DEFAULT_PROFILE: UserProfile = {
  name: "", email: "", role: "", organization: "", department: "",
  bio: "", expertise: [], currentProjects: [],
  communication: { tone: "professional", signOff: "Kind regards", language: "en" },
  customFolders: [], notes: "",
};

type Tab = "logs" | "emails" | "screenshot" | "profile" | "research" | "memory";

function App() {
  const [state, setState] = useState<AgentState>({
    status: "idle", currentGoal: null, logs: [], emails: [],
    currentEmail: null, isLoggedIn: false, pageInfo: null,
    profile: null, recentPapers: [],
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [goal, setGoal] = useState("");
  const [customAction, setCustomAction] = useState("");
  const [actionParams, setActionParams] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("logs");
  const [profileForm, setProfileForm] = useState<UserProfile>(DEFAULT_PROFILE);
  const [researchQuery, setResearchQuery] = useState("");
  const [researchResults, setResearchResults] = useState<any>(null);
  const [memory, setMemory] = useState<any[]>([]);
  const [sidebarSection, setSidebarSection] = useState<"connection" | "agent" | "actions" | "custom">("connection");

  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => { setConnected(false); setTimeout(connectWebSocket, 3000); };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "state") setState(msg.data);
      else if (msg.type === "log") setState((prev) => ({ ...prev, logs: [...prev.logs.slice(-299), msg.data] }));
    };
    wsRef.current = ws;
  }, []);

  useEffect(() => { connectWebSocket(); return () => wsRef.current?.close(); }, [connectWebSocket]);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [state.logs]);
  useEffect(() => { fetchProfile(); }, []);

  const api = async (endpoint: string, body?: any, method = "POST") => {
    const res = await fetch(`/api/${endpoint}`, {
      method, headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };

  const agentApi = (endpoint: string, body?: any) => api(`agent/${endpoint}`, body);

  const fetchProfile = async () => {
    const p = await api("profile", undefined, "GET");
    if (p && !p.error) setProfileForm({ ...DEFAULT_PROFILE, ...p });
  };

  const saveProfileForm = async () => {
    await api("profile", profileForm);
    setState((prev) => ({ ...prev, profile: profileForm }));
  };

  const fetchMemory = async () => {
    const m = await api("memory?limit=50", undefined, "GET");
    if (Array.isArray(m)) setMemory(m);
  };

  const handleAction = (action: string, params?: any) => agentApi("action", { action, params });

  const handleSearchPapers = async () => {
    if (!researchQuery) return;
    const r = await agentApi("action", { action: "search_papers", params: { query: researchQuery } });
    setResearchResults(r?.result);
  };

  const refreshScreenshot = async () => {
    try {
      const res = await fetch("/api/agent/screenshot");
      if (res.ok) { const blob = await res.blob(); setScreenshotUrl(URL.createObjectURL(blob)); }
    } catch {}
  };

  const handleCustomAction = () => {
    if (!customAction) return;
    let params;
    try { params = actionParams ? JSON.parse(actionParams) : undefined; }
    catch { params = { value: actionParams }; }
    handleAction(customAction, params);
  };

  const logColors: Record<string, string> = {
    action: "text-blue-400", result: "text-green-400", error: "text-red-400",
    info: "text-slate-400", decision: "text-amber-400",
  };
  const statusColors: Record<string, string> = {
    idle: "bg-slate-500", running: "bg-green-500 animate-pulse", paused: "bg-yellow-500",
    error: "bg-red-500", awaiting_login: "bg-orange-500 animate-pulse",
  };

  const SidebarSection = ({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <section className="bg-slate-900 rounded-xl border border-slate-800">
      <button onClick={() => setSidebarSection(sidebarSection === id ? id : id as any)} className="w-full p-3 flex items-center justify-between text-left">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">{icon} {title}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition ${sidebarSection === id ? "rotate-180" : ""}`} />
      </button>
      {<div className={`px-3 pb-3 space-y-2 ${sidebarSection === id ? "" : "hidden"}`}>{children}</div>}
    </section>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg"><Bot className="w-5 h-5" /></div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Outlook Browser Agent</h1>
              <p className="text-xs text-slate-500">
                Agentic automation · Playwright + PinchTab + Gemini — no OAuth
                {state.profile?.name && <span className="text-blue-400"> · {state.profile.name}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColors[state.status]}`} />
            <span className="text-sm text-slate-400 capitalize">{state.status}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${connected ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-[1800px] mx-auto p-4 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* Sidebar */}
        <aside className="space-y-3">
          <SidebarSection id="connection" title="Connection" icon={<Power className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => agentApi("start")} className="py-2 px-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1">
                <Zap className="w-3.5 h-3.5" /> Headless
              </button>
              <button onClick={() => agentApi("start-headed")} className="py-2 px-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1">
                <MonitorUp className="w-3.5 h-3.5" /> Headed
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => agentApi("switch-headed")} className="py-1.5 px-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-[10px] transition flex items-center justify-center gap-1">
                <Monitor className="w-3 h-3" /> Show Browser
              </button>
              <button onClick={() => agentApi("switch-headless")} className="py-1.5 px-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-[10px] transition flex items-center justify-center gap-1">
                <MonitorOff className="w-3 h-3" /> Hide Browser
              </button>
            </div>
            <button onClick={() => agentApi("check-session")} className="w-full py-1.5 px-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs transition flex items-center justify-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> Check Session
            </button>
            <div className="bg-slate-800/50 rounded-lg p-2 mt-1">
              <div className="flex items-center gap-1 mb-2 text-[10px] text-amber-400">
                <AlertCircle className="w-3 h-3" />
                First time? Use "Headed" to log in manually. Session persists.
              </div>
              <input type="email" placeholder="Outlook email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs focus:outline-none focus:border-blue-500 mb-1.5" />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs focus:outline-none focus:border-blue-500 mb-1.5" />
              <button onClick={() => agentApi("login", { email, password })} className="w-full py-1.5 px-3 bg-violet-600 hover:bg-violet-700 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1">
                <LogIn className="w-3.5 h-3.5" /> Auto Login
              </button>
            </div>
            {state.isLoggedIn && <div className="text-xs text-green-400 flex items-center gap-1"><CheckCheck className="w-3 h-3" /> Logged in</div>}
          </SidebarSection>

          <SidebarSection id="agent" title="Autonomous Agent" icon={<Sparkles className="w-4 h-4" />}>
            <textarea placeholder='"Read my unread emails and summarize them with priorities based on my work"' value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs focus:outline-none focus:border-blue-500 resize-none" />
            <div className="flex gap-2">
              <button onClick={() => goal && agentApi("run", { goal })} disabled={state.status === "running"} className="flex-1 py-2 px-3 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-700 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1">
                <Play className="w-3.5 h-3.5" /> Run
              </button>
              <button onClick={() => agentApi("stop")} className="py-2 px-3 bg-red-700 hover:bg-red-600 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1">
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            </div>
            {state.currentGoal && <div className="text-xs text-violet-300 bg-violet-900/30 p-2 rounded-md">Goal: {state.currentGoal}</div>}
          </SidebarSection>

          <SidebarSection id="actions" title="Quick Actions" icon={<Zap className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-1.5">
              <Btn icon={<Mail className="w-3 h-3" />} label="Get Emails" onClick={() => handleAction("get_email_list")} />
              <Btn icon={<Eye className="w-3 h-3" />} label="Read Email" onClick={() => handleAction("read_email")} />
              <Btn icon={<FolderOpen className="w-3 h-3" />} label="Folders" onClick={() => handleAction("get_folders")} />
              <Btn icon={<ScrollText className="w-3 h-3" />} label="Summarize" onClick={() => handleAction("summarize_inbox")} />
              <Btn icon={<Sparkles className="w-3 h-3" />} label="Classify" onClick={() => handleAction("classify_email")} />
              <Btn icon={<Send className="w-3 h-3" />} label="Draft Reply" onClick={() => handleAction("generate_draft")} />
              <Btn icon={<Brain className="w-3 h-3" />} label="Deep Context" onClick={() => handleAction("analyze_context")} />
              <Btn icon={<BookOpen className="w-3 h-3" />} label="Papers" onClick={() => setActiveTab("research")} />
              <Btn icon={<ArrowDown className="w-3 h-3" />} label="Scroll ↓" onClick={() => handleAction("scroll_down")} />
              <Btn icon={<ArrowUp className="w-3 h-3" />} label="Scroll ↑" onClick={() => handleAction("scroll_up")} />
              <Btn icon={<CheckCheck className="w-3 h-3" />} label="Mark Read" onClick={() => handleAction("mark_as_read")} />
              <Btn icon={<Trash2 className="w-3 h-3" />} label="Delete" onClick={() => handleAction("delete_email")} />
              <Btn icon={<Monitor className="w-3 h-3" />} label="Screenshot" onClick={() => { setActiveTab("screenshot"); refreshScreenshot(); }} />
              <Btn icon={<FileText className="w-3 h-3" />} label="Fill Form" onClick={() => handleAction("fill_form")} />
              <Btn icon={<Globe className="w-3 h-3" />} label="Page Text" onClick={() => handleAction("get_page_text")} />
              <Btn icon={<Search className="w-3 h-3" />} label="Page Info" onClick={() => handleAction("page_info")} />
            </div>
          </SidebarSection>

          <SidebarSection id="custom" title="Custom Action" icon={<Terminal className="w-4 h-4" />}>
            <input placeholder="Action name" value={customAction} onChange={(e) => setCustomAction(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs focus:outline-none focus:border-blue-500" />
            <input placeholder='Params JSON, e.g. {"index": 0}' value={actionParams} onChange={(e) => setActionParams(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs focus:outline-none focus:border-blue-500" />
            <button onClick={handleCustomAction} className="w-full py-1.5 px-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs transition">Execute</button>
          </SidebarSection>

          <button onClick={() => agentApi("shutdown")} className="w-full py-2 px-3 bg-red-900/50 hover:bg-red-900 border border-red-800 rounded-lg text-xs text-red-300 transition">
            Shutdown Agent
          </button>
        </aside>

        {/* Main Content */}
        <main className="space-y-3">
          {/* Tabs */}
          <div className="flex gap-0.5 bg-slate-900 rounded-xl border border-slate-800 p-1 overflow-x-auto">
            {(["logs", "emails", "screenshot", "profile", "research", "memory"] as Tab[]).map((tab) => (
              <button key={tab} onClick={() => {
                setActiveTab(tab);
                if (tab === "screenshot") refreshScreenshot();
                if (tab === "memory") fetchMemory();
                if (tab === "profile") fetchProfile();
              }} className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium capitalize transition whitespace-nowrap ${
                activeTab === tab ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}>{tab}</button>
            ))}
          </div>

          {/* Logs */}
          {activeTab === "logs" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 h-[calc(100vh-180px)] overflow-y-auto font-mono text-[11px]">
              {state.logs.length === 0 ? (
                <Empty icon={<Bot className="w-10 h-10" />} text='No activity yet. Use "Headed" to launch a visible browser for first-time login.' />
              ) : state.logs.map((log, i) => (
                <div key={i} className="py-1 border-b border-slate-800/50 flex gap-2">
                  <span className="text-slate-600 shrink-0 w-16">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className={`shrink-0 w-14 uppercase font-bold ${logColors[log.type] || "text-slate-400"}`}>{log.type}</span>
                  <span className="text-slate-300 break-all flex-1">{log.message}</span>
                  {log.data && typeof log.data === "object" && (
                    <details className="shrink-0"><summary className="text-slate-600 cursor-pointer hover:text-slate-300 text-[10px]">data</summary>
                      <pre className="text-slate-500 mt-1 max-h-32 overflow-auto text-[9px] max-w-xs">{JSON.stringify(log.data, null, 2)}</pre>
                    </details>
                  )}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}

          {/* Emails */}
          {activeTab === "emails" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 h-[calc(100vh-180px)] overflow-y-auto">
              {state.emails.length === 0 ? (
                <Empty icon={<Mail className="w-10 h-10" />} text='Click "Get Emails" to load your inbox.' />
              ) : (
                <div className="space-y-1.5">
                  {state.emails.map((em, i) => (
                    <div key={em.id} onClick={() => handleAction("open_email", { index: i })}
                      className={`p-2.5 rounded-lg border cursor-pointer transition hover:bg-slate-800 ${em.isRead ? "border-slate-800 bg-slate-900" : "border-blue-800 bg-blue-950/30"}`}>
                      <div className="flex justify-between items-start">
                        <span className={`text-xs font-medium ${em.isRead ? "text-slate-300" : "text-white"}`}>{em.from}</span>
                        <span className="text-[10px] text-slate-500">{em.date}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{em.subject}</div>
                      <div className="text-[10px] text-slate-600 mt-0.5 line-clamp-1">{em.preview}</div>
                    </div>
                  ))}
                </div>
              )}
              {state.currentEmail && (
                <div className="mt-3 p-3 bg-slate-800 rounded-lg border border-slate-700">
                  <h3 className="text-xs font-semibold mb-2 text-blue-400">Open Email</h3>
                  <div className="text-[11px] space-y-1">
                    <div><span className="text-slate-500">From:</span> {state.currentEmail.from}</div>
                    <div><span className="text-slate-500">Subject:</span> {state.currentEmail.subject}</div>
                    <div className="mt-2 text-slate-300 whitespace-pre-wrap max-h-52 overflow-y-auto text-[10px]">{state.currentEmail.body}</div>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    <Btn icon={<Brain className="w-3 h-3" />} label="Analyze" onClick={() => handleAction("analyze_context")} />
                    <Btn icon={<Sparkles className="w-3 h-3" />} label="Classify" onClick={() => handleAction("classify_email")} />
                    <Btn icon={<Send className="w-3 h-3" />} label="Draft" onClick={() => handleAction("generate_draft")} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Screenshot */}
          {activeTab === "screenshot" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 h-[calc(100vh-180px)] overflow-y-auto">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-semibold text-slate-400">Browser View</h3>
                <button onClick={refreshScreenshot} className="text-[10px] px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg transition flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
              {screenshotUrl ? <img src={screenshotUrl} alt="Browser" className="w-full rounded-lg border border-slate-700" /> : <Empty icon={<Monitor className="w-10 h-10" />} text="Click Refresh to capture." />}
              {state.pageInfo && <div className="mt-2 text-[10px] text-slate-500"><div>URL: {state.pageInfo.url}</div><div>Title: {state.pageInfo.title}</div></div>}
            </div>
          )}

          {/* Profile */}
          {activeTab === "profile" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 h-[calc(100vh-180px)] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><User className="w-4 h-4 text-blue-400" /> Your Profile</h3>
                <button onClick={saveProfileForm} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition flex items-center gap-1"><Save className="w-3.5 h-3.5" /> Save</button>
              </div>
              <p className="text-[10px] text-slate-500 mb-4">This is how the agent knows you. Fill this out so it can write in your voice, understand your relationships, and prioritize your work.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Full Name" value={profileForm.name} onChange={(v) => setProfileForm({ ...profileForm, name: v })} />
                <Field label="Email" value={profileForm.email} onChange={(v) => setProfileForm({ ...profileForm, email: v })} />
                <Field label="Role / Title" value={profileForm.role} onChange={(v) => setProfileForm({ ...profileForm, role: v })} />
                <Field label="Organization" value={profileForm.organization} onChange={(v) => setProfileForm({ ...profileForm, organization: v })} />
                <Field label="Department" value={profileForm.department} onChange={(v) => setProfileForm({ ...profileForm, department: v })} />
                <Field label="Student Number" value={profileForm.studentNumber || ""} onChange={(v) => setProfileForm({ ...profileForm, studentNumber: v })} />
              </div>
              <div className="mt-3">
                <Field label="Bio / About You" value={profileForm.bio} onChange={(v) => setProfileForm({ ...profileForm, bio: v })} multiline />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <Field label="Expertise (comma-separated)" value={profileForm.expertise.join(", ")} onChange={(v) => setProfileForm({ ...profileForm, expertise: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
                <Field label="Current Projects (comma-separated)" value={profileForm.currentProjects.join(", ")} onChange={(v) => setProfileForm({ ...profileForm, currentProjects: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <Field label="Communication Tone" value={profileForm.communication.tone} onChange={(v) => setProfileForm({ ...profileForm, communication: { ...profileForm.communication, tone: v } })} />
                <Field label="Sign-off" value={profileForm.communication.signOff} onChange={(v) => setProfileForm({ ...profileForm, communication: { ...profileForm.communication, signOff: v } })} />
                <Field label="Language" value={profileForm.communication.language} onChange={(v) => setProfileForm({ ...profileForm, communication: { ...profileForm.communication, language: v } })} />
              </div>
              <div className="mt-3">
                <Field label="Custom Folders (comma-separated)" value={profileForm.customFolders.join(", ")} onChange={(v) => setProfileForm({ ...profileForm, customFolders: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <div className="mt-3">
                <Field label="Additional Notes / Context" value={profileForm.notes} onChange={(v) => setProfileForm({ ...profileForm, notes: v })} multiline />
              </div>
            </div>
          )}

          {/* Research */}
          {activeTab === "research" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 h-[calc(100vh-180px)] overflow-y-auto">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-3"><BookOpen className="w-4 h-4 text-blue-400" /> Research Papers</h3>
              <div className="flex gap-2 mb-4">
                <input placeholder="Search Semantic Scholar..." value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearchPapers()}
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs focus:outline-none focus:border-blue-500" />
                <button onClick={handleSearchPapers} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition flex items-center gap-1"><Search className="w-3.5 h-3.5" /> Search</button>
              </div>
              {researchResults?.papers ? (
                <div className="space-y-3">
                  {researchResults.papers.map((p: any, i: number) => (
                    <div key={i} className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                      <a href={p.url} target="_blank" rel="noopener" className="text-xs font-medium text-blue-400 hover:underline">{p.title}</a>
                      <div className="text-[10px] text-slate-500 mt-1">{p.authors?.join(", ")} · {p.year} {p.venue && `· ${p.venue}`}</div>
                      {p.citationCount != null && <div className="text-[10px] text-slate-600 mt-0.5">{p.citationCount} citations</div>}
                      {p.abstract && <div className="text-[10px] text-slate-400 mt-1.5 line-clamp-3">{p.abstract}</div>}
                      {p.pdfUrl && <a href={p.pdfUrl} target="_blank" rel="noopener" className="text-[10px] text-green-400 hover:underline mt-1 inline-block">PDF Available</a>}
                    </div>
                  ))}
                </div>
              ) : <Empty icon={<BookOpen className="w-10 h-10" />} text="Search for papers by topic, author, or keyword." />}
            </div>
          )}

          {/* Memory */}
          {activeTab === "memory" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 h-[calc(100vh-180px)] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><Brain className="w-4 h-4 text-blue-400" /> Agent Memory</h3>
                <button onClick={fetchMemory} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-[10px] transition flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
              </div>
              <p className="text-[10px] text-slate-500 mb-3">The agent remembers email interactions, decisions, and context. This builds situational awareness over time.</p>
              {memory.length === 0 ? (
                <Empty icon={<Brain className="w-10 h-10" />} text="No memories yet. The agent records interactions automatically." />
              ) : (
                <div className="space-y-1.5">
                  {[...memory].reverse().map((m, i) => (
                    <div key={i} className="p-2 bg-slate-800 rounded-lg border border-slate-700/50">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">{m.type}</span>
                        <span className="text-[9px] text-slate-600">{new Date(m.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="text-[10px] text-slate-300">{m.summary}</div>
                      {m.tags?.length > 0 && <div className="text-[9px] text-slate-600 mt-0.5">{m.tags.join(" · ")}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Btn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-lg text-[10px] transition flex items-center justify-center gap-1">
      {icon} {label}
    </button>
  );
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const cls = "w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs focus:outline-none focus:border-blue-500";
  return (
    <div>
      <label className="text-[10px] text-slate-500 mb-0.5 block">{label}</label>
      {multiline ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={cls + " resize-none"} />
        : <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />}
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="text-slate-600 text-center py-16"><div className="opacity-30 flex justify-center mb-3">{icon}</div><p className="text-xs">{text}</p></div>;
}

export default App;
