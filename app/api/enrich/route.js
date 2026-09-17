import { HAIKU, claude, parseJson, textFrom } from "../../../lib/claude";

function cleanHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

export async function POST(request) {
  try {
    const { url } = await request.json();
    const client = claude();
    if (!url) {
      return Response.json({ error: "Add a company website URL first" }, { status: 400 });
    }

    const ask = `Research this company and return exactly this JSON:
{
  "companyName": "",
  "summary": "one sentence describing what the company does",
  "challenge": "one plausible growth or go-to-market challenge grounded in sources, or empty string",
  "news": "one recent product, funding, customer, hiring, or company signal, or empty string"
}

Use empty strings when a field is not supported. Do not invent facts.
Company: ${url}`;

    try {
      const response = await client.messages.create({
        model: HAIKU,
        max_tokens: 800,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        system: "Research a company from the public web. Return only valid JSON.",
        messages: [{ role: "user", content: ask }],
      });
      return Response.json(parseJson(textFrom(response)));
    } catch (searchError) {
      const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const websiteResponse = await fetch(normalizedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Warmly/1.0)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!websiteResponse.ok) throw searchError;
      const pageText = cleanHtml(await websiteResponse.text());
      const response = await client.messages.create({
        model: HAIKU,
        max_tokens: 800,
        system: "Extract factual company context from public website text. Return only valid JSON.",
        messages: [{ role: "user", content: `${ask}\n\nWebsite text:\n${pageText}` }],
      });
      return Response.json(parseJson(textFrom(response)));
    }
  } catch (error) {
    console.error("Enrichment error:", error.message);
    return Response.json({ error: error.message || "Unable to enrich company" }, { status: 500 });
  }
}
