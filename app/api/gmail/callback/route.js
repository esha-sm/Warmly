import { getOAuthClient, saveRefreshToken } from "../../../../lib/gmail";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");

    if (error) {
      return new Response(`Gmail access was denied (${error}).`, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (!code) {
      return new Response("Missing OAuth code. Start again at /api/gmail/connect.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      return new Response("Google did not return a refresh token. Revoke Warmly in your Google account, then connect again.", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    await saveRefreshToken(tokens.refresh_token);
    return new Response("Gmail is connected with read-only access. Restart the Next.js server, then use Check replies.", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Gmail callback error:", error.message);
    return new Response(error.message || "Unable to finish Gmail connect.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
