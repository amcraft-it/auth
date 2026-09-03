// ============================================================
// AM-CRAFT AUTH MODULE v2.1
// ============================================================
// Universal Google Sign-In gate for all AM-Craft GitHub Pages apps.
//
// USAGE: <script src="https://amcraft-it.github.io/auth/auth.js"></script>
//
// ---- WHAT v2.1 FIXES ----
// Colleagues were getting "Finishing sign-in" forever when the mint endpoint
// (the dashboard backend) was cold at their login: the single mint attempt
// timed out, no day-token was issued, and it never retried. v2.1 makes the
// mint robust:
//   * mint retries with backoff over ~70s, so a cold start just delays the
//     token by a few seconds instead of blocking writes all day;
//   * on reload, if the session has no day-token yet, it re-mints;
//   * if the stored Google token has expired (so it can't mint), it silently
//     asks Google for a fresh credential and mints with that.
// Pair with the keep-warm trigger on the DASHBOARD backend (the mint endpoint).
//
// CHANGELOG:
//   v2.1 - Robust mint: backoff retries + re-mint on reload + silent
//          credential refresh when the stored token has expired.
//   v2.0 - Client-side domain gate (instant, background, phone-proof);
//          background mint of a day-token exposed via getDayToken().
//   v1.4 - Session expires at next local midnight (once-a-day login).
//   v1.3 - localStorage persistence + silent background re-verify.
//   v1.2 - Hardened jsonpCall (clean teardown + one retry).
//   v1.1 - JSONP verify (fixed HTTP 404) + UTF-8 safe JWT decode.
// ============================================================

