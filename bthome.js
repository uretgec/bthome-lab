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

  // ---------- minimal decoder (objects only; used by self-test) ----------
  function decode(a) {
    const out = []; let i = 0;
    while (i < a.length) {
      const id = a[i++], d = DEFS[id]; if (!d) throw new Error('Bilinmeyen id 0x' + hx(id));
      let value;
      switch (d.k) {
        case 'num': value = Number((rd(a, i, d.t) * d.f).toFixed(dec(d.f))); i += tInfo(d.t).bits / 8; break;
        case 'bin': case 'enum': value = a[i++]; break;
        case 'ts': value = rd(a, i, 'u32'); i += 4; break;
        case 'text': { const n = a[i++]; value = fromUtf8(a.slice(i, i + n)); i += n; break; }
        case 'raw': { const n = a[i++]; value = toHex(a.slice(i, i + n)); i += n; break; }
        case 'dimmer': value = { event: a[i], steps: a[i + 1] }; i += 2; break;
        case 'cmd': { const n = a[i] & 0x1F, op = a[i + 1]; value = { op, steps: n ? a[i + 2] : 0 }; i += 2 + n; break; }
        case 'fw': value = a.slice(i, i + d.n).reverse(); i += d.n; break;
      }
      out.push({ id, value });
    }
    return out;
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
    return res;
  }

  window.BTHome = { DEFS, GROUPS, BTN, DIM, CMD, FLAG_NAMES, hx, toHex, encodeObject, decode, buildAdv, buildPacket, parseKey, crc24, crcBytes, parseMac, PDU, adTypeDesc, rangeInfo, fmt, defaultValue, selfTest };
})();
