// ============================================================
// AM-CRAFT AUTH MODULE v1.4
// ============================================================
// Universal Google Sign-In gate for all AM-Craft GitHub Pages apps.
//
// USAGE: Add this ONE line to any HTML page <head> or before </body>:
//
//   <script src="https://amcraft-it.github.io/auth/auth.js"></script>
//
// CONFIGURATION: Edit the CONFIG object below.
//
// CHANGELOG:
//   v1.4 - Session now expires at the next local 00:00 (midnight) instead
//          of a rolling 24h window, so everyone re-authenticates once at
//          the start of each work day. SESSION_TTL is retained only as a
//          safety cap; expiry is governed by the stored "exp" timestamp.
//   v1.3 - "Auth once a day" persistence:
//          * Session moved from sessionStorage -> localStorage, so it
//            survives tab closes / browser restarts and is shared across
//            all tools on the same origin (sign in once, all apps unlock).
//          * SESSION_TTL raised to 24h.
//          * Silent background re-verify: on load, a valid stored session
//            shows the page immediately (no login screen), then re-checks
//            the allowlist in the background. Only an explicit "not
//            authorized" result signs the user out -- transient failures
//            (cold start / network) leave them signed in.
//            NOTE: the stored Google ID token expires ~1h after issue, so
//            the re-check can only truly re-validate auth within that first
//            hour; after that it rides on the local 24h session. True all-
//            day server-side revocation would require an OAuth refresh-token
//            backend, which GIS does not provide to a pure frontend.
//   v1.2 - Hardened jsonpCall: script tag removed only when the request
//          finishes (callback/timeout/error), not on a blind 500ms timer.
//          One automatic retry (800ms) so cold-start blips surface as
//          "Network error" only after TWO consecutive failures.
//   v1.1 - Verification switched from fetch POST to JSONP GET (fixes the
//          intermittent "Authentication required" / HTTP 404 caused by the
//          POST 302 redirect landing in doGet's AUTH_ENFORCE guard).
//          JWT payload decoded UTF-8 safe (fixes mojibake names).
// ============================================================

