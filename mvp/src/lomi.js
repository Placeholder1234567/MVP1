/*
 * Lomi client. Sends tasks to /api/lomi on your server.
 * When the page runs inside a Claude artifact preview, it uses that
 * preview's built-in model access instead. If neither is available it
 * falls back to simple rules, and tells the caller via { fallback: true }.
 */
(function (global) {
  "use strict";
  var P = global.GuadPrompts;
  var samplePromise = null;

  function previewSampler() {
    if (!samplePromise) {
      samplePromise = (global.claude && global.claude.use)
        ? global.claude.use("sample").catch(function () { return null; })
        : Promise.resolve(null);
    }
    return samplePromise;
  }

  function parseJson(text) {
    var t = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t);
  }

  async function ask(task, payload) {
    var sampler = await previewSampler();
    if (sampler) {
      var r = await sampler(P.build[task](payload), { modelTier: "quick" });
      return r.text;
    }
    var res = await fetch("/api/lomi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ task: task }, payload))
    });
    if (!res.ok) throw new Error("lomi_unavailable");
    return (await res.json()).text;
  }

  /* ---------- rules-based fallback ---------- */
  var VAGUE = ["was fine", "was good", "was normal", "was bad", "acted out", "had an attitude", "had a bad attitude", "behaved", "was difficult", "was a handful"];
  var INC = /\b(fell|fall|slipped|slip|tripped|hurt|injur\w*|bleed\w*|bruise\w*|hospital|911|emergency|wrong med\w*|missed (his|her|their) med\w*|ran off|left the house|eloped|seizure)\b/i;

  function rules(task, p) {
    var text = p.text || "";
    var se = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean), low = text.toLowerCase();
    var flags = VAGUE.filter(function (v) { return low.indexOf(v) >= 0; })
      .map(function (v) { return { phrase: v, tip: "“" + v + "” is too vague for the record. Describe what you saw or heard." }; });
    var m = text.match(INC), inc = { detected: !!m, summary: m ? (se.filter(function (s) { return INC.test(s); })[0] || "") : "" };
    if (task === "behavior") return { before: "", behavior: text, behaviorType: "", response: "", outcome: "", duration: "", flags: flags, incident: inc };
    var o = { activities: [], meals: [], mood: [], health: [] };
    se.forEach(function (s) {
      var l = s.toLowerCase();
      if (/\b(ate|lunch|dinner|breakfast|snack|food|drank|meal)\b/.test(l)) o.meals.push(s);
      else if (INC.test(l) || /\b(med\w*|pain|sick|doctor|nurse|temperature)\b/.test(l)) o.health.push(s);
      else if (/\b(mood|happy|upset|fine|calm|smil\w*|angry|sad|laugh\w*|anxious|yell\w*)\b/.test(l)) o.mood.push(s);
      else o.activities.push(s);
    });
    return { activities: o.activities.join(" "), meals: o.meals.join(" "), mood: o.mood.join(" "), health: o.health.join(" "),
      goals: (p.goals || []).map(function (g) { return { id: g.id, trials: [], notAttempted: false, reason: "" }; }), flags: flags, incident: inc };
  }

  async function draft(task, payload) {
    try { return { data: parseJson(await ask(task, payload)), fallback: false }; }
    catch (e) { return { data: rules(task, payload), fallback: true }; }
  }

  async function summarize(data) {
    try { return { text: (await ask("summary", { data: data })).trim(), fallback: false }; }
    catch (e) { return { text: "", fallback: true }; }
  }

  global.Lomi = { draft: draft, summarize: summarize, LEVELS: P.LEVELS };
})(window);
