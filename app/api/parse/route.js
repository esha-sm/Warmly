import { HAIKU, claude, parseJson, textFrom } from "../../../lib/claude";

const leadFields = [
  "First name, Last name",
  "Company name",
  "Company URL",
  "Title",
  "LinkedIn URL",
  "Email",
  "Company One-Sentence Summary",
  "Growth Challenge",
  "Recent Company News",
];

function cleanHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function urlsIn(text) {
  return [...new Set((text.match(/https?:\/\/[^\s<>"']+/gi) || []).map((url) => url.replace(/[),.;]+$/, "")))];
}

async function fetchSite(url) {
  const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const response = await fetch(normalizedUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Warmly/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return { url: normalizedUrl, text: "" };
  return { url: normalizedUrl, text: cleanHtml(await response.text()) };
}

function leadFieldsFor(overrides) {
  return Object.fromEntries(leadFields.map((field) => [field, overrides[field] || ""]));
}

// Handles the simplest case with zero AI calls: just a bare name, nothing else.
// e.g. "daniel vataj" -> a lead with just a name filled in, no API cost, no ambiguity.
function bareNameLead(text) {
  const trimmed = text.trim();
  const isSingleLine = !trimmed.includes("\n") && trimmed.length < 60;
  const looksLikeJustAName = /^[a-zA-Z]+(\s+[a-zA-Z]+){1,3}$/.test(trimmed);
  if (!isSingleLine || !looksLikeJustAName) return null;

  const properCased = trimmed
    .split(/\s+/)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return leadFieldsFor({ "First name, Last name": properCased });
}

export async function POST(request) {
  try {
    const { text } = await request.json();
    if (!text?.trim()) {
      return Response.json({ error: "Paste some lead information first" }, { status: 400 });
    }

    // Fast path: a bare name needs no AI call at all.
    const quickLead = bareNameLead(text);
    if (quickLead) {
      return Response.json({ leads: [quickLead] });
    }

    const pages = [];
    for (const url of urlsIn(text).slice(0, 3)) {
      try {
        pages.push(await fetchSite(url));
      } catch {
        pages.push({ url, text: "" });
      }
    }

    const siteContext = pages
      .filter((page) => page.text)
      .map((page) => `Fetched ${page.url}:\n${page.text}`)
      .join("\n\n");

    const client = claude();
    const prompt = `Turn the following messy copied text into a clean JSON array of outreach leads.

The text may contain names, companies, job titles, LinkedIn URLs, company websites, headings, or notes.

Do not invent a contact name, emails, or LinkedIn URLs. Leave a field empty when it is not present.

Even a single bare name with no other context is a valid lead — return it as-is rather than an empty array.

Omit only rows that have neither a person nor a company.

Return ONLY valid JSON. Return an array where every object has exactly these string keys:
${leadFields.map((field) => `- ${field}`).join("\n")}

Copied text:
${text}

${siteContext ? `Fetched website text:\n${siteContext}` : "No website text could be fetched."}`;

    const response = await client.messages.create({
      model: HAIKU,
      max_tokens: 2500,
      system: "You extract structured lead data from messy text and public websites. Return only valid JSON, with no markdown or commentary. A bare name alone is always a valid lead.",
      messages: [{ role: "user", content: prompt }],
    });

    const parsed = parseJson(textFrom(response));
    const leads = Array.isArray(parsed) ? parsed : parsed.leads;

    if (!Array.isArray(leads)) {
      throw new Error("The parser did not return a lead list");
    }

    const normalizedLeads = leads
      .filter((lead) => lead && typeof lead === "object")
      .map((lead) => Object.fromEntries(leadFields.map((field) => [field, String(lead[field] ?? "")])))
      .filter((lead) => lead["First name, Last name"] || lead["Company name"] || lead["Company URL"]);

    if (!normalizedLeads.length) {
      return Response.json({ error: "Could not turn that paste into a company or person. Add a name, or a working company URL." }, { status: 400 });
    }

    return Response.json({ leads: normalizedLeads });
  } catch (error) {
    console.error("Parse error:", error.message);
    return Response.json({ error: error.message || "Unable to parse leads" }, { status: 500 });
  }
}