import { HAIKU, claude, parseJson, textFrom } from "../../../lib/claude";
import { hunterDomain, hunterFindEmail } from "../../../lib/hunter";

function jsonFrom(text) {
  try {
    return parseJson(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Unable to read company lookup");
    return JSON.parse(match[0]);
  }
}

async function resolveCompany({ firstName, lastName, company, domain }) {
  const host = hunterDomain(domain);
  const firm = String(company || "").trim();
  if (host || firm) {
    return {
      companyName: firm,
      companyUrl: host ? `https://${host}` : "",
      domain: host,
    };
  }

  const response = await claude().messages.create({
    model: HAIKU,
    max_tokens: 400,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
    system: "Find this person's current employer from the public web. Return only JSON. Never invent an email address.",
    messages: [{
      role: "user",
      content: `Find the current company and company website for ${firstName} ${lastName}. Return {"companyName":"","companyUrl":""}. Use empty strings if you cannot verify them. Do not include an email.`,
    }],
  });

  const parsed = jsonFrom(textFrom(response));
  const foundHost = hunterDomain(parsed.companyUrl || "");
  return {
    companyName: String(parsed.companyName || "").trim(),
    companyUrl: foundHost ? `https://${foundHost}` : String(parsed.companyUrl || "").trim(),
    domain: foundHost,
  };
}

export async function POST(request) {
  try {
    const { firstName, lastName, domain, company } = await request.json();
    if (!firstName || !lastName) {
      return Response.json({ error: "Add a first and last name before looking up an email" }, { status: 400 });
    }
    if (!process.env.HUNTER_API_KEY) {
      return Response.json({ error: "No Hunter.io API key set. Restart the app after adding HUNTER_API_KEY to .env.local" }, { status: 400 });
    }

    const resolved = await resolveCompany({ firstName, lastName, company, domain });
    const found = await hunterFindEmail({
      firstName,
      lastName,
      domain: resolved.domain,
      company: resolved.companyName,
    });

    if (!found) {
      return Response.json({
        error: resolved.companyName || resolved.domain
          ? "Hunter couldn't find an email for this person at that company"
          : "Couldn't find a public company for this person. Add a company URL, then try Find email.",
      }, { status: 404 });
    }

    return Response.json({
      email: found.email,
      confidence: found.score,
      companyName: resolved.companyName,
      companyUrl: resolved.companyUrl || (found.domain ? `https://${found.domain}` : ""),
    });
  } catch (error) {
    return Response.json({ error: error.message || "Unable to find email" }, { status: 500 });
  }
}
