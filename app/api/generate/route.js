import Anthropic from "@anthropic-ai/sdk";

export async function POST(request) {
  try {
    const { lead, apiKey, background } = await request.json();

    if (!apiKey) {
      return Response.json({ error: "No API key provided" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    const prompt = `Write a cold email for this founder from a job seeker applying for a role.

Founder info:
Name: ${lead.name}
Company: ${lead.company}
Title: ${lead.title}
What they do: ${lead.summary}
GTM Challenge: ${lead.challenge}
Recent News: ${lead.news}

Job seeker background:
${background}

Rules:
- Open with something SPECIFIC about their company or recent news
- Mention ONE specific thing from the job seeker background that is directly relevant to this company
- Make clear this is a job application not a sales pitch
- Ask for a 15-min call
- Max 5 sentences
- Each sentence on its own line with a blank line between them
- Put "Best," and "[Your Name]" each on their own separate lines at the end
- Do NOT use dashes, bullet points, or hyphens anywhere in the email
- Write in flowing prose only

Return ONLY JSON: { "subject": "...", "body": "..." }`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: "You write personalized cold emails for job seekers. Return ONLY valid JSON with subject and body keys. No markdown, no backticks, no dashes, no bullet points.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].text;
    const email = JSON.parse(text);
    return Response.json(email);

  } catch (error) {
    console.error("Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}