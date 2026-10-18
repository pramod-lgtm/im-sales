/* IM Delivery frontend: static PWA. Talks to Apps Script JSON API (POST text/plain). */
(function () {
'use strict';
var $ = function (id) { return document.getElementById(id); };
var LS = window.localStorage;
var S = { token: LS.getItem('imd_token'), user: JSON.parse(LS.getItem('imd_user') || 'null'), settings: JSON.parse(LS.getItem('imd_settings') || '{}'), masters: null };
function apiUrl() { return LS.getItem('imd_api') || (window.IM_DELIVERY_CONFIG || {}).apiUrl || ''; }
function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function today() { var t = new Date(Date.now() + 330 * 60000); return t.toISOString().slice(0, 10); }
function addDays(d, n) { var t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function tm(iso) { if (!iso) return '-'; var t = new Date(new Date(iso).getTime() + 330 * 60000), hh = t.getUTCHours(), mm = t.getUTCMinutes(); return ((hh % 12) || 12) + ':' + (mm < 10 ? '0' : '') + mm + (hh < 12 ? ' am' : ' pm'); }
function mins(m) { if (m == null || m === '') return '-'; m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm'; }
function inr(n) { return 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
function dmy(d) { return d ? d.split('-').reverse().join('-') : ''; }
function val(id) { var e = $(id); return e ? e.value.trim() : ''; }
var pending = 0; function busy(d) { pending += d; $('loading').classList.toggle('hidden', pending <= 0); }
function toast(m, t) { var e = $('toast'); e.textContent = m; e.className = 'toast ' + (t || 'ok'); clearTimeout(e._h); e._h = setTimeout(function () { e.className = 'toast hidden'; }, 4000); }
function fail(e) { toast(e && e.message || String(e), 'err'); }

// ---------------- server
function call(action, data, quiet) {
  var url = apiUrl(); if (!url) { go('/setup'); return Promise.reject(new Error('API link not set. Setup screen par /exec link daalein.')); }
  if (!quiet) busy(1);
  return fetch(url, { method: 'POST', redirect: 'follow', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: S.token, action: action, data: data || {} }) })
    .then(function (r) { if (!r.ok) throw new Error('Server error ' + r.status); return r.text(); })
    .then(function (s) { var r; try { r = JSON.parse(s); } catch (e) { throw new Error('Bad response. Check API link / deployment (Anyone access).'); } return r; },
      function (e) { throw new Error(/Server/.test(e.message) ? e.message : 'Network problem — internet check karein.'); })
    .then(function (r) { if (!quiet) busy(-1); if (!r.ok) { if (r.auth === false) signOut(true); throw new Error(r.error); } return r.data; }, function (e) { if (!quiet) busy(-1); throw e; });
}
function signOut(local) { if (!local) call('logout', {}, true).catch(function () {}); S.token = null; S.user = null; LS.removeItem('imd_token'); LS.removeItem('imd_user'); go('/login'); }
function isStaff() { return S.user && (S.user.role === 'admin' || S.user.role === 'dispatcher'); }
function masters(force) { if (S.masters && !force) return Promise.resolve(S.masters); return call('masters').then(function (m) { S.masters = m; return m; }); }

// ---------------- GPS
function getPos(timeout) {
  return new Promise(function (res) {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(function (p) { res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); }, function () { res(null); }, { enableHighAccuracy: true, timeout: timeout || 15000, maximumAge: 20000 });
  });
}
var T = { watch: null, timer: null, last: null, wake: null };
function trackQueue() { return JSON.parse(LS.getItem('imd_q') || '[]'); }
function startTracking(tripId) {
  LS.setItem('imd_trip', String(tripId)); if (!navigator.geolocation) return;
  if (T.watch == null) T.watch = navigator.geolocation.watchPosition(function (p) {
    var pt = { at: new Date().toISOString(), lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), speed: p.coords.speed == null ? null : p.coords.speed * 3.6 };
    var lt = T.last, gap = lt ? (Date.now() - lt.t) / 1000 : 1e9;
    if (gap >= Math.min(30, (S.settings.ping_sec || 60) / 2)) { var q = trackQueue(); q.push(pt); LS.setItem('imd_q', JSON.stringify(q.slice(-2000))); T.last = { t: Date.now() }; }
    var b = $('trackinfo'); if (b) b.textContent = 'GPS on • last ' + tm(pt.at) + ' • ±' + pt.acc + ' m • queued ' + trackQueue().length;
  }, function () {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 60000 });
  if (!T.timer) T.timer = setInterval(flushTrack, (S.settings.ping_sec || 60) * 1000);
  if ('wakeLock' in navigator && !T.wake) navigator.wakeLock.request('screen').then(function (w) { T.wake = w; w.addEventListener('release', function () { T.wake = null; }); }).catch(function () {});
}
function flushTrack() {
  var trip = LS.getItem('imd_trip'), q = trackQueue(); if (!trip || !q.length || !S.token) return Promise.resolve();
  var batch = q.slice(0, 300);
  return call('track', { trip_id: Number(trip), points: batch }, true).then(function (r) { LS.setItem('imd_q', JSON.stringify(trackQueue().slice(batch.length))); if (r && r.stopped) stopTracking(); }).catch(function () {});
}
function stopTracking() { if (T.watch != null) navigator.geolocation.clearWatch(T.watch); clearInterval(T.timer); T.watch = null; T.timer = null; LS.removeItem('imd_trip'); if (T.wake) T.wake.release(); }
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && LS.getItem('imd_trip')) { startTracking(LS.getItem('imd_trip')); flushTrack(); } });

// ---------------- photos / signature
function readPhoto(input, maxW) {
  return new Promise(function (res, rej) {
    var f = input.files && input.files[0]; if (!f) return res('');
    var img = new Image(), url = URL.createObjectURL(f);
    img.onload = function () { var w = Math.min(maxW || 1100, img.width), c = document.createElement('canvas'); c.width = w; c.height = Math.round(img.height * w / img.width); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.6)); };
    img.onerror = function () { rej(new Error('Photo read failed')); }; img.src = url;
  });
}
function signPad(c) {
  var ctx = c.getContext('2d'), dr = false, used = false; c.width = c.offsetWidth; c.height = c.offsetHeight; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  function p(e) { var r = c.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return [t.clientX - r.left, t.clientY - r.top]; }
  c.onpointerdown = function (e) { dr = true; used = true; var q = p(e); ctx.beginPath(); ctx.moveTo(q[0], q[1]); };
  c.onpointermove = function (e) { if (!dr) return; var q = p(e); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
  c.onpointerup = c.onpointerleave = function () { dr = false; };
  return { data: function () { return used ? c.toDataURL('image/png') : ''; }, clear: function () { ctx.clearRect(0, 0, c.width, c.height); used = false; } };
}

// ---------------- routing
var ROUTES = {}; function go(p) { if (location.hash === '#' + p) route(); else location.hash = p; }
function route() {
  var p = location.hash.replace(/^#/, '') || '/', parts = p.split('?'), path = parts[0], q = {};
  (parts[1] || '').split('&').forEach(function (kv) { if (kv) { var a = kv.split('='); q[a[0]] = decodeURIComponent(a[1] || ''); } });
  if (path !== '/setup' && !apiUrl()) path = '/setup';
  else if (path !== '/setup' && !S.token) path = '/login';
  if (path === '/' || (path === '/login' && S.token)) path = isStaff() ? '/plans' : '/route';
  nav(path); window.scrollTo(0, 0);
  var fn = ROUTES[path] || ROUTES['/route']; try { fn(q); } catch (e) { fail(e); }
}
window.addEventListener('hashchange', route);
function nav(path) {
  $('who').textContent = S.user ? S.user.name + ' • ' + (S.user.role_label || S.user.role) : '';
  var n = $('nav'); if (!S.token || !S.user || path === '/setup' || path === '/login') { n.classList.add('hidden'); return; }
  var items = isStaff() ? [['/plans', '🗓', 'Plans'], ['/orders', '📦', 'Orders'], ['/live', '📍', 'Live'], ['/dash', '📊', 'Report'], ['/more', '☰', 'More']]
    : [['/route', '🚚', 'Mera Route'], ['/fuel', '⛽', 'Gaadi / Fuel'], ['/history', '🕘', 'History'], ['/more', '☰', 'More']];
  n.innerHTML = items.map(function (i) { return '<a href="#' + i[0] + '" class="' + (path === i[0] ? 'on' : '') + '"><i>' + i[1] + '</i>' + i[2] + '</a>'; }).join('');
  n.classList.remove('hidden');
}
function view(html) { $('view').innerHTML = html; }
function on(id, ev, fn) { var e = $(id); if (e) e.addEventListener(ev, fn); }

// ---------------- setup & login
ROUTES['/setup'] = function () {
  view('<div class="card"><h2>Setup / API link</h2><p class="small muted">Apps Script &gt; Deploy &gt; Web app URL (…/exec) yahan paste karein. Ek baar per phone.</p>' +
    '<label>API URL (/exec)</label><input id="u" placeholder="https://script.google.com/macros/s/.../exec" value="' + h(apiUrl()) + '">' +
    '<div class="row" style="margin-top:12px"><button id="test">Test</button><button class="primary" id="save">Save</button></div><p id="msg" class="small"></p></div>');
  function chk(u) { if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)) throw new Error('Link …/exec par khatam hona chahiye (no /u/0/).'); }
  on('test', 'click', function () { var u = val('u'); try { chk(u); } catch (e) { return fail(e); } LS.setItem('imd_api', u); call('ping').then(function () { $('msg').textContent = '✅ Connected'; }, fail); });
  on('save', 'click', function () { var u = val('u'); try { chk(u); } catch (e) { return fail(e); } LS.setItem('imd_api', u); toast('Saved'); go('/login'); });
};
ROUTES['/login'] = function () {
  view('<div class="card" style="margin-top:30px"><h2>Login / लॉगिन</h2><label>Username ya Mobile</label><input id="un" autocomplete="username" autocapitalize="none">' +
    '<label>PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="current-password">' +
    '<button class="primary big" id="go" style="margin-top:14px">Login</button><p class="center small"><a href="#/setup">Setup / API link</a></p></div>');
  function doit() { call('login', { username: val('un'), pin: val('pin') }).then(function (r) { S.token = r.token; S.user = r.user; S.settings = r.settings; S.masters = null; LS.setItem('imd_token', r.token); LS.setItem('imd_user', JSON.stringify(r.user)); LS.setItem('imd_settings', JSON.stringify(r.settings)); go('/'); }, fail); }
  on('go', 'click', doit); on('pin', 'keydown', function (e) { if (e.key === 'Enter') doit(); });
};
ROUTES['/more'] = function () {
  var staff = isStaff(), admin = S.user.role === 'admin';
  view('<div class="card"><h2>More</h2><div class="grid2">' +
    (staff ? '<a class="btn" href="#/fuelreport">⛽ Fuel / km per litre</a><a class="btn" href="#/fuel">⛽ Fuel log entry</a><a class="btn" href="#/km">🛣 KM Report</a><a class="btn" href="#/summary">📝 Daily Summary</a><a class="btn" href="#/stores">🏬 Stores</a><a class="btn" href="#/vehicles">🚐 Vehicles</a>' : '') +
    (admin ? '<a class="btn" href="#/users">👤 Users / Drivers</a><a class="btn" href="#/settings">⚙ Settings</a>' : '') +
    (staff ? '<a class="btn" href="#/route">🚚 My Route (driver view)</a>' : '') +
    '<a class="btn" href="#/pin">🔑 Change PIN</a><a class="btn" href="#/setup">🔗 API link</a><button id="lo" class="danger">Logout</button></div></div>');
  on('lo', 'click', function () { signOut(); });
};
ROUTES['/pin'] = function () {
  view('<div class="card"><h2>Change PIN</h2><label>Old PIN</label><input id="o" type="password" inputmode="numeric"><label>New PIN (4-6 digits)</label><input id="n" type="password" inputmode="numeric"><button class="primary big" id="s" style="margin-top:12px">Save</button></div>');
  on('s', 'click', function () { call('changePin', { old: val('o'), pin: val('n') }).then(function () { toast('PIN changed'); go('/more'); }, fail); });
};

