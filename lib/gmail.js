import { promises as fs } from "fs";
import path from "path";
import { google } from "googleapis";

const scopes = ["https://www.googleapis.com/auth/gmail.readonly"];

function redirectUri() {
  return process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/api/gmail/callback";
}

function refreshToken() {
  return process.env.GMAIL_REFRESH_TOKEN || process.env.USER_REFRESH_TOKEN || "";
}

export function getOAuthClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to .env.local, then visit /api/gmail/connect.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri());
}

export function gmailAuthUrl() {
  return getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
  });
}

export async function saveRefreshToken(token) {
  const file = path.join(process.cwd(), ".env.local");
  let text = "";
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    text = "";
  }
  const line = `GMAIL_REFRESH_TOKEN=${token}`;
  text = /^GMAIL_REFRESH_TOKEN=/m.test(text)
    ? text.replace(/^GMAIL_REFRESH_TOKEN=.*/m, line)
    : `${text.trim()}\n${line}\n`;
  await fs.writeFile(file, text);
}

export function hasGmailRefreshToken() {
  return Boolean(refreshToken());
}

