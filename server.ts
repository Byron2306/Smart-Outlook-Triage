import express from "express";
import { createServer as createViteServer } from "vite";
import session from "express-session";
import cookieParser from "cookie-parser";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

// Extend express-session
declare module "express-session" {
  interface SessionData {
    accessToken: string;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "a-very-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: true,
        sameSite: "none",
        httpOnly: true,
      },
    })
  );

  // --- OAuth Configuration ---
  const CLIENT_ID = process.env.MS_CLIENT_ID;
  const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
  const REDIRECT_URI = `${process.env.APP_URL}/auth/callback`;
  const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
  const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const SCOPES = "openid profile email User.Read Mail.Read Mail.ReadWrite Mail.Send";

  // --- API Routes ---

  app.get("/api/auth/url", (req, res) => {
    if (!CLIENT_ID) {
      return res.status(500).json({ error: "MS_CLIENT_ID not configured" });
    }
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      response_mode: "query",
      scope: SCOPES,
      state: "12345",
    });
    res.json({ url: `${AUTH_URL}?${params.toString()}` });
  });

  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send("No code provided");
    }

    try {
      const response = await axios.post(
        TOKEN_URL,
        new URLSearchParams({
          client_id: CLIENT_ID!,
          client_secret: CLIENT_SECRET!,
          code: code as string,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const { access_token, refresh_token } = response.data;
      req.session.accessToken = access_token;
      
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Token exchange error:", error.response?.data || error.message);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/user/me", async (req, res) => {
    const token = req.session.accessToken;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    try {
      const response = await axios.get("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      res.json(response.data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user info" });
    }
  });

  app.get("/api/mail/folders", async (req, res) => {
    const token = req.session.accessToken;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    try {
      const response = await axios.get("https://graph.microsoft.com/v1.0/me/mailFolders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      res.json(response.data.value);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch folders" });
    }
  });

  app.post("/api/mail/folders/create", async (req, res) => {
    const token = req.session.accessToken;
    const { displayName } = req.body;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    try {
      const response = await axios.post(
        "https://graph.microsoft.com/v1.0/me/mailFolders",
        { displayName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.json(response.data);
    } catch (error) {
      res.status(500).json({ error: "Failed to create folder" });
    }
  });

  app.get("/api/mail/messages", async (req, res) => {
    const token = req.session.accessToken;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    try {
      const response = await axios.get(
        "https://graph.microsoft.com/v1.0/me/messages?$top=10&$select=subject,from,receivedDateTime,bodyPreview,id",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.json(response.data.value);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/reports/save", async (req, res) => {
    const { report } = req.body;
    try {
      const fs = await import("fs/promises");
      await fs.writeFile("smoketest_results.json", JSON.stringify(report, null, 2));
      res.json({ success: true, message: "Report saved to smoketest_results.json" });
    } catch (error) {
      console.error("Failed to save report:", error);
      res.status(500).json({ error: "Failed to save report" });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
