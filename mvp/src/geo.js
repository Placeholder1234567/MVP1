/* Guad location helpers: find which home a caregiver is at. */
(function (global) {
  "use strict";

  // Distance in meters between two lat/lng points (haversine formula).
  function distance(lat1, lng1, lat2, lng2) {
    var R = 6371000, r = Math.PI / 180;
    var dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  // Resolves { lat, lng, accuracy } or rejects with a plain-language message.
  function currentPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject("This device can't share its location."); return; }
      navigator.geolocation.getCurrentPosition(
        function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }); },
        function (err) {
          reject(err && err.code === 1 ? "Location permission was turned off." : "Couldn't get your location right now.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  // Ranks homes by distance from a position. Homes without coordinates go last.
  function rankHomes(homes, pos) {
    return homes.map(function (h) {
      var d = (pos && h.lat != null && h.lng != null) ? distance(pos.lat, pos.lng, h.lat, h.lng) : null;
      return { home: h, distance: d, inside: d != null && d <= (h.radius || 150) };
    }).sort(function (a, b) {
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });
  }

  function formatDistance(m) {
    if (m == null) return "";
    return m < 1000 ? m + " m away" : (m / 1609.34).toFixed(1) + " mi away";
  }

  global.GuadGeo = { distance: distance, currentPosition: currentPosition, rankHomes: rankHomes, formatDistance: formatDistance };
})(window);
