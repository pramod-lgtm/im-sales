/* IM Warehouse frontend: static PWA. Talks to Apps Script JSON API (POST text/plain). */
(function () {
'use strict';
var $ = function (id) { return document.getElementById(id); };
var LS = window.localStorage;
var S = { token: LS.getItem('imw_token'), user: JSON.parse(LS.getItem('imw_user') || 'null'), m: null };
function apiUrl() { return LS.getItem('imw_api') || (window.IM_WAREHOUSE_CONFIG || {}).apiUrl || ''; }
function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function today() { return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10); }
function tm(iso) { if (!iso) return '-'; var t = new Date(new Date(iso).getTime() + 330 * 60000), hh = t.getUTCHours(), mm = t.getUTCMinutes(); return t.getUTCDate() + '/' + (t.getUTCMonth() + 1) + ' ' + ((hh % 12) || 12) + ':' + (mm < 10 ? '0' : '') + mm + (hh < 12 ? 'am' : 'pm'); }
function mins(m) { if (m == null || m === '') return '-'; m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm'; }
function inr(n) { return 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
function dmy(d) { return d ? String(d).split('-').reverse().join('-') : ''; }
function val(id) { var e = $(id); return e ? e.value.trim() : ''; }
var pending = 0; function busy(d) { pending += d; $('loading').classList.toggle('hidden', pending <= 0); }
function toast(m, t) { var e = $('toast'); e.textContent = m; e.className = 'toast ' + (t || 'ok'); clearTimeout(e._h); e._h = setTimeout(function () { e.className = 'toast hidden'; }, 4000); }
function fail(e) { toast(e && e.message || String(e), 'err'); }
function call(action, data, quiet) {
  var url = apiUrl(); if (!url) { go('/setup'); return Promise.reject(new Error('API link set nahi hai. Setup screen par /exec link daalein.')); }
  if (!quiet) busy(1);
  return fetch(url, { method: 'POST', redirect: 'follow', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: S.token, action: action, data: data || {} }) })
    .then(function (r) { if (!r.ok) throw new Error('Server error ' + r.status); return r.text(); })
    .then(function (s) { try { return JSON.parse(s); } catch (e) { throw new Error('Bad response. API link / deployment (Anyone access) check karein.'); } },
      function (e) { throw new Error(/Server/.test(e.message) ? e.message : 'Network problem, internet check karein.'); })
    .then(function (r) { if (!quiet) busy(-1); if (!r.ok) { if (r.auth === false) signOut(true); throw new Error(r.error); } return r.data; }, function (e) { if (!quiet) busy(-1); throw e; });
}
function signOut(local) { if (!local) call('logout', {}, true).catch(function () {}); S.token = null; S.user = null; S.m = null; LS.removeItem('imw_token'); LS.removeItem('imw_user'); go('/login'); }
function masters(force) { if (S.m && !force) return Promise.resolve(S.m); return call('masters').then(function (m) { S.m = m; return m; }); }
function role() { return S.user && S.user.role; }
function isMgr() { return role() === 'admin' || role() === 'warehouse_manager'; }
function can(p) { var P = { view: ['admin', 'warehouse_manager'], bills: ['admin', 'warehouse_manager', 'biller'], hold: ['admin', 'warehouse_manager', 'biller'], delivery: ['admin', 'warehouse_manager', 'dispatch'], sync: ['admin', 'warehouse_manager', 'biller'], manage: ['admin'] }; return (P[p] || []).indexOf(role()) >= 0; }
function stageLbl(s) { return (S.m && S.m.stage_label[s]) || s; }
function pill(o) { return '<span class="pill st-' + h(o.stage) + '">' + h(stageLbl(o.stage)) + '</span>' + (Number(o.hold) ? ' <span class="pill st-hold">HOLD</span>' : ''); }
function csv(rows, name) {
  if (!rows.length) return toast('Kuch data nahi', 'err'); var keys = Object.keys(rows[0]);
  var s = [keys.join(',')].concat(rows.map(function (r) { return keys.map(function (k) { var v = r[k] == null ? '' : typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k]); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); })).join('\n');
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + s], { type: 'text/csv' })); a.download = name + '-' + today() + '.csv'; a.click();
}
function sheet(html) { var d = document.createElement('div'); d.className = 'sheet'; d.innerHTML = '<div>' + html + '<button class="big" data-close style="margin-top:10px">Band karein</button></div>'; d.addEventListener('click', function (e) { if (e.target === d || e.target.hasAttribute('data-close')) d.remove(); }); document.body.appendChild(d); return d; }

// ---------------- router
function go(p) { if (location.hash !== '#' + p) location.hash = '#' + p; else route(); }
var NAV = [['/q', '📋', 'Meri queue', null], ['/all', '🏬', 'Sab orders', 'view'], ['/cl', '📍', 'Cluster', 'view'], ['/dl', '🏪', 'Dealers', 'view'], ['/bills', '🧾', 'Billing', 'bills'], ['/disp', '🚚', 'Delivery', 'delivery'], ['/dash', '📊', 'Dashboard', 'view'], ['/admin', '⚙️', 'Admin', 'manage']];
function nav(cur) {
  var n = $('nav'); if (!S.user) { n.classList.add('hidden'); return; }
  n.innerHTML = NAV.filter(function (x) { return !x[3] || can(x[3]); }).map(function (x) { return '<a href="#' + x[0] + '" class="' + (cur.indexOf(x[0]) === 0 ? 'on' : '') + '"><i>' + x[1] + '</i>' + x[2] + '</a>'; }).join('');
  n.classList.remove('hidden');
}
function route() {
  var p = location.hash.slice(1) || '/q', v = $('view');
  if (p !== '/setup' && !S.token) p = '/login';
  $('who').textContent = S.user ? S.user.name + ' (' + S.user.role_label + ')' : '';
  nav(p); window.scrollTo(0, 0);
  if (p === '/login') return vLogin(v); if (p === '/setup') return vSetup(v);
  masters().then(function () {
    if (p.indexOf('/o/') === 0) return vOrder(v, Number(p.slice(3)));
    var f = { '/q': vQueue, '/all': vAll, '/cl': vClusters, '/bills': vBills, '/disp': vDisp, '/dash': vDash, '/dl': vDealers, '/admin': vAdmin }[p] || vQueue; f(v);
  }).catch(fail);
}
window.addEventListener('hashchange', route);

