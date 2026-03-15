#!/usr/bin/env bash
set -e

# ─────────────────────────────────────────────────────────────
#  Outlook Browser Agent — One-Click Installer
# ─────────────────────────────────────────────────────────────
#
#  This script:
#    1. Checks prerequisites (Node.js, npm)
#    2. Installs all npm dependencies
#    3. Installs Playwright Chromium + system deps
#    4. Collects your credentials (Gemini key, Outlook, NWU)
#    5. Saves your profile
#    6. Starts the server
#    7. Launches the headed browser + auto-login
#    8. Opens the dashboard in your default browser
#
#  Usage:
#    chmod +x setup.sh
#    ./setup.sh
#
#  Non-interactive usage (CI/scripts):
#    GEMINI_API_KEY="..." OUTLOOK_EMAIL="..." OUTLOOK_PASSWORD="..." \
#    NWU_USERNAME="..." ./setup.sh
#
# ─────────────────────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $1"; exit 1; }
ask()   { echo -en "${BOLD}$1${NC}"; }

PORT="${PORT:-3000}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${BOLD}┌─────────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}│       Outlook Browser Agent — Setup             │${NC}"
echo -e "${BOLD}└─────────────────────────────────────────────────┘${NC}"
echo ""

# ─── 1. Prerequisites ───────────────────────────────────────

info "Checking prerequisites..."

if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install it from https://nodejs.org (v18+)"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js v18+ required (found v$(node -v))"
fi
ok "Node.js $(node -v)"

if ! command -v npm &>/dev/null; then
  fail "npm is not installed"
fi
ok "npm $(npm -v)"

# ─── 2. Install Dependencies ────────────────────────────────

info "Installing npm dependencies..."
npm install --no-audit --no-fund 2>&1 | tail -3
ok "npm packages installed"

info "Installing Playwright Chromium browser..."
npx playwright install chromium 2>&1 | tail -3
ok "Chromium installed"

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  info "Installing Playwright system dependencies (may need sudo)..."
  npx playwright install-deps chromium 2>&1 | tail -3
  ok "System dependencies installed"
fi

# ─── 3. Collect Credentials ─────────────────────────────────

echo ""
echo -e "${BOLD}┌─────────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}│       Configuration                             │${NC}"
echo -e "${BOLD}└─────────────────────────────────────────────────┘${NC}"
echo ""

if [ -z "$GEMINI_API_KEY" ]; then
  info "Get a free Gemini API key at: https://aistudio.google.com/apikey"
  ask "Gemini API Key (press Enter to skip): "
  read -r GEMINI_API_KEY
  if [ -z "$GEMINI_API_KEY" ]; then
    warn "No Gemini key — AI features (draft, classify, analyze) will be disabled"
    GEMINI_API_KEY="placeholder"
  fi
fi

if [ -z "$OUTLOOK_EMAIL" ]; then
  echo ""
  ask "Outlook email (e.g. name@nwu.ac.za): "
  read -r OUTLOOK_EMAIL
fi

if [ -z "$OUTLOOK_PASSWORD" ]; then
  ask "Outlook password: "
  read -rs OUTLOOK_PASSWORD
  echo ""
fi

if [ -z "$NWU_USERNAME" ]; then
  ask "NWU student number / username (e.g. 20172672): "
  read -r NWU_USERNAME
fi

if [ -z "$OUTLOOK_EMAIL" ] || [ -z "$OUTLOOK_PASSWORD" ]; then
  fail "Email and password are required"
fi

# ─── 4. Save Environment ────────────────────────────────────

info "Writing .env.local..."
cat > .env.local <<EOF
GEMINI_API_KEY="${GEMINI_API_KEY}"
PORT=${PORT}
EOF
ok "Environment saved to .env.local"

# ─── 5. Start Server ────────────────────────────────────────

echo ""
info "Starting server on port ${PORT}..."

if lsof -i :"$PORT" -t &>/dev/null 2>&1; then
  warn "Port ${PORT} is in use — killing existing process..."
  lsof -i :"$PORT" -t | xargs kill -9 2>/dev/null || true
  sleep 2
fi

DISPLAY="${DISPLAY:-:0}" npm run dev &>/dev/null &
SERVER_PID=$!
echo "$SERVER_PID" > .server.pid

