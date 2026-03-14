# Outlook Browser Agent

An agentic email automation tool that controls Outlook through **real browser automation** (Playwright) — no OAuth app registration, no Microsoft Graph API, no client secrets. It logs into Outlook the same way you do: through the browser.

## How It Works

```
┌─────────────────────────────────────────────┐
│           Web Dashboard (React)             │
│  Login · Quick Actions · Autonomous Agent   │
└─────────────────┬───────────────────────────┘
                  │ REST + WebSocket
┌─────────────────┴───────────────────────────┐
│           Express Server                    │
│  Agent API · Screenshot · Real-time Logs    │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────┴───────────────────────────┐
│         Outlook Agent (Agentic Loop)        │
│  Gemini AI decides actions → Playwright     │
│  executes them → observes results → repeat  │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────┴───────────────────────────┐
│      Playwright (Headless Chromium)         │
│  Real browser session · Persisted cookies   │
│  outlook.live.com / outlook.office.com      │
└─────────────────────────────────────────────┘
```

### Why Browser Automation Instead of OAuth?

| Approach | OAuth + Graph API | Browser Automation (this project) |
|----------|-------------------|-----------------------------------|
| Setup | Register Azure AD app, configure secrets, handle token refresh | Just provide your email & password |
| Permissions | Requires admin consent for org accounts | Uses your existing access |
| 2FA | Complex to handle programmatically | Can handle via saved browser session |
| Maintenance | API changes, token expiry | Works as long as Outlook web works |
| Inspiration | — | OpenClaw's "clippy" skill, PinchTab |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright's Chromium
npm run install-browsers

# 3. Set your Gemini API key (optional, for AI features)
cp env.example .env
# Edit .env and add your GEMINI_API_KEY

# 4. Start the server
npm run dev
```

Open `http://localhost:3000` in your browser.

## Features

### Manual Control (Quick Actions)
- **Get Emails** — Read the visible email list from Outlook
- **Open/Read Email** — Click on and extract an email's content
- **Compose & Send** — Write and send new emails
- **Reply** — Reply to the currently open email
- **Scroll** — Navigate through the email list
- **Search** — Find specific emails
- **Move to Folder** — Organize emails into folders
- **Delete / Mark Read** — Email management
- **Screenshot** — See what the browser currently looks like

### AI-Powered (requires Gemini API key)
- **Classify Email** — AI categorizes the open email by priority and folder
- **Draft Reply** — AI generates a professional reply draft
- **Summarize Inbox** — AI summarizes your visible emails with priorities

### Autonomous Agent
Give the agent a natural-language goal like:
- *"Read my 5 newest emails and summarize them"*
- *"Find emails from the dean and draft replies"*
- *"Classify all unread emails and move them to appropriate folders"*

The AI agent will:
1. Observe the current page state
2. Decide the best next action
3. Execute it via Playwright
4. Repeat until the goal is achieved

## Architecture

```
src/
├── agent/
│   ├── browser.ts    # Playwright browser lifecycle + session persistence
│   ├── outlook.ts    # Outlook-specific selectors and automation actions
│   └── agent.ts      # Agentic orchestrator (manual + autonomous modes)
├── ai/
│   └── gemini.ts     # Gemini AI: classify, draft, summarize, decide
├── components/       # (reserved for future component extraction)
├── App.tsx           # React dashboard UI
├── main.tsx          # React entry point
└── index.css         # Tailwind + custom styles

server.ts             # Express + WebSocket server, agent API endpoints
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/agent/start` | Launch the headless browser |
| POST | `/api/agent/login` | Login with email & password |
| POST | `/api/agent/check-session` | Check if session is still active |
| POST | `/api/agent/action` | Execute a single action |
| POST | `/api/agent/run` | Start autonomous agent with a goal |
| POST | `/api/agent/stop` | Stop the autonomous agent |
| GET | `/api/agent/state` | Get current agent state |
| GET | `/api/agent/screenshot` | Get browser screenshot (JPEG) |
| POST | `/api/agent/shutdown` | Close browser and clean up |
| WS | `/ws` | Real-time logs and state updates |

## PinchTab & OpenClaw Comparison

This project was inspired by research into existing browser automation tools:

- **PinchTab**: A Go binary that provides browser control via HTTP API using accessibility-tree snapshots. Token-efficient (~1-3K tokens vs 10K+ for screenshots). We use a similar approach with Playwright's `ariaSnapshot()`.

- **OpenClaw (Clawbot)**: Their "clippy" skill automates Outlook via Playwright without OAuth — exactly the approach used here. Their browser relay method uses a Chrome extension for AI agent control.

This project gives you the same capabilities as both tools, but as a single self-contained Node.js app with a built-in web dashboard.

## Session Persistence

Browser sessions (cookies, local storage) are saved to `playwright-session/` automatically. This means:
- You only need to log in once
- The session survives server restarts
- 2FA prompts are handled once, then the session is reused

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | For AI features | Google Gemini API key ([get one free](https://aistudio.google.com/apikey)) |
| `PORT` | No | Server port (default: 3000) |

## License

MIT
