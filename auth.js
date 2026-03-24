// ============================================================
// AM-CRAFT AUTH MODULE v1.0
// ============================================================
// Universal Google Sign-In gate for all AM-Craft GitHub Pages apps.
//
// USAGE: Add this ONE line to any HTML page <head> or before </body>:
//
//   <script src="https://amcraft-it.github.io/auth/auth.js"></script>
//
// That's it. The script will:
//   1. Hide all page content
//   2. Show AM-Craft login screen
//   3. Verify user with Apps Script backend
//   4. On success → show page content + add user pill to page
//   5. On failure → show error
//
// CONFIGURATION: Edit the CONFIG object below.
// ============================================================

(function() {
  'use strict';

  // --- CONFIG ---
  var AUTH_CONFIG = {
    GOOGLE_CLIENT_ID: '51370093929-sh4ts8p1ipu41u77j9vplq8tddp3sc8m.apps.googleusercontent.com',  // ← Your OAuth Client ID
    VERIFY_URL: 'https://script.google.com/macros/s/AKfycbzErJwC-vAczZ4u8piJzdVgtCCeQlGy7IEfT5yPxoEAvqc4o0jWu3d4dRWaIj9vQy_f/exec',
    SESSION_KEY: 'amcraft_auth',
    SESSION_TTL: 8 * 60 * 60 * 1000,  // 8 hours
    FONT_URL: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
  };

  // --- SESSION ---
  function getSession() {
    try {
      var raw = sessionStorage.getItem(AUTH_CONFIG.SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (Date.now() - s.ts > AUTH_CONFIG.SESSION_TTL) {
        sessionStorage.removeItem(AUTH_CONFIG.SESSION_KEY);
        return null;
      }
      return s;
    } catch(e) { return null; }
  }

  function setSession(data) {
    try {
      data.ts = Date.now();
      sessionStorage.setItem(AUTH_CONFIG.SESSION_KEY, JSON.stringify(data));
    } catch(e) {}
  }

  function clearSession() {
    try { sessionStorage.removeItem(AUTH_CONFIG.SESSION_KEY); } catch(e) {}
  }

  // --- JSONP ---
  var _jcb = 0;
  function jsonpCall(params) {
    return new Promise(function(resolve, reject) {
      var cb = '__acb' + (_jcb++);
      var t = setTimeout(function() { delete window[cb]; reject(new Error('Timeout')); }, 20000);
      window[cb] = function(d) { clearTimeout(t); delete window[cb]; resolve(d); };
      var qs = 'callback=' + cb;
      for (var k in params) qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      var s = document.createElement('script');
      s.src = AUTH_CONFIG.VERIFY_URL + '?' + qs;
      s.onerror = function() { clearTimeout(t); delete window[cb]; reject(new Error('Network error')); };
      document.body.appendChild(s);
      setTimeout(function() { try { s.remove(); } catch(e){} }, 500);
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

    /* User pill - floats top-right on any page */
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
          '<div class="amc-auth-loading-text">Verifying access…</div>' +
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
    // CSS
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // HTML
    var wrap = document.createElement('div');
    wrap.innerHTML = HTML;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }

  // --- CORE AUTH LOGIC ---
  var authState = {
    token: null,
    user: null
  };

  // Expose globally so host pages can access auth info
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

  function handleCredentialResponse(response) {
    var idToken = response.credential;

    // Decode JWT for user info
    var payload = JSON.parse(atob(idToken.split('.')[1]));
    var user = { name: payload.name, email: payload.email, picture: payload.picture };

    // Show loading
    document.getElementById('amc-gsi-btn').style.display = 'none';
    document.getElementById('amc-auth-loading').classList.add('visible');
    document.getElementById('amc-auth-user').classList.add('visible');
    document.getElementById('amc-auth-avatar').src = user.picture || '';
    document.getElementById('amc-auth-name').textContent = user.name;
    document.getElementById('amc-auth-email').textContent = user.email;
    document.getElementById('amc-auth-error').classList.remove('visible');

    // Verify with backend
    jsonpCall({ action: 'verifyAuth', id_token: idToken })
      .then(function(res) {
        if (res.success && res.authorized) {
          authState.token = idToken;
          authState.user = user;
          setSession({ token: idToken, user: user });
          onAuthSuccess(user);
        } else {
          showAuthError(res.message || 'Access denied.');
        }
      })
      .catch(function(err) {
        showAuthError('Verification failed: ' + err.message);
      });
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

    // Dispatch custom event so host pages can react
    window.dispatchEvent(new CustomEvent('amcraft-auth-success', { detail: { user: user, token: authState.token } }));
  }

  function signOut() {
    if (window.google && window.google.accounts) {
      google.accounts.id.disableAutoSelect();
    }
    authState.token = null;
    authState.user = null;
    clearSession();

    // Reset UI
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

    // Check existing session
    var session = getSession();
    if (session && session.token && session.user) {
      authState.token = session.token;
      authState.user = session.user;
      onAuthSuccess(session.user);
      return;
    }

    // No session — show login
    showOverlay();
    showPageContent(); // Overlay covers everything, so page visibility is fine

    injectGSI().then(function() {
      initGSIButton();
    });
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
