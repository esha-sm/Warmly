import { google } from "googleapis";
import { getOAuthClient, hasGmailRefreshToken } from "../../../lib/gmail";

export async function POST(request) {
  try {
    const { leads } = await request.json();
    const sent = Array.isArray(leads) ? leads.filter((lead) => lead?.id && lead?.email && lead?.sentAt) : [];

    if (!hasGmailRefreshToken()) {
      return Response.json({
        configured: false,
        ids: [],
        error: "Connect Gmail first. Open /api/gmail/connect, then restart the dev server.",
      }, { status: 400 });
    }

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN || process.env.USER_REFRESH_TOKEN,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const repliedIds = [];

    for (const lead of sent) {
      const afterDate = lead.sentAt.slice(0, 10).replace(/-/g, "/");
      const query = `from:${lead.email} after:${afterDate}`;
      const res = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 1 });
      if (res.data.messages?.length) repliedIds.push(lead.id);
    }

    return Response.json({ ids: repliedIds });
  } catch (error) {
    console.error("Replies error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
