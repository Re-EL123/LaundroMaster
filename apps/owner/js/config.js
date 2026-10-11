// Public runtime configuration (no secrets — publishable values only).
window.API_BASE = 'https://laundromaster-sable.vercel.app/api';
// Set these to your Supabase project publishable values for client-side auth.
window.SUPABASE_URL = 'https://rkecjvqupwizqimijaii.supabase.co';
window.SUPABASE_ANON_KEY = '';

// Warm the API/Supabase connections before the first request so TLS setup is
// already underway when the app fires its initial data fetches.
(function () {
  try {
    var origins = [window.API_BASE, window.SUPABASE_URL];
    var seen = {};
    origins.forEach(function (raw) {
      if (!raw) return;
      var origin;
      try { origin = new URL(raw, location.href).origin; } catch (e) { return; }
      if (origin === location.origin || seen[origin]) return;
      seen[origin] = true;
      ['preconnect', 'dns-prefetch'].forEach(function (rel) {
        var link = document.createElement('link');
        link.rel = rel;
        link.href = origin;
        if (rel === 'preconnect') link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
      });
    });
  } catch (e) { /* ignore */ }
})();