// ---------------- login / setup
function vLogin(v) {
  v.innerHTML = '<div class="card"><h2>IM Warehouse login</h2><label>Username ya mobile</label><input id="u" autocomplete="username"><label>PIN</label><input id="p" type="password" inputmode="numeric" autocomplete="current-password">' +
    '<button class="primary big" id="go" style="margin-top:14px">Login</button><p class="center small"><a href="#/setup">Setup / API link</a></p></div>';
  $('go').onclick = function () { call('login', { username: val('u'), pin: val('p') }).then(function (r) { S.token = r.token; S.user = r.user; LS.setItem('imw_token', r.token); LS.setItem('imw_user', JSON.stringify(r.user)); go('/q'); }).catch(fail); };
}
function vSetup(v) {
  v.innerHTML = '<div class="card"><h2>Setup / API link</h2><p class="small muted">Apps Script Web app ka /exec link yahan paste karein.</p><input id="api" value="' + h(apiUrl()) + '"><div class="row" style="margin-top:10px"><button class="primary" id="sv">Save</button><button id="tp">Test</button></div><p class="center small"><a href="#/login">Login par wapas</a></p></div>';
  $('sv').onclick = function () { if (!/^https:\/\/script\.google(usercontent)?\.com\/.+\/exec/.test(val('api'))) return toast('Link /exec par khatam hona chahiye', 'err'); LS.setItem('imw_api', val('api')); toast('Saved'); go(S.token ? '/q' : '/login'); };
  $('tp').onclick = function () { LS.setItem('imw_api', val('api')); call('ping').then(function () { toast('Connected'); }).catch(fail); };
}

// ---------------- lists
function card(o) {
  return '<a class="card" style="display:block;text-decoration:none;color:inherit" href="#/o/' + o.id + '"><div class="row"><b>#' + o.id + ' ' + h(o.dealer_name) + '</b><span style="flex:0">' + pill(o) + '</span></div>' +
    '<div class="small muted">' + h(dmy(o.order_date)) + ' • ' + (o.zone ? '<b>' + h(o.zone) + '</b> / ' : '') + h(o.area || 'area ?') + (o.route ? ' • ' + h(o.route) : '') + (o.beat_day ? ' • beat ' + h(o.beat_day) : '') + ' • ' + h(o.salesman) + '</div>' +
    '<div class="small">' + (o.lines || []).map(function (l) { return h(l.brand) + ' ' + inr(l.ordered_value) + (l.ordered_qty !== '' ? ' (' + l.ordered_qty + ' pcs)' : ''); }).join(' + ') +
    [['P', o.picker_name], ['C', o.checker_name], ['B', o.biller_name], ['Pk', o.packer_name]].filter(function (x) { return x[1]; }).map(function (x) { return ' • ' + x[0] + ': ' + h(x[1]); }).join('') + (o.invoice_no ? ' • Inv ' + h(o.invoice_no) : '') + (o.vehicle || o.delivery_mode ? ' • ' + h(o.vehicle || o.delivery_mode) : '') + '</div>' +
    (Number(o.hold) ? '<div class="small short">Hold: ' + h(o.hold_reason) + ' ' + h(o.hold_note) + '</div>' : '') + '</a>';
}
function syncBtn() { return can('sync') ? '<button class="sm" id="sync">🔄 Sync now</button>' : ''; }
function bindSync(after) { var b = $('sync'); if (b) b.onclick = function () { call('syncNow').then(function (r) { toast('Sync: ' + r.new_orders + ' naye orders, ' + r.dealers_added + ' naye dealers'); S.m = null; after(); }).catch(fail); }; }
function vQueue(v) {
  call('orders', {}).then(function (list) {
    v.innerHTML = '<div class="row"><h2>Meri queue (' + list.length + ')</h2>' + syncBtn() + '</div><p class="small muted">Last sync: ' + tm(S.m.last_sync) + '</p>' + (list.length ? list.map(card).join('') : '<div class="card center muted">Abhi koi kaam nahi.</div>');
    bindSync(function () { vQueue(v); });
  }).catch(fail);
}
function vAll(v) {
  call('orders', { all: 1 }).then(function (list) {
    var st = LS.getItem('imw_f') || '';
    function draw() {
      var f = list.filter(function (o) { return !st || (st === 'hold' ? Number(o.hold) : o.stage === st); }), q = (val('q') || '').toUpperCase();
      if (q) f = f.filter(function (o) { return (o.dealer_name + ' ' + o.area + ' ' + o.route + ' ' + o.invoice_no).toUpperCase().indexOf(q) >= 0; });
      $('lst').innerHTML = f.map(card).join('') || '<div class="card center muted">Kuch nahi</div>';
    }
    v.innerHTML = '<div class="row"><h2>Sab orders</h2>' + syncBtn() + '<button class="sm" id="ex">CSV</button></div><div class="row"><select id="st"><option value="">Sab stage</option>' + S.m.stages.map(function (s) { return '<option value="' + s + '"' + (st === s ? ' selected' : '') + '>' + h(stageLbl(s)) + '</option>'; }).join('') + '<option value="hold"' + (st === 'hold' ? ' selected' : '') + '>HOLD</option></select><input id="q" placeholder="Dealer / area / invoice"></div><div id="lst" style="margin-top:10px"></div>';
    $('st').onchange = function () { st = this.value; LS.setItem('imw_f', st); draw(); }; $('q').oninput = draw; draw(); bindSync(function () { vAll(v); });
    $('ex').onclick = function () { call('exportOrders').then(function (r) { csv(r, 'warehouse-orders'); }).catch(fail); };
  }).catch(fail);
}

