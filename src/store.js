/*
 * Guad data store.
 *
 * DEVELOPMENT ONLY: this keeps everything in the browser's localStorage so the
 * app runs with no backend. Do NOT enter real client information while this
 * file is in use. For production, replace load/save/log with calls to a
 * HIPAA-ready backend (encrypted database, signed BAA, per-user auth, audit log).
 * Keep the same shape so the UI code does not need to change.
 */
(function (global) {
  "use strict";
  var KEY = "guad-data-v1";

  function emptyState() {
    return {
      version: 1,
      agency: null,            // { name }
      homes: [],               // { id, name, address, lat, lng, radius }
      staff: [],               // { id, name, ini, role: "caregiver"|"supervisor"|"admin", medCert, homeIds: [] }
      clients: [],             // { id, homeId, name, first, ini, info, health:{...}, goals:[], behaviors:[], meds:[], medHistory:[], caseNotes:[] }
      schedule: {},            // { [homeId]: { [yyyy-mm-dd]: { am|pm|on: { staff, status:"filled"|"open"|"filling" } } } }
      notes: [], incidents: [], mar: [], health: [],
      attendance: {},          // { [yyyy-mm-dd]: { [clientId]: { services:[], by, at } } }
      msgs: [],                // { id, homeId, from, text, at }
      coverage: [],            // callout and open-shift requests handled by Lomi
      clocks: [],              // { id, staffId, homeId, inAt, outAt, lat, lng, distance, verified, manual }
      events: [],              // append-only activity log used for analytics: { type, at, homeId, staffId, ... }
      session: { userId: null }
    };
  }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && s.version === 1) return s;
    } catch (e) {}
    return emptyState();
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function uid() { return Math.random().toString(36).slice(2, 10); }

  function log(state, type, data) {
    var e = Object.assign({ type: type, at: new Date().toISOString() }, data || {});
    state.events.push(e);
    return e;
  }

  global.GuadStore = { load: load, save: save, reset: emptyState, uid: uid, log: log };
})(window);