for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:"$PORT"/ 2>/dev/null; then
    ok "Server running (PID: $SERVER_PID)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    fail "Server failed to start after 30 seconds"
  fi
  sleep 1
done

# ─── 6. Save Profile ────────────────────────────────────────

info "Saving your profile..."

USERNAME_PART=$(echo "$OUTLOOK_EMAIL" | cut -d@ -f1)
DISPLAY_NAME=$(echo "$USERNAME_PART" | sed 's/\./ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')

curl -s -X POST "http://localhost:${PORT}/api/profile" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"${DISPLAY_NAME}\",
    \"email\": \"${OUTLOOK_EMAIL}\",
    \"role\": \"\",
    \"organization\": \"North-West University (NWU)\",
    \"department\": \"\",
    \"studentNumber\": \"${NWU_USERNAME}\",
    \"bio\": \"\",
    \"expertise\": [],
    \"currentProjects\": [],
    \"communication\": {\"tone\": \"professional\", \"signOff\": \"Kind regards\", \"language\": \"en\"},
    \"customFolders\": [\"Students_Queries\", \"Admin_Management\", \"Deadlines_Alerts\", \"Events_Training\", \"Other_To_Review\"],
    \"notes\": \"\"
  }" >/dev/null 2>&1

ok "Profile saved (edit in dashboard Profile tab for more detail)"

# ─── 7. Launch Browser + Login ───────────────────────────────

echo ""
echo -e "${BOLD}┌─────────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}│       Logging In                                │${NC}"
echo -e "${BOLD}└─────────────────────────────────────────────────┘${NC}"
echo ""
info "Launching headed Chromium browser..."

curl -s -X POST "http://localhost:${PORT}/api/agent/start-headed" >/dev/null 2>&1
ok "Browser launched"

info "Starting automated NWU login..."
info "The login will go through: Microsoft → ADFS → NWU CAS → MFA"
echo ""
echo -e "${YELLOW}  ╔═══════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}  ║  When prompted, approve MFA on your phone!   ║${NC}"
echo -e "${YELLOW}  ║  Watch the dashboard Logs tab for the code.  ║${NC}"
echo -e "${YELLOW}  ╚═══════════════════════════════════════════════╝${NC}"
echo ""

LOGIN_RESULT=$(curl -s -X POST "http://localhost:${PORT}/api/agent/login" \
  -H "Content-Type: application/json" \
  --max-time 180 \
  -d "{
    \"email\": \"${OUTLOOK_EMAIL}\",
    \"password\": \"${OUTLOOK_PASSWORD}\",
    \"username\": \"${NWU_USERNAME}\"
  }")

LOGIN_SUCCESS=$(echo "$LOGIN_RESULT" | grep -o '"success":true' || true)

if [ -n "$LOGIN_SUCCESS" ]; then
  ok "Login successful! You're in Outlook."
else
  warn "Automated login didn't complete — this usually means MFA timed out."
  warn "You can retry via the dashboard or log in manually in the browser."
fi

# ─── 8. Open Dashboard ──────────────────────────────────────

echo ""
info "Opening dashboard..."

DASHBOARD_URL="http://localhost:${PORT}"

if command -v xdg-open &>/dev/null; then
  xdg-open "$DASHBOARD_URL" 2>/dev/null &
elif command -v open &>/dev/null; then
  open "$DASHBOARD_URL" 2>/dev/null &
elif command -v start &>/dev/null; then
  start "$DASHBOARD_URL" 2>/dev/null &
else
  info "Open in your browser: ${DASHBOARD_URL}"
fi

echo ""
echo -e "${BOLD}┌─────────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}│       Setup Complete!                           │${NC}"
echo -e "${BOLD}├─────────────────────────────────────────────────┤${NC}"
echo -e "${BOLD}│  Dashboard:  http://localhost:${PORT}              │${NC}"
echo -e "${BOLD}│  Server PID: ${SERVER_PID}                              │${NC}"
echo -e "${BOLD}│                                                 │${NC}"
echo -e "${BOLD}│  To stop:  kill ${SERVER_PID}  (or: kill \$(cat .server.pid)) │${NC}"
echo -e "${BOLD}│  To restart: npm run dev                        │${NC}"
echo -e "${BOLD}└─────────────────────────────────────────────────┘${NC}"
echo ""