// ---------------- order detail
var STEPS = [['allocate', 'allocated_at', 'allocated_by', 'Picker ko allocate'], ['pick', 'picked_at', 'picked_by', 'Pick (maal nikala)'], ['check', 'checked_at', 'checked_by', 'Check'], ['bill', 'billed_at', 'billed_by', 'Bill'], ['pack', 'packed_at', 'packed_by', 'Pack (ready for dispatch)'], ['dispatch', 'dispatched_at', 'dispatched_by', 'Dispatch']];
var STEP_ROLES = { allocate: ['admin', 'warehouse_manager'], pick: ['admin', 'warehouse_manager', 'picker'], check: ['admin', 'warehouse_manager', 'checker'], bill: ['admin', 'warehouse_manager', 'biller'], pack: ['admin', 'warehouse_manager', 'packer'], dispatch: ['admin', 'warehouse_manager', 'dispatch'] };
var NEXT = { new: 'allocate', allocated: 'pick', picked: 'check', checked: 'bill', billed: 'pack', packed: 'dispatch' };
function vOrder(v, id) {
  call('order', { id: id }).then(function (r) {
    var o = r.order, nx = NEXT[o.stage], mine = nx && STEP_ROLES[nx].indexOf(role()) >= 0 && !Number(o.hold), si = S.m.stages.indexOf(o.stage);
    var tl = '<ul class="tl"><li class="done"><b>Order aaya</b> <span class="small muted">' + h(dmy(o.order_date)) + ' • ' + h(o.salesman) + ' (Sales Tracker #' + h(o.src_id) + ')</span></li>' + STEPS.map(function (s, i) {
      var done = !!o[s[1]], extra = '';
      if (s[0] === 'allocate' && done) extra = ' → Picker ' + h(o.picker_name || '-') + ', Checker ' + h(o.checker_name || '-') + ', Biller ' + h(o.biller_name || '-') + ', Packer ' + h(o.packer_name || '-');
      var nm = { pick: o.picker_name, check: o.checker_name, bill: o.biller_name, pack: o.packer_name, dispatch: o.dispatch_name }[s[0]];
      if (s[0] === 'pick' && done) extra = ' • picked ' + h(o.picked_qty) + (Number(o.short_qty) ? ' <span class="short">short ' + o.short_qty + '</span>' : '');
      if (s[0] === 'bill' && o.invoice_no) extra = ' • Inv ' + h(o.invoice_no) + ' • qty ' + h(o.billed_qty) + ' • ' + inr(o.billed_value) + (o.bill_source ? ' (' + h(o.bill_source) + ')' : '');
      if (s[0] === 'pack' && done) extra = ' • ' + h(o.boxes) + ' boxes';
      if (s[0] === 'dispatch' && o.delivery_mode) extra = ' • ' + h(o.delivery_mode) + ' ' + h(o.vehicle) + ' • ' + h(o.payment_mode) + ' • ' + h(dmy(o.dispatch_date));
      return '<li class="' + (done ? 'done' : (i === si ? 'now' : '')) + '"><b>' + s[3] + '</b>' + extra + '<div class="small muted">' + (done ? tm(o[s[1]]) + ' • ' + (nm && s[0] !== 'allocate' ? 'Done by <b>' + h(nm) + '</b> (login: ' + h(o[s[2]]) + ')' : h(o[s[2]])) : 'Pending' + (nm && s[0] !== 'allocate' ? ' • assigned ' + h(nm) : '')) + '</div></li>';
    }).join('') + '</ul>';
    var lines = '<div class="tw"><table><tr><th>Brand / item</th><th>Order qty</th><th>Value</th><th>Picked</th><th>Short</th></tr>' + o.lines.map(function (l) {
      var sh = l.picked_qty !== '' && l.ordered_qty !== '' ? Math.max(0, l.ordered_qty - l.picked_qty) : '';
      return '<tr><td>' + h(l.brand) + (l.item ? ' ' + h(l.item) : '') + '</td><td>' + (isMgr() && o.stage !== 'dispatched' && !o.picked_at ? '<input class="oq" data-id="' + l.id + '" type="number" min="0" value="' + h(l.ordered_qty) + '" style="width:80px;padding:6px">' : h(l.ordered_qty)) + '</td><td>' + inr(l.ordered_value) + '</td><td>' +
        (nx === 'pick' && mine ? '<input class="pq" data-id="' + l.id + '" type="number" min="0" value="' + h(l.ordered_qty) + '" style="width:80px;padding:6px">' : h(l.picked_qty)) + '</td><td class="short">' + (sh || '') + '</td></tr>';
    }).join('') + '</table></div>' + (isMgr() && !o.picked_at ? '<button class="sm" id="saveq">Order qty save</button>' : '');
    var act = '';
    if (mine) {
      if (nx === 'allocate') act = '<div class="grid2"><div>' + whoSel('w_picker', 'picker', o.picker_name, 'Picker') + '</div><div>' + whoSel('w_checker', 'checker', o.checker_name, 'Checker') + '</div><div>' + whoSel('w_biller', 'biller', o.biller_name, 'Biller') + '</div><div>' + whoSel('w_packer', 'packer', o.packer_name, 'Packer') + '</div></div>';
      else act = whoSel('w_done', STEP_ROLE[nx][0], o[STEP_ROLE[nx][1]] || (role() === STEP_ROLE[nx][0] && peopleFor(STEP_ROLE[nx][0]).length <= 1 ? S.user.name : ''), 'Done by (kisne kiya)');
      if (nx === 'bill') act = '<div class="grid2"><div><label>Invoice no</label><input id="inv"></div><div><label>Billed qty</label><input id="bq" type="number" value="' + h(o.picked_qty) + '"></div></div><label>Billed value (Rs)</label><input id="bv" type="number">';
      if (nx === 'pack') act = '<label>Kitne boxes</label><input id="bx" type="number" min="1">';
      act += '<button class="good big" id="stepb" style="margin-top:10px">✔ ' + STEPS.filter(function (s) { return s[0] === nx; })[0][3] + ' confirm</button>';
    }
    var hold = '';
    if (can('hold') && o.stage !== 'dispatched') hold = Number(o.hold) ? '<div class="card"><b class="short">HOLD: ' + h(o.hold_reason) + '</b> ' + h(o.hold_note) + '<div class="small muted">' + tm(o.hold_at) + ' • ' + h(o.hold_by) + '</div><button class="warn" id="unh" style="margin-top:8px">Unhold</button></div>'
      : '<div class="card"><h3>Hold</h3><select id="hr">' + S.m.hold_reasons.map(function (x) { return '<option>' + h(x) + '</option>'; }).join('') + '</select><input id="hn" placeholder="Note (Other ke liye zaroori)" style="margin-top:6px"><button class="danger" id="hb" style="margin-top:8px">Hold karein</button></div>';
    var del = '';
    if (can('delivery') && si >= S.m.stages.indexOf('billed') && o.stage !== 'dispatched') del = '<div class="card"><h3>Delivery allocation</h3>' + delForm(o) + '<button class="primary big" id="delb" style="margin-top:10px">Save delivery</button></div>';
    var nb = r.nearby.length ? '<div class="card"><h3>Paas ke pending orders (' + r.nearby.length + ')</h3><p class="small muted">Inhe saath mein bill / dispatch karein.</p>' + r.nearby.map(function (x) { return '<div class="chk"><a href="#/o/' + x.id + '">#' + x.id + ' ' + h(x.dealer_name) + '</a><span class="small muted">' + h(x.why) + (x.km !== '' ? ' • ' + x.km + ' km' : '') + ' • ' + h(stageLbl(x.stage)) + (Number(x.hold) ? ' • HOLD' : '') + ' • ' + inr(x.ordered_value) + (x.zone ? ' • ' + h(x.zone) : '') + '</span></div>'; }).join('') + '</div>' : '';
    v.innerHTML = '<div class="card"><div class="row"><h2>#' + o.id + ' ' + h(o.dealer_name) + '</h2><span style="flex:0">' + pill(o) + '</span></div><div class="small muted">Zone ' + h(o.zone || '-') + ' • ' + h(o.area || 'area ?') + ' • ' + h(o.route || '-') + (o.beat_day ? ' • beat ' + h(o.beat_day) : '') + (o.lat !== '' ? ' • <a target="_blank" href="https://www.google.com/maps?q=' + o.lat + ',' + o.lng + '">map</a>' : '') + '</div>' + (o.remarks ? '<div class="small">Remark: ' + h(o.remarks) + '</div>' : '') + '</div>' +
      (isMgr() ? '<details class="card"><summary><b>Area / zone badlein</b></summary>' + dlists() + '<div class="grid2"><div><label>Zone</label><input id="oz" list="dl_zone" value="' + h(o.zone) + '"></div><div><label>Area</label><input id="oa" list="dl_area" value="' + h(o.area) + '"></div></div><label>Route</label><input id="or" list="dl_route" value="' + h(o.route) + '"><p class="small muted">Dealer master aur uske open orders mein bhi update hoga. Sync isse overwrite nahi karega.</p><button class="primary" id="oas">Save</button></details>' : '') + '<div class="card"><h3>Items</h3>' + lines + '</div><div class="card"><h3>Timeline</h3>' + tl + act + '</div>' + hold + del + nb;
    var b = $('stepb'); if (b) b.onclick = function () {
      var d = { id: o.id, action: nx };
      if (nx === 'allocate') {
        d.picker_name = whoVal('w_picker'); var pu = S.m.users.filter(function (u) { return u.role === 'picker' && u.name === d.picker_name; })[0]; if (pu) d.picker_id = pu.id;
        d.checker_name = whoVal('w_checker'); d.biller_name = whoVal('w_biller'); d.packer_name = whoVal('w_packer');
      } else { d.done_by = whoVal('w_done'); if (!d.done_by) return toast('Done by chunein', 'err'); }
      if (nx === 'pick') { d.picked = {}; Array.prototype.forEach.call(document.querySelectorAll('.pq'), function (i) { d.picked[i.dataset.id] = i.value; }); }
      if (nx === 'bill') { d.invoice_no = val('inv'); d.billed_qty = val('bq'); d.billed_value = val('bv'); }
      if (nx === 'pack') d.boxes = val('bx');
      call('step', d).then(function () { toast('Ho gaya ✔'); vOrder(v, id); }).catch(fail);
    };
    if ($('oas')) $('oas').onclick = function () { call('orderArea', { id: o.id, zone: val('oz'), area: val('oa'), route: val('or') }).then(function () { S.dl = null; toast('Saved'); vOrder(v, id); }).catch(fail); };
    if (isMgr() && !S.dl) loadDealers().then(function () { var e = $('dlbox'); if (e) e.outerHTML = dlists(); }).catch(function () {});
    if ($('saveq')) $('saveq').onclick = function () { var ls = []; Array.prototype.forEach.call(document.querySelectorAll('.oq'), function (i) { ls.push({ id: i.dataset.id, ordered_qty: i.value }); }); call('setLines', { id: o.id, lines: ls }).then(function () { toast('Saved'); vOrder(v, id); }).catch(fail); };
    if ($('hb')) $('hb').onclick = function () { call('hold', { id: o.id, reason: val('hr'), note: val('hn') }).then(function () { toast('Hold kiya'); vOrder(v, id); }).catch(fail); };
    if ($('unh')) $('unh').onclick = function () { call('unhold', { id: o.id }).then(function () { toast('Unhold'); vOrder(v, id); }).catch(fail); };
    if ($('delb')) $('delb').onclick = function () { call('delivery', delData([o.id])).then(function () { toast('Delivery saved'); vOrder(v, id); }).catch(fail); };
  }).catch(fail);
}
// "Done by": users of that role + staff names of that role + Other (free text)
function peopleFor(r) {
  var seen = {}, out = [];
  S.m.users.filter(function (u) { return u.role === r; }).concat(S.m.staff.filter(function (x) { return x.role === r; })).forEach(function (x) { if (!seen[x.name]) { seen[x.name] = 1; out.push(x.name); } });
  return out;
}
function whoSel(id, r, cur, label) {
  var ps = peopleFor(r), other = cur && ps.indexOf(cur) < 0;
  return '<label>' + label + '</label><select id="' + id + '" onchange="document.getElementById(\'' + id + '_o\').classList.toggle(\'hidden\',this.value!==\'__o\')"><option value="">-</option>' +
    ps.map(function (n) { return '<option' + (n === cur ? ' selected' : '') + '>' + h(n) + '</option>'; }).join('') + '<option value="__o"' + (other ? ' selected' : '') + '>Other name...</option></select>' +
    '<input id="' + id + '_o" class="' + (other ? '' : 'hidden') + '" placeholder="Naam likhein" value="' + h(other ? cur : '') + '" style="margin-top:6px">';
}
function whoVal(id) { var v = val(id); return v === '__o' ? val(id + '_o') : v; }
var STEP_ROLE = { pick: ['picker', 'picker_name'], check: ['checker', 'checker_name'], bill: ['biller', 'biller_name'], pack: ['packer', 'packer_name'], dispatch: ['dispatch', 'dispatch_name'] };
function delForm(o) {
  o = o || {};
  return '<div class="grid2"><div><label>Delivery mode</label><select id="dm">' + S.m.delivery_modes.map(function (x) { return '<option' + (o.delivery_mode === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
    '<div><label>Vehicle</label><select id="vh"><option value="">-</option>' + S.m.vehicles.map(function (x) { return '<option' + (o.vehicle === x.number ? ' selected' : '') + '>' + h(x.number) + '</option>'; }).join('') + '</select></div>' +
    '<div><label>Payment mode</label><select id="pm">' + S.m.payment_modes.map(function (x) { return '<option' + (o.payment_mode === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
    '<div><label>Dispatch date</label><input id="dd" type="date" value="' + h(o.dispatch_date || today()) + '"></div></div><label>Ref (courier AWB / porter / note)</label><input id="dr" value="' + h(o.delivery_ref) + '">';
}
function delData(ids) { return { ids: ids, delivery_mode: val('dm'), vehicle: val('vh'), payment_mode: val('pm'), dispatch_date: val('dd'), delivery_ref: val('dr') }; }

// ---------------- delivery allocation (bulk)
function vDisp(v) {
  call('orders', { all: 1 }).then(function (list) {
    var open = list.filter(function (o) { return (o.stage === 'billed' || o.stage === 'packed') && !Number(o.hold); });
    var un = open.filter(function (o) { return !o.delivery_mode; }), al = open.filter(function (o) { return o.delivery_mode; });
    var groups = {}; un.forEach(function (o) { var k = (o.area || 'No area') + (o.route ? ' • ' + o.route : ''); (groups[k] = groups[k] || []).push(o); });
    v.innerHTML = '<h2>Delivery allocation</h2><div class="card"><h3>Bill ho chuke, delivery baaki (' + un.length + ')</h3>' + Object.keys(groups).sort().map(function (k) {
      return '<div class="small muted" style="margin-top:8px"><b>' + h(k) + '</b> (' + groups[k].length + ')</div>' + groups[k].map(function (o) { return '<label class="chk"><input type="checkbox" class="sel" value="' + o.id + '"><span>#' + o.id + ' ' + h(o.dealer_name) + ' • ' + h(o.invoice_no) + ' • ' + inr(o.billed_value) + ' • ' + h(stageLbl(o.stage)) + (o.boxes ? ' • ' + o.boxes + ' boxes' : '') + '</span></label>'; }).join('');
    }).join('') + (un.length ? delForm() + '<button class="primary big" id="go" style="margin-top:10px">Selected ko allocate karein</button>' : '<p class="muted">Sab allocate ho gaye.</p>') + '</div>' +
      '<div class="card"><h3>Allocated, dispatch baaki (' + al.length + ')</h3>' + al.map(card).join('') + '</div>';
    if ($('go')) $('go').onclick = function () { var ids = Array.prototype.map.call(document.querySelectorAll('.sel:checked'), function (i) { return Number(i.value); }); if (!ids.length) return toast('Orders chunein', 'err'); call('delivery', delData(ids)).then(function () { toast(ids.length + ' allocated'); vDisp(v); }).catch(fail); };
  }).catch(fail);
}

// ---------------- clusters
function vClusters(v) {
  call('clusters').then(function (cl) {
    var lastZ = null;
    v.innerHTML = '<div class="row"><h2>Cluster view (pending)</h2><button class="sm" id="ex">CSV</button></div><p class="small muted">Zone, phir area, phir route. Ek jagah ke unbilled / unallocated orders saath bill aur dispatch karein.</p>' + cl.map(function (c, i) {
      var zh = c.zone !== lastZ ? '<h3 style="margin-top:14px">Zone: ' + h(c.zone) + ' (' + cl.filter(function (x) { return x.zone === c.zone; }).reduce(function (a, x) { return a + x.orders; }, 0) + ' orders)</h3>' : ''; lastZ = c.zone;
      return zh + '<div class="card"><div class="row"><b>' + h(c.key) + '</b><span style="flex:0" class="pill">' + c.orders + ' orders</span></div><div class="small muted">' + (c.route ? 'Route: ' + h(c.route) + ' • ' : '') + c.dealers + ' dealers • ' + inr(c.value) + ' • unbilled ' + c.unbilled + (c.held ? ' • <span class="short">hold ' + c.held + '</span>' : '') + '</div><div class="small">' + c.ids.map(function (id) { return '<a href="#/o/' + id + '">#' + id + '</a>'; }).join(' ') + '</div></div>';
    }).join('');
    $('ex').onclick = function () { csv(cl.map(function (c) { return { zone: c.zone, area: c.area || c.key, route: c.route, orders: c.orders, dealers: c.dealers, value: c.value, unbilled: c.unbilled, hold: c.held, order_ids: c.ids.join(' ') }; }), 'clusters'); };
  }).catch(fail);
}

// ---------------- billing import
var FIELDS = [['invoice_no', 'Invoice no *'], ['bill_date', 'Bill date *'], ['dealer', 'Dealer / party name *'], ['order_ref', 'Order ref (optional)'], ['qty', 'Qty'], ['value', 'Value / amount']];
var TEMPLATE_MAP = { invoice_no: 'Invoice No', bill_date: 'Invoice Date', dealer: 'Dealer / Party Name', order_ref: 'Order Ref', qty: 'Qty', value: 'Value' };
var GUESS = { invoice_no: /inv.*(no|num)|bill.*no|voucher|document.*no|^trx|transaction.*number/i, bill_date: /date/i, dealer: /party|customer|dealer|bill.?to|account.*name/i, order_ref: /order|ref|po/i, qty: /qty|quantity/i, value: /amount|value|total|net/i };
function loadXlsx() { if (window.XLSX) return Promise.resolve(); return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = res; s.onerror = function () { rej(new Error('XLSX reader load nahi hua. CSV try karein.')); }; document.head.appendChild(s); }); }
function parseCsv(text) {
  var rows = [], row = [], f = '', q = false, i, ch; text = String(text).replace(/^\uFEFF/, '');
  for (i = 0; i < text.length; i++) { ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += ch; }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  rows = rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); }); if (!rows.length) return [];
  var head = rows[0].map(function (x) { return String(x).trim(); });
  return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (k, j) { o[k] = r[j] == null ? '' : r[j]; }); return o; });
}
function readFile(file) {
  if (/\.xlsx?$/i.test(file.name)) return loadXlsx().then(function () { return file.arrayBuffer(); }).then(function (b) { var wb = XLSX.read(b, { type: 'array', cellDates: true }), ws = wb.Sheets[wb.SheetNames[0]]; return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' }); });
  return file.text().then(parseCsv);
}
function vBills(v) {
  v.innerHTML = '<h2>Daily billing import (Fusion ERP)</h2><div class="card"><p class="small"><a href="Billing_Import_Template.xlsx" download>⬇ Download template (XLSX)</a> : template ke columns apne aap map ho jaate hain. EXAMPLE rows skip hoti hain.</p><label>CSV ya XLSX file</label><input type="file" id="f" accept=".csv,.xlsx,.xls"><div id="mapper"></div></div><div class="card"><div class="row"><h3>Unmatched bills</h3><button class="sm" id="rl">Refresh</button></div><div id="um"></div></div>';
  $('f').onchange = function () {
    var file = this.files[0]; if (!file) return;
    readFile(file).then(function (rows) {
      if (!rows.length) throw new Error('File khali hai');
      var cols = Object.keys(rows[0]), saved = S.m.bill_map || {};
      $('mapper').innerHTML = '<p class="small muted">' + rows.length + ' rows. Columns match karein (yaad rakha jayega):</p>' + FIELDS.map(function (fd) {
        var pre = cols.indexOf(TEMPLATE_MAP[fd[0]]) >= 0 ? TEMPLATE_MAP[fd[0]] : cols.indexOf(saved[fd[0]]) >= 0 ? saved[fd[0]] : (cols.filter(function (c) { return GUESS[fd[0]].test(c); })[0] || '');
        return '<label>' + fd[1] + '</label><select id="m_' + fd[0] + '"><option value="">(none)</option>' + cols.map(function (c) { return '<option' + (c === pre ? ' selected' : '') + '>' + h(c) + '</option>'; }).join('') + '</select>';
      }).join('') + '<button class="primary big" id="imp" style="margin-top:12px">Import + match</button>';
      $('imp').onclick = function () {
        var map = {}; FIELDS.forEach(function (fd) { map[fd[0]] = val('m_' + fd[0]); });
        if (!map.invoice_no || !map.dealer || !map.bill_date) return toast('Invoice, date aur dealer column zaroori', 'err');
        var bills = mapBillRows(rows, map);
        call('importBills', { map: map, rows: bills }).then(function (r) { S.m.bill_map = map; toast('Matched ' + r.matched + ', unmatched ' + r.unmatched + ', duplicate skip ' + r.skipped_duplicates); loadUm(); }).catch(fail);
      };
    }).catch(fail);
  };
  $('rl').onclick = loadUm; loadUm();
}
function num(v) { var n = Number(String(v == null ? '' : v).replace(/[,₹\s]|Rs\.?/gi, '')); return isFinite(n) ? n : 0; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function anyDate(v) {
  var s = String(v || '').trim(), m, MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
  if ((m = /^(\d{1,2})[-\/. ]([A-Za-z]{3})[A-Za-z]*[-\/. ](\d{2,4})/.exec(s)) && MON[m[2].toLowerCase()]) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad2(MON[m[2].toLowerCase()]) + '-' + pad2(+m[1]);
  if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/.exec(s))) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad2(+m[2]) + '-' + pad2(+m[1]);
  return s;
}
function mapBillRows(rows, map) {
  var by = {}, out = [];
  rows.forEach(function (r) { var inv = String(r[map.invoice_no] == null ? '' : r[map.invoice_no]).trim(); if (!inv || /^EXAMPLE/i.test(inv)) return; var b = by[inv];
    if (!b) { b = by[inv] = { invoice_no: inv, bill_date: anyDate(r[map.bill_date]), dealer: String(r[map.dealer] || '').trim(), order_ref: map.order_ref ? String(r[map.order_ref] || '').trim() : '', qty: 0, value: 0 }; out.push(b); }
    b.qty += map.qty ? num(r[map.qty]) : 0; b.value += map.value ? num(r[map.value]) : 0; });
  return out;
}
function loadUm() {
  Promise.all([call('unmatchedBills'), call('orders', { all: 1 })]).then(function (r) {
    var um = r[0], open = r[1].filter(function (o) { return !o.invoice_no && o.stage !== 'dispatched'; });
    $('um').innerHTML = um.length ? um.map(function (b) {
      return '<div class="card"><b>' + h(b.invoice_no) + '</b> • ' + h(dmy(b.bill_date)) + ' • ' + h(b.dealer) + ' • qty ' + h(b.qty) + ' • ' + inr(b.value) + '<div class="row" style="margin-top:6px"><select class="lk" data-id="' + b.id + '"><option value="">Order chunein</option>' + open.map(function (o) { return '<option value="' + o.id + '">#' + o.id + ' ' + h(o.dealer_name) + ' (' + h(dmy(o.order_date)) + ')</option>'; }).join('') + '</select><button class="sm primary" data-link="' + b.id + '">Link</button><button class="sm" data-ign="' + b.id + '">Ignore</button></div></div>';
    }).join('') : '<p class="muted">Sab bills match ho gaye.</p>';
    Array.prototype.forEach.call(document.querySelectorAll('[data-link]'), function (bt) { bt.onclick = function () { var s = document.querySelector('.lk[data-id="' + bt.dataset.link + '"]'); if (!s.value) return toast('Order chunein', 'err'); call('linkBill', { bill_id: Number(bt.dataset.link), order_id: Number(s.value) }).then(function () { toast('Linked'); loadUm(); }).catch(fail); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-ign]'), function (bt) { bt.onclick = function () { call('ignoreBill', { bill_id: Number(bt.dataset.ign) }).then(loadUm).catch(fail); }; });
  }).catch(fail);
}

// ---------------- dealers
function loadDealers(force) { if (S.dl && !force) return Promise.resolve(S.dl); return call('dealers', {}, true).then(function (d) { S.dl = d; return d; }); }
function uniq(k) { var m = {}; (S.dl || []).forEach(function (d) { var v = String(d[k] || '').trim(); if (v) m[v] = 1; }); return Object.keys(m).sort(); }
function dlists() { return '<div id="dlbox">' + ['zone', 'area', 'route'].map(function (k) { return '<datalist id="dl_' + k + '">' + uniq(k).map(function (v) { return '<option value="' + h(v) + '">'; }).join('') + '</datalist>'; }).join('') + '</div>'; }
function vDealers(v) {
  loadDealers(true).then(function (list) {
    var fz = LS.getItem('imw_fz') || '', fa = '';
    v.innerHTML = '<div class="row"><h2>Dealers (' + list.length + ')</h2><button class="sm" id="dx">CSV download</button><label class="btn sm" style="margin:0">CSV upload<input type="file" id="du" accept=".csv" class="hidden"></label></div>' + dlists() +
      '<div class="row"><input id="dq" placeholder="Naam / mobile"><select id="dz"><option value="">Sab zone</option><option value="__none">(zone khali)</option>' + uniq('zone').map(function (z) { return '<option' + (z === fz ? ' selected' : '') + '>' + h(z) + '</option>'; }).join('') + '</select><select id="da"><option value="">Sab area</option><option value="__none">(area khali)</option>' + uniq('area').map(function (z) { return '<option>' + h(z) + '</option>'; }).join('') + '</select></div>' +
      '<div class="card" style="margin-top:10px"><b>Bulk:</b> select karke zone / area set karein<div class="row" style="margin-top:6px"><input id="bz" list="dl_zone" placeholder="Zone"><input id="ba" list="dl_area" placeholder="Area (optional)"><button class="primary" id="bs">Selected par lagao</button></div><label class="chk"><input type="checkbox" id="sall"> Sab dikh rahe select karein</label></div><div id="dlst"></div>' +
      '<p class="small muted">CSV columns: id, name, area, zone, route (id ya name se match). Sales Tracker sync aapke badle hue area/zone/route ko overwrite nahi karega.</p>';
    function shown() {
      var q = val('dq').toUpperCase(), z = val('dz'), a = val('da');
      return list.filter(function (d) { return (!q || (d.name + ' ' + d.mobile).toUpperCase().indexOf(q) >= 0) && (!z || (z === '__none' ? !d.zone : d.zone === z)) && (!a || (a === '__none' ? !d.area : d.area === a)); });
    }
    function draw() {
      var f = shown();
      $('dlst').innerHTML = f.slice(0, 300).map(function (d) { return '<div class="chk"><input type="checkbox" class="dsel" value="' + d.id + '"><span style="flex:1"><b>' + h(d.name) + '</b><br><span class="small muted">Zone ' + h(d.zone || '-') + ' • ' + h(d.area || 'area ?') + ' • ' + h(d.route || '-') + (d.beat_day ? ' • ' + h(d.beat_day) : '') + (d.local_override ? ' • local: ' + h(d.local_override) : '') + '</span></span><button class="sm" data-de="' + d.id + '">Edit</button></div>'; }).join('') + (f.length > 300 ? '<p class="muted small">Pehle 300 dikh rahe, search se chhota karein (' + f.length + ').</p>' : '');
      Array.prototype.forEach.call(document.querySelectorAll('[data-de]'), function (b) { b.onclick = function () { edit(list.filter(function (x) { return x.id === Number(b.dataset.de); })[0]); }; });
    }
    function edit(d) {
      var sh = sheet('<h3>' + h(d.name) + '</h3>' + dlists() + '<div class="grid2"><div><label>Zone</label><input id="ez" list="dl_zone" value="' + h(d.zone) + '"></div><div><label>Area</label><input id="ea" list="dl_area" value="' + h(d.area) + '"></div><div><label>Route</label><input id="er" list="dl_route" value="' + h(d.route) + '"></div><div><label>Mobile</label><input id="em" value="' + h(d.mobile) + '"></div><div><label>Lat</label><input id="elat" inputmode="decimal" value="' + h(d.lat) + '"></div><div><label>Lng</label><input id="elng" inputmode="decimal" value="' + h(d.lng) + '"></div></div><button class="primary big" id="es" style="margin-top:10px">Save</button>');
      $('es').onclick = function () { call('saveDealer', { id: d.id, zone: val('ez'), area: val('ea'), route: val('er'), mobile: val('em'), lat: val('elat'), lng: val('elng') }).then(function () { sh.remove(); toast('Saved'); vDealers(v); }).catch(fail); };
    }
    $('dq').oninput = draw; $('dz').onchange = function () { LS.setItem('imw_fz', val('dz')); draw(); }; $('da').onchange = draw; draw();
    $('sall').onchange = function () { var c = this.checked; Array.prototype.forEach.call(document.querySelectorAll('.dsel'), function (i) { i.checked = c; }); };
    $('bs').onclick = function () { var ids = Array.prototype.map.call(document.querySelectorAll('.dsel:checked'), function (i) { return Number(i.value); }); if (!ids.length) return toast('Dealers select karein', 'err'); call('bulkDealers', { ids: ids, zone: val('bz'), area: val('ba') }).then(function (n) { toast(n + ' dealers updated'); vDealers(v); }).catch(fail); };
    $('dx').onclick = function () { csv(list.map(function (d) { return { id: d.id, name: d.name, area: d.area, zone: d.zone, route: d.route, beat_day: d.beat_day, mobile: d.mobile, lat: d.lat, lng: d.lng }; }), 'dealers'); };
    $('du').onchange = function () { var f = this.files[0]; if (!f) return; f.text().then(parseCsv).then(function (rows) { rows = rows.map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { o[k.trim().toLowerCase()] = r[k]; }); return o; }); return call('importDealers', { rows: rows }); }).then(function (r) { toast(r.updated + ' updated' + (r.not_found_count ? ', ' + r.not_found_count + ' nahi mile' : '')); vDealers(v); }).catch(fail); };
  }).catch(fail);
}

