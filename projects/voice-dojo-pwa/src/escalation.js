// ─── AI ESCALATION ───────────────────────────────────────────────────────────
//
// Called only when the local scorer's confidence is below threshold,
// OR when the user explicitly requests deep feedback.
//
// Passes the local scores as context so Claude isn't starting blind —
// it can validate, adjust, or add nuance on top of what we already know.
// This keeps the prompt tight and the token count low.

const ESCALATION_PROMPT = `You are a voice acting coach in a gamified training app. 
A deterministic scorer has already analysed the transcript and produced preliminary scores.
Your job is to validate these, adjust if needed, and add the nuanced coaching the algorithm can't.

Respond ONLY with valid JSON, no markdown fences:
{
  "overall": <1-10, consider the local score as a starting point but trust your own judgement>,
  "character_accuracy": <1-10>,
  "commitment": <1-10>,
  "distinctiveness": <1-10>,
  "verdict": "<10 words max, punchy director gut reaction>",
  "strengths": ["<specific thing that worked — reference actual words if possible>"],
  "notes": ["<specific coaching note>", "<optional second note>"],
  "xp_earned": <use provided xp value — do not change this>,
  "scoringMethod": "ai"
}

Be specific. 7 is genuinely good. 9+ is rare. A personal best deserves acknowledgement.`;

export const escalateToAI = async (character, line, transcript, localResult, prevBest, xpEarned, userApiKey = null) => {
  const apiKey = userApiKey || null; // null = use proxy (Anthropic handles auth in Claude artifacts)

  const prompt = `Character: ${character.name}
Character type: ${character.voiceRef.characterType}
Voice notes: ${character.notes}
Target line: "${line}"
Transcript: "${transcript}"
Previous best score: ${prevBest}
XP to award: ${xpEarned}

Preliminary local scores (algorithm — use as starting context):
  Word accuracy: ${Math.round(localResult.wordAccuracy * 100)}%
  Key phrase score: ${Math.round(localResult.keyPhraseScore * 100)}%
  Signature word score: ${Math.round(localResult.sigWordScore * 100)}%
  Local overall estimate: ${localResult.score}/10
  Scorer confidence: ${Math.round(localResult.confidence * 100)}% (reason this was escalated: confidence below threshold)

Local coaching notes already identified:
  Strengths: ${localResult.strengths.join("; ")}
  Areas to work on: ${localResult.notes.join("; ")}`;

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001", // Haiku: much cheaper, fast, sufficient for coaching notes
      max_tokens: 600, // tight — we don't need essays
      system: ESCALATION_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content.map(b => b.text || "").join("");
  const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  return { ...parsed, scoringMethod: "ai" };
};
