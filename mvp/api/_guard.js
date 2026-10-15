/*
 * Shared request checks for the prototype's API routes. Files starting with
 * "_" are not deployed as routes by Vercel.
 *
 * This is NOT authentication. Until real sign-in exists, it only:
 *   - rejects requests that don't come from this site's own pages (stops other
 *     websites from using your API keys through visitors' browsers), and
 *   - rate-limits each IP address (best effort: each serverless instance keeps
 *     its own counts).
 * A script can fake the Origin header, so turn on Vercel Deployment Protection
 * (Project Settings → Deployment Protection) for any deployment that has your
 * ANTHROPIC_API_KEY or OPENAI_API_KEY set. See README "Protect the API routes".
 */
const hits = new Map();

function hostOf(url) {
  try { return new URL(url).host; } catch (e) { return ""; }
}

module.exports = function guard(req, res, { limit, windowMs }) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const from = hostOf(req.headers.origin || req.headers.referer || "");
  const allowed = (process.env.GUAD_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!from || (from !== host && !allowed.includes(from))) {
    res.status(403).json({ error: "This endpoint only accepts requests from the Guad app." });
    return false;
  }

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    res.setHeader("Retry-After", String(Math.ceil((windowMs - (now - recent[0])) / 1000)));
    res.status(429).json({ error: "Too many requests. Try again in a few minutes." });
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
};