// ---------------- dashboard
function table(rows, cols) { return '<div class="tw"><table><tr>' + cols.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '</tr>' + rows.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td>' + (c[2] ? c[2](r[c[0]], r) : h(r[c[0]])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>'; }
function vDash(v) {
  var day = LS.getItem('imw_day') || today();
  call('dashboard', { date: day }).then(function (d) {
    v.innerHTML = '<div class="row"><h2>Dashboard</h2><input type="date" id="day" value="' + day + '" style="flex:0 1 170px"></div>' +
      
      '<div class="grid4">' + S.m.stages.map(function (s) { return '<div class="kpi"><b>' + (d.counts[s] || 0) + '</b><span>' + h(stageLbl(s)) + '</span></div>'; }).join('') + '<div class="kpi"><b class="short">' + d.counts.hold + '</b><span>HOLD</span></div><div class="kpi"><b>' + d.unmatched + '</b><span>Unmatched bills</span></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="row"><h3>Pending to bill (' + d.pending.length + ')</h3><button class="sm" id="e1">CSV</button></div>' + table(d.pending, [['id', '#', function (x) { return '<a href="#/o/' + x + '">' + x + '</a>'; }], ['dealer_name', 'Dealer'], ['zone', 'Zone'], ['area', 'Area'], ['reason', 'Reason', function (x, r) { return r.hold ? '<span class="short">' + h(x) + '</span>' : h(x); }], ['age_days', 'Age (din)'], ['ordered_value', 'Value', inr]]) + '</div>' +
      '<div class="card"><div class="row"><h3>Aaj ka dispatch by vehicle</h3><button class="sm" id="e2">CSV</button></div>' + table(d.dispatch, [['vehicle', 'Vehicle / mode'], ['orders', 'Orders'], ['dispatched', 'Dispatched'], ['boxes', 'Boxes'], ['value', 'Value', inr], ['dealers', 'Dealers', function (x) { return h(x.join(', ')); }]]) + '</div>' +
      '<div class="card"><div class="row"><h3>Efficiency (last 30 din, avg time per step)</h3><button class="sm" id="e3">CSV</button></div>' + table(d.efficiency, [['step', 'Step'], ['person', 'Kisne'], ['orders', 'Orders'], ['avg_min', 'Avg', mins], ['max_min', 'Max', mins]]) + '</div>';
    $('day').onchange = function () { LS.setItem('imw_day', this.value); vDash(v); };
    $('e1').onclick = function () { csv(d.pending, 'pending-to-bill'); }; $('e2').onclick = function () { csv(d.dispatch.map(function (r) { return Object.assign({}, r, { dealers: r.dealers.join(' | ') }); }), 'dispatch-' + day); }; $('e3').onclick = function () { csv(d.efficiency, 'efficiency'); };
  }).catch(fail);
}