// ---------------- DRIVER
function stopCard(s, trip, driver) {
  var st = s.store || {}, closed = ['delivered', 'partial', 'failed'].indexOf(s.status) >= 0, active = trip && trip.status === 'active';
  return '<div class="card stop st-' + s.status + '"><div class="row" style="justify-content:space-between"><h3 style="flex:1"><span class="seq">' + s.seq + '</span>' + h(st.name) + '</h3><span class="pill st-' + s.status + '">' + h(s.status) + '</span></div>' +
    '<div class="small muted">' + h(st.address || '') + (st.phone ? ' • <a href="tel:' + h(st.phone) + '">📞 ' + h(st.contact || st.phone) + '</a>' : '') + '</div>' +
    '<div class="small">📦 ' + (s.boxes || 0) + ' boxes • ' + inr(s.value) + ' • ' + s.leg_km + ' km • ETA <b>' + tm(s.eta_arr) + '</b> → ' + tm(s.eta_dep) + '</div>' +
    (s.arrived_at ? '<div class="small">Arrived ' + tm(s.arrived_at) + (s.arr_dist !== '' ? ' (' + s.arr_dist + ' m)' : '') + '</div>' : '') +
    (closed ? '<div class="small">Done ' + tm(s.done_at) + (s.receiver ? ' • ' + h(s.receiver) : '') + (s.boxes_delivered !== '' ? ' • ' + s.boxes_delivered + ' boxes' : '') + (s.reason ? ' • ' + h(s.reason) : '') + (s.geo_flag === 'outside' ? ' • <b style="color:var(--low)">⚠ ' + s.done_dist + ' m away</b>' : '') + (s.photo_url ? ' • <a target="_blank" href="' + h(s.photo_url) + '">photo</a>' : '') + '</div>' : '') +
    '<div class="row" style="margin-top:8px">' + (s.nav_url ? '<a class="btn sm" target="_blank" href="' + h(s.nav_url) + '">🧭 Navigate</a>' : '') +
    (driver && active && !closed ? (s.arrived_at ? '' : '<button class="sm warn" data-arr="' + s.id + '">📍 Arrived / पहुँच गया</button>') + '<button class="sm good" data-del="' + s.id + '">✅ Deliver</button><button class="sm danger" data-fail="' + s.id + '">✖ Failed</button>' : '') + '</div></div>';
}
ROUTES['/route'] = function () {
  view('<p class="muted">Loading…</p>');
  call('myRoute', { date: today() }).then(function (plans) {
    if (!plans.length) { stopTracking(); return view('<div class="card center"><h2>Aaj koi route nahi</h2><p class="muted">No route assigned for today (' + dmy(today()) + ').</p><button id="rf">Refresh</button></div>'), on('rf', 'click', route); }
    var html = '';
    plans.forEach(function (p) {
      var t = p.trip, done = p.stops.filter(function (s) { return ['delivered', 'partial', 'failed'].indexOf(s.status) >= 0; }).length;
      html += '<div class="card"><h2>Route #' + p.id + ' • ' + dmy(p.date) + '</h2><div class="grid4"><div class="kpi"><b>' + p.stops.length + '</b><span>Stops</span></div><div class="kpi"><b>' + p.total_km + '</b><span>Planned km</span></div><div class="kpi"><b>' + mins(p.total_min) + '</b><span>Planned time</span></div><div class="kpi"><b>' + tm(p.return_eta) + '</b><span>Return ETA</span></div></div>' +
        '<p class="small">Start: ' + h(p.start_name) + ' at ' + h(p.start_time) + (p.vehicle_no ? ' • 🚐 ' + h(p.vehicle_no) : '') + ' • <a target="_blank" href="' + h(p.route_url) + '">🗺 Full route in Google Maps</a></p>' +
        (!t ? '<button class="primary big" data-start="' + p.id + '">▶ Start Trip / यात्रा शुरू</button>' :
          t.status === 'active' ? '<div class="tracking" id="trackinfo">GPS tracking on…</div><p class="small">Started ' + tm(t.start_at) + ' • Odo ' + t.start_odo + ' • ' + done + '/' + p.stops.length + ' done</p><button class="danger big" data-end="' + t.id + '">⏹ End Trip / यात्रा समाप्त</button>' :
          '<p class="small">Trip ended ' + tm(t.end_at) + ' • Odo km ' + (t.odo_km || '-') + ' • GPS km ' + (t.gps_km || 0) + '</p>') + '</div>';
      html += p.stops.map(function (s) { return stopCard(s, t, true); }).join('');
      if (t && t.status === 'active') setTimeout(function () { startTracking(t.id); }, 0);
    });
    view(html); bindDriver(plans);
  }, function (e) { view('<div class="card">' + h(e.message) + '</div>'); });
};
function sheet(html) { var d = document.createElement('div'); d.className = 'sheet'; d.innerHTML = '<div>' + html + '</div>'; document.body.appendChild(d); d.addEventListener('click', function (e) { if (e.target === d) d.remove(); }); return d; }
function bindDriver(plans) {
  var v = $('view'), stops = {}; plans.forEach(function (p) { p.stops.forEach(function (s) { stops[s.id] = s; }); });
  v.querySelectorAll('[data-start]').forEach(function (b) { b.onclick = function () { odoSheet('start', Number(b.dataset.start)); }; });
  v.querySelectorAll('[data-end]').forEach(function (b) { b.onclick = function () { odoSheet('end', Number(b.dataset.end)); }; });
  v.querySelectorAll('[data-arr]').forEach(function (b) { b.onclick = function () {
    b.disabled = true; getPos().then(function (pos) {
      var d = { stop_id: Number(b.dataset.arr) }; if (pos) { d.lat = pos.lat; d.lng = pos.lng; }
      return call('arrive', d).then(function (r) {
        if (r.need_confirm) { if (!confirm('Aap store se ' + r.dist + ' m door hain (limit ' + r.geofence_m + ' m). Phir bhi Arrived mark karein? This will be flagged.')) return; d.force = 1; return call('arrive', d); } return r;
      });
    }).then(function (r) { if (r) toast('Arrived ✔'); route(); }, function (e) { b.disabled = false; fail(e); });
  }; });
  v.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { deliverSheet(stops[b.dataset.del], 'delivered'); }; });
  v.querySelectorAll('[data-fail]').forEach(function (b) { b.onclick = function () { deliverSheet(stops[b.dataset.fail], 'failed'); }; });
}
function odoSheet(kind, id) {
  var sh = sheet('<h2>' + (kind === 'start' ? 'Start Trip / यात्रा शुरू' : 'End Trip / यात्रा समाप्त') + '</h2>' +
    '<label>Odometer reading (km) *</label><input id="odo" type="number" inputmode="numeric">' +
    '<label>Odometer photo / मीटर की फोटो *</label><input id="odop" type="file" accept="image/*" capture="environment">' +
    (kind === 'start' ? '<label>Selfie (optional)</label><input id="self" type="file" accept="image/*" capture="user">' : '') +
    '<p class="small muted">GPS on rakhein. App khuli rakhein — screen on rahegi taaki tracking chale.</p><button class="primary big" id="ok">' + (kind === 'start' ? '▶ Start' : '⏹ End trip') + '</button><button class="big" id="cx" style="margin-top:8px">Cancel</button>');
  sh.querySelector('#cx').onclick = function () { sh.remove(); };
  sh.querySelector('#ok').onclick = function () {
    var btn = this, odo = sh.querySelector('#odo').value; if (odo === '') return fail(new Error('Odometer reading daalein'));
    if (!sh.querySelector('#odop').files.length) return fail(new Error('Odometer photo lein'));
    btn.disabled = true;
    Promise.all([readPhoto(sh.querySelector('#odop')), kind === 'start' ? readPhoto(sh.querySelector('#self'), 600) : '', getPos()]).then(function (r) {
      var d = { odo: Number(odo), odo_photo: r[0] }; if (r[2]) { d.lat = r[2].lat; d.lng = r[2].lng; d.acc = r[2].acc; }
      if (kind === 'start') { d.plan_id = id; d.selfie = r[1]; return call('startTrip', d).then(function (x) { startTracking(x.trip_id); toast('Trip started, GPS on'); }); }
      d.trip_id = id; return flushTrack().then(function () { return call('endTrip', d); }).then(function (x) { stopTracking(); toast('Trip ended' + (x.pending_stops ? ' — ' + x.pending_stops + ' stops pending' : '')); });
    }).then(function () { sh.remove(); route(); }, function (e) { btn.disabled = false; fail(e); });
  };
}
function deliverSheet(s, mode) {
  var st = S.settings || {}, failMode = mode === 'failed';
  var sh = sheet('<h2>' + h(s.store.name) + '</h2>' +
    (failMode ? '' : '<div class="row"><label style="flex:none"><input type="radio" name="ty" value="delivered" checked style="width:auto"> Full delivered</label><label style="flex:none"><input type="radio" name="ty" value="partial" style="width:auto"> Partial / अधूरा</label></div>' +
      '<label>Receiver name / लेने वाले का नाम *</label><input id="rc"><label>Boxes delivered (planned ' + (s.boxes || 0) + ')</label><input id="bx" type="number" inputmode="numeric" value="' + (s.boxes || 0) + '">' +
      '<label>Photo (proof) ' + (st.photo_required ? '*' : '') + '</label><input id="ph" type="file" accept="image/*" capture="environment">' +
      (st.otp_required ? '<label>Store OTP *</label><input id="otp" inputmode="numeric">' : '') +
      '<label>Signature (optional)</label><canvas class="sign" id="sg"></canvas><button class="sm" id="sgc">Clear sign</button>') +
    '<label>' + (failMode ? 'Reason / कारण *' : 'Reason (partial ke liye) / Note') + '</label><select id="rs"><option value="">—</option><option>Store closed / दुकान बंद</option><option>Owner not available</option><option>Refused / मना किया</option><option>Payment issue</option><option>Short space / jagah nahi</option><option>Wrong address</option><option>Time over</option><option>Other</option></select><input id="rn" placeholder="Details" style="margin-top:6px">' +
    '<button class="' + (failMode ? 'danger' : 'good') + ' big" id="ok" style="margin-top:12px">' + (failMode ? 'Mark Failed' : 'Confirm Delivery') + '</button><button class="big" id="cx" style="margin-top:8px">Cancel</button>');
  var pad = failMode ? null : signPad(sh.querySelector('#sg'));
  if (pad) sh.querySelector('#sgc').onclick = pad.clear;
  sh.querySelector('#cx').onclick = function () { sh.remove(); };
  sh.querySelector('#ok').onclick = function () {
    var btn = this, ty = failMode ? 'failed' : sh.querySelector('input[name=ty]:checked').value, reason = [sh.querySelector('#rs').value, sh.querySelector('#rn').value.trim()].filter(Boolean).join(' - ');
    btn.disabled = true;
    Promise.all([failMode ? '' : readPhoto(sh.querySelector('#ph')), getPos()]).then(function (r) {
      var d = { stop_id: s.id, status: ty, reason: reason, photo: r[0] };
      if (!failMode) { d.receiver = sh.querySelector('#rc').value.trim(); d.boxes_delivered = sh.querySelector('#bx').value; d.sign = pad.data(); var o = sh.querySelector('#otp'); if (o) d.otp = o.value.trim(); }
      if (r[1]) { d.lat = r[1].lat; d.lng = r[1].lng; }
      return call('deliver', d);
    }).then(function (x) { sh.remove(); toast(x.geo_flag === 'outside' ? 'Saved — ⚠ ' + x.dist + ' m door se mark hua (flagged)' : 'Saved ✔', x.geo_flag === 'outside' ? 'err' : 'ok'); route(); }, function (e) { btn.disabled = false; fail(e); });
  };
}
ROUTES['/history'] = function () {
  var to = today(); call('kmReport', { from: addDays(to, -30), to: to, driver_id: S.user.id }).then(function (r) {
    view('<div class="card"><h2>Mera KM (30 din)</h2>' + kmTable(r.rows, true) + '</div>');
  }, function (e) { view('<div class="card">' + h(e.message) + '</div>'); });
};

