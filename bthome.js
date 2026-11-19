/* bthome.js — BTHome v2 spec engine. Pure logic, NO DOM. Exposes window.BTHome */
(function () {
  'use strict';
  const hx = b => b.toString(16).toUpperCase().padStart(2, '0');
  const toHex = (a, sep) => a.map(hx).join(sep || '');
  const utf8 = s => Array.from(new TextEncoder().encode(s));
  const fromUtf8 = a => new TextDecoder().decode(new Uint8Array(a));

  // ---------- OBJECT TABLE (id, name, type, factor, unit) ----------
  const NUM = [
    [0x01,'battery','u8',1,'%'],[0x02,'temperature','s16',0.01,'°C'],[0x03,'humidity','u16',0.01,'%'],
    [0x04,'pressure','u24',0.01,'hPa'],[0x05,'illuminance','u24',0.01,'lx'],[0x06,'mass (kg)','u16',0.01,'kg'],
    [0x07,'mass (lb)','u16',0.01,'lb'],[0x08,'dewpoint','s16',0.01,'°C'],[0x09,'count','u8',1,''],
    [0x0A,'energy','u24',0.001,'kWh'],[0x0B,'power','u24',0.01,'W'],[0x0C,'voltage','u16',0.001,'V'],
    [0x0D,'pm2.5','u16',1,'µg/m³'],[0x0E,'pm10','u16',1,'µg/m³'],[0x12,'co2','u16',1,'ppm'],
    [0x13,'tvoc','u16',1,'µg/m³'],[0x14,'moisture','u16',0.01,'%'],[0x2E,'humidity','u8',1,'%'],
    [0x2F,'moisture','u8',1,'%'],[0x3D,'count','u16',1,''],[0x3E,'count','u32',1,''],
    [0x3F,'rotation','s16',0.1,'°'],[0x40,'distance (mm)','u16',1,'mm'],[0x41,'distance (m)','u16',0.1,'m'],
    [0x42,'duration','u24',0.001,'s'],[0x43,'current','u16',0.001,'A'],[0x44,'speed','u16',0.01,'m/s'],
    [0x45,'temperature','s16',0.1,'°C'],[0x46,'UV index','u8',0.1,''],[0x47,'volume','u16',0.1,'L'],
    [0x48,'volume','u16',1,'mL'],[0x49,'volume flow rate','u16',0.001,'m³/hr'],[0x4A,'voltage','u16',0.1,'V'],
    [0x4B,'gas','u24',0.001,'m³'],[0x4C,'gas','u32',0.001,'m³'],[0x4D,'energy','u32',0.001,'kWh'],
    [0x4E,'volume','u32',0.001,'L'],[0x4F,'water','u32',0.001,'L'],[0x51,'acceleration','u16',0.001,'m/s²'],
    [0x52,'gyroscope','u16',0.001,'°/s'],[0x55,'volume storage','u32',0.001,'L'],[0x56,'conductivity','u16',1,'µS/cm'],
    [0x57,'temperature','s8',1,'°C'],[0x58,'temperature','s8',0.35,'°C'],[0x59,'count','s8',1,''],
    [0x5A,'count','s16',1,''],[0x5B,'count','s32',1,''],[0x5C,'power','s32',0.01,'W'],
    [0x5D,'current','s16',0.001,'A'],[0x5E,'direction','u16',0.01,'°'],[0x5F,'precipitation','u16',0.1,'mm'],
    [0x60,'channel','u8',1,''],[0x61,'rotational speed','u16',1,'rpm'],[0x62,'speed','s32',0.000001,'m/s'],
    [0x63,'acceleration','s32',0.000001,'m/s²'],[0x65,'settings revision','u8',1,'']
  ];
  const BIN_NAMES = ['generic boolean','power','opening','battery low','battery charging','carbon monoxide','cold',
    'connectivity','door','garage door','gas','heat','light','lock','moisture','motion','moving','occupancy','plug',
    'presence','problem','running','safety','smoke','sound','tamper','vibration','window'];
  const BTN = [[0,'none'],[1,'press'],[2,'double_press'],[3,'triple_press'],[4,'long_press'],[5,'long_double_press'],
    [6,'long_triple_press'],[0x80,'hold_press'],[0x81,'hold_release']];
  const DIM = [[0,'none'],[1,'rotate left'],[2,'rotate right']];
  const CMD = [[0,'off'],[1,'on'],[2,'toggle'],[3,'step up'],[4,'step down']];
  const LIGHT = [[0,'dark'],[1,'twilight'],[2,'bright']];
  const GROUPS = ['sensor', 'binary', 'event', 'device', 'misc'];
  const FLAG_NAMES = ['LE Limited Discoverable', 'LE General Discoverable', 'BR/EDR Not Supported',
    'Simultaneous LE+BR/EDR (Controller)', 'Simultaneous LE+BR/EDR (Host)'];

  const DEFS = {};
  const add = d => { DEFS[d.id] = d; };
  NUM.forEach(([id, name, t, f, u]) => add({ id, name, k: 'num', t, f, u, g: 'sensor' }));
  BIN_NAMES.forEach((name, i) => add({ id: i < 3 ? 0x0F + i : 0x15 + (i - 3), name, k: 'bin', g: 'binary' }));
  add({ id: 0x64, name: 'light level', k: 'enum', en: LIGHT, g: 'sensor' });
  add({ id: 0x00, name: 'packet id', k: 'num', t: 'u8', f: 1, u: '', g: 'misc' });
  add({ id: 0x50, name: 'timestamp', k: 'ts', g: 'misc' });
  add({ id: 0x53, name: 'text', k: 'text', g: 'misc' });
  add({ id: 0x54, name: 'raw', k: 'raw', g: 'misc' });
  add({ id: 0x3A, name: 'button', k: 'enum', en: BTN, g: 'event' });
  add({ id: 0x3C, name: 'dimmer', k: 'dimmer', g: 'event' });
  add({ id: 0x3B, name: 'command', k: 'cmd', g: 'event' });
  add({ id: 0xF0, name: 'device type id', k: 'num', t: 'u16', f: 1, u: '', g: 'device' });
  add({ id: 0xF1, name: 'firmware version (u32)', k: 'fw', n: 4, g: 'device' });
  add({ id: 0xF2, name: 'firmware version (u24)', k: 'fw', n: 3, g: 'device' });

  // ---------- integer helpers ----------
  const tInfo = t => ({ signed: t[0] === 's', bits: +t.slice(1) });
  function range(t) { const { signed, bits } = tInfo(t); return signed ? [-(2 ** (bits - 1)), 2 ** (bits - 1) - 1] : [0, 2 ** bits - 1]; }
  function le(raw, t) {
    const { bits } = tInfo(t); if (raw < 0) raw += 2 ** bits;
    const out = []; for (let i = 0; i < bits / 8; i++) { out.push(raw % 256); raw = Math.floor(raw / 256); }
    return out;
  }
  function rd(a, i, t) {
    const { signed, bits } = tInfo(t); let v = 0;
    for (let k = bits / 8 - 1; k >= 0; k--) v = v * 256 + a[i + k];
    return signed && v >= 2 ** (bits - 1) ? v - 2 ** bits : v;
  }
  const dec = f => (String(f).split('.')[1] || '').length;
  const fmt = (v, f) => v.toFixed(dec(f));
  const enName = (list, v) => { const e = list.find(x => x[0] === v); return e ? e[1] : null; };
  const isInt = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
  const E = (c, a) => { const e = new Error(c); e.code = c; e.args = a || {}; return e; };

  function rangeInfo(d) { // pure data; the UI formats it
    if (d.k === 'num') { const [lo, hi] = range(d.t); return { k: 'num', t: d.t, lo, hi, f: d.f, u: d.u }; }
    return d.k === 'fw' ? { k: 'fw', n: d.n } : { k: d.k };
  }
  function defaultValue(id) {
    const d = DEFS[id];
    switch (d.k) {
      case 'num': case 'bin': return 0;
      case 'enum': return d.en[0][0];
      case 'ts': return Math.floor(Date.now() / 1000);
      case 'text': case 'raw': return '';
      case 'dimmer': return { event: 1, steps: 1 };
      case 'cmd': return { op: 1, steps: 1 };
      case 'fw': return new Array(d.n).fill(0);
    }
  }

  // ---------- encode one object -> {bytes, data, detail, name} ----------
  function encodeObject(o) {
    const d = DEFS[o.id]; if (!d) throw E('e.id');
    const v = o.value; let data, detail;
    switch (d.k) {
      case 'num': {
        if (typeof v !== 'number' || !isFinite(v)) throw E('e.num');
        const raw = Math.round(v / d.f), [lo, hi] = range(d.t);
        if (raw < lo || raw > hi) throw E('e.range', rangeInfo(d));
        data = le(raw, d.t); detail = `${raw} × ${d.f} = ${fmt(raw * d.f, d.f)}${d.u ? ' ' + d.u : ''}`; break;
      }
      case 'bin':
        if (v !== 0 && v !== 1) throw E('e.bin');
        data = [v]; detail = v ? 'true (1)' : 'false (0)'; break;
      case 'enum': {
        const n = enName(d.en, v); if (n === null) throw E('e.enum');
        data = [v]; detail = { c: 'd.enum', a: { id: d.id, v } }; break;
      }
      case 'ts':
        if (!isInt(v, 0, 4294967295)) throw E('e.ts');
        data = le(v, 'u32'); detail = new Date(v * 1000).toISOString().slice(0, 19) + 'Z (UTC)'; break;
      case 'text': {
        const b = utf8(String(v)); if (b.length > 255) throw E('e.text', { n: b.length });
        data = [b.length, ...b]; detail = `len=${b.length} "${v}"`; break;
      }
      case 'raw': {
        const c = String(v).replace(/[\s:]/g, '');
        if (!/^[0-9a-fA-F]*$/.test(c) || c.length % 2) throw E('e.rawhex');
        const b = c.match(/../g) ? c.match(/../g).map(x => parseInt(x, 16)) : [];
        if (b.length > 255) throw E('e.rawlen', { n: b.length });
        data = [b.length, ...b]; detail = `len=${b.length}`; break;
      }
      case 'dimmer': {
        const en = enName(DIM, v && v.event); if (en === null) throw E('e.dimev');
        if (!isInt(v.steps, 0, 255)) throw E('e.steps');
        data = [v.event, v.steps]; detail = { c: 'd.dimmer', a: { ev: v.event, steps: v.steps } }; break;
      }
      case 'cmd': {
        const en = enName(CMD, v && v.op); if (en === null) throw E('e.op');
        if (v.op >= 3) {
          if (!isInt(v.steps, 0, 255)) throw E('e.steps');
          data = [1, v.op, v.steps]; detail = { c: 'd.cmd', a: { op: v.op, steps: v.steps } };
        } else { data = [0, v.op]; detail = { c: 'd.cmd', a: { op: v.op } }; }
        break;
      }
      case 'fw': {
        if (!Array.isArray(v) || v.length !== d.n || !v.every(x => isInt(x, 0, 255))) throw E('e.fw', { n: d.n });
        data = v.slice().reverse(); detail = v.join('.'); break;
      }
    }
    return { id: o.id, bytes: [o.id, ...data], data, detail, name: d.name };
  }

  // ---------- object walker (offset-aware; decode() and the Phase 5 decoder both use it) ----------
  function walkObjects(a) {
    const objs = [], order = []; let i = 0, prev = -1, stop = null;
    while (i < a.length) {
      const st0 = i, id = a[i], d = DEFS[id];
      if (!d) { stop = { kind: 'unknown', offset: st0, id, rest: a.slice(st0) }; break; }
      const fail = kind => { stop = { kind, offset: st0, id, rest: a.slice(st0) }; };
      let value, raw = null, n = 0;
      switch (d.k) {
        case 'num': { const sz = tInfo(d.t).bits / 8; if (i + 1 + sz > a.length) { fail('trunc'); break; } raw = rd(a, i + 1, d.t); value = Number((raw * d.f).toFixed(dec(d.f))); n = 1 + sz; break; }
        case 'bin': case 'enum': if (i + 1 >= a.length) { fail('trunc'); break; } value = a[i + 1]; n = 2; break;
        case 'ts': if (i + 5 > a.length) { fail('trunc'); break; } value = rd(a, i + 1, 'u32'); n = 5; break;
        case 'text': case 'raw': {
          if (i + 1 >= a.length) { fail('trunc'); break; }
          const len = a[i + 1]; if (i + 2 + len > a.length) { fail('badlen'); break; }
          const body = a.slice(i + 2, i + 2 + len); value = d.k === 'text' ? fromUtf8(body) : toHex(body); n = 2 + len; break;
        }
        case 'dimmer': if (i + 3 > a.length) { fail('trunc'); break; } value = { event: a[i + 1], steps: a[i + 2] }; n = 3; break;
        case 'cmd': {
          if (i + 2 >= a.length) { fail('trunc'); break; }
          const lb = a[i + 1], na = lb & 0x1F, op = a[i + 2];
          if ((lb & 0xE0) || i + 3 + na > a.length || (op <= 2 && na !== 0) || (op >= 3 && op <= 4 && na !== 1)) { fail('badlen'); break; }
          value = { op, steps: na ? a[i + 3] : 0 }; n = 3 + na; break;
        }
        case 'fw': if (i + 1 + d.n > a.length) { fail('trunc'); break; } value = a.slice(i + 1, i + 1 + d.n).reverse(); n = 1 + d.n; break;
      }
      if (stop) break;
      objs.push({ id, off: st0, n, bytes: a.slice(st0, st0 + n), raw, value, d });
      if (id < prev) order.push({ id, prev, off: st0 });
      prev = id; i += n;
    }
    return { objs, stop, order };
  }
  // ---------- minimal decoder (used by the T5 roundtrip) ----------
  function decode(a) {
    const w = walkObjects(a);
    if (w.stop) throw E(w.stop.kind === 'unknown' ? 'E_OBJ_UNKNOWN' : 'E_OBJ', { offset: w.stop.offset, id: w.stop.id, kind: w.stop.kind });
    return w.objs.map(o => ({ id: o.id, value: o.value }));
  }

  // ---------- AES-128 (forward cipher only) + AES-CCM (RFC 3610, L=2, M=4, no AAD) ----------
  const rotl8 = (x, n) => ((x << n) | (x >> (8 - n))) & 0xFF;
  const xt = x => ((x << 1) ^ (x & 0x80 ? 0x1B : 0)) & 0xFF;
  const SBOX = (() => {
    const sb = []; let p = 1, q = 1;
    do {
      p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1B : 0)) & 0xFF;
      q ^= q << 1; q &= 0xFF; q ^= q << 2; q &= 0xFF; q ^= q << 4; q &= 0xFF; if (q & 0x80) q ^= 0x09;
      sb[p] = q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63;
    } while (p !== 1);
    sb[0] = 0x63; return sb;
  })();
  function aesKeys(key) {
    const w = []; for (let i = 0; i < 4; i++) w.push(key.slice(4 * i, 4 * i + 4));
    for (let i = 4, rc = 1; i < 44; i++) {
      let t = w[i - 1];
      if (i % 4 === 0) { t = [SBOX[t[1]] ^ rc, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]]; rc = xt(rc); }
      w.push(w[i - 4].map((b, j) => b ^ t[j]));
    }
    const rk = []; for (let r = 0; r < 11; r++) rk.push([].concat(w[4 * r], w[4 * r + 1], w[4 * r + 2], w[4 * r + 3]));
    return rk;
  }
  function aesBlock(rk, blk) {
    let s = blk.map((b, i) => b ^ rk[0][i]);
    for (let r = 1; r <= 10; r++) {
      s = s.map(b => SBOX[b]);
      s = s.map((_, i) => s[4 * (((i >> 2) + (i & 3)) % 4) + (i & 3)]); // ShiftRows
      if (r < 10) {
        const o = [];
        for (let c = 0; c < 4; c++) {
          const a = s.slice(4 * c, 4 * c + 4);
          o.push(xt(a[0]) ^ xt(a[1]) ^ a[1] ^ a[2] ^ a[3], a[0] ^ xt(a[1]) ^ xt(a[2]) ^ a[2] ^ a[3],
            a[0] ^ a[1] ^ xt(a[2]) ^ xt(a[3]) ^ a[3], xt(a[0]) ^ a[0] ^ a[1] ^ a[2] ^ xt(a[3]));
        }
        s = o;
      }
      s = s.map((b, i) => b ^ rk[r][i]);
    }
    return s;
  }
  const xorA = (a, b) => a.map((x, i) => x ^ b[i]);
  // B0 flags 0x09 = M'=1 (M=4), L'=1 (L=2), no AAD. CTR flags 0x01. MIC = CBC-MAC[0..3] XOR S0[0..3].
  function ccm(key, nonce, input, decrypt, micIn) {
    const rk = aesKeys(key), n = input.length;
    const ctrBlk = i => aesBlock(rk, [0x01, ...nonce, i >> 8, i & 255]);
    const out = [];
    for (let i = 0; i * 16 < n; i++) { const ks = ctrBlk(i + 1); input.slice(16 * i, 16 * i + 16).forEach((b, j) => out.push(b ^ ks[j])); }
    const pt = decrypt ? out : input;
    let x = aesBlock(rk, [0x09, ...nonce, n >> 8, n & 255]);
    for (let i = 0; i * 16 < n; i++) { const blk = pt.slice(16 * i, 16 * i + 16); while (blk.length < 16) blk.push(0); x = aesBlock(rk, xorA(x, blk)); }
    const mic = xorA(x.slice(0, 4), ctrBlk(0).slice(0, 4));
    return decrypt ? { ok: !!micIn && mic.every((b, i) => b === micIn[i]), pt: out } : { ct: out, mic };
  }
  const ccmEncrypt = (key, nonce, pt) => ccm(key, nonce, pt, false);
  const ccmDecrypt = (key, nonce, ct, mic) => ccm(key, nonce, ct, true, mic);
  function parseKey(str) {
    const c = String(str || '').replace(/[\s:]/g, '');
    return /^[0-9a-fA-F]{32}$/.test(c) ? c.match(/../g).map(x => parseInt(x, 16)) : null;
  }

  // ---------- build the AdvData from a state object ----------
  // st = {flagsOn, flags, nameMode:'none'|'short'|'complete', name, info(low 5 bits), autoSort, objs:[{id,value}]}
  function buildAdv(st) {
    const bytes = [], segs = [], warns = [], rowErr = {}, rowInfo = {};
    const W = (l, c, a) => warns.push({ l, c, a: a || {} });
    const put = (arr, layer, lvl, label, desc) => { segs.push({ s: bytes.length, n: arr.length, layer, lvl, label, desc }); arr.forEach(b => bytes.push(b)); };

    if (st.flagsOn) {
      const f = st.flags & 0x1F, bits = [0, 1, 2, 3, 4].filter(i => (f >> i) & 1);
      put([2, 0x01, f], 'ad', 0, { c: 'lbl.flags' }, { c: 'd.flags', a: { v: hx(f), bits } });
      if ((f & 3) === 3) W('warn', 'w.limdisc');
    } else W('warn', 'w.noflags');

    if (st.nameMode !== 'none' && st.name) {
      const nb = utf8(st.name), ty = st.nameMode === 'short' ? 0x08 : 0x09;
      if (nb.length + 1 > 255) W('err', 'w.namelong');
      else put([nb.length + 1, ty, ...nb], 'ad', 0, { c: ty === 8 ? 'lbl.name.short' : 'lbl.name.complete' }, { c: 'd.name', a: { text: st.name, n: nb.length } });
    }

    if (st.txPower && st.txPower.on) {
      const v = st.txPower.val;
      if (isInt(v, -127, 127)) put([2, 0x0A, v & 0xFF], 'ad', 0, { c: 'lbl.tx' }, `${v} dBm (sint8)`);
      else W('err', 'w.txrange');
    }
    const items = st.objs.map((o, i) => ({ o, i }));
    if (st.autoSort) items.sort((a, b) => a.o.id - b.o.id); // stable
    const encoded = [], payload = []; let bad = 0, pid = -1, unsorted = false;
    items.forEach(({ o, i }) => {
      if (o.id < pid) unsorted = true; pid = o.id;
      try {
        const r = encodeObject(o); encoded.push(r); r.bytes.forEach(b => payload.push(b));
        rowInfo[i] = { id: o.id, data: r.data, detail: r.detail };
      } catch (e) { rowErr[i] = e.code ? { c: e.code, a: e.args } : { c: 'e.unknown', a: {} }; bad++; }
    });
    const info = 0x40 | (st.info & 0x1F), encOn = !!(info & 1);
    let tail = payload, enc = null, encFail = false;
    if (encOn) {
      const e = st.enc || {}, key = parseKey(e.key), mac = parseMac(st.mac), ctr = e.counter;
      if (!mac) W('err', 'w.enc.mac');
      else if (!isInt(ctr, 0, 4294967295)) W('err', 'w.enc.ctr');
      else {
        enc = { nonce: [...mac, 0xD2, 0xFC, info, ...le(ctr, 'u32')], mac, ctr: le(ctr, 'u32'), info, plaintext: payload, ct: null, mic: null };
        if (!key) W('err', 'w.enc.key');
        else { const c = ccmEncrypt(key, enc.nonce, payload); enc.ct = c.ct; enc.mic = c.mic; tail = [...c.ct, ...enc.ctr, ...c.mic]; }
      }
      if (!enc || !enc.ct) { encFail = true; W('err', 'w.enc.fail'); }
      else W('info', 'w.enc.replay');
    }
    const len = 1 + 2 + 1 + tail.length;
    if (encFail) { /* error already reported */ }
    else if (len > 255) W('err', 'w.svc.long');
    else {
      put([len, 0x16], 'ad', 0, { c: 'lbl.svc' }, { c: 'd.len', a: { len } });
      put([0xD2, 0xFC], 'bth', 1, { c: 'lbl.uuid' }, { c: 'd.uuid' });
      put([info], 'bth', 1, { c: 'lbl.info' }, { c: 'd.info', a: { v: hx(info), enc: encOn, trig: !!(info & 4) } });
      if (enc) {
        if (enc.ct.length) put(enc.ct, 'enc', 1, { c: 'lbl.ct' }, { c: 'd.ct', a: { pt: toHex(payload, ' '), n: encoded.length } });
        put(enc.ctr, 'cnt', 1, { c: 'lbl.ctr' }, { c: 'd.ctr', a: { n: enc.ctr.length } });
        put(enc.mic, 'mic', 1, { c: 'lbl.mic' }, { c: 'd.mic' });
      } else encoded.forEach(r => put(r.bytes, 'obj', 1, { c: 'lbl.obj', a: { id: r.id } }, r.detail));
    }
    if (st.custom && st.custom.on) {
      const c = st.custom, th = String(c.typeHex || '').trim();
      const ty = c.sel === 'free' ? (/^[0-9a-fA-F]{1,2}$/.test(th) ? parseInt(th, 16) : NaN) : parseInt(c.sel, 16);
      const hs = String(c.data || '').replace(/[\s:]/g, '');
      if (isNaN(ty)) W('err', 'w.cu.type');
      else if (!/^[0-9a-fA-F]*$/.test(hs) || hs.length % 2) W('err', 'w.cu.hex');
      else {
        const d = hs ? hs.match(/../g).map(x => parseInt(x, 16)) : [];
        if (d.length + 1 > 255) W('err', 'w.cu.long');
        else {
          put([d.length + 1, ty, ...d], 'ad', 0, { c: 'lbl.custom', a: { ty: hx(ty) } }, customDesc(ty, d));
          if (ty === 0x16 && d[0] === 0xD2 && d[1] === 0xFC) W('warn', 'w.cu.fcd2');
        }
      }
    }
    if (st.info & 2) W('warn', 'w.bit1');
    if (st.info & 0x18) W('warn', 'w.bit34');
    if (bad) W('err', 'w.badrows', { n: bad });
    if (unsorted && !st.autoSort) W('warn', 'w.unsorted');
    if (!encoded.length) W('info', 'w.noobj');
    if (bytes.length > 31) W('err', 'w.over31', { n: bytes.length });
    return { bytes, segs, warns, rowErr, rowInfo, enc };
  }

  // ---------- link layer: CRC, MAC, packet ----------
  function crc24(bytes) {
    let s = 0xAAAAAA; // byte-wise bit-reversed spec init 0x555555
    bytes.forEach(b => { for (let i = 0; i < 8; i++) { const fb = (s ^ (b >> i)) & 1; s >>= 1; if (fb) s ^= 0xDA6000; } });
    return s;
  }
  const crcBytes = s => [s & 0xFF, (s >> 8) & 0xFF, (s >> 16) & 0xFF];
  function parseMac(str) { // display order -> bytes in display order, or null
    const c = String(str).replace(/[:\-\s]/g, '');
    return /^[0-9a-fA-F]{12}$/.test(c) ? c.match(/../g).map(x => parseInt(x, 16)) : null;
  }
  const PDU = [[0, 'ADV_IND', true], [1, 'ADV_DIRECT_IND', false], [2, 'ADV_NONCONN_IND', true], [3, 'SCAN_REQ', false],
    [4, 'SCAN_RSP', false], [5, 'CONNECT_IND', false], [6, 'ADV_SCAN_IND', true]];
  const AD_TYPES = { 0x01: 'Flags', 0x02: 'Incomplete List of 16-bit Service UUIDs', 0x03: 'Complete List of 16-bit Service UUIDs',
    0x04: 'Incomplete List of 32-bit Service UUIDs', 0x05: 'Complete List of 32-bit Service UUIDs',
    0x06: 'Incomplete List of 128-bit Service UUIDs', 0x07: 'Complete List of 128-bit Service UUIDs',
    0x08: 'Shortened Local Name', 0x09: 'Complete Local Name', 0x0A: 'Tx Power Level', 0x16: 'Service Data - 16-bit UUID',
    0x19: 'Appearance', 0x20: 'Service Data - 32-bit UUID', 0x21: 'Service Data - 128-bit UUID', 0xFF: 'Manufacturer Specific Data' };
  const AD_HINT = { 2: 'h.uuid16', 3: 'h.uuid16', 0x16: 'h.svc16', 0xFF: 'h.mfr' };
  function adTypeDesc(t) { return { name: AD_TYPES[t] || null, hint: AD_HINT[t] || null }; }
  function customDesc(ty, d) {
    if ((ty === 2 || ty === 3) && d.length && d.length % 2 === 0) { const u = []; for (let i = 0; i < d.length; i += 2) u.push('0x' + hx(d[i + 1]) + hx(d[i])); return { c: 'd.cu.uuid', a: { list: u.join(', ') } }; }
    if (ty === 0xFF && d.length >= 2) return { c: 'd.cu.mfr', a: { id: `0x${hx(d[1])}${hx(d[0])}`, n: d.length - 2 } };
    return { c: 'd.cu.raw', a: { n: d.length, hex: toHex(d, ' ') } };
  }

  // st adds: pduType (0|2|6), txAdd (0|1), mac (display order string)
  function buildPacket(st) {
    const adv = buildAdv(st), warns = adv.warns.slice(), W = (l, c, a) => warns.push({ l, c, a: a || {} });
    const mac = parseMac(st.mac), pdu = PDU.find(p => p[0] === st.pduType && p[2]), n = adv.bytes.length;
    if (!mac) W('err', 'w.mac');
    if (!pdu) W('err', 'w.pdu');
    if (st.txAdd === 1 && mac && (mac[0] >> 6) !== 1) W('warn', 'w.txadd');
    const hdr = pdu ? [pdu[0] | (st.txAdd << 6), 6 + n] : null;
    if (!mac || !pdu || n > 31) return { adv, full: null, warns, hdr, mac };
    const advA = mac.slice().reverse(), pduBytes = [hdr[0], hdr[1], ...advA, ...adv.bytes];
    const crc = crc24(pduBytes), cb = crcBytes(crc), segs = [];
    const sg = (s, len, layer, label, desc) => segs.push({ s, n: len, layer, lvl: 0, label, desc });
    sg(0, 1, 'fix', { c: 'lbl.pre' }, { c: 'd.pre' });
    sg(1, 4, 'fix', { c: 'lbl.aa' }, { c: 'd.aa' });
    sg(5, 1, 'll', { c: 'lbl.h0' }, { c: 'd.h0', a: { pdu: pdu[1], tx: st.txAdd } });
    sg(6, 1, 'll', { c: 'lbl.h1' }, { c: 'd.h1', a: { n, len: hdr[1] } });
    sg(7, 6, 'll', { c: 'lbl.adva' }, { c: 'd.adva', a: { mac: toHex(mac, ':'), le: toHex(advA, ' ') } });
    adv.segs.forEach(s => segs.push(Object.assign({}, s, { s: s.s + 13 })));
    sg(13 + n, 3, 'crc', { c: 'lbl.crc' }, { c: 'd.crc', a: { v: crc.toString(16).toUpperCase().padStart(6, '0'), on: toHex(cb, ' ') } });
    return { adv, full: { bytes: [0xAA, 0xD6, 0xBE, 0x89, 0x8E, ...pduBytes, ...cb], segs }, warns, hdr, mac };
  }

  // ---------- decoder (Phase 5): pure parsing, codes + params only, no human text ----------
  const hex6 = x => x.toString(16).toUpperCase().padStart(6, '0');
  const pduName = ty => { const p = PDU.find(x => x[0] === ty); return p ? p[1] : 'PDU_' + ty; };
  const isBth = e => e.ty === 0x16 && e.data.length >= 2 && e.data[0] === 0xD2 && e.data[1] === 0xFC;
  function normalizeHex(input) {
    const c = String(input || '').replace(/0x/gi, '').replace(/[\s:,\-]/g, '');
    const bad = c.search(/[^0-9a-fA-F]/);
    if (bad >= 0) return { err: { c: 'E_HEX_CHAR', a: { pos: bad >> 1, ch: c[bad] } } };
    if (c.length % 2) return { err: { c: 'E_HEX_ODD', a: { pos: c.length >> 1 } } };
    return { bytes: c ? c.match(/../g).map(x => parseInt(x, 16)) : [] };
  }
  function adWalk(b, start, end) {
    const els = []; let o = start;
    while (o < end) {
      const len = b[o];
      if (len === 0) return { els, err: { kind: 'zero', offset: o } };
      if (o + 1 + len > end) return { els, err: { kind: 'overrun', offset: o } };
      els.push({ o, len, ty: b[o + 1], data: b.slice(o + 2, o + 1 + len) });
      o += 1 + len;
    }
    return { els, err: null };
  }
  function detectFormat(b) { // first match wins; null = unknown
    const n = b.length;
    if (n >= 16 && b[0] === 0xAA && b[1] === 0xD6 && b[2] === 0xBE && b[3] === 0x89 && b[4] === 0x8E) return { f: 'FULL_PACKET', pre: true, r: 'R_FULL_PRE' };
    if (n >= 15 && b[0] === 0xD6 && b[1] === 0xBE && b[2] === 0x89 && b[3] === 0x8E) return { f: 'FULL_PACKET', pre: false, r: 'R_FULL_NOPRE' };
    if (n >= 8 && b[1] === n - 2 && [0, 2, 4, 6].indexOf(b[0] & 0x0F) >= 0) return { f: 'PDU', r: 'R_PDU' };
    if (n >= 2 && b[0] === 0xD2 && b[1] === 0xFC) return { f: 'SERVICE_DATA', r: 'R_SVC' };
    const w = adWalk(b, 0, n);
    if (!w.err && w.els.length && (w.els.some(isBth) || w.els.every(e => AD_TYPES[e.ty]))) return { f: 'ADV_DATA', r: w.els.some(isBth) ? 'R_ADV_BTH' : 'R_ADV_KNOWN' };
    if ((b[0] >> 5) === 2) {
      if (!(b[0] & 1) && !walkObjects(b.slice(1)).stop) return { f: 'BARE_PAYLOAD', r: 'R_BARE' };
      if ((b[0] & 1) && n >= 9) return { f: 'BARE_PAYLOAD', r: 'R_BARE_ENC' };
    }
    if (w.err && w.els.length && AD_TYPES[w.els[0].ty]) return { f: 'ADV_DATA', r: 'R_ADV_PARTIAL' }; // broken capture: let the TLV error surface
    return null;
  }
  const FORCED = { FULL: { f: 'FULL_PACKET', pre: true }, FULL_NOPRE: { f: 'FULL_PACKET', pre: false }, PDU: { f: 'PDU' }, SERVICE_DATA: { f: 'SERVICE_DATA' }, ADV_DATA: { f: 'ADV_DATA' }, BARE_PAYLOAD: { f: 'BARE_PAYLOAD' } };

  function valueDisplay(o) {
    const d = o.d, v = o.value;
    switch (d.k) {
      case 'num': return `${fmt(o.raw * d.f, d.f)}${d.u ? ' ' + d.u : ''}`;
      case 'bin': return { c: 'v.bin', a: { v } };
      case 'enum': return enName(d.en, v) !== null ? { c: 'd.enum', a: { id: d.id, v } } : { c: 'v.unk', a: { v } };
      case 'ts': return new Date(v * 1000).toISOString().slice(0, 19) + 'Z';
      case 'text': return v;
      case 'raw': return v.length ? v.match(/../g).join(' ') : '';
      case 'dimmer': return enName(DIM, v.event) !== null ? { c: 'd.dimmer', a: { ev: v.event, steps: v.steps } } : { c: 'v.unk', a: { v: v.event } };
      case 'cmd': return enName(CMD, v.op) !== null ? { c: 'd.cmd', a: v.op >= 3 ? { op: v.op, steps: v.steps } : { op: v.op } } : { c: 'v.unk', a: { v: v.op } };
      case 'fw': return v.join('.');
    }
  }

  // opts: { format: 'auto'|FULL|FULL_NOPRE|PDU|SERVICE_DATA|ADV_DATA|BARE_PAYLOAD, mac: string, key: string }
  function parseInput(input, opts) {
    opts = opts || {};
    const M = { mac: null, macFrom: null, txAdd: null, rxAdd: null, chSel: null, pduType: null, pduName: null, crcOk: null, counter: null, micOk: null,
      deviceInfo: null, version: null, encrypted: false, trigger: false, flags: null, name: null, txPower: null, extraAd: 0, advLen: null, unparsed: false, hasLink: false };
    const R = { state: 'idle', format: null, reason: null, bytes: [], segments: [], measurements: [], warnings: [], errors: [], hints: [], bth: null, meta: M };
    const W = (c, a) => R.warnings.push({ l: 'warn', c, a: a || {} });
    const Er = (c, a) => R.errors.push({ l: 'err', c, a: a || {} });
    const seg = (s0, n0, layer, lvl, label, desc, hexo) => { const o = { s: s0, n: n0, layer, lvl, label, desc }; if (hexo != null) o.hex = hexo; R.segments.push(o); };
    const raw = (s0, n0, lvl, arr) => { if (n0 > 0) seg(s0, n0, 'unp', lvl, { c: 'lbl.unparsed' }, { c: 'd.cu.raw', a: { n: n0, hex: toHex(arr, ' ') } }); };
    const fail = () => { R.state = 'error'; R.segments.sort((x, y) => x.s - y.s); return R; };
    const norm = normalizeHex(input);
    if (norm.err) { R.errors.push(Object.assign({ l: 'err' }, norm.err)); return fail(); }
    const b = R.bytes = norm.bytes, n = b.length;
    if (!n) return R; // idle
    let det = null;
    if (opts.format && opts.format !== 'auto') { det = FORCED[opts.format] ? Object.assign({ r: 'R_MANUAL' }, FORCED[opts.format]) : null; } else det = detectFormat(b);
    if (!det) { Er('E_UNKNOWN_FORMAT'); return fail(); }
    R.format = det.f; R.reason = det.r;
    const min = det.f === 'FULL_PACKET' ? (det.pre ? 16 : 15) : det.f === 'PDU' ? 8 : det.f === 'SERVICE_DATA' ? 3 : 1;
    if (n < min) { Er('E_TOO_SHORT', { have: n, min }); return fail(); }
    if (det.f === 'SERVICE_DATA' && !(b[0] === 0xD2 && b[1] === 0xFC)) { Er('E_SVC_UUID'); return fail(); }

    let advMac = null;
    // ----- BTHome layer: uuidAt (or -1), infoAt, end (exclusive) -----
    function emit(w, base, pt) {
      const seen = {};
      w.objs.forEach(o => {
        const d = o.d, vd = valueDisplay(o); seen[o.id] = (seen[o.id] || 0) + 1;
        seg(base + o.off, o.n, 'obj', pt ? 2 : 1, { c: 'lbl.obj', a: { id: o.id } }, d.k === 'num' ? `${o.raw} × ${d.f} = ${vd}` : vd, pt ? toHex(o.bytes, ' ') : undefined);
        R.measurements.push({ id: o.id, name: d.name, off: base + o.off, bytes: o.bytes, raw: o.raw, factor: d.k === 'num' ? d.f : null, unit: d.u || '', value: o.value, vt: vd, dup: seen[o.id], pt });
      });
      w.order.forEach(x => W('W_ORDER', { id: hx(x.id), prev: hx(x.prev), offset: base + x.off }));
      if (w.stop) {
        const so = base + w.stop.offset;
        raw(so, w.stop.rest.length, pt ? 2 : 1, w.stop.rest);
        if (pt) R.segments[R.segments.length - 1].hex = toHex(w.stop.rest, ' ');
        if (w.stop.kind === 'unknown') { W('W_UNKNOWN_ID', { id: hx(w.stop.id), offset: so }); M.unparsed = true; }
        else Er('E_OBJ', { id: hx(w.stop.id), offset: so, kind: w.stop.kind });
      }
    }
    function bthLayer(uuidAt, infoAt, end) {
      if (uuidAt >= 0) seg(uuidAt, 2, 'bth', 1, { c: 'lbl.uuid' }, { c: 'd.uuid' });
      if (infoAt >= end) { Er('E_TOO_SHORT', { have: end - Math.max(uuidAt, 0), min: 3 }); return; }
      const info = b[infoAt], ver = info >> 5, enc = !!(info & 1), trig = !!(info & 4);
      M.deviceInfo = info; M.version = ver; M.encrypted = enc; M.trigger = trig;
      seg(infoAt, 1, 'bth', 1, { c: 'lbl.info' }, { c: ver === 2 ? 'd.info' : 'd.infov', a: { v: hx(info), ver, enc, trig } });
      R.bth = { present: true, ok: false };
      const ps = infoAt + 1;
      if (ver !== 2) { Er('E_VERSION', { v: ver }); raw(ps, end - ps, 1, b.slice(ps, end)); return; }
      R.bth.ok = true;
      const rsv = [1, 3, 4].filter(k => (info >> k) & 1);
      if (rsv.length) W('W_RESERVED', { bits: rsv.map(k => 'bit' + k).join(', ') });
      if (!enc) { emit(walkObjects(b.slice(ps, end)), ps, false); return; }
      const pl = b.slice(ps, end);
      if (pl.length < 8) { Er('E_ENC_SHORT', { have: pl.length }); raw(ps, pl.length, 1, pl); return; }
      const cl = pl.length - 8, ct = pl.slice(0, cl), ctrB = pl.slice(cl, cl + 4), mic = pl.slice(cl + 4);
      if (cl) seg(ps, cl, 'enc', 1, { c: 'lbl.ct' }, { c: 'd.ctx', a: { n: cl } });
      seg(ps + cl, 4, 'cnt', 1, { c: 'lbl.ctr' }, { c: 'd.ctr', a: { n: 4 } });
      seg(ps + cl + 4, 4, 'mic', 1, { c: 'lbl.mic' }, { c: 'd.mic' });
      M.counter = rd(ctrB, 0, 'u32');
      const macB = advMac || parseMac(opts.mac), key = parseKey(opts.key);
      if (!advMac && macB) { M.mac = toHex(macB, ':'); M.macFrom = 'input'; }
      if (!macB || !key) { R.hints.push({ l: 'info', c: 'H_ENC_NEED', a: { key: !key, mac: !macB } }); return; }
      const d = ccmDecrypt(key, [...macB, 0xD2, 0xFC, info, ...ctrB], ct, mic);
      M.micOk = d.ok;
      if (!d.ok) { Er('E_MIC'); return; } // never expose plaintext when the MIC fails
      emit(walkObjects(d.pt), ps, true);
    }

    // ----- link layer -----
    let adStart = 0, adEnd = n, hasAd = det.f === 'ADV_DATA';
    if (det.f === 'FULL_PACKET' || det.f === 'PDU') {
      const full = det.f === 'FULL_PACKET'; let p = 0; M.hasLink = true;
      if (full) { if (det.pre) { seg(0, 1, 'fix', 0, { c: 'lbl.pre' }, { c: 'd.pre' }); p = 1; } seg(p, 4, 'fix', 0, { c: 'lbl.aa' }, { c: 'd.aa' }); p += 4; }
      const pduEnd = full ? n - 3 : n, h0 = b[p], h1 = b[p + 1], ty = h0 & 15, avail = pduEnd - (p + 2);
      M.pduType = ty; M.pduName = pduName(ty); M.chSel = (h0 >> 5) & 1; M.txAdd = (h0 >> 6) & 1; M.rxAdd = (h0 >> 7) & 1;
      seg(p, 1, 'll', 0, { c: 'lbl.h0' }, { c: 'd.h0x', a: { pdu: M.pduName, ch: M.chSel, tx: M.txAdd, rx: M.rxAdd } });
      seg(p + 1, 1, 'll', 0, { c: 'lbl.h1' }, { c: 'd.h1', a: { n: Math.max(0, h1 - 6), len: h1 } });
      if (h1 !== avail) W('W_LENFIELD', { declared: h1, actual: avail });
      if ([0, 2, 4, 6].indexOf(ty) >= 0) {
        const onair = b.slice(p + 2, p + 8); advMac = onair.slice().reverse(); M.mac = toHex(advMac, ':'); M.macFrom = 'advA';
        seg(p + 2, 6, 'll', 0, { c: 'lbl.adva' }, { c: 'd.adva', a: { mac: M.mac, le: toHex(onair, ' ') } });
        adStart = p + 8; adEnd = pduEnd; hasAd = true;
      } else { W('W_PDU_UNSUP', { pdu: M.pduName }); raw(p + 2, avail, 0, b.slice(p + 2, pduEnd)); }
      if (full) {
        const got = b[n - 3] | (b[n - 2] << 8) | (b[n - 1] << 16), exp = crc24(b.slice(det.pre ? 5 : 4, n - 3));
        M.crcOk = exp === got;
        if (!M.crcOk) W('W_CRC', { exp: hex6(exp), got: hex6(got) });
        seg(n - 3, 3, 'crc', 0, { c: 'lbl.crc' }, { c: 'd.crc', a: { v: hex6(got), on: toHex(b.slice(n - 3), ' ') } });
      }
    }

    // ----- AD elements / service data / bare payload -----
    if (hasAd) {
      const w = adWalk(b, adStart, adEnd); let bthDone = false; M.advLen = adEnd - adStart;
      if (M.advLen > 31) W('W_ADV_LEN', { n: M.advLen });
      w.els.forEach(e => {
        const ty = e.ty, total = e.len + 1;
        if (isBth(e)) {
          if (bthDone) { W('W_MULTI_BTH'); M.extraAd++; seg(e.o, total, 'ad', 0, { c: 'lbl.ad', a: { name: AD_TYPES[0x16], ty: hx(ty) } }, customDesc(ty, e.data)); return; }
          bthDone = true; seg(e.o, 2, 'ad', 0, { c: 'lbl.svc' }, { c: 'd.len', a: { len: e.len } });
          bthLayer(e.o + 2, e.o + 4, e.o + 1 + e.len); return;
        }
        if (ty === 0x01 && e.data.length === 1) { M.flags = e.data[0]; seg(e.o, total, 'ad', 0, { c: 'lbl.flags' }, { c: 'd.flags', a: { v: hx(M.flags), bits: [0, 1, 2, 3, 4].filter(i => (M.flags >> i) & 1) } }); return; }
        if (ty === 0x08 || ty === 0x09) { const text = fromUtf8(e.data); M.name = { mode: ty === 8 ? 'short' : 'complete', text };
          seg(e.o, total, 'ad', 0, { c: ty === 8 ? 'lbl.name.short' : 'lbl.name.complete' }, { c: 'd.name', a: { text, n: e.data.length } }); return; }
        if (ty === 0x0A && e.data.length === 1) { const v = e.data[0] > 127 ? e.data[0] - 256 : e.data[0]; M.txPower = v; seg(e.o, total, 'ad', 0, { c: 'lbl.tx' }, `${v} dBm (sint8)`); return; }
        M.extraAd++;
        if (!AD_TYPES[ty]) W('W_AD_UNKNOWN', { ty: hx(ty), offset: e.o });
        seg(e.o, total, 'ad', 0, AD_TYPES[ty] ? { c: 'lbl.ad', a: { name: AD_TYPES[ty], ty: hx(ty) } } : { c: 'lbl.adu', a: { ty: hx(ty) } }, customDesc(ty, e.data));
      });
      if (w.err) { Er('E_TLV', { offset: w.err.offset, kind: w.err.kind }); raw(w.err.offset, adEnd - w.err.offset, 0, b.slice(w.err.offset, adEnd)); }
      if (!bthDone) W('W_NO_BTHOME');
    } else if (det.f === 'SERVICE_DATA') bthLayer(0, 2, n);
    else if (det.f === 'BARE_PAYLOAD') bthLayer(-1, 0, n);
    else if (M.pduType !== null) W('W_NO_BTHOME');

    R.segments.sort((x, y) => x.s - y.s); // stable: children keep insertion order after their parent
    R.state = R.errors.length ? 'error' : 'ok';
    return R;
  }

  // ---------- self-tests ----------
  function selfTest() {
    const res = [];
    const t = (id, fn) => { try { const r = fn(); res.push({ id, ok: r.ok, detail: r.detail }); } catch (e) { res.push({ id, ok: false, detail: e.message }); } };
    t('T1', () => {
      const c = crc24(utf8('123456789')), bs = toHex(crcBytes(c), ' ');
      return { ok: c === 0xC25A56 && bs === '56 5A C2', detail: '0x' + c.toString(16).toUpperCase() + ' → ' + bs };
    });
    t('T2', () => {
      const want = '0201060B094449592D73656E736F720A16D2FC4002C40903BF13';
      const got = toHex(buildAdv({ flagsOn: true, flags: 6, nameMode: 'complete', name: 'DIY-sensor', info: 0, autoSort: true,
        objs: [{ id: 2, value: 25 }, { id: 3, value: 50.55 }] }).bytes);
      return { ok: got === want, detail: got };
    });
    t('T3', () => {
      const want = 'AAD6BE898E4214A5808FE648540201060A16D2FC4002C40903BF130F28DB';
      const p = buildPacket({ flagsOn: true, flags: 6, nameMode: 'none', name: '', info: 0, autoSort: true,
        objs: [{ id: 2, value: 25 }, { id: 3, value: 50.55 }], mac: '54:48:E6:8F:80:A5', pduType: 2, txAdd: 1 });
      const got = p.full ? toHex(p.full.bytes) : '(null)';
      return { ok: got === want, detail: got };
    });
    t('T4', () => {
      const seq = k => Array.from({ length: 16 }, (_, i) => i * k);
      const kat = toHex(aesBlock(aesKeys(seq(1)), seq(17))) === '69C4E0D86A7B0430D8CDB78070B4C55A';
      const st = { flagsOn: false, flags: 0, nameMode: 'none', name: '', info: 1, autoSort: true,
        objs: [{ id: 2, value: 25.06 }, { id: 3, value: 50.55 }], mac: '54:48:E6:8F:80:A5',
        enc: { key: '231d39c1d7cc1ab1aee224cd096db932', counter: 1122867 } };
      const a = buildAdv(st), got = toHex(a.bytes.slice(2)), want = 'D2FC41E445F3C9962B332211006C7C4519', e = a.enc, key = parseKey(st.enc.key);
      const d = ccmDecrypt(key, e.nonce, e.ct, e.mic), bad = ccmDecrypt(key, e.nonce, e.ct, [e.mic[0], e.mic[1], e.mic[2], e.mic[3] ^ 1]);
      const ok = kat && got === want && toHex(e.nonce) === '5448E68F80A5D2FC4133221100' && d.ok && toHex(d.pt) === '02CA0903BF13' && !bad.ok;
      return { ok, detail: `${got} (KAT ${kat ? '✓' : '✗'}, decrypt ${d.ok ? '✓' : '✗'}, tamper ${bad.ok ? '✗' : '✓'})` };
    });
    t('T5', () => {
      const xs = [{ id: 2, value: -3.25 }, { id: 4, value: 1013.25 }, { id: 0x1A, value: 1 }, { id: 0x3A, value: 0x80 },
        { id: 0x53, value: 'Merhaba çğş €' }, { id: 0x54, value: 'DEADBEEF' }, { id: 0x3C, value: { event: 2, steps: 3 } },
        { id: 0x3B, value: { op: 3, steps: 5 } }, { id: 0xF1, value: [4, 2, 1, 0] }, { id: 0x50, value: 1700000000 },
        { id: 0x58, value: 1.05 }, { id: 0x62, value: -1.234567 }, { id: 0x64, value: 2 }];
      const bytes = []; xs.forEach(x => encodeObject(x).bytes.forEach(b => bytes.push(b)));
      const a = JSON.stringify(decode(bytes)), b = JSON.stringify(xs);
      return { ok: a === b, detail: a === b ? 'n=' + xs.length : a };
    });
    const T2HEX = '0201060B094449592D73656E736F720A16D2FC4002C40903BF13', T8HEX = 'AAD6BE898E4214A5808FE648540201060A16D2FC4002C40903BF130F28DB';
    const T9HEX = '0201061216D2FC41E445F3C9962B332211006C7C4519', T9KEY = '231d39c1d7cc1ab1aee224cd096db932', T9MAC = '5448E68F80A5';
    const msOf = r => r.measurements.map(m => m.id + ':' + m.value).join(',');
    const codes = (r, k) => r[k].map(x => x.c);
    t('T7', () => {
      const r = parseInput(T2HEX), ms = msOf(r);
      return { ok: r.format === 'ADV_DATA' && !r.errors.length && !!r.meta.name && r.meta.name.text === 'DIY-sensor' && ms === '2:25,3:50.55', detail: `${r.format} ${ms}` };
    });
    t('T8', () => {
      const r = parseInput(T8HEX), m = r.meta, bad = parseInput(T8HEX.replace('03BF130F28DB', '03BF140F28DB'));
      const ok = r.format === 'FULL_PACKET' && m.crcOk === true && m.mac === '54:48:E6:8F:80:A5' && m.txAdd === 1 && m.pduType === 2 && m.pduName === 'ADV_NONCONN_IND' && msOf(r) === '2:25,3:50.55'
        && codes(bad, 'warnings').indexOf('W_CRC') >= 0 && bad.meta.crcOk === false && bad.measurements.length === 2;
      return { ok, detail: `${m.mac} ${m.pduName} crc=${m.crcOk} | corrupt: ${codes(bad, 'warnings').join()}` };
    });
    t('T9', () => {
      const o = { mac: T9MAC, key: T9KEY }, r = parseInput(T9HEX, o), bad = parseInput(T9HEX.replace('C9962B33', 'C9962A33'), o), nokey = parseInput(T9HEX, { mac: T9MAC });
      const ok = r.meta.micOk === true && r.meta.counter === 1122867 && msOf(r) === '2:25.06,3:50.55'
        && codes(bad, 'errors').indexOf('E_MIC') >= 0 && bad.measurements.length === 0 && bad.meta.micOk === false && !bad.segments.some(x => x.hex != null)
        && !nokey.errors.length && codes(nokey, 'hints').indexOf('H_ENC_NEED') >= 0 && nokey.measurements.length === 0;
      return { ok, detail: `mic=${r.meta.micOk} ctr=${r.meta.counter} ${msOf(r)} | tamper: ${codes(bad, 'errors').join()}` };
    });
    t('T10', () => {
      const mixed = '0x02:01:06 0b09 4449592D73656e736F72,0A16-d2fc 4002C4 09\n03bf13', a = parseInput(T2HEX), b2 = parseInput(mixed);
      const sig = r => JSON.stringify([r.format, msOf(r), r.meta.name]);
      const odd = parseInput('020'), trunc = parseInput('02010609'), ver = parseInput('D2FC2002C409');
      const sts = [
        { info: 0, objs: [{ id: 2, value: 25 }, { id: 3, value: 50.55 }], nameMode: 'complete', name: 'DIY-sensor' },
        { info: 4, objs: [{ id: 0, value: 1 }, { id: 0x3A, value: 1 }], nameMode: 'none', name: '' },
        { info: 0, objs: [{ id: 1, value: 97 }, { id: 2, value: 21.5 }, { id: 2, value: 22 }, { id: 2, value: -3.25 }], nameMode: 'none', name: '' }];
      const rt = sts.every(x => {
        const r = parseInput(toHex(buildAdv(Object.assign({ flagsOn: true, flags: 6, autoSort: true }, x)).bytes));
        return !r.errors.length && msOf(r) === x.objs.map(o => o.id + ':' + o.value).join(',');
      });
      const tr = trunc.errors.find(e => e.c === 'E_TLV'), ok = sig(a) === sig(b2) && a.state === 'ok' && odd.errors[0] && odd.errors[0].c === 'E_HEX_ODD'
        && !!tr && tr.a.offset === 3 && codes(ver, 'errors').indexOf('E_VERSION') >= 0 && rt;
      return { ok, detail: `norm=${sig(a) === sig(b2)} odd=${odd.errors[0] && odd.errors[0].c} tlv@${tr && tr.a.offset} ver=${codes(ver, 'errors').join()} roundtrip=${rt}` };
    });
    return res;
  }

  window.BTHome = { DEFS, GROUPS, BTN, DIM, CMD, FLAG_NAMES, hx, toHex, encodeObject, decode, buildAdv, buildPacket, parseKey, crc24, crcBytes, parseMac, PDU, adTypeDesc, rangeInfo, fmt, parseInput, defaultValue, selfTest };
})();
