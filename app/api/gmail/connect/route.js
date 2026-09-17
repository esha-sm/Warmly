import { gmailAuthUrl } from "../../../../lib/gmail";

export async function GET() {
  try {
    return Response.redirect(gmailAuthUrl(), 302);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
