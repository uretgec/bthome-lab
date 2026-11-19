/* app.js — one state object, event wiring, one update(). Load order: bthome.js, i18n.js, app.js.
   Every user-visible string comes from window.STR via t(); the engine only emits codes. */
(function () {
  'use strict';
  const B = window.BTHome, STR = window.STR, $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hex = B.hx, nv = v => (typeof v === 'number' && isFinite(v)) ? v : '';
  const u8len = s => new TextEncoder().encode(String(s)).length;
  const LINKS = { format: 'https://bthome.io/format/', enc: 'https://bthome.io/encryption/', assigned: 'https://www.bluetooth.com/specifications/assigned-numbers/', rfc: 'https://www.rfc-editor.org/rfc/rfc3610', core: 'https://www.bluetooth.com/specifications/specs/' };
  const INFO_LINKS = { ll: ['core'], ad: ['assigned'], bth: ['format'], enc: ['enc', 'rfc'], out: ['format'] };
  const COMMON = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x21, 0x3A];
  const FIELD_OF = { 'w.mac': 'mac', 'w.enc.mac': 'mac', 'w.txadd': 'mac', 'w.enc.key': 'encKey', 'w.enc.ctr': 'encCtr', 'w.txrange': 'txVal',
    'w.cu.type': 'cuType', 'w.cu.hex': 'cuData', 'w.cu.long': 'cuData', 'w.cu.fcd2': 'cuData', 'w.namelong': 'name' };
  const FIELDS = ['mac', 'name', 'txVal', 'cuType', 'cuData', 'encKey', 'encCtr'];
  const SEC = { fix: 'll', ll: 'll', crc: 'll', ad: 'ad', bth: 'bth', obj: 'bth', enc: 'enc', cnt: 'enc', mic: 'enc' };
  const secOf = s => (s.layer === 'ad' && s.label.c === 'lbl.svc') ? 'bth' : SEC[s.layer];
  const HOW_LBL = ['lbl.pre', 'lbl.aa', 'lbl.h0 lbl.h1', 'lbl.adva', 'lbl.flags lbl.name.short lbl.name.complete lbl.tx lbl.custom lbl.svc', 'lbl.uuid lbl.info', 'lbl.obj', 'lbl.ct lbl.ctr lbl.mic', 'lbl.crc'];
  const GLOSSARY_N = 15;

  // ---------- i18n ----------
  let lang = 'en';
  function initLang() {
    let v = null; try { v = localStorage.getItem('bthome_lang'); } catch (e) { /* in-memory fallback */ }
    if (v === 'tr' || v === 'en') return v;
    return /^tr/i.test(navigator.language || '') ? 'tr' : 'en';
  }
  function saveLang(v) { try { localStorage.setItem('bthome_lang', v); } catch (e) { /* in-memory only */ } }
  const t = (k, a) => { let s = STR[lang][k]; if (s == null) s = k; return a ? s.replace(/\{(\w+)\}/g, (m, n) => a[n] != null ? a[n] : m) : s; };
  // engine output: string (language-free) or {c, a}
  function tx(x) {
    if (x == null) return ''; if (typeof x === 'string') return x;
    const a = Object.assign({}, x.a); let c = x.c;
    switch (c) {
      case 'lbl.obj': a.hex = hex(a.id); a.name = t('obj.' + a.id + '.name'); break;
      case 'd.enum': return t('enum.' + a.id + '.' + a.v);
      case 'd.dimmer': a.evn = t('enum.60.' + a.ev); break;
      case 'd.cmd': a.opn = t('enum.59.' + a.op); c = a.steps != null ? 'd.cmd.arg' : 'd.cmd.noarg'; break;
      case 'd.h0': a.txn = t(a.tx ? 'val.random' : 'val.public'); break;
      case 'd.info': a.encn = t(a.enc ? 'val.yes' : 'val.no'); a.trign = t(a.trig ? 'val.yes' : 'val.no'); break;
      case 'd.flags': a.names = a.bits.map(i => t('flag.' + i)).join(', ') || '—'; break;
      case 'd.cu.raw': if (!a.n) c = 'd.cu.empty'; break;
      case 'e.range': a.lo = B.fmt(a.lo * a.f, a.f); a.hi = B.fmt(a.hi * a.f, a.f); a.unit = a.u || ''; break;
    }
    return t(c, a);
  }

  // ---------- state ----------
  const base = () => ({ pduType: 2, txAdd: 1, mac: '54:48:E6:8F:80:A5', txPower: { on: false, val: 0 }, custom: { on: false, sel: 'FF', typeHex: '', data: '' }, enc: { key: '231d39c1d7cc1ab1aee224cd096db932', counter: 1122867 } });
  const PRESETS = {
    p1: () => Object.assign(base(), { flagsOn: true, flags: 6, nameMode: 'complete', name: 'DIY-sensor', info: 0, autoSort: true, objs: [{ id: 2, value: 25 }, { id: 3, value: 50.55 }] }),
    p2: () => Object.assign(base(), { flagsOn: true, flags: 6, nameMode: 'none', name: '', info: 1, autoSort: true, objs: [{ id: 2, value: 25.06 }, { id: 3, value: 50.55 }] }),
    p3: () => Object.assign(base(), { flagsOn: true, flags: 6, nameMode: 'none', name: '', info: 4, autoSort: true, objs: [{ id: 0, value: 1 }, { id: 0x3A, value: 1 }] }),
    p4: () => Object.assign(base(), { flagsOn: true, flags: 6, nameMode: 'none', name: '', info: 0, autoSort: true, objs: [{ id: 1, value: 97 }, { id: 2, value: 21.5 }, { id: 2, value: 22 }, { id: 2, value: -3.25 }] })
  };
  let st = PRESETS.p1(), prev = null, view = 'adv';
  const copyTxt = { adv: '', full: '', svc: '' };

  // ---------- static text + dynamic builders (text only; state is never touched) ----------
  function applyStatic() {
    document.documentElement.lang = lang; document.title = t('app.title');
    document.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-attr]').forEach(n => n.dataset.i18nAttr.split(';').forEach(p => { const i = p.indexOf(':'); n.setAttribute(p.slice(0, i), t(p.slice(i + 1))); }));
    document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }
  function buildDyn() {
    $('pduType').innerHTML = B.PDU.map(p => `<option value="${p[0]}"${p[2] ? '' : ' disabled'}>${p[0]} ${p[1]}${p[2] ? '' : ' — ' + esc(t('pdu.unsupported'))}</option>`).join('');
    $('hdrGrid').innerHTML = [7, 6, 5, 4, 3, 2, 1, 0].map(b => `<div class="bit"><b>bit${b}</b><span class="bv" id="hb${b}">0</span><small>${esc(t('hb.' + b))}</small></div>`).join('');
    $('flagBits').innerHTML = [0, 1, 2, 3, 4].map(i => `<label class="chk"><input type="checkbox" data-bit="${i}"><span>bit${i} ${esc(t('flag.' + i))}</span></label>`).join('');
    $('infoGrid').innerHTML = [7, 6, 5, 4, 3, 2, 1, 0].map(b => {
      const lock = b >= 5;
      return `<label class="bit ${lock ? 'lock' : ''}"${lock ? ` title="${esc(t('bit.lock'))}"` : ''}><b>bit${b}</b><input type="checkbox" data-b="${b}" ${lock ? 'disabled' : ''} ${b === 6 ? 'checked' : ''}><small>${esc(t('bit.' + b))}</small></label>`;
    }).join('');
    document.querySelectorAll('[data-info]').forEach(n => {
      const s = n.dataset.info;
      n.innerHTML = ['what', 'enter', 'change', 'break'].map(q => `<p><b>${esc(t('info.q.' + q))}</b> ${t('info.' + s + '.' + q)}</p>`).join('') +
        `<p><b>${esc(t('info.q.spec'))}</b> ${INFO_LINKS[s].map(k => `<a href="${LINKS[k]}" target="_blank" rel="noopener">${esc(t('link.' + k))}</a>`).join(' · ')}</p>`;
    });
    $('howList').innerHTML = HOW_LBL.map((l, i) => `<li data-lbl="${l}">${t('how.' + (i + 1))}</li>`).join('');
    let g = ''; for (let n = 1; n <= GLOSSARY_N; n++) g += `<dt>${esc(t('gl.' + n + '.t'))}</dt><dd>${esc(t('gl.' + n + '.d'))}</dd>`;
    $('gloss').innerHTML = g;
    $('links').innerHTML = Object.keys(LINKS).map(k => `<li><a href="${LINKS[k]}" target="_blank" rel="noopener">${esc(t('link.' + k))}</a></li>`).join('');
  }
  function syncStatic() {
    $('flagsOn').checked = st.flagsOn;
    $('flagBits').querySelectorAll('input').forEach(c => { c.checked = !!((st.flags >> c.dataset.bit) & 1); c.disabled = !st.flagsOn; });
    $('nameMode').value = st.nameMode; $('name').value = st.name; $('name').disabled = st.nameMode === 'none';
    $('infoGrid').querySelectorAll('input[data-b]').forEach(c => { const b = +c.dataset.b; if (b < 5) c.checked = !!((st.info >> b) & 1); });
    $('autoSort').checked = st.autoSort;
    $('pduType').value = st.pduType; $('mac').value = st.mac;
    document.querySelectorAll('input[name=txAdd]').forEach(r => { r.checked = +r.value === st.txAdd; });
    $('txOn').checked = st.txPower.on; $('txVal').value = nv(st.txPower.val); $('txVal').disabled = !st.txPower.on;
    const c = st.custom;
    $('cuOn').checked = c.on; $('cuSel').value = c.sel; $('cuType').value = c.typeHex; $('cuData').value = c.data;
    $('cuSel').disabled = $('cuData').disabled = $('cuType').disabled = !c.on; $('cuType').hidden = c.sel !== 'free';
    const encOn = !!(st.info & 1);
    $('encOn').checked = encOn; $('encKey').value = st.enc.key; $('encCtr').value = nv(st.enc.counter);
    ['encKey', 'randKey', 'encCtr', 'ctrInc'].forEach(id => { $(id).disabled = !encOn; });
    $('encOff').hidden = encOn;
  }

  // ---------- inputs ----------
  $('flagsOn').oninput = e => { st.flagsOn = e.target.checked; syncStatic(); update(); };
  $('flagBits').oninput = e => { const b = +e.target.dataset.bit; st.flags = e.target.checked ? st.flags | (1 << b) : st.flags & ~(1 << b); update(); };
  $('nameMode').oninput = e => { st.nameMode = e.target.value; syncStatic(); update(); };
  $('name').oninput = e => { st.name = e.target.value; update(); };
  $('infoGrid').oninput = e => { const b = +e.target.dataset.b; st.info = e.target.checked ? st.info | (1 << b) : st.info & ~(1 << b); syncStatic(); update(); };
  $('autoSort').oninput = e => { st.autoSort = e.target.checked; update(); };
  $('pduType').oninput = e => { st.pduType = +e.target.value; update(); };
  document.querySelectorAll('input[name=txAdd]').forEach(r => { r.oninput = () => { st.txAdd = +r.value; update(); }; });
  $('mac').oninput = e => { st.mac = e.target.value; update(); };
  $('randMac').onclick = () => {
    const a = new Uint8Array(6); crypto.getRandomValues(a); a[0] = (a[0] & 0x3F) | 0x40; // random static: top 2 bits = 01
    st.mac = Array.from(a).map(hex).join(':'); st.txAdd = 1; syncStatic(); update();
  };
  $('txOn').oninput = e => { st.txPower.on = e.target.checked; syncStatic(); update(); };
  $('txVal').oninput = e => { st.txPower.val = e.target.value === '' ? NaN : +e.target.value; update(); };
  $('cuOn').oninput = e => { st.custom.on = e.target.checked; syncStatic(); update(); };
  $('cuSel').oninput = e => { st.custom.sel = e.target.value; syncStatic(); update(); };
  $('cuType').oninput = e => { st.custom.typeHex = e.target.value; update(); };
  $('cuData').oninput = e => { st.custom.data = e.target.value; update(); };
  $('encOn').oninput = e => { st.info = e.target.checked ? st.info | 1 : st.info & ~1; syncStatic(); update(); };
  $('encKey').oninput = e => { st.enc.key = e.target.value; update(); };
  $('randKey').onclick = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); st.enc.key = Array.from(a).map(hex).join('').toLowerCase(); syncStatic(); update(); };
  $('encCtr').oninput = e => { st.enc.counter = e.target.value === '' ? NaN : +e.target.value; update(); };
  $('ctrInc').onclick = () => { const c = st.enc.counter; st.enc.counter = isFinite(c) ? (c + 1) % 4294967296 : 0; syncStatic(); update(); };
  $('addObj').onclick = () => { st.objs.push({ id: 2, value: B.defaultValue(2) }); buildRows(); update(); };
  $('spaced').oninput = () => $('hexView').classList.toggle('sp', $('spaced').checked);
  document.querySelectorAll('input[name=view]').forEach(r => { r.oninput = () => { view = r.value; prev = null; update(); }; });
  $('preset').oninput = e => { const f = PRESETS[e.target.value]; e.target.value = ''; if (f) loadState(f()); };
  $('reset').onclick = () => loadState(PRESETS.p1());
  document.querySelectorAll('[data-lang]').forEach(b => { b.onclick = () => setLang(b.dataset.lang); });
  function loadState(s) { st = s; prev = null; syncStatic(); buildRows(); update(); }
  function setLang(l) { lang = l; saveLang(l); applyAll(); }

  // ---------- copy ----------
  document.querySelectorAll('[data-cp]').forEach(b => { b.onclick = () => doCopy(b, copyTxt[b.dataset.cp]); });
  function doCopy(btn, text) {
    if (!text) return;
    const done = () => { btn.textContent = '✓'; btn.classList.add('ok'); clearTimeout(btn._t); btn._t = setTimeout(() => { btn.classList.remove('ok'); btn.textContent = t(btn.dataset.i18n); }, 1500); };
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ } ta.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }

  // ---------- cross-highlight (one delegated pair) ----------
  function hl(e, on) {
    const el = e.target.closest && e.target.closest('[data-sid],[data-lbl],[data-seg]'); if (!el) return;
    let sel;
    if (el.dataset.sid) sel = `[data-sid="${el.dataset.sid}"],.sec[data-seg="${el.dataset.seg}"]`;
    else if (el.dataset.lbl) sel = el.dataset.lbl.split(' ').map(c => `[data-lbl="${c}"]`).join(',');
    else sel = `[data-seg="${el.dataset.seg}"]`;
    document.querySelectorAll(sel).forEach(x => x.classList.toggle('hl', on));
  }
  document.addEventListener('mouseover', e => hl(e, true));
  document.addEventListener('mouseout', e => hl(e, false));

  // ---------- measurement rows ----------
  const groupList = B.GROUPS.map(g => ({ g, ids: Object.keys(B.DEFS).map(Number).filter(id => B.DEFS[id].g === g).sort((a, b) => a - b) }));
  function idSelect(sel) {
    const opt = id => `<option value="${id}"${id === sel ? ' selected' : ''}>0x${hex(id)} ${esc(t('obj.' + id + '.name'))}</option>`;
    return '<select data-f="id">' + `<optgroup label="${esc(t('grp.common'))}">${COMMON.map(opt).join('')}</optgroup>` +
      groupList.map(({ g, ids }) => `<optgroup label="${esc(t('grp.' + g))}">${ids.map(opt).join('')}</optgroup>`).join('') + '</select>';
  }
  const sr = k => `<span class="sr">${esc(t(k))}</span>`;
  const enOpts = (list, oid, sel) => list.map(([v]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${hex(v)} ${esc(t('enum.' + oid + '.' + v))}</option>`).join('');
  function editor(d, o) {
    const v = o.value;
    switch (d.k) {
      case 'num': return `<label class="fld">${sr('lbl.value')}<input type="number" step="any" data-f="val" value="${nv(v)}"></label><span class="u">${esc(d.u)}</span>`;
      case 'bin': return `<label class="chk"><input type="checkbox" data-f="val" ${v ? 'checked' : ''}><span>${esc(t('chk.bin'))}</span></label>`;
      case 'enum': return `<label class="fld">${sr('lbl.value')}<select data-f="val">${enOpts(d.en, d.id, v)}</select></label>`;
      case 'ts': { const iso = isFinite(v) ? new Date(v * 1000).toISOString().slice(0, 19) : '';
        return `<label class="fld">${sr('lbl.value')}<input type="datetime-local" step="1" data-f="val" value="${iso}"></label><span class="fh">UTC</span>`; }
      case 'text': return `<label class="fld" style="flex:1">${sr('lbl.value')}<input type="text" data-f="val" value="${esc(v)}" placeholder="${esc(t('text.ph'))}"></label>`;
      case 'raw': return `<label class="fld" style="flex:1">${sr('lbl.value')}<input type="text" class="mono" data-f="val" value="${esc(v)}" placeholder="${esc(t('raw.ph'))}"></label>`;
      case 'dimmer': return `<label class="fld"><span>${esc(t('lbl.event'))}</span><select data-f="ev">${enOpts(B.DIM, 60, v.event)}</select></label><label class="fld"><span>${esc(t('lbl.steps'))}</span><input type="number" min="0" max="255" data-f="st" value="${nv(v.steps)}"></label>`;
      case 'cmd': return `<label class="fld"><span>${esc(t('lbl.opcode'))}</span><select data-f="op">${enOpts(B.CMD, 59, v.op)}</select></label><label class="fld"><span>${esc(t('lbl.steps'))}</span><input type="number" min="0" max="255" data-f="st" value="${nv(v.steps)}" ${v.op < 3 ? 'disabled' : ''}></label>`;
      case 'fw': return (d.n === 4 ? ['major', 'minor', 'patch', 'build'] : ['major', 'minor', 'patch']).map((n, k) =>
        `<label class="fld"><span>${esc(t('fw.' + n))}</span><input type="number" min="0" max="255" data-f="fw" data-k="${k}" value="${nv(v[k])}" style="width:84px"></label>`).join('<span class="u">.</span>');
    }
  }
  function rowHint(d, o) {
    switch (d.k) {
      case 'num': { const ri = B.rangeInfo(d); return t('hint.num', { t: ri.t, lo: B.fmt(ri.lo * ri.f, ri.f), hi: B.fmt(ri.hi * ri.f, ri.f), step: ri.f, unit: ri.u || '—' }); }
      case 'text': return t('hint.text', { n: u8len(o.value) });
      case 'raw': return t('hint.raw', { n: Math.floor(String(o.value).replace(/[\s:]/g, '').length / 2) });
      case 'fw': return t('hint.fw', { n: d.n });
      default: return t('hint.' + d.k);
    }
  }
  function buildRows() {
    $('objs').innerHTML = st.objs.map((o, i) => {
      const d = B.DEFS[o.id];
      return `<div class="row" data-i="${i}"><div class="rowtop"><label class="fld grow">${sr('lbl.object')}${idSelect(o.id)}</label>` +
        `<button type="button" data-f="dup" title="${esc(t('row.dup'))}" aria-label="${esc(t('row.dup'))}">⧉</button>` +
        `<button type="button" data-f="del" title="${esc(t('row.del'))}" aria-label="${esc(t('row.del'))}">✕</button></div>` +
        `<div class="editor">${editor(d, o)}</div><div class="hint"></div><div class="msg err" aria-live="polite"></div><div class="mini"></div></div>`;
    }).join('') || `<div class="hint">${esc(t('bth.none'))}</div>`;
  }
  const num = el => el.value === '' ? NaN : +el.value;
  $('objs').oninput = e => {
    const el = e.target, row = el.closest('.row'); if (!row) return;
    const i = +row.dataset.i, o = st.objs[i], f = el.dataset.f, k = B.DEFS[o.id].k;
    if (f === 'id') { st.objs[i] = { id: +el.value, value: B.defaultValue(+el.value) }; buildRows(); }
    else if (f === 'val') {
      if (k === 'bin') o.value = el.checked ? 1 : 0;
      else if (k === 'enum') o.value = +el.value;
      else if (k === 'num') o.value = num(el);
      else if (k === 'ts') o.value = el.value ? Date.parse((el.value.length === 16 ? el.value + ':00' : el.value) + 'Z') / 1000 : NaN;
      else o.value = el.value;
    }
    else if (f === 'ev') o.value.event = +el.value;
    else if (f === 'st') o.value.steps = num(el);
    else if (f === 'op') { o.value.op = +el.value; buildRows(); }
    else if (f === 'fw') o.value[+el.dataset.k] = num(el);
    update();
  };
  $('objs').onclick = e => {
    const b = e.target.closest('button'); if (!b || !b.dataset.f) return;
    const i = +b.closest('.row').dataset.i;
    if (b.dataset.f === 'del') st.objs.splice(i, 1);
    else if (b.dataset.f === 'dup') st.objs.splice(i + 1, 0, JSON.parse(JSON.stringify(st.objs[i])));
    buildRows(); update();
  };

  // ---------- outputs ----------
  function update() {
    const p = B.buildPacket(st), r = p.adv;
    const shown = view === 'full' ? (p.full || { bytes: [], segs: [] }) : { bytes: r.bytes, segs: r.segs };
    const cur = shown.bytes, len = cur.length, changed = i => !!prev && (i >= prev.length || prev[i] !== cur[i]);
    const segAt = new Array(len).fill(-1);
    shown.segs.forEach((s, k) => { for (let j = 0; j < s.n; j++) segAt[s.s + j] = k; });
    const seg = i => shown.segs[segAt[i]];
    const attrs = i => { const s = seg(i); return s ? ` data-seg="${secOf(s)}" data-sid="s${segAt[i]}" data-lbl="${s.label.c}"` : ''; };
    const layer = i => seg(i) ? seg(i).layer : 'ad';

    // measurement rows: live hints + inline validation
    document.querySelectorAll('.row').forEach(row => {
      const i = +row.dataset.i, o = st.objs[i], err = r.rowErr[i], inf = r.rowInfo[i];
      row.classList.toggle('bad', !!err);
      row.querySelector('.hint').textContent = rowHint(B.DEFS[o.id], o);
      row.querySelector('.msg').textContent = err ? tx(err) : '';
      row.querySelector('.mini').textContent = !err && inf ? `${hex(inf.id)} | ${B.toHex(inf.data, ' ')} -> ${tx(inf.detail)}` : '';
    });
    $('infoHex').textContent = '0x' + hex(0x40 | (st.info & 0x1F));

    // link layer read-outs
    for (let b = 0; b < 8; b++) $('hb' + b).textContent = p.hdr ? (p.hdr[0] >> b) & 1 : '–';
    $('hdrLen').textContent = p.hdr ? `0x${hex(p.hdr[1] & 0xFF)} = ${p.hdr[1]}` : '–';
    $('macNote').textContent = p.mac ? t('ll.macOnAir', { hex: B.toHex(p.mac.slice().reverse(), ' ') }) : t('ll.macBad');
    const cu = st.custom, ct = cu.sel === 'free' ? (/^[0-9a-fA-F]{1,2}$/.test(String(cu.typeHex).trim()) ? parseInt(cu.typeHex, 16) : NaN) : parseInt(cu.sel, 16);
    const ad = isNaN(ct) ? null : B.adTypeDesc(ct);
    $('cuDesc').textContent = ad ? t('cu.desc', { ty: hex(ct), name: ad.name || t('cu.unknown'), hint: ad.hint ? ' — ' + t(ad.hint) : '' }) : '';

    // live per-field hints + inline validation (never blocks typing)
    $('hint_mac').textContent = t('hint.mac');
    $('hint_name').textContent = t('hint.name', { n: u8len(st.name) });
    $('hint_txVal').textContent = t('hint.tx');
    $('hint_cuData').textContent = t('hint.cu', { n: Math.floor(String(cu.data).replace(/[\s:]/g, '').length / 2) });
    $('hint_encKey').textContent = t('hint.key', { n: String(st.enc.key).replace(/[\s:]/g, '').length });
    $('hint_encCtr').textContent = t('hint.ctr');
    FIELDS.forEach(f => {
      const ws = p.warns.filter(w => FIELD_OF[w.c] === f), isErr = ws.some(w => w.l === 'err');
      $('msg_' + f).textContent = ws.map(w => t(w.c, w.a)).join(' ');
      $('msg_' + f).className = 'msg' + (ws.length ? (isErr ? ' err' : ' warn') : '');
      $(f).classList.toggle('bad', isErr);
    });

    // budget: bar, breakdown, persistent overflow banner
    const n = r.bytes.length;
    $('budgetTxt').textContent = t('bud.text', { n });
    const bar = $('budgetBar'); bar.style.width = Math.min(n / 31, 1) * 100 + '%';
    bar.style.background = n > 31 ? 'var(--err)' : n > 24 ? 'var(--warn)' : 'var(--bth)';
    $('banner').hidden = n <= 31; $('banner').textContent = t('w.over31', { n });
    let hd = 0, adv = 0, uu = 0, inf2 = 0, ms = 0, cn = 0, mn = 0;
    r.segs.forEach(s => {
      if (s.layer === 'ad') { hd += 2; adv += s.n - 2; }
      else if (s.layer === 'bth') { if (s.label.c === 'lbl.uuid') uu += s.n; else inf2 += s.n; }
      else if (s.layer === 'obj' || s.layer === 'enc') ms += s.n;
      else if (s.layer === 'cnt') cn += s.n; else if (s.layer === 'mic') mn += s.n;
    });
    const chip = (k, v) => `<span>${esc(t(k))} ${v} B</span>`;
    $('budChips').innerHTML = chip('bud.hdr', hd) + chip('bud.ad', adv) + chip('bud.uuid', uu) + chip('bud.info', inf2) + chip('bud.meas', ms) +
      (cn + mn ? `<span class="encx">${esc(t('bud.enc', { n: cn + mn, c: cn, m: mn }))}</span>` : '') + `<span>${esc(t('bud.total'))} ${n} B</span>`;
    $('warns').innerHTML = p.warns.filter(w => !FIELD_OF[w.c] && w.c !== 'w.over31').map(w => `<div class="w ${w.l}">${esc(t(w.c, w.a))}</div>`).join('');

    // encryption panel
    const e = r.enc, h = a => B.toHex(a, ' ') || '—';
    $('encOut').innerHTML = !(st.info & 1) ? '' : !e ? `<div class="fh" style="margin-top:8px">${esc(t('enc.nononce'))}</div>`
      : `<div class="vh" style="margin:10px 0 4px"><b>${esc(t('enc.nonce'))}</b></div>
        <div class="nonce"><div class="c-ll">${h(e.mac)}<small>${esc(t('nonce.mac'))}</small></div><div class="c-bth">D2 FC<small>${esc(t('nonce.uuid'))}</small></div><div class="c-bth">${hex(e.info)}<small>${esc(t('nonce.info'))}</small></div><div class="c-cnt">${h(e.ctr)}<small>${esc(t('nonce.ctr'))}</small></div></div>
        <div class="mono" style="margin-top:8px;word-break:break-all">${esc(t('enc.plain', { n: e.plaintext.length }))}: <span class="c-obj">${h(e.plaintext)}</span></div>
        <div class="mono" style="word-break:break-all">${esc(t('enc.ct'))}: <span class="c-enc">${e.ct ? h(e.ct) : '—'}</span> · ${esc(t('enc.mic'))}: <span class="c-mic">${e.mic ? h(e.mic) : '—'}</span></div>
        <div class="fh" style="margin-top:4px">${esc(t('enc.public'))}</div>`;

    // copy sources
    copyTxt.adv = B.toHex(r.bytes); copyTxt.full = p.full ? B.toHex(p.full.bytes) : '';
    const iu = r.segs.findIndex(s => s.label.c === 'lbl.uuid'); let svc = '';
    if (iu >= 0) { let end = r.segs[iu].s; for (let k = iu; k < r.segs.length && ['bth', 'obj', 'enc', 'cnt', 'mic'].indexOf(r.segs[k].layer) >= 0; k++) end = r.segs[k].s + r.segs[k].n; svc = B.toHex(r.bytes.slice(r.segs[iu].s, end)); }
    copyTxt.svc = svc;
    document.querySelectorAll('[data-cp]').forEach(b => { b.disabled = !copyTxt[b.dataset.cp]; });

    // three synchronized views of the same bytes
    const empty = `<span class="fh">${esc(view === 'full' ? t('out.nofull') : t('out.empty'))}</span>`;
    const span = i => `<span class="b c-${layer(i)}${changed(i) ? ' fl' : ''}"${attrs(i)}>${hex(cur[i])}</span>`;
    $('hexView').innerHTML = len ? cur.map((_, i) => span(i)).join('') : empty;
    $('pretty').innerHTML = shown.segs.map((s, k) => {
      let any = false; for (let j = 0; j < s.n; j++) if (changed(s.s + j)) any = true;
      return `<div class="pl l${s.lvl}" data-seg="${secOf(s)}" data-sid="s${k}" data-lbl="${s.label.c}"><span class="c-${s.layer}${any ? ' fl' : ''}">${B.toHex(cur.slice(s.s, s.s + s.n), ' ')}</span>  <b>${esc(tx(s.label))}</b>  <span class="d">${esc(tx(s.desc))}</span></div>`;
    }).join('') || empty;
    let dump = '';
    for (let o = 0; o < len; o += 16) {
      let hs = '', asc = '';
      for (let k = 0; k < 16; k++) {
        const i = o + k;
        if (i < len) { hs += span(i) + ' '; const c = cur[i]; asc += c >= 32 && c < 127 ? esc(String.fromCharCode(c)) : '.'; } else hs += '   ';
      }
      dump += `<span class="off">${o.toString(16).padStart(4, '0')}</span>  ${hs} <span class="asc">|${asc}|</span>\n`;
    }
    $('dump').innerHTML = dump;
    prev = cur.slice();
  }

  // ---------- tests (T1–T5 from the engine, T6 i18n parity here) ----------
  function parityTest() {
    const en = Object.keys(STR.en), tr = Object.keys(STR.tr), miss = [];
    en.forEach(k => { if (!(k in STR.tr)) miss.push('tr:' + k); });
    tr.forEach(k => { if (!(k in STR.en)) miss.push('en:' + k); });
    ['en', 'tr'].forEach(L => Object.keys(STR[L]).forEach(k => { if (!String(STR[L][k]).trim()) miss.push(L + ' empty:' + k); }));
    Object.keys(B.DEFS).forEach(id => ['en', 'tr'].forEach(L => { if (!STR[L]['obj.' + id + '.name']) miss.push(L + ':obj.' + id + '.name'); }));
    return { id: 'T6', ok: !miss.length, detail: miss.length ? miss.slice(0, 6).join(', ') : en.length + ' keys, ' + Object.keys(B.DEFS).length + ' objects' };
  }
  const tests = B.selfTest().concat([parityTest()]);
  function renderBadge() {
    const okN = tests.filter(x => x.ok).length, all = okN === tests.length;
    $('badge').textContent = t('badge.tests', { n: okN, total: tests.length, mark: all ? '✓' : '✗' });
    $('badge').classList.toggle('okb', all); $('badge').classList.toggle('badb', !all);
    $('report').textContent = tests.map(x => `${t(x.ok ? 'rep.pass' : 'rep.fail')}  ${x.id}  ${t('test.' + x.id)}\n      ${x.detail}`).join('\n');
  }
  $('badge').onclick = () => { $('report').hidden = !$('report').hidden; };

  function applyAll() { applyStatic(); buildDyn(); syncStatic(); buildRows(); renderBadge(); update(); }
  lang = initLang();
  applyAll();
})();
