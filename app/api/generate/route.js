import { SONNET, claude, clip, parseJson, textFrom } from "../../../lib/claude";

const draftSystem = `You write short personalized cold emails for job seekers.

Return ONLY valid JSON with keys subject and body. No markdown, no backticks.

Rules:
- Open with something specific about their company or recent news
- Mention one specific thing from the job seeker background that is relevant
- This is a job application, not a sales pitch
- Ask for a 15-min call
- Max 5 sentences for a first note, max 4 for a follow-up
- Each sentence on its own line with a blank line between them
- Put "Best," and "[Your Name]" each on their own separate lines at the end
- Do not use dashes, bullet points, or hyphens anywhere in the email
- Write in flowing prose only
- For follow-ups: assume they already received a first note; do not re-pitch from scratch; give one new reason to reply`;

export async function POST(request) {
  try {
    const { lead, background, followUp } = await request.json();
    const client = claude();

    if (!lead || typeof lead !== "object") {
      return Response.json({ error: "A lead is required before generating a draft" }, { status: 400 });
    }

    const facts = [
      `Name: ${clip(lead.name, 80)}`,
      `Company: ${clip(lead.company, 80)}`,
      `Title: ${clip(lead.title, 80)}`,
      `What they do: ${clip(lead.summary, 280)}`,
      `GTM challenge: ${clip(lead.challenge, 220)}`,
      `Recent news: ${clip(lead.news, 220)}`,
    ].join("\n");

    const response = await client.messages.create({
      model: SONNET,
      max_tokens: 800,
      system: [
        { type: "text", text: draftSystem, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Job seeker background:\n${clip(background, 1200)}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{
        role: "user",
        content: `${followUp ? "Write a follow-up email." : "Write a first cold email."}\n\n${facts}`,
      }],
    });

    return Response.json(parseJson(textFrom(response)));
  } catch (error) {
    console.error("Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
