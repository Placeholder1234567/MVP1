/*
 * POST /api/transcribe
 * Body: { audio: base64 string, mimeType: string }
 *
 * The browser records audio with MediaRecorder so transcription works across
 * browsers instead of depending on SpeechRecognition support.
 */
const guard = require("./_guard.js");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  // Not authentication (there are no accounts yet): same-site check + rate limit. See _guard.js.
  if (!guard(req, res, { limit: 20, windowMs: 10 * 60 * 1000 })) return;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: "Transcription isn't configured on the server." });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (typeof body.audio !== "string" || !body.audio || body.audio.length > 3_500_000) {
      return res.status(400).json({ error: "Audio is missing or too large." });
    }
    const bytes = Buffer.from(body.audio, "base64");
    const type = typeof body.mimeType === "string" && body.mimeType.startsWith("audio/")
      ? body.mimeType.split(";")[0] : "audio/webm";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), "recording." + (type === "audio/mp4" ? "mp4" : "webm"));
    form.append("model", "whisper-1");
    form.append("language", "en");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: "Bearer " + key },
      body: form
    });
    if (!r.ok) return res.status(502).json({ error: "The transcription service couldn't process the recording." });
    const data = await r.json();
    return res.status(200).json({ text: String(data.text || "").trim() });
  } catch (e) {
    return res.status(502).json({ error: "The transcription service is unavailable." });
  }
};
