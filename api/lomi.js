/*
 * POST /api/lomi  (Vercel serverless function)
 * Body: { task: "shift" | "behavior" | "summary", ...fields for that task }
 * Returns: { text } on success, { error } otherwise.
 *
 * Set ANTHROPIC_API_KEY in your Vercel project settings (never in code).
 * Before sending real client information through this endpoint you need:
 *   - a signed BAA with your AI provider and your host,
 *   - real user authentication (only signed-in staff may call this),
 *   - rate limiting and request logging without storing note text in logs.
 */
const { build } = require("../src/prompts.js");
const guard = require("./_guard.js");

const MODEL = process.env.LOMI_MODEL || "claude-sonnet-5-5";
const MAX_INPUT = 8000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "Lomi isn't configured on the server." });

  // Not authentication (there are no accounts yet): same-site check + rate limit. See _guard.js.
  // TODO: verify the caller's session here once authentication is added.
  if (!guard(req, res, { limit: 30, windowMs: 10 * 60 * 1000 })) return;

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const task = body.task;
  if (!build[task]) return res.status(400).json({ error: "Unknown task." });
  if (JSON.stringify(body).length > MAX_INPUT) return res.status(413).json({ error: "Too much text for one request." });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        messages: [{ role: "user", content: build[task](body) }]
      })
    });
    if (!r.ok) return res.status(502).json({ error: "Lomi couldn't respond right now." });
    const data = await r.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: "Lomi couldn't respond right now." });
  }
};
