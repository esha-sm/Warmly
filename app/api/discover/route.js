import { HAIKU, claude, parseJson, textFrom } from "../../../lib/claude";
import { hunterFindEmails } from "../../../lib/hunter";

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

const teamPaths = [
  "/press",
  "/news",
  "/about",
  "/about-us",
  "/team",
  "/our-team",
  "/people",
  "/leadership",
  "/founders",
  "/company",
  "/careers",
  "/jobs",
  "/blog",
  "/contact",
  "/",
];

function domainFrom(text) {
  const match = text.match(/https?:\/\/[^\s<>"']+/i) || text.match(/\b[a-z0-9.-]+\.[a-z]{2,}\b/i);
  if (!match) return "";
  try {
    const value = /^https?:\/\//i.test(match[0]) ? match[0].replace(/[),.;]+$/, "") : `https://${match[0]}`;
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function originFor(domain) {
  return `https://${domain}`;
}

function cleanHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function usefulSlice(text) {
  const markers = /co-?founder|founder|chief executive|\bceo\b|\bcto\b|\bcoo\b|leadership|our team|about us|press kit/i;
  const index = text.search(markers);
  if (index >= 200) return text.slice(Math.max(0, index - 200), index + 3500);
  return text.slice(0, 4000);
}

function looksEmpty(text) {
  return text.length < 2500 && /page not found|\b404\b|not found/i.test(text);
}

function publicEmails(html, domain) {
  const found = new Set();
  const pattern = /(?:mailto:)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  const root = domain.replace(/^www\./, "").split(".").slice(-2).join(".");
  let match;
  while ((match = pattern.exec(html))) {
    const email = match[1].toLowerCase();
    if (!email.includes(root.replace(/\.[^.]+$/, "")) && !email.endsWith(`@${domain}`)) continue;
    if (/^(noreply|no-reply|privacy|legal|unsubscribe)@/.test(email)) continue;
    found.add(email);
  }
  return [...found];
}

function teamLinks(html, origin) {
  const links = new Set();
  const pattern = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      const url = new URL(match[1], origin);
      if (url.origin !== new URL(origin).origin) continue;
      if (/about|team|people|leadership|founder|company|staff|crew|careers?|jobs|press|news|blog/i.test(url.pathname)) {
        links.add(`${url.origin}${url.pathname}`);
      }
    } catch {
      // ignore invalid hrefs
    }
  }
  return [...links];
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(10000),
    redirect: "follow",
  });
  if (!response.ok) return null;
  const html = await response.text();
  const text = cleanHtml(html);
  if (!text || looksEmpty(text)) return null;
  return { url: response.url || url, html, text: usefulSlice(text) };
}

async function crawlCompany(domain) {
  const origin = originFor(domain);
  const queued = teamPaths.map((path) => `${origin}${path === "/" ? "/" : path}`);
  const seen = new Set();
  const pages = [];
  const emails = new Set();

  while (queued.length && pages.length < 8) {
    const url = queued.shift();
    const key = url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const page = await fetchPage(url);
      if (!page?.text) continue;
      pages.push({ url: page.url, text: page.text });
      publicEmails(page.html, domain).forEach((email) => emails.add(email));
      for (const link of teamLinks(page.html, origin)) queued.push(link);
    } catch {
      // skip unreachable paths
    }
  }

  return { pages, emails: [...emails] };
}

function personName(lead) {
  return String(
    lead["First name, Last name"] ||
    lead.name ||
    lead.Name ||
    `${lead.first_name || lead.firstName || ""} ${lead.last_name || lead.lastName || ""}`.trim()
  ).replace(/\s+/g, " ").trim();
}

function emptyLead(domain, extra = {}) {
  return {
    "First name, Last name": "",
    "Company name": extra["Company name"] || domain,
    "Company URL": extra["Company URL"] || originFor(domain),
    Title: "",
    "LinkedIn URL": "",
    Email: "",
    "Company One-Sentence Summary": extra["Company One-Sentence Summary"] || "",
    "Growth Challenge": extra["Growth Challenge"] || "",
    "Recent Company News": extra["Recent Company News"] || "",
    ...extra,
  };
}

export async function POST(request) {
  try {
    const { text } = await request.json();
    const domain = domainFrom(text || "");

    if (!domain) {
      return Response.json({ error: "Paste a company website like https://juicebox.ai/" }, { status: 400 });
    }

    const { pages, emails } = await crawlCompany(domain);
    if (!pages.length) {
      return Response.json({ error: `Could not read ${domain}. Check the URL and try again.` }, { status: 400 });
    }

    const siteContext = pages.map((page) => `Fetched ${page.url}:\n${page.text}`).join("\n\n");
    const client = claude();
    const prompt = `Extract real employees of this company from public website text.

Company domain: ${domain}
Company URL: ${originFor(domain)}

Rules:
- Return a separate lead for each REAL person who works at THIS company
- The "First name, Last name" field is required and must be the person's actual name from the page
- Press, careers, about, leadership, and founder bios count. Co-founders named in press coverage or signed careers notes count
- Job listings and open roles are not people
- Ignore product demos, fake search results, testimonials, customers, and example candidates
- First names plus last names when the page has them (e.g. a press bio). Do not invent a last name
- Do not invent titles, LinkedIn URLs, or emails
- Email may only be filled if that exact address appears in the public emails list or in the page text next to that person
- Generic inboxes like hello@, info@, support@, careers@ belong on nobody; leave Email empty
- If people are found but have no public email, still return them with empty Email
- Fill Company name, summary, challenge, and news from the site when possible; copy those company fields onto every person

Return ONLY valid JSON. Return an array where every object has exactly these string keys:
${leadFields.map((field) => `- ${field}`).join("\n")}

Public emails found on the site:
${emails.length ? emails.join(", ") : "(none)"}

Website text:
${siteContext}`;

    const response = await client.messages.create({
      model: HAIKU,
      max_tokens: 2500,
      system: "You extract employees from public company websites. Return only valid JSON. Never invent emails or people. Prefer press and careers pages over marketing demos.",
      messages: [{ role: "user", content: prompt }],
    });

    const parsed = parseJson(textFrom(response));
    const leads = Array.isArray(parsed) ? parsed : parsed.leads;
    const sourceText = `${emails.join(" ")} ${siteContext}`.toLowerCase();
    const normalizedLeads = (Array.isArray(leads) ? leads : [])
      .filter((lead) => lead && typeof lead === "object")
      .map((lead) => {
        const row = Object.fromEntries(leadFields.map((field) => [field, String(lead[field] ?? "")]));
        row["First name, Last name"] = personName(lead) || row["First name, Last name"];
        const email = row.Email.trim().toLowerCase();
        return {
          ...row,
          "Company URL": row["Company URL"] || originFor(domain),
          Email: email && sourceText.includes(email) ? email : "",
        };
      })
      .filter((lead) => lead["First name, Last name"] || lead["Company name"] || lead["Company URL"]);

    const named = normalizedLeads.filter((lead) => lead["First name, Last name"].trim());
    const result = named.length
      ? await hunterFindEmails(named, domain)
      : [emptyLead(domain, normalizedLeads[0] || {})];

    return Response.json({ leads: result, hunter: Boolean(process.env.HUNTER_API_KEY?.trim()) });
  } catch (error) {
    console.error("Discover error:", error.message);
    return Response.json({ error: error.message || "Unable to find people at that company" }, { status: 500 });
  }
}
