function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { first: parts[0], last: parts[parts.length - 1] };
}

export function hunterDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0];
  }
}

export async function hunterFindEmails(leads, domain, limit = 10) {
  const apiKey = process.env.HUNTER_API_KEY;
  const host = hunterDomain(domain);
  if (!apiKey || !host) return leads;

  const next = [];
  let used = 0;
  for (const lead of leads) {
    const names = splitName(lead["First name, Last name"]);
    if (lead.Email || !names || used >= limit) {
      next.push(lead);
      continue;
    }

    try {
      const url = new URL("https://api.hunter.io/v2/email-finder");
      url.searchParams.set("domain", host);
      url.searchParams.set("first_name", names.first);
      url.searchParams.set("last_name", names.last);
      url.searchParams.set("api_key", apiKey);
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const payload = await response.json();
      if (response.status === 429) {
        next.push(lead, ...leads.slice(next.length + 1));
        break;
      }
      used += 1;
      next.push(payload?.data?.email ? { ...lead, Email: payload.data.email } : lead);
    } catch {
      next.push(lead);
    }
  }
  return next;
}

export async function hunterFindEmail({ firstName, lastName, domain, company }) {
  const apiKey = process.env.HUNTER_API_KEY;
  const host = hunterDomain(domain);
  const firm = String(company || "").trim();
  if (!apiKey || (!host && !firm)) return null;

  const url = new URL("https://api.hunter.io/v2/email-finder");
  if (host) url.searchParams.set("domain", host);
  if (firm) url.searchParams.set("company", firm);
  url.searchParams.set("first_name", firstName);
  url.searchParams.set("last_name", lastName);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const payload = await response.json();
  if (!response.ok || !payload?.data?.email) return null;
  return { email: payload.data.email, score: payload.data.score, domain: host };
}
