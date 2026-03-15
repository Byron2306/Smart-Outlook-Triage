# Outlook Browser Agent

A personal AI agent that controls Outlook through **real browser automation** (Playwright) — no OAuth app registration, no Microsoft Graph API, no client secrets. It logs into Outlook the same way you do: through the browser.

This isn't just an email automator. It **understands who you are**, knows your work context, fetches research papers, builds memory from past interactions, and can even fill out basic documents.

## Full Setup Guide

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** (comes with Node.js)
- A **Gemini API key** for AI features — [get one free](https://aistudio.google.com/apikey)
- **Microsoft Authenticator** on your phone (for NWU MFA approval)

### One-Click Setup

The fastest way to get everything running:

```bash
git clone https://github.com/Byron2306/Smart-Outlook-Triage.git
cd Smart-Outlook-Triage
chmod +x setup.sh
./setup.sh
```

The installer will prompt for your credentials, install everything, start the server, launch the browser, log into Outlook, and open the dashboard. Approve the MFA on your phone when prompted.

You can also pass credentials as environment variables for non-interactive use:

```bash
GEMINI_API_KEY="your-key" \
OUTLOOK_EMAIL="name@nwu.ac.za" \
OUTLOOK_PASSWORD="your-password" \
NWU_USERNAME="20172672" \
./setup.sh
```

### Manual Setup

If you prefer to set up step by step:

#### Step 1: Install Dependencies

```bash
npm install
npm run install-browsers

# On Linux, also install system dependencies:
npx playwright install-deps chromium
```

#### Step 2: Configure Environment

```bash
cp env.example .env.local
```

Edit `.env.local` and set your Gemini API key:

```
GEMINI_API_KEY="your-key-here"
PORT=3000
```

### Step 3: Set Up Your Profile

Start the server first (`npm run dev`), then save your profile via the API or the dashboard's Profile tab. The profile powers all AI features — drafts match your tone, classification considers your work, and the agent knows your context.

```bash
curl -X POST http://localhost:3000/api/profile \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Name",
    "email": "your.email@nwu.ac.za",
    "role": "Your Role",
    "organization": "North-West University (NWU)",
    "department": "Your Department",
    "studentNumber": "your-student-number",
    "bio": "Brief description of your work",
    "expertise": ["field1", "field2"],
    "currentProjects": ["project1"],
    "communication": {"tone": "professional", "signOff": "Kind regards", "language": "en"},
    "customFolders": ["Students_Queries", "Admin_Management", "Deadlines_Alerts"],
    "notes": ""
  }'
```

Or fill it in via the **Profile** tab in the web dashboard.

### Step 4: Start the Server

```bash
npm run dev
```

Open **http://localhost:3000** in your browser to access the dashboard.

### Step 5: Log In to Outlook

#### Option A: Automated Login (NWU accounts)

Use the **Standalone Browser** section in the sidebar, or call the API directly:

```bash
curl -X POST http://localhost:3000/api/agent/start-headed
curl -X POST http://localhost:3000/api/agent/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your.name@nwu.ac.za",
    "password": "your-password",
    "username": "your-student-number"
  }'
```

The automated login handles the full NWU federated flow:

1. Enters your email on `login.microsoftonline.com`
2. Bypasses the first Authenticator prompt via "Use your password instead"
3. Clicks "NWU Single Sign-On" on the NWU ADFS page
4. Enters your student number + password on the NWU CAS page
5. **Waits for you to approve MFA on your phone** (up to 2 minutes) — watch the dashboard Logs tab for the approval code
6. Clicks "Stay signed in" and lands in your inbox

> **Note:** The `username` field is your NWU student number (e.g. `20172672`), which differs from your email address. MFA approval on your phone is required on first login. After that, the session persists in `browser-profile/`.

#### Option B: CDP Connect (recommended for stealth)

Start your own Chrome with remote debugging, log in to Outlook manually, then connect:

```bash
# Close ALL Chrome windows first, then reopen with:
chrome --remote-debugging-port=9222

# On macOS:
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

1. Log into Outlook in that Chrome window
2. In the dashboard, click **CDP Connect** (default URL: `http://127.0.0.1:9222`)
3. The agent attaches to your live browser session — zero detection risk

#### Option C: Chrome Extension

Install the extension from `./extension/` in Chrome and it relays actions via WebSocket.

### Step 6: Use the Agent

Once connected, you can:

- **Quick Actions** (sidebar): Get emails, read, classify, draft replies, scroll, search
- **Autonomous Agent**: Enter a natural language goal like *"Read my unread emails and summarize priorities"*
- **Research**: Search Semantic Scholar for papers
- **Memory**: The agent remembers interactions across sessions

## How It Gets Past OAuth

Microsoft blocks most Playwright scripts because they detect automation signals (`navigator.webdriver`, missing browser plugins, headless fingerprints, etc.). This project handles that through:

1. **Persistent browser profile** (`launchPersistentContext`) — maintains a real Chrome user data directory with all cookies, localStorage, IndexedDB, and service workers. This is fundamentally different from `storageState` which only saves cookies.

2. **Stealth injection** — strips `navigator.webdriver`, fakes Chrome plugin objects, spoofs WebGL vendor strings, and patches the permissions API. Microsoft's login page sees a normal browser.

3. **NWU federated login automation** — handles the full multi-step flow: Microsoft login → Authenticator bypass → NWU ADFS Home Realm Discovery → NWU CAS credentials → MFA wait → session persistence.

4. **Human-like interaction** — typing delays, natural wait times, and real DOM events instead of direct API calls.

**The key insight**: once you've logged in once with a real browser profile and saved it, subsequent launches (even headless) carry the full authentication state.

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Web Dashboard (React)               │
│  Profile · Login · Agent · Research · Memory     │
└─────────────────┬────────────────────────────────┘
                  │ REST + WebSocket
┌─────────────────┴────────────────────────────────┐
│              Express Server                      │
│  Agent API · Profile API · Screenshot · WS       │
└─────────────────┬────────────────────────────────┘
                  │
┌─────────────────┴────────────────────────────────┐
│           Outlook Agent (Agentic Loop)           │
│  Gemini AI observes → decides → executes →       │
│  remembers → repeats                             │
├──────────────────────────────────────────────────┤
│  Knowledge Layer                                 │
│  Profile · Contacts · Memory · Research Papers   │
└─────────────────┬────────────────────────────────┘
                  │
┌─────────────────┴────────────────────────────────┐
│   Playwright (Persistent Chromium Profile)       │
│   + PinchTab (accessibility-tree snapshots)      │
│   outlook.office.com                             │
└──────────────────────────────────────────────────┘
```

## NWU Login Flow

The automated login handles NWU's federated authentication (Microsoft → ADFS → CAS):

```
outlook.office.com
  → login.microsoftonline.com (enter email)
    → "Approve sign in" (detect & click "Use your password instead")
      → adfs.ms.nwu.ac.za (click "NWU Single Sign-On")
        → casprd.nwu.ac.za/cas/login (enter student number + password)
          → "Approve sign in request" (WAIT for MFA on phone)
            → "Stay signed in?" (click Yes)
              → outlook.office.com/mail/ ✓
```

The MFA step requires you to approve on Microsoft Authenticator. The agent logs the approval code and waits up to 2 minutes. After the first login, the session persists in `browser-profile/` and subsequent launches skip the login entirely.

## Available Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install Node.js dependencies |
| `npm run install-browsers` | Install Playwright Chromium |
| `npm run dev` | Start dev server (Express + Vite) on port 3000 |
| `npm run build` | Production build via Vite |
| `npm run lint` | TypeScript type checking (`tsc --noEmit`) |
| `npm run clean` | Remove `dist/` build output |

## Features

### Personal Context (Profile Tab)
The agent knows you:
- **Who you are**: name, role, organization, department
- **What you do**: expertise, current projects, bio
- **How you communicate**: preferred tone, sign-off style
- **Your inbox structure**: custom folder names

Every AI operation uses this context — classification considers your work, drafts match your voice, summaries prioritize what matters to you.

### Situational Awareness (Memory Tab)
The agent remembers:
- Emails it has read and their context
- Decisions it has made
- Research it has done
- Contacts it has learned about

Memory persists across sessions and is used to provide context for future interactions. When you get a follow-up email, the agent connects it to previous threads.

### Research Papers
Search Semantic Scholar directly from the dashboard:
- Find papers by topic, author, or keyword
- View abstracts, citation counts, venues
- Access open-access PDFs
- The autonomous agent can search papers as part of a goal

### Document Filling
The agent can analyze forms and documents visible in the browser and suggest field values based on your profile. It uses your stored personal information to auto-fill name, email, student number, department, etc.

### Autonomous Agent
Natural language goals that leverage all capabilities:
- *"Read my unread emails, classify them by priority, and summarize what I need to do today"*
- *"Find the email from Dr. Smith about the extension deadline and draft a reply"*
- *"Search for papers on transformer architectures and save the key findings"*
- *"Go to the registration form and fill it out with my details"*

### Manual Control
Full set of quick actions for direct control:
- Get/read/compose/reply/send emails
- Navigate folders, scroll, search
- Classify, draft, analyze context
- Screenshot, page text, form filling

## API Reference

### Login

```bash
POST /api/agent/start-headed    # Launch visible Chromium
POST /api/agent/start           # Launch headless Chromium
POST /api/agent/login           # { email, password, username? }
POST /api/agent/connect-cdp     # { cdpUrl? } — connect to running Chrome
POST /api/agent/check-session   # Check if logged into Outlook
POST /api/agent/shutdown        # Close browser
```

### Email Actions

```bash
POST /api/agent/action { action: "get_email_list", params: { maxCount: 15 } }
POST /api/agent/action { action: "open_email", params: { index: 0 } }
POST /api/agent/action { action: "read_email" }
POST /api/agent/action { action: "compose_email", params: { to, subject, body } }
POST /api/agent/action { action: "reply_to_email", params: { body } }
POST /api/agent/action { action: "send_email" }
POST /api/agent/action { action: "classify_email" }
POST /api/agent/action { action: "generate_draft" }
POST /api/agent/action { action: "analyze_context" }
POST /api/agent/action { action: "summarize_inbox" }
```

### Autonomous Agent

```bash
POST /api/agent/run   { goal: "Read my unread emails and summarize priorities" }
POST /api/agent/stop
```

### Profile & Knowledge

```bash
GET  /api/profile
POST /api/profile         # { name, email, role, ... }
GET  /api/contacts
GET  /api/memory?limit=50
```

## PinchTab Integration

[PinchTab](https://pinchtab.com) (v0.7.8) is installed globally and available as a standalone tool for other agents. It provides:
- **Accessibility-tree snapshots** (~1-3K tokens vs 10K+ for screenshots)
- **Direct browser actions** via HTTP API (click, type, fill, scroll)
- **Multi-tab management** with session persistence
- **Stealth mode** to bypass bot detection

```bash
# Start PinchTab server (for other agents)
pinchtab --stealth --port 9867

# Use via HTTP API
curl http://localhost:9867/snapshot
curl -X POST http://localhost:9867/navigate -d '{"url":"https://outlook.live.com"}'
```

A TypeScript wrapper is available at `src/agent/pinchtab.ts` for programmatic use.

## Project Structure

```
src/
├── agent/
│   ├── browser.ts     # Playwright: persistent context, stealth, headed/headless
│   ├── outlook.ts     # Outlook selectors and browser automation actions
│   ├── agent.ts       # Agentic orchestrator with 20+ actions
│   └── pinchtab.ts    # PinchTab HTTP API wrapper
├── ai/
│   └── gemini.ts      # Context-aware AI: classify, draft, analyze, decide
├── knowledge/
│   ├── profile.ts     # User profile, contacts, persistent memory
│   └── research.ts    # Semantic Scholar API, web presence scouting
├── App.tsx            # React dashboard (6 tabs)
├── main.tsx           # Entry point
└── index.css          # Tailwind styles

server.ts              # Express + WebSocket server
agent-data/            # Persisted profile, contacts, memory (gitignored)
browser-profile/       # Chromium user data directory (gitignored)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | For AI features | [Get one free](https://aistudio.google.com/apikey) |
| `PORT` | No | Server port (default: 3000) |

## How This Compares

| Feature | This Project | PinchTab | OpenClaw Clippy |
|---------|-------------|----------|-----------------|
| OAuth needed | No | No | No |
| Browser automation | Playwright | Go + Chrome DevTools | Playwright |
| AI integration | Gemini (built-in) | External | External |
| Personal context | Full profile + memory | None | None |
| Research papers | Semantic Scholar API | None | None |
| Document filling | Yes | Manual | No |
| Web dashboard | Yes | CLI only | No |
| Session persistence | Full Chrome profile | Cookies | Cookies |

## License

MIT
