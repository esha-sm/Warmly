import Anthropic from "@anthropic-ai/sdk";

export const HAIKU = "claude-haiku-4-5";
export const SONNET = "claude-sonnet-4-6";

export function claude() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing. Add it to .env.local and restart the dev server.");
  }
  return new Anthropic({ apiKey });
}

export function textFrom(response) {
  return (response.content || [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function parseJson(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

export function clip(value, max = 280) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}