// ---------------- STAFF: orders
ROUTES['/orders'] = function (q) {
  var date = q.date || today();
  Promise.all([masters(), call('listOrders', { open: 1 })]).then(function (r) {
    var m = r[0], orders = r[1], stores = m.stores.filter(function (s) { return Number(s.active); });
    view('<div class="card"><h2>New delivery order / नया ऑर्डर</h2><label>Store</label><select id="st">' + stores.map(function (s) { return '<option value="' + s.id + '">' + h(s.name) + (s.area ? ' — ' + h(s.area) : '') + (s.lat === '' ? ' (no GPS!)' : '') + '</option>'; }).join('') + '</select>' +
      '<div class="grid2"><div><label>Invoice no</label><input id="inv"></div><div><label>Boxes</label><input id="bx" type="number" inputmode="numeric"></div><div><label>Value (Rs)</label><input id="vl" type="number" inputmode="decimal"></div><div><label>Order date</label><input id="dt" type="date" value="' + date + '"></div></div>' +
      '<label>Items / note</label><input id="it"><button class="primary big" id="add" style="margin-top:10px">+ Add order</button>' +
      '<details style="margin-top:10px"><summary>Bulk paste (Excel: store code/name, invoice, boxes, value, items)</summary><textarea id="bulk" rows="5" placeholder="ST01\tINV101\t5\t25000\tbras"></textarea><button id="imp" style="margin-top:6px">Import</button></details></div>' +
      '<div class="card"><h2>Open orders (not planned) — ' + orders.length + '</h2><div class="tw"><table><tr><th>Date</th><th>Store</th><th>Inv</th><th>Box</th><th>Value</th><th></th></tr>' +
      orders.map(function (o) { return '<tr><td>' + dmy(o.date) + '</td><td>' + h(o.store_name) + (o.status === 'failed' ? ' <span class="pill st-failed">re-deliver</span>' : '') + '</td><td>' + h(o.invoice_no) + '</td><td>' + o.boxes + '</td><td>' + inr(o.value) + '</td><td><button class="sm" data-x="' + o.id + '">✖</button></td></tr>'; }).join('') + '</table></div>' +
      (orders.length ? '<a class="btn primary big" href="#/plan" style="margin-top:10px">🗺 Make today\'s plan</a>' : '') + '</div>');
    on('add', 'click', function () { call('saveOrder', { store_id: val('st'), invoice_no: val('inv'), boxes: val('bx'), value: val('vl'), date: val('dt'), items: val('it') }).then(function () { toast('Order added'); route(); }, fail); });
    on('imp', 'click', function () {
      var rows = val('bulk').split(/\r?\n/).filter(Boolean).map(function (l) { var c = l.split(/\t|,/); return { store: c[0], invoice_no: c[1], boxes: c[2], value: c[3], items: c[4] }; });
      call('importOrders', { date: val('dt'), rows: rows }).then(function (r) { toast(r.imported + ' imported' + (r.errors.length ? ', ' + r.errors.length + ' errors' : '')); if (r.errors.length) alert(r.errors.join('\n')); route(); }, fail);
    });
    $('view').querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { if (confirm('Cancel this order?')) call('cancelOrder', { id: Number(b.dataset.x) }).then(route, fail); }; });
  }, fail);
};