// ---------------- admin
function vAdmin(v) {
  Promise.all([call('users'), call('staffList')]).then(function (rr) { var us = rr[0]; S.m.staffAll = rr[1];
    v.innerHTML = '<h2>Admin</h2><div class="card"><h3>Users</h3>' + table(us, [['username', 'Login'], ['name', 'Naam'], ['role_label', 'Role'], ['active', 'Active', function (x) { return Number(x) ? 'Haan' : 'Nahi'; }], ['id', '', function (x) { return '<button class="sm" data-u="' + x + '">Edit</button>'; }]]) +
      '<button class="primary" id="nu" style="margin-top:8px">+ Naya user</button></div><div class="card"><h3>Vehicles</h3>' + S.m.vehicles.map(function (x) { return '<div class="chk">' + h(x.number) + ' <span class="muted small">' + h(x.type) + '</span></div>'; }).join('') + '<div class="row" style="margin-top:8px"><input id="vn" placeholder="DL1XX-0000"><button id="va">Add vehicle</button></div></div>' +
      '<div class="card"><h3>Staff names (bina login)</h3><p class="small muted">Yeh naam "Done by" dropdown mein aate hain.</p>' + (S.m.staffAll || []).map(function (x) { return '<div class="chk"><span style="flex:1">' + h(x.name) + ' <span class="muted small">' + h(S.m.roles[x.role] || x.role) + (Number(x.active) ? '' : ' (off)') + '</span></span><button class="sm" data-st="' + x.id + '">' + (Number(x.active) ? 'Off' : 'On') + '</button></div>'; }).join('') +
      '<div class="row" style="margin-top:8px"><input id="sn" placeholder="Naam"><select id="sr">' + ['picker', 'checker', 'biller', 'packer', 'dispatch', 'warehouse_manager'].map(function (r) { return '<option value="' + r + '">' + S.m.roles[r] + '</option>'; }).join('') + '</select><button id="sa">Add</button></div></div>' +
      '<div class="card small muted">Sales Tracker sync: har 15 min (trigger). Last: ' + tm(S.m.last_sync) + ' ' + h(S.m.last_sync_note) + '</div><button class="big" id="lo">Logout</button>';
    function edit(u) {
      u = u || {}; var d = sheet('<h3>' + (u.id ? 'Edit user' : 'Naya user') + '</h3>' + (u.id ? '' : '<label>Username</label><input id="eu">') + '<label>Naam</label><input id="en" value="' + h(u.name) + '"><label>Mobile</label><input id="em" value="' + h(u.mobile) + '"><label>Role</label><select id="er">' + Object.keys(S.m.roles).map(function (r) { return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + S.m.roles[r] + '</option>'; }).join('') + '</select><label>PIN ' + (u.id ? '(khali = same)' : '') + '</label><input id="ep" inputmode="numeric">' + (u.id ? '<label class="chk"><input type="checkbox" id="ea"' + (Number(u.active) ? ' checked' : '') + '> Active</label>' : '') + '<button class="primary big" id="es" style="margin-top:10px">Save</button>');
      $('es').onclick = function () { call('saveUser', { id: u.id, username: val('eu'), name: val('en'), mobile: val('em'), role: val('er'), pin: val('ep'), active: u.id ? $('ea').checked : 1 }).then(function () { d.remove(); S.m = null; toast('Saved'); route(); }).catch(fail); };
    }
    $('nu').onclick = function () { edit(); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-u]'), function (b) { b.onclick = function () { edit(us.filter(function (x) { return x.id === Number(b.dataset.u); })[0]); }; });
    $('va').onclick = function () { call('saveVehicle', { number: val('vn') }).then(function () { S.m = null; route(); }).catch(fail); };
    $('lo').onclick = function () { signOut(); };
    $('sa').onclick = function () { call('saveStaff', { name: val('sn'), role: val('sr') }).then(function () { S.m = null; toast('Added'); route(); }).catch(fail); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-st]'), function (b) { b.onclick = function () { var x = S.m.staffAll.filter(function (y) { return y.id === Number(b.dataset.st); })[0]; call('saveStaff', { id: x.id, name: x.name, role: x.role, active: !Number(x.active) }).then(function () { S.m = null; route(); }).catch(fail); }; });
  }).catch(fail);
}
// non-admin logout: long-press title
$('title').addEventListener('click', function () { if (S.user && confirm('Logout karein?')) signOut(); });
route();
})();
