import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, "..");
const envPath = path.join(backendDir, ".env");
dotenv.config({ path: envPath, quiet: true });

const clientId = String(process.env.GOOGLE_CALENDAR_CLIENT_ID || "").trim();
const clientSecret = String(process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "").trim();
const redirectUri = String(process.env.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI || "http://127.0.0.1:8787/google-calendar/oauth/callback").trim();
const scope = "https://www.googleapis.com/auth/calendar";

if (!clientId || !clientSecret) {
  console.error("Missing GOOGLE_CALENDAR_CLIENT_ID or GOOGLE_CALENDAR_CLIENT_SECRET in backend/.env.");
  console.error("Add those two values first, then run this script again.");
  process.exit(1);
}

let redirectUrl;
try {
  redirectUrl = new URL(redirectUri);
} catch {
  console.error(`Invalid GOOGLE_CALENDAR_OAUTH_REDIRECT_URI: ${redirectUri}`);
  process.exit(1);
}

if (!/^https?:$/.test(redirectUrl.protocol)) {
  console.error("GOOGLE_CALENDAR_OAUTH_REDIRECT_URI must start with http:// or https://.");
  process.exit(1);
}

const port = Number(redirectUrl.port || (redirectUrl.protocol === "https:" ? 443 : 80));
const host = redirectUrl.hostname || "127.0.0.1";
const callbackPath = redirectUrl.pathname || "/";
const state = randomBytes(24).toString("hex");

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  access_type: "offline",
  prompt: "consent",
  include_granted_scopes: "true",
  scope,
  state
}).toString();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const upsertEnvValue = (key, value) => {
  const nextLine = `${key}=${value}`;
  const currentText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const matcher = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
  const updatedText = matcher.test(currentText)
    ? currentText.replace(matcher, nextLine)
    : `${currentText.replace(/\s*$/, "")}\n${nextLine}\n`;
  fs.writeFileSync(envPath, updatedText, "utf8");
};

const printSetup = () => {
  console.log("");
  console.log("Google Calendar OAuth helper");
  console.log("");
  console.log("1. In Google Cloud Console, open your OAuth 2.0 Client ID.");
  console.log(`2. Add this Authorized redirect URI exactly: ${redirectUri}`);
  console.log("3. Save the OAuth client settings.");
  console.log("4. Open the URL below in your browser and approve calendar access.");
  console.log("");
  console.log(authUrl.toString());
  console.log("");
  console.log("This script will keep listening for the callback and will save GOOGLE_CALENDAR_REFRESH_TOKEN into backend/.env automatically.");
  console.log("Press Ctrl+C to cancel.");
  console.log("");
};

const sendHtml = (res, statusCode, title, body) => {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:Arial,sans-serif;padding:24px;line-height:1.5"><h1>${title}</h1><p>${body}</p></body></html>`);
};

const exchangeCodeForToken = async (code) => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    }).toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error_description || payload?.error || response.statusText || `HTTP ${response.status}`;
    throw new Error(`Google token exchange failed: ${message}`);
  }
  return payload;
};

let isHandlingCallback = false;
const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", redirectUri);
  if (requestUrl.pathname !== callbackPath) {
    return sendHtml(res, 404, "Not Found", "This helper only handles the Google Calendar OAuth callback path.");
  }
  if (isHandlingCallback) {
    return sendHtml(res, 409, "Already Processing", "The OAuth callback is already being processed.");
  }

  const returnedState = String(requestUrl.searchParams.get("state") || "").trim();
  const error = String(requestUrl.searchParams.get("error") || "").trim();
  const code = String(requestUrl.searchParams.get("code") || "").trim();

  if (error) {
    return sendHtml(res, 400, "Authorization Failed", `Google returned an error: ${error}`);
  }
  if (!code) {
    return sendHtml(res, 400, "Missing Code", "Google did not return an authorization code.");
  }
  if (returnedState !== state) {
    return sendHtml(res, 400, "State Mismatch", "The OAuth state did not match. Close this window and try again.");
  }

  isHandlingCallback = true;
  try {
    const tokenPayload = await exchangeCodeForToken(code);
    const refreshToken = String(tokenPayload?.refresh_token || "").trim();
    if (!refreshToken) {
      throw new Error("Google did not return a refresh token. Remove the app from your Google account permissions, then run the helper again.");
    }

    upsertEnvValue("GOOGLE_CALENDAR_REFRESH_TOKEN", refreshToken);
    upsertEnvValue("GOOGLE_CALENDAR_SYNC_ENABLED", "true");

    sendHtml(res, 200, "Calendar Connected", "The refresh token was saved to backend/.env. You can close this tab and restart the backend.");
    console.log("");
    console.log("GOOGLE_CALENDAR_REFRESH_TOKEN was saved to backend/.env.");
    console.log("Restart your backend server, then refresh the admin calendar page.");
    console.log("");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown token exchange error.";
    sendHtml(res, 500, "Token Exchange Failed", message);
    console.error(message);
    process.exitCode = 1;
  } finally {
    setTimeout(() => {
      server.close();
    }, 250);
  }
});

server.on("error", (error) => {
  console.error(`OAuth helper could not start on ${redirectUri}: ${error.message}`);
  process.exit(1);
});

server.listen(port, host, () => {
  printSetup();
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