(function() {
  'use strict';

  // --- CONFIG ---
  var AUTH_CONFIG = {
    GOOGLE_CLIENT_ID: '51370093929-sh4ts8p1ipu41u77j9vplq8tddp3sc8m.apps.googleusercontent.com',  // <- Your OAuth Client ID
    VERIFY_URL: 'https://script.google.com/macros/s/AKfycbzErJwC-vAczZ4u8piJzdVgtCCeQlGy7IEfT5yPxoEAvqc4o0jWu3d4dRWaIj9vQy_f/exec',
    SESSION_KEY: 'amcraft_auth',
    SESSION_TTL: 24 * 60 * 60 * 1000,  // safety cap only; real expiry = next local midnight (see nextMidnightTs)
    FONT_URL: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
  };

  // --- SESSION (localStorage: persists across tabs + restarts, shared per origin) ---
  // Expiry is the NEXT local midnight, so a login lasts until 00:00 and
  // everyone re-authenticates once at the start of the work day. SESSION_TTL
  // is kept only as an absolute safety cap (e.g. a clock-skew guard).
  function nextMidnightTs() {
    var d = new Date();
    d.setHours(24, 0, 0, 0); // rolls to 00:00:00.000 of the next day, local time
    return d.getTime();
  }

  function getSession() {
    try {
      var raw = localStorage.getItem(AUTH_CONFIG.SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      var now = Date.now();
      // Expire at stored midnight, and hard-cap by TTL as a fallback.
      if ((s.exp && now >= s.exp) || (s.ts && now - s.ts > AUTH_CONFIG.SESSION_TTL)) {
        localStorage.removeItem(AUTH_CONFIG.SESSION_KEY);
        return null;
      }
      return s;
    } catch(e) { return null; }
  }

  function setSession(data) {
    try {
      data.ts = Date.now();
      data.exp = nextMidnightTs();
      localStorage.setItem(AUTH_CONFIG.SESSION_KEY, JSON.stringify(data));
    } catch(e) {}
  }

  function clearSession() {
    try { localStorage.removeItem(AUTH_CONFIG.SESSION_KEY); } catch(e) {}
  }

  // --- JSONP (hardened: clean teardown + one retry on transient failure) ---
  var _jcb = 0;
  function jsonpCall(params, _retried) {
    return new Promise(function(resolve, reject) {
      var cb = '__acb' + (_jcb++);
      var s = document.createElement('script');
      var done = false;

      function cleanup() {
        if (done) return;
        done = true;
        clearTimeout(t);
        delete window[cb];
        try { s.remove(); } catch(e) {}
      }

      var t = setTimeout(function() {
        cleanup();
        reject(new Error('Timeout'));
      }, 20000);

      window[cb] = function(d) {
        cleanup();
        resolve(d);
      };

      var qs = 'callback=' + cb;
      for (var k in params) qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);

      s.onerror = function() {
        cleanup();
        // One automatic retry -- covers Apps Script cold-start / transient edge failures
        if (!_retried) {
          setTimeout(function() {
            jsonpCall(params, true).then(resolve, reject);
          }, 800);
        } else {
          reject(new Error('Network error'));
        }
      };

      s.src = AUTH_CONFIG.VERIFY_URL + '?' + qs;
      document.body.appendChild(s);
    });
  }

  // --- STYLES ---
  var CSS = '' +
    '#amcraft-auth-overlay {' +
    '  position:fixed;inset:0;z-index:99999;' +
    '  background:linear-gradient(145deg,#090d4a 0%,#0E1165 40%,#1a1d7a 100%);' +
    '  display:flex;align-items:center;justify-content:center;' +
    '  font-family:"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif;' +
    '  transition:opacity 0.5s ease,visibility 0.5s ease;' +
    '}' +
    '#amcraft-auth-overlay.hidden{opacity:0;visibility:hidden;pointer-events:none;}' +

    '#amcraft-auth-card {' +
    '  background:#fff;border-radius:16px;' +
    '  box-shadow:0 20px 60px rgba(0,0,0,0.3);' +
    '  padding:48px 44px;text-align:center;' +
    '  max-width:400px;width:90vw;' +
    '  animation:amcAuthIn 0.6s cubic-bezier(0.16,1,0.3,1);' +
    '}' +
    '@keyframes amcAuthIn{from{transform:translateY(30px) scale(0.96);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}' +

    '.amc-auth-logo{font-size:22px;font-weight:700;color:#0E1165;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;}' +
    '.amc-auth-logo span{color:#3B82F6;font-weight:400;}' +
    '.amc-auth-sub{font-size:13px;color:#94A3B8;margin-bottom:32px;font-weight:500;}' +
    '.amc-auth-divider{width:40px;height:3px;background:linear-gradient(90deg,#0E1165,#3B82F6);border-radius:2px;margin:0 auto 28px;}' +
    '.amc-auth-msg{font-size:15px;color:#475569;margin-bottom:28px;line-height:1.5;}' +

    '.amc-auth-gsi-wrap{display:flex;justify-content:center;margin-bottom:16px;}' +

    '.amc-auth-loading{display:none;flex-direction:column;align-items:center;gap:12px;margin-top:16px;}' +
    '.amc-auth-loading.visible{display:flex;}' +
    '.amc-auth-spinner{width:28px;height:28px;border:3px solid #E2E5F1;border-top-color:#0E1165;border-radius:50%;animation:amcSpin 0.7s linear infinite;}' +
    '@keyframes amcSpin{to{transform:rotate(360deg)}}' +
    '.amc-auth-loading-text{font-size:13px;color:#94A3B8;}' +

    '.amc-auth-user{display:none;flex-direction:column;align-items:center;gap:8px;margin-top:20px;}' +
    '.amc-auth-user.visible{display:flex;}' +
    '.amc-auth-avatar{width:44px;height:44px;border-radius:50%;border:2px solid #E2E5F1;}' +
    '.amc-auth-name{font-weight:600;font-size:14px;color:#0F172A;}' +
    '.amc-auth-email{font-size:12px;color:#94A3B8;font-family:"JetBrains Mono",monospace;}' +

    '.amc-auth-error{color:#EF4444;font-size:13px;margin-top:16px;display:none;padding:10px 14px;background:#FEF2F2;border-radius:6px;line-height:1.4;}' +
    '.amc-auth-error.visible{display:block;}' +

    '.amc-auth-footer{margin-top:28px;font-size:11px;color:#94A3B8;}' +

    '#amcraft-auth-pill{' +
    '  position:fixed;top:8px;right:12px;z-index:99998;' +
    '  display:none;align-items:center;gap:8px;' +
    '  background:#0E1165;color:#fff;' +
    '  padding:5px 14px 5px 5px;border-radius:22px;' +
    '  font-family:"DM Sans",-apple-system,sans-serif;' +
    '  font-size:12px;font-weight:500;cursor:pointer;' +
    '  box-shadow:0 2px 12px rgba(14,17,101,0.25);' +
    '  transition:all 0.2s ease;' +
    '}' +
    '#amcraft-auth-pill:hover{background:#1a1d7a;box-shadow:0 4px 16px rgba(14,17,101,0.35);}' +
    '#amcraft-auth-pill.visible{display:flex;}' +
    '#amcraft-auth-pill img{width:24px;height:24px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.3);}' +

    '#amcraft-auth-pill-menu{' +
    '  display:none;position:fixed;z-index:99999;' +
    '  background:#fff;border-radius:8px;' +
    '  box-shadow:0 8px 32px rgba(14,17,101,0.15);' +
    '  padding:8px 0;min-width:180px;' +
    '  font-family:"DM Sans",-apple-system,sans-serif;' +
    '}' +
    '#amcraft-auth-pill-menu.open{display:block;}' +
    '.amc-pill-menu-email{padding:8px 16px;font-size:11px;color:#94A3B8;font-family:"JetBrains Mono",monospace;border-bottom:1px solid #ECEEF5;margin-bottom:4px;}' +
    '.amc-pill-menu-item{padding:9px 16px;font-size:13px;color:#475569;cursor:pointer;transition:background 0.15s;}' +
    '.amc-pill-menu-item:hover{background:#F1F3F9;color:#0F172A;}' +
  '';

  // --- HTML ---
  var HTML = '' +
    '<div id="amcraft-auth-overlay">' +
      '<div id="amcraft-auth-card">' +
        '<div class="amc-auth-logo">AM-CRAFT <span>|</span></div>' +
        '<div class="amc-auth-sub">Secure Access</div>' +
        '<div class="amc-auth-divider"></div>' +
        '<div class="amc-auth-msg">Sign in with your company Google account to continue.</div>' +
        '<div class="amc-auth-gsi-wrap"><div id="amc-gsi-btn"></div></div>' +
        '<div class="amc-auth-loading" id="amc-auth-loading">' +
          '<div class="amc-auth-spinner"></div>' +
          '<div class="amc-auth-loading-text">Verifying access...</div>' +
        '</div>' +
        '<div class="amc-auth-user" id="amc-auth-user">' +
          '<img class="amc-auth-avatar" id="amc-auth-avatar" src="" alt="">' +
          '<div class="amc-auth-name" id="amc-auth-name"></div>' +
          '<div class="amc-auth-email" id="amc-auth-email"></div>' +
        '</div>' +
        '<div class="amc-auth-error" id="amc-auth-error"></div>' +
        '<div class="amc-auth-footer">Access restricted to authorized AM-Craft personnel</div>' +
      '</div>' +
    '</div>' +
    '<div id="amcraft-auth-pill">' +
      '<img id="amc-pill-avatar" src="" alt="">' +
      '<span id="amc-pill-name"></span>' +
    '</div>' +
    '<div id="amcraft-auth-pill-menu">' +
      '<div class="amc-pill-menu-email" id="amc-pill-email"></div>' +
      '<div class="amc-pill-menu-item" id="amc-pill-signout">Sign out</div>' +
    '</div>';

  // --- INJECT ---
  function injectFont() {
    if (document.querySelector('link[href*="DM+Sans"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = AUTH_CONFIG.FONT_URL;
    document.head.appendChild(link);
  }

  function injectGSI() {
    return new Promise(function(resolve) {
      if (window.google && window.google.accounts) { resolve(); return; }
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = resolve;
      s.onerror = function() { resolve(); }; // will fail gracefully later
      document.head.appendChild(s);
    });
  }

  function injectUI() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.innerHTML = HTML;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }

  // --- CORE AUTH LOGIC ---
  var authState = {
    token: null,
    user: null
  };

  window.amcraftAuth = {
    getUser: function() { return authState.user; },
    getToken: function() { return authState.token; },
    signOut: signOut,
    isAuthenticated: function() { return !!authState.token; }
  };

  function hidePageContent() {
    document.documentElement.style.visibility = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  function showPageContent() {
    document.documentElement.style.visibility = '';
    document.documentElement.style.overflow = '';
  }

  function showOverlay() {
    var ov = document.getElementById('amcraft-auth-overlay');
    if (ov) ov.classList.remove('hidden');
  }

  function hideOverlay() {
    var ov = document.getElementById('amcraft-auth-overlay');
    if (ov) ov.classList.add('hidden');
    showPageContent();
  }

  function showPill(user) {
    var pill = document.getElementById('amcraft-auth-pill');
    document.getElementById('amc-pill-avatar').src = user.picture || '';
    document.getElementById('amc-pill-name').textContent = user.name.split(' ')[0];
    document.getElementById('amc-pill-email').textContent = user.email;
    pill.classList.add('visible');
  }

  function initGSIButton() {
    if (!window.google || !window.google.accounts) return;
    google.accounts.id.initialize({
      client_id: AUTH_CONFIG.GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: true,
      cancel_on_tap_outside: false
    });
    google.accounts.id.renderButton(
      document.getElementById('amc-gsi-btn'),
      { theme: 'outline', size: 'large', width: 280, text: 'signin_with', shape: 'rectangular' }
    );
  }

  // --- Decode a JWT payload, UTF-8 safe (fixes mojibake in non-ASCII names) ---
  function decodeJwtPayload(idToken) {
    var part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (part.length % 4) part += '=';
    var bin = atob(part);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  }

  function handleCredentialResponse(response) {
    var idToken = response.credential;

    // Decode JWT for user info (UTF-8 safe)
    var user;
    try {
      var payload = decodeJwtPayload(idToken);
      user = { name: payload.name, email: payload.email, picture: payload.picture };
    } catch (e) {
      showAuthError('Could not read sign-in token.');
      return;
    }

    // Show loading
    document.getElementById('amc-gsi-btn').style.display = 'none';
    document.getElementById('amc-auth-loading').classList.add('visible');
    document.getElementById('amc-auth-user').classList.add('visible');
    document.getElementById('amc-auth-avatar').src = user.picture || '';
    document.getElementById('amc-auth-name').textContent = user.name;
    document.getElementById('amc-auth-email').textContent = user.email;
    document.getElementById('amc-auth-error').classList.remove('visible');

    // Verify with backend -- JSONP GET (routes to doGet's verifyAuth branch,
    // above the AUTH_ENFORCE guard; retries once on cold-start blip).
    jsonpCall({ action: 'verifyAuth', id_token: idToken })
      .then(function(res) {
        if (res && res.success && res.authorized) {
          authState.token = idToken;
          authState.user = user;
          setSession({ token: idToken, user: user });
          onAuthSuccess(user);
        } else {
          showAuthError((res && res.message) || 'Access denied.');
        }
      })
      .catch(function(err) {
        showAuthError('Verification failed: ' + err.message);
      });
  }

  // --- Silent background re-verify of a restored session ---
  // Shows the page immediately from the stored session, then re-checks the
  // allowlist. Only an explicit "not authorized" signs the user out; a
  // transient failure (cold start / network / expired token) is ignored so
  // a blip never locks out a legit user.
  function backgroundReverify(session) {
    if (!session || !session.token) return;
    jsonpCall({ action: 'verifyAuth', id_token: session.token })
      .then(function(res) {
        // Only act on a definitive, successful "you are NOT authorized".
        // (res.success === true means the backend actually ran the check.
        //  An expired token returns success:true, authorized:false with a
        //  token-related message -- we do NOT sign out on that, because the
        //  local session is still within its 24h window and the token
        //  expiring after ~1h is expected, not a revocation.)
        if (res && res.success === true && res.authorized === false) {
          var msg = (res.message || '').toLowerCase();
          var looksLikeTokenExpiry =
            msg.indexOf('token') !== -1 ||
            msg.indexOf('expired') !== -1 ||
            msg.indexOf('invalid') !== -1;
          if (!looksLikeTokenExpiry) {
            // Genuine revocation: email removed from allowlist.
            forceReauth();
          }
        }
        // Any thrown error (timeout/network) is swallowed -> stay signed in.
      })
      .catch(function() { /* transient -- ignore, keep local session */ });
  }

  // Sign out silently and drop to the login screen (used by revocation check).
  function forceReauth() {
    authState.token = null;
    authState.user = null;
    clearSession();

    document.getElementById('amcraft-auth-pill').classList.remove('visible');
    document.getElementById('amcraft-auth-pill-menu').classList.remove('open');
    document.getElementById('amc-auth-user').classList.remove('visible');
    document.getElementById('amc-auth-loading').classList.remove('visible');
    document.getElementById('amc-gsi-btn').style.display = '';
    var err = document.getElementById('amc-auth-error');
    err.textContent = 'Your access has changed. Please sign in again.';
    err.classList.add('visible');

    hidePageContent();
    showOverlay();
    injectGSI().then(function() { initGSIButton(); });

    window.dispatchEvent(new CustomEvent('amcraft-auth-signout'));
  }

  function showAuthError(msg) {
    document.getElementById('amc-auth-loading').classList.remove('visible');
    document.getElementById('amc-gsi-btn').style.display = '';
    var el = document.getElementById('amc-auth-error');
    el.textContent = msg;
    el.classList.add('visible');
  }

  function onAuthSuccess(user) {
    hideOverlay();
    showPill(user);
    window.dispatchEvent(new CustomEvent('amcraft-auth-success', { detail: { user: user, token: authState.token } }));
  }

  function signOut() {
    if (window.google && window.google.accounts) {
      google.accounts.id.disableAutoSelect();
    }
    authState.token = null;
    authState.user = null;
    clearSession();

    document.getElementById('amcraft-auth-pill').classList.remove('visible');
    document.getElementById('amcraft-auth-pill-menu').classList.remove('open');
    document.getElementById('amc-auth-loading').classList.remove('visible');
    document.getElementById('amc-auth-user').classList.remove('visible');
    document.getElementById('amc-auth-error').classList.remove('visible');
    document.getElementById('amc-gsi-btn').style.display = '';

    hidePageContent();
    showOverlay();
    initGSIButton();

    window.dispatchEvent(new CustomEvent('amcraft-auth-signout'));
  }

  // --- PILL MENU ---
  function setupPillMenu() {
    var pill = document.getElementById('amcraft-auth-pill');
    var menu = document.getElementById('amcraft-auth-pill-menu');

    pill.addEventListener('click', function(e) {
      e.stopPropagation();
      var rect = pill.getBoundingClientRect();
      menu.style.top = (rect.bottom + 6) + 'px';
      menu.style.right = (window.innerWidth - rect.right) + 'px';
      menu.classList.toggle('open');
    });

    document.getElementById('amc-pill-signout').addEventListener('click', function() {
      menu.classList.remove('open');
      signOut();
    });

    document.addEventListener('click', function(e) {
      if (!e.target.closest('#amcraft-auth-pill-menu') && !e.target.closest('#amcraft-auth-pill')) {
        menu.classList.remove('open');
      }
    });
  }

  // --- INIT ---
  function init() {
    hidePageContent();
    injectFont();
    injectUI();
    setupPillMenu();

    // Valid stored session -> show page immediately, re-verify in background
    var session = getSession();
    if (session && session.token && session.user) {
      authState.token = session.token;
      authState.user = session.user;
      onAuthSuccess(session.user);
      backgroundReverify(session);   // silent allowlist re-check
      return;
    }

    // No session -> show login
    showOverlay();
    showPageContent();

    injectGSI().then(function() {
      initGSIButton();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