(function() {
  'use strict';

  // --- CONFIG ---
  var AUTH_CONFIG = {
    GOOGLE_CLIENT_ID: '51370093929-sh4ts8p1ipu41u77j9vplq8tddp3sc8m.apps.googleusercontent.com',
    VERIFY_URL: 'https://script.google.com/macros/s/AKfycbzErJwC-vAczZ4u8piJzdVgtCCeQlGy7IEfT5yPxoEAvqc4o0jWu3d4dRWaIj9vQy_f/exec',
    ALLOWED_DOMAIN: 'am-craft.com',
    SESSION_KEY: 'amcraft_auth',
    SESSION_TTL: 24 * 60 * 60 * 1000,   // safety cap; real expiry = next local midnight
    FONT_URL: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
  };

  // Backoff schedule (ms after login) for minting the day-token. Spans ~70s so
  // even a full cold start of the mint endpoint is covered by a later attempt.
  var MINT_DELAYS = [0, 1500, 3000, 6000, 12000, 20000, 30000];

  // --- SESSION (localStorage; expires at next local midnight) ---
  function nextMidnightTs() {
    var d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }

  function getSession() {
    try {
      var raw = localStorage.getItem(AUTH_CONFIG.SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      var now = Date.now();
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

  function patchSession(patch) {
    try {
      var raw = localStorage.getItem(AUTH_CONFIG.SESSION_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      for (var k in patch) s[k] = patch[k];
      localStorage.setItem(AUTH_CONFIG.SESSION_KEY, JSON.stringify(s));
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

      var t = setTimeout(function() { cleanup(); reject(new Error('Timeout')); }, 20000);
      window[cb] = function(d) { cleanup(); resolve(d); };

      var qs = 'callback=' + cb;
      for (var k in params) qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);

      s.onerror = function() {
        cleanup();
        if (!_retried) { setTimeout(function() { jsonpCall(params, true).then(resolve, reject); }, 800); }
        else { reject(new Error('Network error')); }
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
          '<div class="amc-auth-loading-text">Signing in...</div>' +
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
      s.onerror = function() { resolve(); };
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

  // --- CORE STATE ---
  var authState = { token: null, user: null, dayToken: null };
  var _gsiInited = false;
  var _minting = false;

  window.amcraftAuth = {
    getUser: function() { return authState.user; },
    getToken: function() { return authState.token; },
    getDayToken: function() { return authState.dayToken; },
    isReady: function() { return !!authState.dayToken; },
    signOut: signOut,
    isAuthenticated: function() { return !!authState.user; }
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
    document.getElementById('amc-pill-name').textContent = (user.name || '').split(' ')[0];
    document.getElementById('amc-pill-email').textContent = user.email;
    pill.classList.add('visible');
  }

  // --- GSI init (shared) ---
  function ensureGSIInitialized() {
    if (!window.google || !window.google.accounts) return false;
    if (!_gsiInited) {
      google.accounts.id.initialize({
        client_id: AUTH_CONFIG.GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: true,
        cancel_on_tap_outside: false
      });
      _gsiInited = true;
    }
    return true;
  }

  function initGSIButton() {
    injectGSI().then(function() {
      if (!ensureGSIInitialized()) return;
      google.accounts.id.renderButton(
        document.getElementById('amc-gsi-btn'),
        { theme: 'outline', size: 'large', width: 280, text: 'signin_with', shape: 'rectangular' }
      );
      try { google.accounts.id.prompt(); } catch (e) {}
    });
  }

  // Silently ask Google for a fresh credential (used when the stored token
  // expired and we still need to mint a day-token).
  function trySilentRefresh() {
    injectGSI().then(function() {
      if (!ensureGSIInitialized()) return;
      try { google.accounts.id.prompt(); } catch (e) {}
    });
  }

  // --- UTF-8 safe JWT decode ---
  function decodeJwtPayload(idToken) {
    var part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (part.length % 4) part += '=';
    var bin = atob(part);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  }

  // --- Client-side gate ---
  function clientGateCheck(payload) {
    if (!payload) return { ok: false, why: 'Could not read sign-in token.' };
    if (payload.aud !== AUTH_CONFIG.GOOGLE_CLIENT_ID)
      return { ok: false, why: 'This sign-in is not for this application.' };
    var iss = payload.iss || '';
    if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com')
      return { ok: false, why: 'Unexpected token issuer.' };
    var now = Math.floor(Date.now() / 1000);
    if (payload.exp && parseInt(payload.exp, 10) < now)
      return { ok: false, why: 'Sign-in expired, please try again.' };
    if (payload.email_verified === false)
      return { ok: false, why: 'Your Google email is not verified.' };
    var email = (payload.email || '').toLowerCase();
    var domain = AUTH_CONFIG.ALLOWED_DOMAIN.toLowerCase();
    var hostedOk = (payload.hd && String(payload.hd).toLowerCase() === domain);
    var emailOk = email.indexOf('@' + domain, email.length - ('@' + domain).length) !== -1;
    if (!hostedOk && !emailOk)
      return { ok: false, why: 'Access restricted to ' + AUTH_CONFIG.ALLOWED_DOMAIN + ' accounts.' };
    return { ok: true, email: email };
  }

  function handleCredentialResponse(response) {
    var idToken = response.credential;

    var payload, user;
    try {
      payload = decodeJwtPayload(idToken);
      user = { name: payload.name, email: payload.email, picture: payload.picture };
    } catch (e) {
      showAuthError('Could not read sign-in token.');
      return;
    }

    var gate = clientGateCheck(payload);
    if (!gate.ok) { showAuthError(gate.why); return; }

    // Grant locally, immediately -- no blocking backend call (phone-proof).
    authState.token = idToken;
    authState.user = user;
    setSession({ token: idToken, user: user });
    onAuthSuccess(user);

    // Mint the day-token with retries (fresh token, so this should succeed).
    _minting = false;
    mintWithRetry(idToken, 0);
  }

  // --- Robust day-token mint (backoff retries + silent refresh) ---
  function mintWithRetry(idToken, i) {
    if (authState.dayToken) return;         // already have it
    if (_minting) return;                   // an attempt is already in flight
    _minting = true;

    jsonpCall({ action: 'verifyAuth', id_token: idToken })
      .then(function(res) {
        _minting = false;
        if (authState.dayToken) return;

        // Definitive "not authorized" that is NOT a token-freshness issue -> sign out.
        if (res && res.success === true && res.authorized === false) {
          var msg = (res.message || '').toLowerCase();
          var tokenish = msg.indexOf('token') !== -1 || msg.indexOf('expired') !== -1 || msg.indexOf('invalid') !== -1;
          if (!tokenish) { forceReauth('Your access has changed. Please sign in again.'); return; }
          // Stored token expired/invalid and we still have no day-token:
          // ask Google (silently) for a fresh credential, then mint with that.
          if (!authState.dayToken) trySilentRefresh();
          return;
        }

        if (res && res.dayToken) {
          authState.dayToken = res.dayToken;
          patchSession({ dayToken: res.dayToken });
          window.dispatchEvent(new CustomEvent('amcraft-auth-ready', { detail: { dayToken: res.dayToken } }));
          return;
        }

        // No token yet, no clear denial (e.g. cold-start hiccup) -> retry.
        scheduleMintRetry(idToken, i);
      })
      .catch(function() {
        _minting = false;
        scheduleMintRetry(idToken, i);     // timeout/network -> retry
      });
  }

  function scheduleMintRetry(idToken, i) {
    if (authState.dayToken) return;
    if (i + 1 >= MINT_DELAYS.length) return; // window exhausted; next page load will retry
    setTimeout(function() { mintWithRetry(idToken, i + 1); }, MINT_DELAYS[i + 1]);
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

  function forceReauth(message) {
    authState.token = null;
    authState.user = null;
    authState.dayToken = null;
    clearSession();
    document.getElementById('amcraft-auth-pill').classList.remove('visible');
    document.getElementById('amcraft-auth-pill-menu').classList.remove('open');
    document.getElementById('amc-auth-user').classList.remove('visible');
    document.getElementById('amc-auth-loading').classList.remove('visible');
    document.getElementById('amc-gsi-btn').style.display = '';
    var err = document.getElementById('amc-auth-error');
    err.textContent = message || 'Please sign in again.';
    err.classList.add('visible');
    hidePageContent();
    showOverlay();
    initGSIButton();
    window.dispatchEvent(new CustomEvent('amcraft-auth-signout'));
  }

  function signOut() {
    if (window.google && window.google.accounts) {
      google.accounts.id.disableAutoSelect();
    }
    authState.token = null;
    authState.user = null;
    authState.dayToken = null;
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

    var session = getSession();
    if (session && session.token && session.user) {
      authState.token = session.token;
      authState.user = session.user;
      authState.dayToken = session.dayToken || null;
      onAuthSuccess(session.user);

      if (authState.dayToken) {
        window.dispatchEvent(new CustomEvent('amcraft-auth-ready', { detail: { dayToken: authState.dayToken } }));
        // Light background refresh of audit/revocation (won't overwrite a good token).
        mintWithRetry(session.token, MINT_DELAYS.length - 2);
      } else {
        // Session exists but never got a day-token (previous mint failed).
        // Retry hard; if the stored token is stale, mintWithRetry triggers a
        // silent credential refresh.
        injectGSI().then(function() { ensureGSIInitialized(); });
        mintWithRetry(session.token, 0);
      }
      return;
    }

    // No session -> show login; One Tap / auto_select may complete with no click.
    showOverlay();
    showPageContent();
    initGSIButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
