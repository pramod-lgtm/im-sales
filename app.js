(function () {
  'use strict';
  var C = window.IM_CONFIG || {}, frame = document.getElementById('app'), splash = document.getElementById('splash');
  var url = String(C.execUrl || '').replace(/\/macros\/u\/\d+\/s\//, '/macros/s/'); // never use the per-account /u/N/ form
  document.getElementById('openDirect').href = url;

  // ---- load the Apps Script app in the iframe
  if (!C.credentialless) frame.removeAttribute('credentialless');
  var loaded = false, slowTimer;
  function start() {
    loaded = false; splash.classList.remove('gone'); document.getElementById('slow').classList.remove('show');
    document.getElementById('status').textContent = navigator.onLine === false ? 'No internet connection…' : 'Loading…';
    clearTimeout(slowTimer); slowTimer = setTimeout(function () { if (!loaded) document.getElementById('slow').classList.add('show'); }, 15000);
    frame.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'pwa=1';
  }
  frame.addEventListener('load', function () { loaded = true; clearTimeout(slowTimer); setTimeout(function () { splash.classList.add('gone'); }, 250); });
  document.getElementById('retry').onclick = start;
  window.addEventListener('online', function () { if (!loaded) start(); });
  start();

  // ---- remember the login for the app inside the iframe (credentialless frames forget storage on every launch)
  var okOrigin = new RegExp(C.appOriginPattern || '^https://[a-z0-9-]+-script\\.googleusercontent\\.com$');
  var KEY = 'im_sales_token';
  window.addEventListener('message', function (e) {
    if (!okOrigin.test(e.origin) || !e.data || typeof e.data.type !== 'string') return;
    try { if (e.source.top !== window) return; } catch (err) { return; } // only frames inside this page
    if (e.data.type === 'im-hello') e.source.postMessage({ type: 'im-token', token: localStorage.getItem(KEY) }, e.origin);
    else if (e.data.type === 'im-save') { if (typeof e.data.token === 'string' && /^[a-f0-9]{64}$/.test(e.data.token)) localStorage.setItem(KEY, e.data.token); else localStorage.removeItem(KEY); }
  });

  // ---- install prompt (Android/desktop Chrome, Edge) + iOS instructions
  var bar = document.getElementById('installbar'), btn = document.getElementById('installbtn'), txt = document.getElementById('installtxt'), deferred = null;
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var dismissed = function () { return Number(localStorage.getItem('im_install_dismissed') || 0) > Date.now(); };
  document.getElementById('installx').onclick = function () { bar.classList.remove('show'); localStorage.setItem('im_install_dismissed', String(Date.now() + 7 * 86400000)); };
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    if (!standalone && !dismissed()) { btn.style.display = ''; bar.classList.add('show'); }
  });
  btn.onclick = function () {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.then(function () { deferred = null; bar.classList.remove('show'); });
  };
  window.addEventListener('appinstalled', function () { bar.classList.remove('show'); });
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && !standalone && !dismissed()) {
    txt.innerHTML = '<b>Install IM Sales</b><br>Tap <b>Share</b> <span aria-hidden="true">⬆︎</span> then <b>Add to Home Screen</b>.';
    btn.style.display = 'none'; bar.classList.add('show');
  }

  // ---- service worker (required for "Install app")
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
})();