// ---------------- STAFF: plan builder
ROUTES['/plan'] = function () {
  Promise.all([masters(true), call('listOrders', { open: 1 })]).then(function (r) {
    var m = r[0], orders = r[1], st = m.settings, drivers = m.users.filter(function (u) { return u.role === 'driver' && Number(u.active); });
    view('<div class="card"><h2>Daily plan / आज का प्लान</h2><div class="grid2"><div><label>Date</label><input id="dt" type="date" value="' + today() + '"></div><div><label>Start time</label><input id="tm" type="time" value="' + h(st.start_time) + '"></div>' +
      '<div><label>Avg speed km/h</label><input id="sp" type="number" value="' + h(st.speed_kmh) + '"></div><div><label>Min per stop</label><input id="sv" type="number" value="' + h(st.service_min) + '"></div></div>' +
      '<label>Start point (warehouse)</label><input id="sn" value="' + h(st.depot_name) + '"><div class="grid2"><input id="la" value="' + h(st.depot_lat) + '" placeholder="lat"><input id="lo" value="' + h(st.depot_lng) + '" placeholder="lng"></div>' +
      '<label>Driver(s) — select 2+ to split route</label>' + drivers.map(function (d) { return '<label class="chk"><input type="checkbox" class="drv" value="' + d.id + '">' + h(d.name) + '</label>'; }).join('') + '</div>' +
      '<div class="card"><h2>Orders to deliver (' + orders.length + ')</h2><label class="chk"><input type="checkbox" id="all" checked><b>Select all</b></label>' +
      orders.map(function (o) { return '<label class="chk"><input type="checkbox" class="ord" value="' + o.id + '" checked><span>' + h(o.store_name) + ' <span class="small muted">• ' + h(o.invoice_no) + ' • ' + o.boxes + ' box • ' + inr(o.value) + '</span></span></label>'; }).join('') +
      '<button class="primary big" id="pv" style="margin-top:10px">⚡ Calculate best route</button></div><div id="out"></div>');
    on('all', 'change', function () { var c = this.checked; document.querySelectorAll('.ord').forEach(function (x) { x.checked = c; }); });
    function args() { return { date: val('dt'), start_time: val('tm'), speed_kmh: val('sp'), service_min: val('sv'), start_name: val('sn'), start_lat: val('la'), start_lng: val('lo'),
      order_ids: [].map.call(document.querySelectorAll('.ord:checked'), function (x) { return Number(x.value); }), drivers: [].map.call(document.querySelectorAll('.drv:checked'), function (x) { return Number(x.value); }) }; }
    on('pv', 'click', function () {
      var a = args(); call('previewPlan', a).then(function (res) {
        $('out').innerHTML = res.plans.map(function (p, i) { return planHtml(p, res, i); }).join('') + '<button class="good big" id="sv2">💾 Save & assign plan</button>';
        on('sv2', 'click', function () { if (!a.drivers.length && !confirm('No driver selected. Save unassigned?')) return; call('savePlan', a).then(function () { toast('Plan saved'); go('/plans'); }, fail); });
        $('out').scrollIntoView({ behavior: 'smooth' });
      }, fail);
    });
  }, fail);
};
function planHtml(p, res, i) {
  return '<div class="card"><h2>' + (p.driver_name ? '🚚 ' + h(p.driver_name) : 'Route ' + (i + 1)) + '</h2><div class="grid4"><div class="kpi"><b>' + p.stops.length + '</b><span>Stops</span></div><div class="kpi"><b>' + p.total_km + ' km</b><span>Total km</span></div><div class="kpi"><b>' + mins(p.total_min) + '</b><span>Total time (drive ' + mins(p.drive_min) + ')</span></div><div class="kpi"><b>' + tm(p.return_eta) + '</b><span>Return to warehouse</span></div></div>' +
    '<p class="small muted">Distance: ' + (p.distance_source === 'google' ? 'Google Maps road km' : 'estimate (straight line × road factor)') + ' • ' + res.speed_kmh + ' km/h • ' + res.service_min + ' min/stop</p>' +
    '<div class="tw"><table><tr><th>#</th><th>Store</th><th>Km</th><th>Arrive</th><th>Leave</th><th></th></tr><tr><td>0</td><td>' + h(res.depot.name) + '</td><td></td><td></td><td>' + h(res.start_time) + '</td><td></td></tr>' +
    p.stops.map(function (s) { return '<tr><td>' + s.seq + '</td><td>' + h(s.name) + '<div class="small muted">' + (s.boxes || 0) + ' box • ' + inr(s.value) + '</div></td><td>' + s.leg_km + '</td><td>' + tm(s.eta_arr) + '</td><td>' + tm(s.eta_dep) + '</td><td><a target="_blank" href="' + h(s.nav_url) + '">🧭</a></td></tr>'; }).join('') +
    '<tr><td>↩</td><td>Back to warehouse</td><td>' + p.return_km + '</td><td>' + tm(p.return_eta) + '</td><td></td><td></td></tr></table></div><a class="btn" target="_blank" href="' + h(p.route_url) + '" style="margin-top:8px">🗺 Full route in Google Maps</a></div>';
}
ROUTES['/plans'] = function (q) {
  var date = q.date || today();
  Promise.all([masters(), call('listPlans', { date: date })]).then(function (r) {
    var m = r[0], plans = r[1], drivers = m.users.filter(function (u) { return u.role === 'driver' && Number(u.active); });
    view('<div class="card"><div class="row"><h2 style="flex:1">Plans</h2><input type="date" id="dt" value="' + date + '" style="max-width:170px"></div><a class="btn primary big" href="#/plan">+ New plan</a></div>' +
      (plans.length ? plans.map(function (p) {
        var done = p.stops.filter(function (s) { return ['delivered', 'partial', 'failed'].indexOf(s.status) >= 0; }).length;
        return '<div class="card"><div class="row"><h3 style="flex:1">#' + p.id + ' • ' + h(p.driver_name || 'Unassigned') + (p.vehicle_no ? ' • ' + h(p.vehicle_no) : '') + '</h3><span class="pill">' + h(p.status) + '</span></div>' +
          '<div class="small">' + done + '/' + p.stops.length + ' done • ' + p.total_km + ' km • ' + mins(p.total_min) + ' • return ' + tm(p.return_eta) + (p.trip ? ' • started ' + tm(p.trip.start_at) + (p.trip.end_at ? ', ended ' + tm(p.trip.end_at) : '') : '') + '</div>' +
          '<details><summary>Stops & assign</summary>' + p.stops.map(function (s) { return stopCard(s, p.trip, false); }).join('') +
          (!p.trip ? '<div class="row"><select id="ad' + p.id + '"><option value="">Driver…</option>' + drivers.map(function (d) { return '<option value="' + d.id + '"' + (Number(d.id) === Number(p.driver_id) ? ' selected' : '') + '>' + h(d.name) + '</option>'; }).join('') + '</select>' +
            '<select id="av' + p.id + '"><option value="">Vehicle…</option>' + m.vehicles.map(function (v) { return '<option value="' + v.id + '"' + (Number(v.id) === Number(p.vehicle_id) ? ' selected' : '') + '>' + h(v.number) + '</option>'; }).join('') + '</select><button class="sm primary" data-as="' + p.id + '">Assign</button><button class="sm danger" data-cp="' + p.id + '">Cancel plan</button></div>' : '') +
          '<a class="btn sm" target="_blank" href="' + h(p.route_url) + '">🗺 Route</a></details></div>';
      }).join('') : '<div class="card muted center">No plans for ' + dmy(date) + '</div>'));
    on('dt', 'change', function () { go('/plans?date=' + this.value); });
    $('view').querySelectorAll('[data-as]').forEach(function (b) { b.onclick = function () { var id = b.dataset.as; call('assignPlan', { id: Number(id), driver_id: val('ad' + id), vehicle_id: val('av' + id) }).then(function () { toast('Assigned'); route(); }, fail); }; });
    $('view').querySelectorAll('[data-cp]').forEach(function (b) { b.onclick = function () { if (confirm('Cancel plan? Orders go back to open.')) call('cancelPlan', { id: Number(b.dataset.cp) }).then(route, fail); }; });
  }, fail);
};

// ---------------- STAFF: live map
var MAP = null;
ROUTES['/live'] = function (q) {
  var date = q.date || today();
  view('<div class="card"><div class="row"><h2 style="flex:1">Live drivers</h2><input type="date" id="dt" value="' + date + '" style="max-width:170px"><button class="sm" id="rf">↻</button></div><div id="map"></div><div id="lst" style="margin-top:10px"></div></div>');
  on('dt', 'change', function () { go('/live?date=' + this.value); }); on('rf', 'click', route);
  if (!window.L) return $('lst').innerHTML = 'Map library failed to load (internet?).';
  MAP = L.map('map').setView([28.6448, 77.2410], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(MAP);
  Promise.all([masters(), call('live', { date: date, trail: 1 }), call('listPlans', { date: date })]).then(function (r) {
    var trips = r[1], plans = r[2], bounds = [], colors = ['#7a1f4b', '#1f6feb', '#1f8a5b', '#c98a12', '#8250df', '#cf222e'];
    var st = r[0].settings; L.marker([Number(st.depot_lat), Number(st.depot_lng)], { title: 'Warehouse' }).addTo(MAP).bindPopup('🏭 ' + h(st.depot_name));
    plans.forEach(function (p) { p.stops.forEach(function (s) { if (s.store.lat === '') return; var c = s.status === 'delivered' ? '#1f8a5b' : s.status === 'failed' ? '#c4384b' : s.status === 'partial' ? '#c98a12' : '#888';
      L.circleMarker([s.store.lat, s.store.lng], { radius: 8, color: c, fillOpacity: .8 }).addTo(MAP).bindPopup(s.seq + '. ' + h(s.store.name) + '<br>' + h(s.status) + ' • ETA ' + tm(s.eta_arr)); bounds.push([s.store.lat, s.store.lng]); }); });
    trips.forEach(function (t, i) {
      var c = colors[i % colors.length];
      if (t.trail && t.trail.length > 1) L.polyline(t.trail, { color: c, weight: 4, opacity: .7 }).addTo(MAP);
      if (t.last) { L.marker([t.last.lat, t.last.lng]).addTo(MAP).bindPopup('🚚 ' + h(t.driver) + '<br>' + tm(t.last.at) + ' • ' + t.done + '/' + t.total).openPopup(); bounds.push([t.last.lat, t.last.lng]); }
    });
    if (bounds.length) MAP.fitBounds(bounds, { padding: [30, 30] });
    var stale = function (t) { return t.status === 'active' && t.last && Date.now() - new Date(t.last.at) > 10 * 60000; };
    $('lst').innerHTML = trips.length ? '<table><tr><th>Driver</th><th>Status</th><th>Last GPS</th><th>Done</th></tr>' + trips.map(function (t, i) { return '<tr><td><span style="color:' + colors[i % colors.length] + '">●</span> ' + h(t.driver) + '</td><td>' + h(t.status) + '</td><td>' + (t.last ? tm(t.last.at) : '-') + (stale(t) ? ' <b style="color:var(--low)">⚠ no signal</b>' : '') + '</td><td>' + t.done + '/' + t.total + '</td></tr>'; }).join('') + '</table>' : '<p class="muted">No trips started.</p>';
  }, fail);
};

// ---------------- STAFF: dashboard
function rangeFor(k) { var t = today(); if (k === 'day') return [t, t]; if (k === 'week') return [addDays(t, -6), t]; return [t.slice(0, 8) + '01', t]; }
function kpi(v, l) { return '<div class="kpi"><b>' + (v == null ? '-' : v) + '</b><span>' + l + '</span></div>'; }
ROUTES['/dash'] = function (q) {
  var k = q.r || 'week', rg = rangeFor(k), from = q.from || rg[0], to = q.to || rg[1];
  call('dashboard', { from: from, to: to }).then(function (d) {
    var t = d.total;
    view('<div class="card"><div class="row"><a class="btn sm ' + (k === 'day' ? 'primary' : '') + '" href="#/dash?r=day">Today</a><a class="btn sm ' + (k === 'week' ? 'primary' : '') + '" href="#/dash?r=week">7 days</a><a class="btn sm ' + (k === 'month' ? 'primary' : '') + '" href="#/dash?r=month">Month</a></div><p class="small muted">' + dmy(d.from) + ' → ' + dmy(d.to) + '</p>' +
      '<div class="grid4">' + kpi(t.trips, 'Trips') + kpi(t.delivered + '/' + t.stops, 'Delivered') + kpi(t.success_pct == null ? '-' : t.success_pct + '%', 'Success') + kpi(t.on_time_pct == null ? '-' : t.on_time_pct + '%', 'On-time') +
      kpi(t.failed + ' / ' + t.partial, 'Failed / Partial') + kpi(t.planned_km + ' / ' + t.gps_km, 'Km plan / GPS') + kpi(mins(t.planned_min) + ' / ' + mins(t.actual_min), 'Time plan / actual') + kpi(mins(t.idle_min), 'Idle') + kpi(t.geo_viol, 'Geofence ⚠') + kpi(inr(t.value_delivered), 'Value delivered') + '</div></div>' +
      '<div class="card"><h2>🏆 Leaderboard</h2><div class="tw"><table><tr><th>#</th><th>Driver</th><th>Score</th><th>Deliv</th><th>On-time</th><th>Km plan/GPS</th><th>Idle</th><th>Geo⚠</th></tr>' +
      d.leaderboard.map(function (b, i) { return '<tr><td>' + (i + 1) + '</td><td>' + h(b.driver) + '</td><td><b>' + b.score + '</b></td><td>' + b.delivered + '+' + b.partial + 'p/' + b.stops + '</td><td>' + (b.on_time_pct == null ? '-' : b.on_time_pct + '%') + '</td><td>' + b.planned_km + '/' + b.gps_km + '</td><td>' + mins(b.idle_min) + '</td><td>' + b.geo_viol + '</td></tr>'; }).join('') + '</table></div></div>' +
      '<div class="card"><h2>Per trip: planned vs actual</h2><div class="tw"><table><tr><th>Date</th><th>Driver</th><th>Stops</th><th>Time plan/actual</th><th>Avg delay</th><th>Km plan/GPS/odo</th><th>Status</th></tr>' +
      d.trips.map(function (r) { return '<tr><td>' + dmy(r.date) + '</td><td>' + h(r.driver) + '</td><td>' + (r.delivered + r.partial) + '/' + r.stops + '</td><td>' + mins(r.planned_min) + ' / ' + mins(r.actual_min) + '</td><td>' + (r.avg_delay_min == null ? '-' : r.avg_delay_min + 'm') + '</td><td>' + r.planned_km + ' / ' + r.gps_km + ' / ' + (r.odo_km == null ? '-' : r.odo_km) + '</td><td>' + h(r.trip_status) + '</td></tr>'; }).join('') + '</table></div></div>' +
      '<div class="card"><h2>Per day</h2><div class="tw"><table><tr><th>Date</th><th>Trips</th><th>Delivered</th><th>On-time</th><th>Km GPS</th></tr>' + d.days.map(function (x) { return '<tr><td>' + dmy(x.date) + '</td><td>' + x.trips + '</td><td>' + x.delivered + '/' + x.stops + '</td><td>' + (x.on_time_pct == null ? '-' : x.on_time_pct + '%') + '</td><td>' + x.gps_km + '</td></tr>'; }).join('') + '</table></div></div>' +
      '<div class="card"><h2>⚠ Exceptions</h2><h3>Failed / partial</h3>' + (d.failed.length ? '<table>' + d.failed.map(function (f) { return '<tr><td>' + dmy(f.date) + '</td><td>' + h(f.driver) + '</td><td>' + h(f.store) + '</td><td>' + h(f.status) + ': ' + h(f.reason) + '</td></tr>'; }).join('') + '</table>' : '<p class="muted small">None</p>') +
      '<h3>Geofence violations (marked away from store)</h3>' + (d.geo_violations.length ? '<table>' + d.geo_violations.map(function (f) { return '<tr><td>' + dmy(f.date) + '</td><td>' + h(f.driver) + '</td><td>' + h(f.store) + '</td><td>' + f.dist + ' m</td></tr>'; }).join('') + '</table>' : '<p class="muted small">None</p>') +
      '<h3>Idle (stopped &gt;15 min, not at a stop)</h3>' + (d.idle.length ? '<table>' + d.idle.map(function (f) { return '<tr><td>' + dmy(f.date) + '</td><td>' + h(f.driver) + '</td><td>' + tm(f.from) + '–' + tm(f.to) + '</td><td>' + f.minutes + ' min</td><td><a target="_blank" href="https://www.google.com/maps?q=' + f.lat + ',' + f.lng + '">map</a></td></tr>'; }).join('') + '</table>' : '<p class="muted small">None</p>') + '</div>');
  }, fail);
};
ROUTES['/summary'] = function (q) {
  var date = q.date || today();
  call('dailySummary', { date: date }).then(function (r) {
    view('<div class="card"><div class="row"><h2 style="flex:1">Daily summary</h2><input type="date" id="dt" value="' + date + '" style="max-width:170px"></div><pre class="wa" id="tx">' + h(r.text) + '</pre><div class="row"><button id="cp">📋 Copy</button><a class="btn good" target="_blank" href="https://wa.me/?text=' + encodeURIComponent(r.text) + '">WhatsApp</a></div></div>');
    on('dt', 'change', function () { go('/summary?date=' + this.value); });
    on('cp', 'click', function () { navigator.clipboard.writeText(r.text).then(function () { toast('Copied'); }); });
  }, fail);
};

// ---------------- KM report
function kmTable(rows, mine) {
  if (!rows.length) return '<p class="muted small">No trips.</p>';
  return '<div class="tw"><table><tr><th>Date</th>' + (mine ? '' : '<th>Driver</th>') + '<th>Vehicle</th><th>Odo start→end</th><th>Odo km</th><th>GPS km</th><th>Plan km</th><th>Var odo/GPS</th><th>Claim km</th></tr>' +
    rows.map(function (r) { return '<tr><td>' + dmy(r.date) + '</td>' + (mine ? '' : '<td>' + h(r.driver) + '</td>') + '<td>' + h(r.vehicle) + '</td><td>' + h(r.start_odo) + '→' + h(r.end_odo) + (r.start_odo_photo ? ' <a target="_blank" href="' + h(r.start_odo_photo) + '">📷</a>' : '') + (r.end_odo_photo ? '<a target="_blank" href="' + h(r.end_odo_photo) + '">📷</a>' : '') + '</td><td>' + (r.odo_km == null ? '-' : r.odo_km) + '</td><td>' + r.gps_km + '</td><td>' + r.planned_km + '</td><td>' + (r.odo_vs_gps_pct == null ? '-' : r.odo_vs_gps_pct + '%') + (r.flag ? ' ⚠' : '') + '</td><td><b>' + r.claim_km + '</b>' + (r.amount !== '' ? '<div class="small">' + inr(r.amount) + '</div>' : '') + '</td></tr>'; }).join('') + '</table></div>';
}
function groupTable(title, g) { return '<h3>' + title + '</h3><div class="tw"><table><tr><th></th><th>Trips</th><th>Odo km</th><th>GPS km</th><th>Plan km</th><th>Var</th><th>Claim km</th><th>Amount</th></tr>' + g.map(function (x) { return '<tr><td>' + h(x.key) + '</td><td>' + x.trips + '</td><td>' + x.odo_km + '</td><td>' + x.gps_km + '</td><td>' + x.planned_km + '</td><td>' + (x.variance_pct == null ? '-' : x.variance_pct + '%') + '</td><td><b>' + x.claim_km + '</b></td><td>' + (x.amount ? inr(x.amount) : '-') + '</td></tr>'; }).join('') + '</table></div>'; }
function csv(rows, cols) { var e = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }; return [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return e(r[c]); }).join(','); })).join('\n'); }
function download(name, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
ROUTES['/km'] = function (q) {
  var t = today(), from = q.from || t.slice(0, 8) + '01', to = q.to || t;
  call('kmReport', { from: from, to: to }).then(function (r) {
    view('<div class="card"><h2>🛣 KM run report</h2><div class="grid2"><input type="date" id="f" value="' + from + '"><input type="date" id="t" value="' + to + '"></div><div class="row" style="margin-top:8px"><button id="ap">Apply</button><button class="primary" id="dl">⬇ CSV (trips)</button><button id="dl2">⬇ CSV (driver/vehicle/month)</button></div>' +
      '<p class="small muted">Claim km = odometer km (if both readings) else GPS km. ⚠ = odo vs GPS differs &gt;15%. Rate/km: ' + (r.km_rate ? 'Rs ' + r.km_rate : 'not set (Settings > km_rate)') + '</p></div>' +
      '<div class="card">' + groupTable('By driver', r.by_driver) + groupTable('By vehicle', r.by_vehicle) + groupTable('By month', r.by_month) + groupTable('By day', r.by_day) + '</div><div class="card"><h3>Trips</h3>' + kmTable(r.rows) + '</div>');
    on('ap', 'click', function () { go('/km?from=' + val('f') + '&to=' + val('t')); });
    on('dl', 'click', function () { download('km-report-' + from + '-to-' + to + '.csv', csv(r.rows, ['date', 'month', 'trip_id', 'driver', 'vehicle', 'status', 'start_odo', 'end_odo', 'odo_km', 'gps_km', 'planned_km', 'odo_vs_gps_pct', 'odo_vs_plan_pct', 'gps_vs_plan_pct', 'claim_km', 'amount', 'flag', 'start_odo_photo', 'end_odo_photo'])); });
    on('dl2', 'click', function () { var all = []; [['driver', r.by_driver], ['vehicle', r.by_vehicle], ['month', r.by_month], ['day', r.by_day]].forEach(function (g) { g[1].forEach(function (x) { all.push(Object.assign({ group: g[0] }, x)); }); }); download('km-summary-' + from + '-to-' + to + '.csv', csv(all, ['group', 'key', 'trips', 'odo_km', 'gps_km', 'planned_km', 'variance_pct', 'claim_km', 'amount'])); });
  }, fail);
};

// ---------------- vehicle / fuel log
function n2(v) { return v === '' || v == null ? '-' : (Math.round(Number(v) * 100) / 100).toLocaleString('en-IN'); }
ROUTES['/fuel'] = function (q) {
  var date = q.date || today(), staff = isStaff();
  Promise.all([call('fuelDay', { date: date, driver_id: q.driver || '' }), staff ? masters() : null]).then(function (r) {
    var d = r[0], m = r[1], vmap = {}; d.vehicles.forEach(function (v) { vmap[v.id] = v; });
    var drivers = m ? m.users.filter(function (u) { return Number(u.active); }) : [];
    var html = '<div class="card"><div class="row"><h2 style="flex:1">⛽ Gaadi / Fuel log</h2><input type="date" id="dt" value="' + date + '" style="max-width:170px"></div>' +
      (staff ? '<label>Driver</label><select id="drv">' + drivers.map(function (u) { return '<option value="' + u.id + '"' + (Number(u.id) === Number(d.driver_id) ? ' selected' : '') + '>' + h(u.name) + '</option>'; }).join('') + '</select>' : '') +
      '<p class="small muted">' + h(d.driver_name) + ' • ' + dmy(d.date) + (d.auto_deliveries != null ? ' • Aaj ki deliveries (app se): <b>' + d.auto_deliveries + '</b>' : '') + '</p></div>';
    d.entries.forEach(function (e) {
      var v = vmap[e.vehicle_id] || { number: '#' + e.vehicle_id };
      if (e.status === 'closed') {
        html += '<div class="card"><h3>🚐 ' + h(v.number) + ' <span class="pill st-delivered">closed</span></h3><div class="grid4">' + kpi(e.opening_km + '→' + e.closing_km, 'Odometer') + kpi(n2(e.km_run), 'Km run') + kpi(e.fuel_rs ? inr(e.fuel_rs) : '-', 'Fuel') + kpi(n2(e.litres), 'Litres') +
          kpi(n2(e.rs_per_litre), 'Rs/litre') + kpi(n2(e.km_per_litre), 'Km/litre') + kpi(e.parking ? inr(e.parking) : '-', 'Parking') + kpi(e.toll ? inr(e.toll) : '-', 'MCD / toll') + kpi(e.deliveries === '' ? '-' : e.deliveries, 'Deliveries (' + (e.deliveries_src || '-') + ')') + '</div>' +
          (staff ? '<button class="sm" data-fc="' + e.id + '" style="margin-top:8px">✏ Edit closing</button>' : '') + '</div>';
      } else {
        html += '<div class="card"><h3>🚐 ' + h(v.number) + ' <span class="pill st-arrived">open</span></h3><p class="small">Opening km: <b>' + e.opening_km + '</b>' + (e.opening_photo ? ' • <a target="_blank" href="' + h(e.opening_photo) + '">📷</a>' : '') + '</p>' +
          '<h3 style="margin-top:8px">Shaam / Evening</h3><div class="grid2"><div><label>Closing km *</label><input id="ck' + e.id + '" type="number" inputmode="decimal" step="any" min="' + e.opening_km + '"></div><div><label>Fuel Rs</label><input id="fr' + e.id + '" type="number" inputmode="decimal" step="any"></div>' +
          '<div><label>Litres</label><input id="lt' + e.id + '" type="number" inputmode="decimal" step="any"></div><div><label>Parking Rs</label><input id="pk' + e.id + '" type="number" inputmode="decimal" step="any"></div>' +
          '<div><label>MCD / toll Rs</label><input id="tl' + e.id + '" type="number" inputmode="decimal" step="any"></div><div><label>Deliveries made' + (d.auto_deliveries != null ? ' (auto: ' + d.auto_deliveries + ')' : ' *') + '</label><input id="dl' + e.id + '" type="number" inputmode="numeric" placeholder="' + (d.auto_deliveries != null ? 'auto' : '') + '"></div></div>' +
          '<label>Odometer photo (optional)</label><input id="cp' + e.id + '" type="file" accept="image/*" capture="environment"><p class="small muted" id="cv' + e.id + '"></p>' +
          '<button class="primary big" data-close="' + e.id + '" data-open="' + e.opening_km + '">Save evening entry</button></div>';
      }
    });
    var used = d.entries.map(function (e) { return Number(e.vehicle_id); }), free = d.vehicles.filter(function (v) { return used.indexOf(Number(v.id)) < 0; });
    if (free.length) html += '<div class="card"><h3>' + (d.entries.length ? '+ Doosri gaadi' : 'Subah / Morning') + '</h3><label>Vehicle *</label><select id="veh">' + free.map(function (v) { return '<option value="' + v.id + '"' + (Number(v.id) === Number(d.default_vehicle_id) ? ' selected' : '') + '>' + h(v.number) + '</option>'; }).join('') + '</select>' +
      '<label>Opening km *</label><input id="ok" type="number" inputmode="decimal" step="any"><p class="small muted" id="pv"></p><label>Odometer photo (optional)</label><input id="op" type="file" accept="image/*" capture="environment"><button class="good big" id="sopen" style="margin-top:10px">Save opening km</button></div>';
    view(html);
    on('dt', 'change', function () { go('/fuel?date=' + this.value + (staff ? '&driver=' + val('drv') : '')); });
    on('drv', 'change', function () { go('/fuel?date=' + val('dt') + '&driver=' + this.value); });
    function pre() { var v = vmap[val('veh')]; if (!v) return; $('ok').value = v.prev_closing == null ? '' : v.prev_closing; $('pv').textContent = v.prev_closing == null ? 'Is gaadi ka pichla closing km nahi mila — meter se bharein.' : 'Pichla closing km: ' + v.prev_closing + ' (prefilled)'; }
    if ($('veh')) { pre(); on('veh', 'change', pre); }
    on('sopen', 'click', function () {
      var btn = this, okm = val('ok'); if (okm === '') return fail(new Error('Opening km daalein')); btn.disabled = true;
      readPhoto($('op'), 900).then(function (ph) {
        var a = { date: d.date, driver_id: staff ? d.driver_id : '', vehicle_id: Number(val('veh')), opening_km: Number(okm), photo: ph };
        return call('fuelOpen', a).then(function (x) { if (x.need_confirm) { if (!confirm('Opening km ' + okm + ' pichle closing km ' + x.prev_closing + ' se kam hai. Phir bhi save karein?')) return null; a.force = 1; return call('fuelOpen', a); } return x; });
      }).then(function (x) { btn.disabled = false; if (x) { toast('Opening km saved'); route(); } }, function (e) { btn.disabled = false; fail(e); });
    });
    $('view').querySelectorAll('[data-close]').forEach(function (b) {
      var id = b.dataset.close, op = Number(b.dataset.open), calc = function () { var ck = Number(val('ck' + id)), lt = Number(val('lt' + id)), fr = Number(val('fr' + id)), km = ck - op, t = [];
        if (val('ck' + id) !== '') t.push(km < 0 ? '⚠ Closing km opening se kam hai' : 'Km run: ' + Math.round(km * 10) / 10); if (lt > 0 && fr > 0) t.push('Rs/litre: ' + n2(fr / lt)); if (lt > 0 && km >= 0 && val('ck' + id) !== '') t.push('Km/litre: ' + n2(km / lt)); $('cv' + id).textContent = t.join(' • '); };
      ['ck', 'lt', 'fr'].forEach(function (k) { on(k + id, 'input', calc); });
      b.onclick = function () {
        var ck = val('ck' + id); if (ck === '') return fail(new Error('Closing km daalein')); if (Number(ck) < op) return fail(new Error('Closing km (' + ck + ') opening km (' + op + ') se kam nahi ho sakta'));
        if (d.auto_deliveries == null && val('dl' + id) === '') return fail(new Error('Deliveries made bharein'));
        b.disabled = true;
        readPhoto($('cp' + id), 900).then(function (ph) { return call('fuelClose', { id: Number(id), closing_km: Number(ck), fuel_rs: val('fr' + id), litres: val('lt' + id), parking: val('pk' + id), toll: val('tl' + id), deliveries: val('dl' + id), photo: ph }); })
          .then(function (x) { toast('Saved • ' + x.km_run + ' km' + (x.km_per_litre !== '' ? ' • ' + x.km_per_litre + ' km/l' : '')); route(); }, function (e) { b.disabled = false; fail(e); });
      };
    });
    $('view').querySelectorAll('[data-fc]').forEach(function (b) { b.onclick = function () {
      var e = d.entries.filter(function (x) { return String(x.id) === b.dataset.fc; })[0];
      var sh = sheet('<h2>Edit closing</h2><div class="grid2"><div><label>Closing km</label><input id="eck" type="number" step="any" value="' + h(e.closing_km) + '"></div><div><label>Fuel Rs</label><input id="efr" type="number" step="any" value="' + h(e.fuel_rs) + '"></div><div><label>Litres</label><input id="elt" type="number" step="any" value="' + h(e.litres) + '"></div><div><label>Parking</label><input id="epk" type="number" step="any" value="' + h(e.parking) + '"></div><div><label>MCD / toll</label><input id="etl" type="number" step="any" value="' + h(e.toll) + '"></div><div><label>Deliveries (blank = auto)</label><input id="edl" type="number" value="' + (e.deliveries_src === 'manual' ? h(e.deliveries) : '') + '"></div></div><button class="primary big" id="esv" style="margin-top:10px">Save</button><button class="big" id="ecx" style="margin-top:8px">Cancel</button>');
      sh.querySelector('#ecx').onclick = function () { sh.remove(); };
      sh.querySelector('#esv').onclick = function () { var g = function (k) { return sh.querySelector('#' + k).value.trim(); }; call('fuelClose', { id: e.id, closing_km: g('eck'), fuel_rs: g('efr'), litres: g('elt'), parking: g('epk'), toll: g('etl'), deliveries: g('edl') }).then(function () { sh.remove(); toast('Saved'); route(); }, fail); };
    }; });
  }, function (e) { view('<div class="card">' + h(e.message) + '</div>'); });
};
var FUEL_COLS = [['date', 'Date'], ['vehicle', 'Vehicle'], ['driver', 'Driver'], ['opening_km', 'Opening km'], ['closing_km', 'Closing km'], ['km_run', 'Km run'], ['fuel_rs', 'Fuel Rs'], ['litres', 'Litres'], ['rs_per_litre', 'Rs per litre'], ['km_per_litre', 'Km per litre'], ['parking', 'Parking'], ['toll', 'MCD/toll'], ['deliveries', 'Deliveries made']];
function fuelGroupTable(title, g, withVeh) {
  return '<h3>' + title + '</h3><div class="tw"><table><tr><th>' + (withVeh ? 'Driver' : 'Vehicle') + '</th>' + (withVeh ? '<th>Vehicle</th>' : '') + '<th>Km</th><th>Litres</th><th>Km/l</th><th>Expected</th><th>Diff</th><th>Fuel</th><th>Parking</th><th>MCD/toll</th><th>Deliv</th><th>Rs/km</th><th>Rs/deliv</th></tr>' +
    g.map(function (a) { return '<tr' + (a.flag ? ' style="background:#fde0e4"' : '') + '><td>' + h(a.name) + (a.flag ? ' ⚠' : '') + '</td>' + (withVeh ? '<td>' + h(a.vehicle) + '</td>' : '') + '<td>' + n2(a.km) + '</td><td>' + n2(a.litres) + '</td><td><b>' + n2(a.kmpl) + '</b></td><td>' + n2(a.expected_kmpl) + (a.expected_src ? '<div class="small muted">' + h(a.expected_src) + '</div>' : '') + '</td><td>' + (a.diff_pct == null ? '-' : a.diff_pct + '%') + '</td><td>' + inr(a.fuel_rs) + '</td><td>' + inr(a.parking) + '</td><td>' + inr(a.toll) + '</td><td>' + a.deliveries + '</td><td>' + n2(a.cost_per_km) + '</td><td>' + n2(a.cost_per_delivery) + '</td></tr>'; }).join('') + '</table></div>';
}
ROUTES['/fuelreport'] = function (q) {
  var month = q.m || today().slice(0, 7);
  call('fuelReport', { month: month }).then(function (r) {
    var t = r.totals;
    view('<div class="card"><div class="row"><h2 style="flex:1">⛽ Fuel & km per litre</h2><input type="month" id="mo" value="' + month + '" style="max-width:170px"></div>' +
      '<div class="grid4">' + kpi(n2(t.km), 'Km run') + kpi(n2(t.litres), 'Litres') + kpi(n2(t.kmpl), 'Km / litre') + kpi(inr(t.fuel_rs), 'Fuel') + kpi(inr(t.parking), 'Parking') + kpi(inr(t.toll), 'MCD / toll') + kpi(inr(t.total_cost), 'Total cost') + kpi(n2(t.cost_per_km), 'Cost per km') + kpi(t.deliveries, 'Deliveries') + kpi(n2(t.cost_per_delivery), 'Cost per delivery') + '</div>' +
      '<p class="small muted">Km/l = total km ÷ total litres (closed entries). ⚠ = more than ' + r.tolerance_pct + '% below the vehicle\'s expected km/l (set in Vehicles, else its own last-3-month average).' + (r.open_entries ? ' ' + r.open_entries + ' entries still open (no closing km).' : '') + '</p>' +
      '<div class="row"><button class="primary" id="dl">⬇ CSV (daily log)</button><button id="dl2">⬇ CSV (monthly roll-up)</button></div></div>' +
      '<div class="card"><h2>⚠ Flags</h2>' + (r.flags.length ? '<table>' + r.flags.map(function (f) { return '<tr><td>' + h(f.type) + '</td><td>' + h(f.name) + '</td><td>' + n2(f.kmpl) + ' km/l vs ' + n2(f.expected_kmpl) + '</td><td><b style="color:var(--low)">' + f.diff_pct + '%</b></td></tr>'; }).join('') + '</table>' : '<p class="muted small">None</p>') + '</div>' +
      '<div class="card">' + fuelGroupTable('By vehicle', r.by_vehicle) + fuelGroupTable('By driver', r.by_driver, true) + '</div>' +
      '<div class="card"><h3>Daily log</h3><div class="tw"><table><tr>' + FUEL_COLS.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '<th></th></tr>' +
      r.rows.map(function (e) { return '<tr' + (e.flag ? ' style="background:#fde0e4"' : '') + '>' + FUEL_COLS.map(function (c) { var v = e[c[0]]; return '<td>' + (c[0] === 'date' ? dmy(v) : c[0] === 'vehicle' || c[0] === 'driver' ? h(v) : n2(v)) + '</td>'; }).join('') +
        '<td>' + (e.status !== 'closed' ? '<span class="pill st-arrived">open</span>' : '') + (e.flag ? ' ⚠' : '') + (e.opening_photo ? ' <a target="_blank" href="' + h(e.opening_photo) + '">📷</a>' : '') + (e.closing_photo ? '<a target="_blank" href="' + h(e.closing_photo) + '">📷</a>' : '') + '</td></tr>'; }).join('') + '</table></div></div>');
    on('mo', 'change', function () { go('/fuelreport?m=' + this.value); });
    on('dl', 'click', function () { var rows = r.rows.map(function (e) { var o = {}; FUEL_COLS.forEach(function (c) { o[c[1]] = e[c[0]]; }); o['Deliveries source'] = e.deliveries_src; o.Status = e.status; o['Expected km/l'] = e.expected_kmpl; o.Flag = e.flag; return o; });
      download('fuel-log-' + month + '.csv', csv(rows, FUEL_COLS.map(function (c) { return c[1]; }).concat(['Deliveries source', 'Status', 'Expected km/l', 'Flag']))); });
    on('dl2', 'click', function () { var all = [];
      r.by_vehicle.forEach(function (a) { all.push(Object.assign({ group: 'vehicle', vehicle: a.name, driver: '' }, a)); }); r.by_driver.forEach(function (a) { all.push(Object.assign({ group: 'driver', driver: a.name }, a)); });
      all.push(Object.assign({ group: 'total', vehicle: '', driver: '' }, t));
      download('fuel-summary-' + month + '.csv', csv(all, ['group', 'vehicle', 'driver', 'entries', 'km', 'litres', 'kmpl', 'expected_kmpl', 'diff_pct', 'flag', 'fuel_rs', 'rs_per_litre', 'parking', 'toll', 'total_cost', 'deliveries', 'cost_per_km', 'cost_per_delivery'])); });
  }, fail);
};

// ---------------- masters
function formCard(title, fields, rows, cols, onSave, key) {
  return '<div class="card"><h2>' + title + '</h2><input type="hidden" id="f_id">' + fields.map(function (f) { return '<label>' + f[1] + '</label>' + (f[2] === 'select' ? '<select id="f_' + f[0] + '">' + f[3] + '</select>' : '<input id="f_' + f[0] + '" ' + (f[2] ? 'type="' + f[2] + '" ' : '') + (f[3] || '') + '>'); }).join('') +
    '<div class="row" style="margin-top:10px"><button class="primary" id="fs">Save</button><button id="fc">Clear</button></div></div><div class="card"><div class="tw"><table><tr>' + cols.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '<th></th></tr>' +
    rows.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td>' + h(c[2] ? c[2](r) : r[c[0]]) + '</td>'; }).join('') + '<td><button class="sm" data-ed="' + r.id + '">Edit</button></td></tr>'; }).join('') + '</table></div></div>';
}
function bindForm(fields, rows, action, extra) {
  function set(r) { $('f_id').value = r ? r.id : ''; fields.forEach(function (f) { var e = $('f_' + f[0]); if (e) e.value = r && r[f[0]] != null ? r[f[0]] : (f[4] || ''); }); }
  set(null);
  $('view').querySelectorAll('[data-ed]').forEach(function (b) { b.onclick = function () { set(rows.filter(function (r) { return String(r.id) === b.dataset.ed; })[0]); window.scrollTo(0, 0); }; });
  on('fc', 'click', function () { set(null); });
  on('fs', 'click', function () { var d = { id: val('f_id') ? Number(val('f_id')) : '' }; fields.forEach(function (f) { d[f[0]] = val('f_' + f[0]); }); call(action, d).then(function () { toast('Saved'); S.masters = null; route(); }, fail); });
  if (extra) extra(set);
}
var ACT = '<option value="1">Active</option><option value="0">Off</option>';
ROUTES['/stores'] = function () {
  masters(true).then(function (m) {
    var F = [['code', 'Code'], ['name', 'Store name *'], ['address', 'Address'], ['area', 'Area'], ['lat', 'Latitude', 'number', 'step="any"'], ['lng', 'Longitude', 'number', 'step="any"'], ['contact', 'Contact person'], ['phone', 'Phone', 'tel'], ['active', 'Status', 'select', ACT, '1']];
    view(formCard('Stores (GPS zaroori)', F, m.stores, [['code', 'Code'], ['name', 'Name'], ['area', 'Area'], ['gps', 'GPS', function (r) { return r.lat !== '' ? '✔' : '✖ missing'; }], ['active', 'On', function (r) { return Number(r.active) ? '✔' : '-'; }]]) +
      '<p class="small muted">Tip: store par khade hokar "Use my location" dabayein, ya Google Maps se lat,lng copy karein.</p>');
    $('view').querySelector('.card h2').insertAdjacentHTML('afterend', '<button class="sm" id="here">📍 Use my location</button> <input id="paste" placeholder="Paste &quot;28.65, 77.19&quot; from Google Maps" style="margin-top:6px">');
    bindForm(F, m.stores, 'saveStore');
    on('here', 'click', function () { getPos().then(function (p) { if (!p) return fail(new Error('GPS not available')); $('f_lat').value = p.lat.toFixed(6); $('f_lng').value = p.lng.toFixed(6); toast('±' + p.acc + ' m'); }); });
    on('paste', 'input', function () { var mm = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/.exec(this.value); if (mm) { $('f_lat').value = mm[1]; $('f_lng').value = mm[2]; } });
  }, fail);
};
ROUTES['/vehicles'] = function () {
  masters(true).then(function (m) {
    var F = [['number', 'Vehicle number *'], ['type', 'Type (Tempo / Bike / Van)'], ['capacity_boxes', 'Capacity (boxes)', 'number'], ['expected_kmpl', 'Expected km/l (blank = own 3-month average)', 'number', 'step="0.1" inputmode="decimal"'], ['active', 'Status', 'select', ACT, '1']];
    view(formCard('Vehicles', F, m.vehicles, [['number', 'Number'], ['type', 'Type'], ['capacity_boxes', 'Boxes'], ['expected_kmpl', 'Exp km/l', function (r) { return r.expected_kmpl === '' || r.expected_kmpl == null ? 'auto' : r.expected_kmpl; }], ['active', 'On', function (r) { return Number(r.active) ? '✔' : '-'; }]])); bindForm(F, m.vehicles, 'saveVehicle');
  }, fail);
};
ROUTES['/users'] = function () {
  masters(true).then(function (m) {
    var vo = '<option value="">—</option>' + m.vehicles.map(function (v) { return '<option value="' + v.id + '">' + h(v.number) + '</option>'; }).join('');
    var F = [['username', 'Username *'], ['name', 'Full name *'], ['mobile', 'Mobile', 'tel'], ['role', 'Role', 'select', '<option value="driver">Driver</option><option value="dispatcher">Dispatcher</option><option value="admin">Admin</option>', 'driver'], ['vehicle_id', 'Default vehicle', 'select', vo], ['pin', 'PIN (new / reset only)', 'text', 'inputmode="numeric"'], ['active', 'Status', 'select', ACT, '1']];
    view(formCard('Users / Drivers', F, m.users, [['username', 'User'], ['name', 'Name'], ['role', 'Role'], ['mobile', 'Mobile'], ['active', 'On', function (r) { return Number(r.active) ? '✔' : '-'; }]])); bindForm(F, m.users, 'saveUser');
  }, fail);
};
ROUTES['/settings'] = function () {
  masters(true).then(function (m) {
    var s = m.settings, keys = ['depot_name', 'depot_lat', 'depot_lng', 'start_time', 'speed_kmh', 'service_min', 'road_factor', 'use_google_maps', 'geofence_m', 'late_min', 'idle_min', 'ping_sec', 'photo_required', 'otp_required', 'km_rate', 'kmpl_tolerance_pct', 'company'];
    view('<div class="card"><h2>Settings</h2>' + keys.map(function (k) { return '<label>' + k + '</label><input id="s_' + k + '" value="' + h(s[k]) + '">'; }).join('') + '<button class="primary big" id="ss" style="margin-top:12px">Save</button></div>');
    on('ss', 'click', function () { var d = {}; keys.forEach(function (k) { d[k] = val('s_' + k); }); call('saveSettings', d).then(function () { toast('Saved'); return call('me'); }).then(function (r) { S.settings = r.settings; LS.setItem('imd_settings', JSON.stringify(r.settings)); }, fail); });
  }, fail);
};

// ---------------- boot
if (S.token) call('me', {}, true).then(function (r) { S.user = r.user; S.settings = r.settings; LS.setItem('imd_user', JSON.stringify(r.user)); LS.setItem('imd_settings', JSON.stringify(r.settings)); nav(location.hash.replace(/^#/, '').split('?')[0]); }).catch(function () {});
if (LS.getItem('imd_trip')) startTracking(LS.getItem('imd_trip'));
window.__IMD = { ROUTES: ROUTES };
route();
})();
