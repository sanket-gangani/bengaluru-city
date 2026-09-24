// Namma Ooru — world builder.
// Turns the OpenStreetMap extract (js/world-data.js) into a voxel Bengaluru.
// 1 world unit = one 60 m cell. The board is centred on the origin, x = east, z = south.
(function () {
  const NO = window.NO;
  const WD = NO.WORLD || { meta: { gw: 614.7198439883139, gh: 516.0119999999988, cell: 60 } }, GW = WD.meta.gw, GH = WD.meta.gh, BB = NO.BBOX, CELL = WD.meta.cell;
  const KX = 111320 * Math.cos(((BB.s + BB.n) / 2) * Math.PI / 180), KY = 110574;
  const NX = Math.ceil(GW), NZ = Math.ceil(GH);
  const HX = GW / 2, HZ = GH / 2;

  // ── device tier: phones get the lean build
  const coarse = matchMedia("(pointer: coarse)").matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const MOBILE = coarse || small || /[?&]mobile/.test(location.search);
  const EXPORT = /[?&]export/.test(location.search);
  const TIER = EXPORT ? "high" : MOBILE ? "low" : ((navigator.hardwareConcurrency || 8) <= 4 ? "mid" : "high");
  const Q = { low: 0.5, mid: 0.75, high: 1 }[TIER];
  const R = MOBILE ? 2 : 3;                    // mask pixels per cell
  const MW = Math.ceil(GW * R), MH = Math.ceil(GH * R);
  Object.assign(NO, { GW, GH, MOBILE, TIER, Q });

  NO.ll2w = (lat, lon) => ({ x: (lon - BB.w) * KX / CELL - HX, z: (BB.n - lat) * KY / CELL - HZ });
  NO.w2ll = (x, z) => ({ lat: BB.n - (z + HZ) * CELL / KY, lon: BB.w + (x + HX) * CELL / KX });

  // delta-packed ints → Float32Array of world coords
  function unpack(a, from) {
    const n = (a.length - from) >> 1, o = new Float32Array(n * 2); let x = 0, z = 0;
    for (let i = 0; i < n; i++) { x += a[from + 2 * i]; z += a[from + 2 * i + 1]; o[2 * i] = x / 10 - HX; o[2 * i + 1] = z / 10 - HZ; }
    return o;
  }
  // the heavy layers arrive as one base64 binary (NO.WORLD_BIN) — cheap for phones to load
  let G = null;
  function decodeWorld() {
    const bin = atob(NO.WORLD_BIN), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    if (u8[0] !== 78 || u8[1] !== 79 || u8[2] !== 87 || u8[3] !== 49) throw new Error("map data is damaged");
    const dv = new DataView(u8.buffer); let o = 4;
    const layer = (hasClass) => {
      const n = dv.getUint32(o, true); o += 4;
      const cls = u8.subarray(o, o + n); o += n; while (o % 4) o++;
      const lens = []; for (let i = 0; i < n; i++, o += 4) lens.push(dv.getUint32(o, true));
      const out = [];
      for (let i = 0; i < n; i++) {
        const p = new Float32Array(lens[i] * 2); let x = 0, z = 0;
        for (let k = 0; k < lens[i]; k++, o += 4) { x += dv.getInt16(o, true); z += dv.getInt16(o + 2, true); p[2 * k] = x / 10 - HX; p[2 * k + 1] = z / 10 - HZ; }
        out.push({ c: cls[i], p });
      }
      while (o % 4) o++;
      return out;
    };
    const roads = layer(true).map(r => ({ c: r.c % 10, elev: r.c >= 10, p: r.p })), water = layer(true), green = layer(true), landuse = layer(true);
    const rail = layer(false).map(r => r.p), runways = layer(true).map(r => ({ w: r.c / 100, p: r.p }));
    const nb = dv.getUint32(o, true); o += 4; const bgrid = u8.slice(o, o + nb); o += nb; while (o % 4) o++;
    const nt = dv.getUint32(o, true); o += 4; const tall = new Float32Array(nt * 4);
    for (let i = 0; i < nt; i++) { tall[i * 4] = dv.getInt16(o + i * 4, true); tall[i * 4 + 1] = dv.getInt16(o + i * 4 + 2, true); }
    o += nt * 4; for (let i = 0; i < nt; i++) { tall[i * 4 + 2] = u8[o + i]; tall[i * 4 + 3] = u8[o + nt + i]; }
    NO.WORLD_BIN = null;
    return { roads, water, green, landuse, rail, runways, bgrid, tall, metro: WD.metro.map(m => ({ ref: m.ref, color: m.color, p: unpack(m.p, 0), stops: unpack(m.stops, 0) })) };
  }

  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rnd = mulberry(1537);                   // the year Kempegowda founded the city
  NO.rnd = rnd;
  const hash2 = (x, z) => { let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const hashStr = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
  Object.assign(NO, { hash2, hashStr });
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  // yield to the browser between build steps; a hidden tab clamps timers to 1 s, so use a message there
  const mch = new MessageChannel();
  const tick = () => new Promise(r => { if (document.hidden) { mch.port1.onmessage = () => r(); mch.port2.postMessage(0); } else setTimeout(r, 0); });

  const matCache = {};
  function M(color, o = {}) { const k = color + JSON.stringify(o); if (!matCache[k]) matCache[k] = new THREE.MeshLambertMaterial(Object.assign({ color }, o)); return matCache[k]; }
  NO.M = M;

  // ── vertex-coloured model helper: parts are [geometry, colour, tint?, glow?]
  // tint 1 = takes the instance colour (paint, clothes); glow: 1 headlight, 2 tail-light, 3 amber, 4 window/LED
  NO.mergeColored = function (parts) {
    let n = 0; const gs = parts.map(([g, c, tint = 0, glow = 0]) => { const ng = g.index ? g.toNonIndexed() : g; ng.userData.part = g.userData.part; n += ng.attributes.position.count; return [ng, new THREE.Color(c), tint, glow]; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), tin = new Float32Array(n), glo = new Float32Array(n), part = new Float32Array(n); let o = 0;
    gs.forEach(([g, c, tint, glow]) => {
      const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      for (let q = 0; q < k; q++) { col[(o + q) * 3] = c.r; col[(o + q) * 3 + 1] = c.g; col[(o + q) * 3 + 2] = c.b; tin[o + q] = tint; glo[o + q] = glow; part[o + q] = g.userData.part || 0; }
      o += k;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    out.setAttribute("tint", new THREE.BufferAttribute(tin, 1)); out.setAttribute("glow", new THREE.BufferAttribute(glo, 1)); out.setAttribute("part", new THREE.BufferAttribute(part, 1));
    out.computeBoundingSphere(); return out;
  };
  // one material for vertex-coloured models: instance tint on painted parts only, lights that glow after dark,
  // and (for people) limbs that swing while walking
  NO.uni = { uNight: { value: 0 }, uDay: { value: 1 }, uTime: { value: 0 } };
  NO.modelMat = function (opts = {}) {
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: opts.side || THREE.FrontSide });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, NO.uni);
      sh.vertexShader = "attribute float tint; attribute float glow; attribute float part; varying float vGlow; uniform float uTime;\n" +
        (opts.walk ? "attribute float aPhase; attribute float aMove;\n" : "") +
        sh.vertexShader.replace("#include <color_vertex>", `
          #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
            vColor = vec3( 1.0 );
          #endif
          #ifdef USE_COLOR
            vColor *= color;
          #endif
          #ifdef USE_INSTANCING_COLOR
            vColor *= mix( vec3( 1.0 ), instanceColor.xyz, tint );
          #endif
          vGlow = glow;`).replace("#include <begin_vertex>", opts.walk ? `
          vec3 transformed = vec3( position );
          if ( part > 0.5 ) {
            float side = mod( part, 2.0 ) > 0.5 ? 1.0 : -1.0;
            float pivot = part < 2.5 ? 0.055 : 0.105;
            float a = sin( uTime * 9.0 + aPhase ) * 0.55 * aMove * side * ( part < 2.5 ? 1.0 : -0.8 );
            float y = transformed.y - pivot; float x = transformed.x;
            transformed.x = x * cos( a ) - y * sin( a );
            transformed.y = x * sin( a ) + y * cos( a ) + pivot;
          }
          transformed.y += abs( sin( uTime * 9.0 + aPhase ) ) * 0.006 * aMove;` : "#include <begin_vertex>");
      sh.fragmentShader = "varying float vGlow; uniform float uNight;\n" + sh.fragmentShader.replace("#include <fog_fragment>", `
          if ( vGlow > 0.5 ) {
            vec3 gc = vGlow < 1.5 ? vec3( 1.0, 0.95, 0.8 ) : vGlow < 2.5 ? vec3( 1.0, 0.12, 0.08 ) : vGlow < 3.5 ? vec3( 1.0, 0.6, 0.1 ) : vec3( 1.0, 0.82, 0.5 );
            gl_FragColor.rgb = mix( gl_FragColor.rgb, gc * 1.25, uNight * 0.92 );
          }
          #include <fog_fragment>`);
    };
    return m;
  };

  // prebuilt city (assets/city.bin + ground image): generated once by ?export, so phones skip the heavy work
  NO.loadPrebuilt = async function () {
    try {
      if (!NO.CITY_BIN) return null;
      const bin = atob(NO.CITY_BIN), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      NO.CITY_BIN = null;
      const dv = new DataView(u8.buffer); let n = 0; for (let t = 0; t < 5; t++) n += dv.getUint32(t * 4, true);
      if (20 + n * 19 !== u8.length) return null;
      const img = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = MOBILE ? "assets/ground-m.webp" : "assets/ground.webp"; });
      return img ? { buf: u8.buffer, img } : null;
    } catch (e) { return null; }
  };
  NO.exportCity = function (REC, canvas) {
    const types = ["house", "bld", "canopy", "palm", "rock"], n = types.map(t => REC[t].length / 13), total = n.reduce((a, b) => a + b, 0);
    const buf = new ArrayBuffer(20 + total * 19), dv = new DataView(buf); let o = 20;
    const u16 = v => Math.max(0, Math.min(65535, Math.round(v * 1000))), u8 = v => Math.max(0, Math.min(255, Math.round(v * 255)));
    types.forEach((t, ti) => { dv.setUint32(ti * 4, n[ti], true); const a = REC[t];
      for (let k = 0; k < a.length; k += 13, o += 19) {
        dv.setInt16(o, Math.round(a[k] * 50), true); dv.setInt16(o + 2, Math.round(a[k + 1] * 50), true); dv.setUint16(o + 4, u16(a[k + 2]), true);
        dv.setUint16(o + 6, u16(a[k + 3]), true); dv.setUint16(o + 8, u16(a[k + 4]), true); dv.setUint16(o + 10, u16(a[k + 5]), true);
        let rot = a[k + 6] % 6.2832; if (rot < 0) rot += 6.2832; dv.setUint8(o + 12, Math.round(rot / 6.2832 * 255) & 255);
        dv.setUint8(o + 13, u8(a[k + 7])); dv.setUint8(o + 14, u8(a[k + 8])); dv.setUint8(o + 15, u8(a[k + 9])); dv.setUint8(o + 16, a[k + 10]); dv.setUint8(o + 17, a[k + 11]); dv.setUint8(o + 18, u8(a[k + 12]));
      } });
    const save = (name, body) => fetch("/__save?name=" + name, { method: "POST", body }).then(r => console.log("saved", name, r.status));
    { const u8 = new Uint8Array(buf); let b64 = ""; for (let i = 0; i < u8.length; i += 0x8000) b64 += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      save("city-data.js", "// Prebuilt city: every house, tower and tree (see README → rebuilding). Generated.\nwindow.NO=window.NO||{};NO.CITY_BIN=\"" + btoa(b64) + "\";\n"); }
    canvas.toBlob(b => save("ground.webp", b), "image/webp", .9);
    const m = document.createElement("canvas"); m.width = canvas.width / 2; m.height = canvas.height / 2; const mx = m.getContext("2d"); mx.imageSmoothingQuality = "high"; mx.drawImage(canvas, 0, 0, m.width, m.height);
    m.toBlob(b => save("ground-m.webp", b), "image/webp", .88);
    NO.exported = { counts: n, bytes: buf.byteLength };
  };

  NO.buildWorld = async function (progress) {
    const P = (n) => progress && progress(n);
    P(3); await tick();
    if (!WD || !NO.WORLD_BIN) throw new Error("map data didn't download (js/world-data.js)");
    G = NO.G = decodeWorld();
    const PRE = EXPORT ? null : await NO.loadPrebuilt();
    NO.prebuilt = !!PRE;

    // ── 1. rasterise layers into masks
    const mk = () => { const c = document.createElement("canvas"); c.width = MW; c.height = MH; const x = c.getContext("2d", { willReadFrequently: true }); x.setTransform(R, 0, 0, R, R * HX, R * HZ); x.globalCompositeOperation = "lighter"; x.lineCap = x.lineJoin = "round"; return x; };
    const path = (ctx, p, close) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); if (close) ctx.closePath(); };
    const A = mk(), B = mk(), Cm = mk(), Dm = mk();
    const RW = [0.8, 0.64, 0.52, 0.4, 0.17];
    NO.RW = RW;
    A.fillStyle = "rgb(255,0,0)"; G.water.forEach(w => { if (w.c > 0) { path(A, w.p, 1); A.fill(); } });
    A.fillStyle = "rgb(0,255,0)"; G.green.forEach(w => { if (w.c === 1) { path(A, w.p, 1); A.fill(); } });
    B.fillStyle = "rgb(255,0,0)"; G.green.forEach(w => { if (w.c === 2) { path(B, w.p, 1); B.fill(); } });
    B.fillStyle = "rgb(0,255,0)"; G.green.forEach(w => { if (w.c === 3) { path(B, w.p, 1); B.fill(); } });
    A.strokeStyle = "rgb(0,0,255)"; G.roads.forEach(r => { if (r.c < 4) { A.lineWidth = RW[r.c]; path(A, r.p); A.stroke(); } });
    A.lineWidth = .3; G.rail.forEach(p => { path(A, p); A.stroke(); });
    B.strokeStyle = "rgb(0,0,255)"; B.lineCap = "butt"; G.runways.forEach(r => { B.lineWidth = r.w * 1.6; path(B, r.p); B.stroke(); });
    const LUC = { 1: [Cm, "rgb(255,0,0)"], 2: [Cm, "rgb(0,255,0)"], 3: [Cm, "rgb(0,0,255)"], 4: [Dm, "rgb(255,0,0)"], 5: [Dm, "rgb(0,255,0)"], 6: [Dm, "rgb(0,255,0)"], 7: [Dm, "rgb(0,0,255)"], 8: [Dm, "rgb(0,0,255)"], 9: [Dm, "rgb(0,0,255)"], 10: [Dm, "rgb(0,0,255)"], 11: [Dm, "rgb(0,0,255)"] };
    if (!PRE) G.landuse.forEach(l => { const k = LUC[l.c]; if (!k) return; k[0].fillStyle = k[1]; path(k[0], l.p, 1); k[0].fill(); });
    P(10); await tick();
    const da = A.getImageData(0, 0, MW, MH).data, db = B.getImageData(0, 0, MW, MH).data, dc = Cm.getImageData(0, 0, MW, MH).data, dd = Dm.getImageData(0, 0, MW, MH).data;
    // precise road bitmap (tiled so memory stays small): 6 px per cell on desktop, 4 on phones
    const RB = MOBILE ? 6 : 8, BW = Math.ceil(GW * RB), BH = Math.ceil(GH * RB), rbits = PRE ? null : new Uint8Array(BW * BH);
    if (!PRE) { const TS = 1024, tc = document.createElement("canvas"); tc.width = tc.height = TS; const tx = tc.getContext("2d", { willReadFrequently: true });
      const bbox = G.roads.map(r => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i < r.p.length; i += 2) { const x = r.p[i], z = r.p[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return [x0 - 1, z0 - 1, x1 + 1, z1 + 1]; });
      tx.lineCap = tx.lineJoin = "round"; tx.strokeStyle = "#fff";
      for (let ty = 0; ty * TS < BH; ty++) for (let tx0 = 0; tx0 * TS < BW; tx0++) {
        tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, TS, TS); tx.setTransform(RB, 0, 0, RB, RB * HX - tx0 * TS, RB * HZ - ty * TS);
        const wx0 = tx0 * TS / RB - HX, wz0 = ty * TS / RB - HZ, wx1 = wx0 + TS / RB, wz1 = wz0 + TS / RB;
        G.roads.forEach((r, k) => { const bb = bbox[k]; if (bb[2] < wx0 || bb[0] > wx1 || bb[3] < wz0 || bb[1] > wz1) return; tx.lineWidth = RW[r.c] + (r.c < 4 ? .16 : .05); path(tx, r.p); tx.stroke(); });
        const im = tx.getImageData(0, 0, TS, TS).data, w0 = Math.min(TS, BW - tx0 * TS), h0 = Math.min(TS, BH - ty * TS);
        for (let j = 0; j < h0; j++) { const row = (ty * TS + j) * BW + tx0 * TS; for (let i = 0; i < w0; i++) rbits[row + i] = im[(j * TS + i) * 4 + 3] > 127 ? 1 : 0; }
      } }
    let segHash = null, segs = null;
    const segAt = (x, z) => {
      if (!segHash) { segHash = new Map(); const tmp = [];
        G.roads.forEach(r => { const hw = RW[r.c] / 2 + (r.c < 4 ? .08 : .025), p = r.p;
          for (let i = 0; i < p.length - 2; i += 2) { const ax = p[i], az = p[i + 1], bx2 = p[i + 2], bz = p[i + 3], id = tmp.length / 5; tmp.push(ax, az, bx2, bz, hw);
            for (let a = Math.floor((Math.min(ax, bx2) - hw) / 2); a <= Math.floor((Math.max(ax, bx2) + hw) / 2); a++) for (let b = Math.floor((Math.min(az, bz) - hw) / 2); b <= Math.floor((Math.max(az, bz) + hw) / 2); b++) { const k = (a + 2000) * 8192 + b + 2000; let l = segHash.get(k); if (!l) segHash.set(k, l = []); l.push(id); } } });
        segs = new Float32Array(tmp); }
      const l = segHash.get((Math.floor(x / 2) + 2000) * 8192 + Math.floor(z / 2) + 2000); if (!l) return false;
      for (let q = 0; q < l.length; q++) { const o = l[q] * 5, ax = segs[o], az = segs[o + 1], dx = segs[o + 2] - ax, dz = segs[o + 3] - az, L2 = dx * dx + dz * dz;
        let u = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u; const ex = ax + dx * u - x, ez = az + dz * u - z, hw = segs[o + 4]; if (ex * ex + ez * ez < hw * hw) return true; }
      return false;
    };
    const roadAt = PRE ? segAt : (x, z) => { const i = ((x + HX) * RB) | 0, j = ((z + HZ) * RB) | 0; return (i < 0 || j < 0 || i >= BW || j >= BH) ? true : rbits[j * BW + i] === 1; };
    NO.roadAt = roadAt;
    const px = (x, z) => { const i = (x + HX) * R | 0, j = (z + HZ) * R | 0; return (i < 0 || j < 0 || i >= MW || j >= MH) ? -1 : (j * MW + i) * 4; };
    const free = (x, z) => { const i = px(x, z); return i >= 0 && da[i] < 90 && da[i + 1] < 110 && da[i + 2] < 110 && db[i + 2] < 90 && !roadAt(x, z); };
    NO.isWater = (x, z) => { const i = px(x, z); return i >= 0 && da[i] > 110; };
    NO.isRoad = (x, z) => roadAt(x, z);
    NO.isFree = free;

    const N = NX * NZ, frac = () => new Uint8Array(N);
    const water = frac(), park = frac(), road = frac(), wood = frac(), farm = frac(), lres = frac(), lcom = frac(), lind = frac(), lmil = frac(), linst = frac(), loth = frac();
    if (!PRE) for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const c = j * NX + i;
      for (let b = 0; b < R; b++) for (let a = 0; a < R; a++) {
        const x = i * R + a, z = j * R + b; if (x >= MW || z >= MH) continue;
        const k = (z * MW + x) * 4;
        if (da[k] > 110) water[c]++; if (da[k + 1] > 110) park[c]++; if (da[k + 2] > 110) road[c]++;
        if (db[k] > 110) wood[c]++; if (db[k + 1] > 110) farm[c]++;
        if (dc[k] > 110) lres[c]++; if (dc[k + 1] > 110) lcom[c]++; if (dc[k + 2] > 110) lind[c]++;
        if (dd[k] > 110) lmil[c]++; if (dd[k + 1] > 110) linst[c]++; if (dd[k + 2] > 110) loth[c]++;
      }
    }
    const RR = R * R, half = RR / 2;
    const rd = new Uint8Array(N).fill(60); const qu = new Int32Array(N); let qh = 0, qt = 0;
    if (!PRE) { const ac = document.createElement("canvas"); ac.width = NX; ac.height = NZ; const ax = ac.getContext("2d", { willReadFrequently: true }); ax.setTransform(1, 0, 0, 1, HX, HZ); ax.strokeStyle = "#fff"; ax.lineWidth = 1; ax.lineCap = "round";
      G.roads.forEach(r => { if (r.c <= 3) { path(ax, r.p); ax.stroke(); } }); const ad = ax.getImageData(0, 0, NX, NZ).data;
      for (let c = 0; c < N; c++) if (ad[c * 4] > 90) { rd[c] = 0; qu[qt++] = c; } }
    while (qh < qt) { const c = qu[qh++], i = c % NX, j = (c / NX) | 0, d = rd[c] + 1; if (d > 59) continue;
      if (i > 0 && rd[c - 1] > d) { rd[c - 1] = d; qu[qt++] = c - 1; } if (i < NX - 1 && rd[c + 1] > d) { rd[c + 1] = d; qu[qt++] = c + 1; }
      if (j > 0 && rd[c - NX] > d) { rd[c - NX] = d; qu[qt++] = c - NX; } if (j < NZ - 1 && rd[c + NX] > d) { rd[c + NX] = d; qu[qt++] = c + NX; } }
    const bg = G.bgrid;   // OSM buildings: count (hi nibble) & avg levels (lo)
    P(18); await tick();

    // ── 2. zoning & density
    const W2 = (lat, lon) => { const w = NO.ll2w(lat, lon); return [w.x, w.z]; };
    const CBD = W2(12.9716, 77.5946);
    const hubs = [[W2(12.9780, 77.7300), .95, 55], [W2(12.8450, 77.6650), .95, 45], [W2(13.1000, 77.5960), .8, 45], [W2(13.0400, 77.6000), .95, 55], [W2(13.0050, 77.6960), .9, 50],
      [W2(12.9100, 77.6900), .9, 60], [W2(12.9100, 77.4850), .7, 45], [W2(13.0300, 77.5200), .9, 50], [W2(12.9300, 77.6800), 1, 45], [W2(13.0600, 77.6500), .8, 50], [W2(12.8800, 77.5500), .75, 50], [W2(12.8700, 77.6100), .8, 45]];
    const zoneC = [{ z: 1, p: W2(12.9650, 77.5770), r: 28 }, { z: 1, p: W2(12.9857, 77.6050), r: 16 }, { z: 1, p: W2(13.0035, 77.5700), r: 18 }, { z: 1, p: W2(12.9420, 77.5730), r: 18 }, { z: 2, p: W2(12.9735, 77.6070), r: 20 }];
    const techSeeds = [];
    NO.ORGS.forEach(o => { if (o.lat && (o.cat === "techpark" || o.cat === "corporate")) techSeeds.push({ p: W2(o.lat, o.lon), r: o.cat === "techpark" ? 8 : 4 }); });
    [[12.9380, 77.6950], [12.9270, 77.6780], [13.0460, 77.6260], [12.9820, 77.6640], [12.9900, 77.7250], [12.9360, 77.6900], [12.9580, 77.6450]].forEach(([a, b]) => techSeeds.push({ p: W2(a, b), r: 5 }));
    const dist = (x, z, p) => Math.hypot(x - p[0], z - p[1]);
    // zones: 0 residential, 1 old town, 2 CBD, 3 industrial, 4 tech park, 5 cantonment/military, 6 campus, 7 commercial
    const dens = new Float32Array(N), zone = new Uint8Array(N), lvls = new Uint8Array(N);
    if (!PRE) for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const c = j * NX + i, x = i + .5 - HX, z = j + .5 - HZ;
      let k = 1.25 - dist(x, z, CBD) / 170; for (const h of hubs) k = Math.max(k, h[1] - dist(x, z, h[0]) / h[2]); k = clamp(k, 0, 1);
      const n = vnoise(x / 8, z / 8) * .3 + vnoise(x / 29 + 7, z / 29) * .3 - .3;
      const heur = clamp(k + n * (1 - k * .5) + .3 * Math.exp(-rd[c] / 4) * (1 - k * .7), 0, 1) * .85;
      const cnt = bg[c] >> 4;
      let nb = cnt; if (i > 0 && i < NX - 1 && j > 0 && j < NZ - 1) nb = Math.max(cnt, ((bg[c - 1] >> 4) + (bg[c + 1] >> 4) + (bg[c - NX] >> 4) + (bg[c + NX] >> 4)) / 4 * .8);
      const dOsm = clamp(nb / 4, 0, 1);
      const lu = lres[c] > half ? .72 : lcom[c] > half ? .82 : lind[c] > half ? .6 : lmil[c] > half ? .14 : linst[c] > half ? .32 : loth[c] > half ? .15 : 0;
      let d = Math.max(dOsm, lu * (.8 + .4 * vnoise(x / 5, z / 5)), heur);
      d *= (1 - park[c] / RR) * (1 - wood[c] / RR) * (1 - water[c] / RR);
      if (farm[c] > half) d *= .2;
      if (lmil[c] > half) d = Math.min(d, .22);
      dens[c] = d; lvls[c] = bg[c] & 15;
      let zn = lcom[c] > half ? 7 : 0;
      for (const zc of zoneC) if (dist(x, z, zc.p) < zc.r * (.85 + .3 * vnoise(x / 6, z / 6))) { zn = zc.z; break; }
      if (lind[c] > half) zn = 3; if (lmil[c] > half) zn = 5; if (linst[c] > half) zn = 6;
      for (const t of techSeeds) if (dist(x, z, t.p) < t.r) { zn = 4; dens[c] = Math.max(d, .7); break; }
      zone[c] = zn;
    }
    NO.densAt = (x, z) => { const i = Math.floor(x + HX), j = Math.floor(z + HZ); return (i < 0 || j < 0 || i >= NX || j >= NZ) ? 0 : dens[j * NX + i]; };
    P(24); await tick();

    // reserved footprints: landmarks, org HQs, OSM towers
    const reserved = new Uint8Array(N);
    const reserve = (x, z, r) => { const gx = x + HX, gz = z + HZ; for (let j = Math.floor(gz - r); j <= gz + r; j++) for (let i = Math.floor(gx - r); i <= gx + r; i++) if (i >= 0 && j >= 0 && i < NX && j < NZ && Math.hypot(i + .5 - gx, j + .5 - gz) <= r + .5) reserved[j * NX + i] = 1; };
    const LR = { vidhana: 2.8, stadium: 2.0, palace: 1.8, glasshouse: 1.2, iskcon: 1.5, rocket: 1.3, pyramid: 1.2, attara: 1.4, busstand: 1.6, ubcity: 1.1, tower: .8, library: .9 };
    NO.LANDMARKS.forEach(l => { const w = NO.ll2w(l.lat, l.lon); if (LR[l.kind]) reserve(w.x, w.z, LR[l.kind]); });
    NO.orgPos = {}; const areaCount = {};
    NO.ORGS.forEach(o => {
      if (o.prec === "none") return;
      let lat, lon;
      if (o.lat) { lat = o.lat; lon = o.lon; }
      else {
        const a = NO.AREAS[o.area]; const n = (areaCount[o.area] = (areaCount[o.area] || 0) + 1);
        const ang = hashStr(o.id) * Math.PI * 2 + n * 2.4, rad = (o.area === "cbd" ? 2.5 : 2) + n * .9 + hashStr(o.id + "r") * 2;
        lat = a.lat - Math.sin(ang) * rad * CELL / KY; lon = a.lon + Math.cos(ang) * rad * CELL / KX;
      }
      const w = NO.ll2w(lat, lon); NO.orgPos[o.id] = w;
      if (!(o.cat === "techpark" || o.id === "isro" || o.id === "infosys")) reserve(w.x, w.z, .7);
    });

    // ── 3. buildings: houses line the real streets, facing the road; towers from OSM; trees in the gaps
    // "house" = low-rise, drawn in 3D only near the camera (far away they are painted into the ground);
    // "bld" = everything taller, always drawn.
    const buckets = {}, CHS = { house: 64, bld: 128, bldS: 64, roof: 64, canopy: 96, trunk: 64, palm: 128, rock: 999 };
    const pushRaw = (type, x, y, z, sx, sy, sz, rot, cr, cg, cb, kind, seed) => {
      const CHt = CHS[type] || 96, ncx = Math.ceil(NX / CHt), ncz = Math.ceil(NZ / CHt);
      const ci = clamp(Math.floor((x + HX) / CHt), 0, ncx - 1) + clamp(Math.floor((z + HZ) / CHt), 0, ncz - 1) * ncx;
      const b = (buckets[type] = buckets[type] || []); const arr = (b[ci] = b[ci] || []);
      arr.push(x, y, z, sx, sy, sz, rot, cr, cg, cb, kind, seed);
    };
    const REC = { house: [], bld: [], canopy: [], palm: [], rock: [] };   // primary instances, for the prebuilt export
    const q8 = v => Math.round(v * 255) / 255;
    const fr = (sd, k) => { const v = Math.sin(sd * 12.9898 * k + k * 78.233) * 43758.5453; return v - Math.floor(v); };
    const C = h => new THREE.Color(h);
    const PAL = {
      house: ["#f1e4c8", "#f3d27a", "#f2a9a0", "#9fd3c3", "#cfdca5", "#f4f1ea", "#d9bfe6", "#a9c9e9", "#eeb57a", "#f7f5f0", "#e8d5b0", "#bfe0d6", "#f0c9d4", "#ffe9a8", "#c9e4b0", "#f6f0e2", "#e9dcc9"].map(C),
      old: ["#e9c46a", "#e76f51", "#f4a261", "#8ecae6", "#b5e48c", "#f1faee", "#e5989b", "#ffd166", "#a7c957", "#cdb4db", "#f7b267", "#90be6d"].map(C),
      cbd: ["#e8e3d8", "#d9d4c9", "#c7d3da", "#f2efe8", "#b8c4cc", "#e6dccb"].map(C),
      glass: ["#6f9fb8", "#5b8aa3", "#88b3c8", "#4f7d96", "#9cc0d0", "#7aa6a8", "#5e8f9e", "#8fb8b0"].map(C),
      ind: ["#c9ccce", "#b7c2c9", "#d6d2c7", "#9fb0bd", "#c4b9a6", "#a9b8a2"].map(C),
      apt: ["#f3efe6", "#efe3cf", "#e8e6e1", "#f1e0c6", "#e5ded3", "#f4e9d8", "#dfe3e6"].map(C),
      mil: ["#d8cfb4", "#cfc39f", "#e2dac2"].map(C),
      campus: ["#c6704f", "#e9e1cf", "#d9c7a7"].map(C),
      roof: ["#b5523b", "#a8472f", "#c0603f", "#9c4a36"].map(C),
      tank: C("#202224"),
      canopy: ["#4f8a3c", "#5f9a44", "#3f7a36", "#6ea64e", "#7fb356", "#4a7f3f", "#5a9448", "#6b9d3a"].map(C),
      bloom: ["#e0452b", "#8a6fd1", "#f29bc0", "#f2c230", "#e0452b", "#8a6fd1", "#f7d046"].map(C),
    };
    const ST = .1; // one storey
    // a building and what grows out of it (tiled roof, black water tank, stair headroom). flags: 1 tank, 2 headroom, 4 tiled roof, 8 tall
    const emitB = (x, z, L, D, h, rot, cr, cg, cb, kind, flags, seed) => {
      const low = !(flags & 8);
      pushRaw(low ? "house" : "bld", x, 0, z, L, h, D, rot, cr, cg, cb, kind, seed);
      const c = Math.cos(rot), s = Math.sin(rot), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
      if (flags & 4) { const rc = PAL.roof[Math.floor(fr(seed, 1) * 4)]; pushRaw(low ? "roof" : "bld", x, h, z, L * 1.04, Math.min(L, D) * .45, D * 1.04, rot, rc.r, rc.g, rc.b, 3, seed); }
      else {
        if ((flags & 1) && h < .6) { const [tx, tz] = at((fr(seed, 2) - .5) * L * .5, (fr(seed, 3) - .5) * D * .5); pushRaw("bldS", tx, h, tz, .06, .07, .06, rot, .125, .133, .141, 3, seed); }
        if ((flags & 2) && h > .25) { const [tx, tz] = at((fr(seed, 4) - .5) * L * .3, (fr(seed, 5) - .5) * D * .3); pushRaw("bldS", tx, h, tz, .14, .08, .12, rot, cr, cg, cb, 3, seed); }
      }
    };
    const emitT = (type, x, y, z, sx, sy, sz, rot, cr, cg, cb, seed) => {
      pushRaw(type, x, y, z, sx, sy, sz, rot, cr, cg, cb, 0, seed);
      if (type === "canopy" && TIER !== "low") pushRaw("trunk", x, 0, z, .05, y - sx * .05, .05, 0, .42, .31, .22, 0, seed);
    };
    const paints = [];
    const baked = [];                  // every footprint, painted into the ground for far views: x,z,L,D,rot,r,g,b,h
    // occupancy at 4 px per cell so buildings never overlap
    const OR = 4, OW = NX * OR, OH = NZ * OR, occ = new Uint8Array(OW * OH);
    const occAt = (x, z) => { const i = ((x + HX) * OR) | 0, j = ((z + HZ) * OR) | 0; return (i < 0 || j < 0 || i >= OW || j >= OH) ? 1 : occ[j * OW + i]; };
    const PTS = [[-.44, -.44], [.44, -.44], [-.44, .44], [.44, .44], [0, 0], [0, -.44], [0, .44], [-.44, 0], [.44, 0]];
    const solid = (x, z) => { const i = px(x, z); return i >= 0 && da[i] < 110 && da[i + 1] < 140 && da[i + 2] < 140 && db[i + 2] < 120 && !roadAt(x, z); };
    const fits = (x, z, L, D, rot) => { const c = Math.cos(rot), s = Math.sin(rot); for (const [a, b] of PTS) { const lx = a * L, lz = b * D, px2 = x + lx * c + lz * s, pz2 = z - lx * s + lz * c; if (!solid(px2, pz2) || occAt(px2, pz2)) return false; } return true; };
    const mark = (x, z, L, D, rot) => {
      const c = Math.cos(rot), s = Math.sin(rot), ex = (Math.abs(L * c) + Math.abs(D * s)) / 2, ez = (Math.abs(L * s) + Math.abs(D * c)) / 2;
      const i0 = Math.max(0, ((x - ex + HX) * OR) | 0), i1 = Math.min(OW - 1, ((x + ex + HX) * OR) | 0), j0 = Math.max(0, ((z - ez + HZ) * OR) | 0), j1 = Math.min(OH - 1, ((z + ez + HZ) * OR) | 0);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = (i + .5) / OR - HX - x, dz = (j + .5) / OR - HZ - z, lx = dx * c - dz * s, lz = dx * s + dz * c; if (Math.abs(lx) <= L / 2 + .02 && Math.abs(lz) <= D / 2 + .02) occ[j * OW + i] = 1; }
    };
    let nB = 0, nH = 0;
    // kinds for the facade shader: 0 house, 1 shop-front, 2 glass office, 3 plain/tank, 4 apartment, 5 shed
    const place = (x, z, L, D, h, col, kind, rot, opts = {}) => {
      if (!fits(x, z, L, D, rot)) return false;
      mark(x, z, L, D, rot);
      const low = h <= .45 && (kind === 0 || kind === 1) && !opts.tall;
      const flags = (opts.tank ? 1 : 0) | (opts.headroom ? 2 : 0) | (opts.roof ? 4 : 0) | (low ? 0 : 8), seed = q8(rnd());
      emitB(x, z, L, D, h, rot, col.r, col.g, col.b, kind, flags, seed);
      REC[low ? "house" : "bld"].push(x, z, 0, L, h, D, rot, col.r, col.g, col.b, kind, flags, seed);
      baked.push(x, z, L, D, rot, col.r, col.g, col.b, h);
      low ? nH++ : nB++;
      return true;
    };
    const tree = (x, z, big, palm) => {
      if (!free(x, z) || occAt(x, z)) return;
      const seed = q8(rnd());
      if (palm) { const h = .45 + rnd() * .35, rt = rnd() * 6.28; emitT("palm", x, 0, z, h, h, h, rt, 1, 1, 1, seed); REC.palm.push(x, z, 0, h, h, h, rt, 1, 1, 1, 0, 0, seed); return; }
      const r = (big ? .3 : .18) + rnd() * (big ? .22 : .12), th = .1 + rnd() * .12, rt = rnd() * 6.28, col = rnd() < .07 ? pick(PAL.bloom) : pick(PAL.canopy), y = th + r * .55;
      emitT("canopy", x, y, z, r, r * .8, r, rt, col.r, col.g, col.b, seed); REC.canopy.push(x, z, y, r, r * .8, r, rt, col.r, col.g, col.b, 0, 0, seed);
    };
    const cellOf = (x, z) => { const i = Math.floor(x + HX), j = Math.floor(z + HZ); return (i < 0 || j < 0 || i >= NX || j >= NZ) ? -1 : j * NX + i; };

    // reserved landmark footprints → occupancy
    NO.LANDMARKS.forEach(l => { const w = NO.ll2w(l.lat, l.lon), r = LR[l.kind]; if (r) mark(w.x, w.z, r * 2, r * 2, 0); });
    Object.entries(NO.orgPos).forEach(([id, w]) => { const o = NO.ORGS.find(q => q.id === id); if (!(o.cat === "techpark" || id === "isro" || id === "infosys")) mark(w.x, w.z, 1.3, 1.3, 0); });

    let nTall = 0;
    if (PRE) {
      // prebuilt city: every instance was placed offline with exactly this code (see ?export)
      const dv = new DataView(PRE.buf), types = ["house", "bld", "canopy", "palm", "rock"]; let o = 20;
      for (let t = 0; t < 5; t++) {
        const n = dv.getUint32(t * 4, true), ty = types[t];
        for (let k = 0; k < n; k++, o += 19) {
          const x = dv.getInt16(o, true) / 50, z = dv.getInt16(o + 2, true) / 50, y = dv.getUint16(o + 4, true) / 1000, sx = dv.getUint16(o + 6, true) / 1000, sy = dv.getUint16(o + 8, true) / 1000, sz = dv.getUint16(o + 10, true) / 1000;
          const rot = dv.getUint8(o + 12) / 255 * 6.2832, cr = dv.getUint8(o + 13) / 255, cg = dv.getUint8(o + 14) / 255, cb = dv.getUint8(o + 15) / 255, kind = dv.getUint8(o + 16), flags = dv.getUint8(o + 17), seed = dv.getUint8(o + 18) / 255;
          if (t < 2) { emitB(x, z, sx, sz, sy, rot, cr, cg, cb, kind, flags, seed); t === 0 ? nH++ : nB++; }
          else if (!(NO.TIER === "low" && t === 2 && seed > .7)) emitT(ty, x, y, z, sx, sy, sz, rot, cr, cg, cb, seed);
        }
        if (t === 0) { P(40); await tick(); }
      }
    } else {
    // real high-rises from OSM (levels ≥ 8)
    for (let k = 0; k < G.tall.length; k += 4) {
      const x = G.tall[k] / 10 - HX, z = G.tall[k + 1] / 10 - HZ, lv = G.tall[k + 2], ty = G.tall[k + 3], c = cellOf(x, z);
      if (c < 0) continue;
      const glass = ty === 3 || (ty === 0 && zone[c] >= 2 && zone[c] !== 5 && rnd() < .5);
      const w = .36 + Math.min(.35, lv * .012) + rnd() * .1;
      if (place(x, z, w, w * (.8 + rnd() * .4), Math.min(lv, 60) * ST * .95, glass ? pick(PAL.glass) : pick(PAL.apt), glass ? 2 : 4, rnd() < .5 ? 0 : rnd() * 3, { headroom: 1, tall: 1 })) nTall++;
    }
    P(30); await tick();

    // frontage: walk every street and line both sides with buildings sized for the neighbourhood
    const RES_P = { high: .95, mid: .75, low: .5 }[TIER];
    const style = (zn, cls, lv, d) => {
      if (zn === 4) { const st = lv || 6 + Math.floor(rnd() * 11); return { L: .6 + rnd() * .4, D: .55 + rnd() * .35, h: st * ST, col: pick(PAL.glass), kind: 2, o: { headroom: 1 } }; }
      if (zn === 3) return { L: .7 + rnd() * .35, D: .55 + rnd() * .3, h: ST * (1.3 + rnd() * 1.2), col: pick(PAL.ind), kind: 5, o: {} };
      if (zn === 5 || zn === 6) return { L: .5 + rnd() * .25, D: .3 + rnd() * .15, h: ST * (lv || 1 + Math.floor(rnd() * 2.5)), col: zn === 5 ? pick(PAL.mil) : pick(PAL.campus), kind: 0, o: { roof: rnd() < .4 } };
      if (zn === 1) { const st = lv || 2 + Math.floor(rnd() * 3); return { L: .22 + rnd() * .14, D: .26 + rnd() * .14, h: st * ST, col: pick(PAL.old), kind: 1, o: { roof: rnd() < .18, tank: rnd() < .5 } }; }
      if (zn === 2 || zn === 7 || (cls <= 2 && d > .45)) { const g = zn === 2 && rnd() < .3, st = (lv || 3 + Math.floor(rnd() * 4)) + (g ? 3 : 0);
        return { L: .45 + rnd() * .35, D: .42 + rnd() * .2, h: st * ST, col: g ? pick(PAL.glass) : rnd() < .4 ? pick(PAL.cbd) : pick(PAL.house), kind: g ? 2 : 1, o: { tank: st < 6 && rnd() < .5, headroom: 1 } }; }
      const st = Math.max(1, lv ? lv + Math.round((rnd() - .5) * 1.2) : 1 + Math.floor(Math.pow(rnd(), 1.3) * 3.6 * (.6 + d * .5)));
      const small = cls === 4;
      return { L: small ? .26 + rnd() * .22 : .34 + rnd() * .26, D: small ? .26 + rnd() * .14 : .34 + rnd() * .18, h: st * ST, col: st >= 6 ? pick(PAL.apt) : pick(PAL.house), kind: st >= 6 ? 4 : 0, o: { tank: st <= 5 && rnd() < .6, headroom: st > 3, roof: rnd() < .04 } };
    };
    const order = G.roads.map((r, i) => i).sort((a, b) => G.roads[a].c - G.roads[b].c);
    let oi = 0;
    for (const ri of order) {
      const r = G.roads[ri]; if (r.elev) continue;
      const p = r.p, w = RW[r.c], cf = r.c === 0 ? .45 : r.c === 4 ? RES_P : 1;
      for (let i = 0; i < p.length - 2; i += 2) {
        const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, len = Math.hypot(dx, dz); if (len < .3) continue;
        const ux = dx / len, uz = dz / len, nx = -uz, nz = ux, rot = Math.atan2(-uz, ux);
        let s = .12 + rnd() * .1;
        while (s < len - .15) {
          const mx = ax + ux * s, mz = az + uz * s, c = cellOf(mx, mz); if (c < 0) break;
          const d = dens[c], zn = zone[c];
          const sty = style(zn, r.c, lvls[c], d), L = sty.L;
          if (s + L > len - .08) break;
          for (const side of [1, -1]) {
            const keep = clamp((d - .12) * 1.5, 0, 1) * cf * (zn === 5 ? .2 : zn === 6 ? .35 : zn === 4 ? .7 : 1);
            if (rnd() > keep) continue;
            const S = side === 1 ? sty : style(zn, r.c, lvls[c], d), off = w / 2 + (r.c < 4 ? .1 : .045) + S.D / 2;
            const cx = ax + ux * (s + L / 2) + nx * side * off, cz = az + uz * (s + L / 2) + nz * side * off;
            place(cx, cz, L, S.D, S.h, S.col, S.kind, rot, S.o);
          }
          s += L + .03 + rnd() * .07;
        }
      }
      if (++oi % 8000 === 0) { P(30 + 24 * oi / order.length); await tick(); }
    }

    // fill the inside of big blocks, then trees
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const c = j * NX + i, d = dens[c], zn = zone[c], x0 = i + .5 - HX, z0 = j + .5 - HZ, xi = i - HX, zi = j - HZ;
        if (water[c] > RR * .7) continue;
        if (park[c] > half || wood[c] > half) { const n = (wood[c] > half ? 3 : 2) + Math.floor(rnd() * 2 * Q + .3); for (let k = 0; k < n; k++) tree(xi + rnd(), zi + rnd(), rnd() < .6, rnd() < .06); continue; }
        if (d < .24) {
          if (rnd() < (zn === 5 ? .5 : .09) * Q) tree(xi + rnd(), zi + rnd(), rnd() < .5, rnd() < (zn === 5 ? .05 : .45));
          continue;
        }
        if (!occAt(x0, z0) && rnd() < d * .8) { const S = style(zn, 4, lvls[c], d); place(x0 + (rnd() - .5) * .3, z0 + (rnd() - .5) * .3, S.L * 1.1, S.D * 1.1, S.h, S.col, S.kind, 0, S.o); }
        if (zn === 4 && rnd() < .3) paints.push(["lawn", x0, z0, 1, 1]);
        if (rnd() < (zn === 5 || zn === 6 ? .7 : .3) * Q) tree(xi + rnd(), zi + rnd(), rnd() < .5, rnd() < .12);
      }
      if (j % 64 === 0) { P(54 + 6 * j / NZ); await tick(); }
    }
    // avenue trees along the arterials — the Garden City's rain trees
    G.roads.forEach(r => { if (r.c > 2 || r.elev) return; const p = r.p, off = RW[r.c] / 2 + .05;
      for (let i = 0; i < p.length - 2; i += 2) { const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, len = Math.hypot(dx, dz); if (len < .1) continue;
        for (let s = rnd() * .8; s < len; s += .7 + rnd() * .5) { if (rnd() > .55 * Q) continue; const side = rnd() < .5 ? 1 : -1; tree(ax + dx / len * s - dz / len * off * side, az + dz / len * s + dx / len * off * side, true, rnd() < .05); } } });
    for (let t = 0; t < 260 * Q; t++) {          // granite outcrops on the rural fringe
      const i = Math.floor(rnd() * NX), j = Math.floor(rnd() * NZ), c = j * NX + i;
      if (dens[c] > .2 || water[c] || road[c]) continue;
      for (let k = 0; k < 3 + rnd() * 4; k++) { const s = .12 + rnd() * .25, x = i - HX + rnd(), z = j - HZ + rnd(); if (free(x, z)) { const g = rnd() < .5 ? .61 : .54, rt = rnd() * 6, sd = q8(rnd()); emitT("rock", x, s * .3, z, s * 1.3, s, s, rt, g, g * .98, g * .95, sd); REC.rock.push(x, z, s * .3, s * 1.3, s, s, rt, g, g * .98, g * .95, 0, 0, sd); } }
    }

    }
    // ── 4. ground texture: land use, parks, roads, and every rooftop painted in for far views
    P(62); await tick();
    let tex;
    if (PRE) tex = PRE.img; else {
    const TW = MOBILE ? 2048 : 4096, T = TW / GW, TH = Math.round(GH * T);
    const base = document.createElement("canvas"); base.width = NX; base.height = NZ;
    const bx = base.getContext("2d"), bimg = bx.createImageData(NX, NZ);
    const FIELD = ["#b9c47e", "#a9bb6d", "#cdb97f", "#c09c70", "#9fb865", "#c6c28c", "#b3a36f", "#a8c078"].map(C);
    const ZC = [C("#d5cfc2"), C("#d9ccb6"), C("#d2cfc8"), C("#c9c7c0"), C("#cfd8cc"), C("#b9c79a"), C("#d2d9c2"), C("#d6cfc4")];
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const c = j * NX + i;
      const col = dens[c] >= .24 || zone[c] === 5 || zone[c] === 6 ? ZC[zone[c]] : FIELD[Math.floor(hash2(Math.floor(i / 3 + hash2(j, 7) * 2), Math.floor(j / 2)) * FIELD.length)];
      const v = .95 + hash2(i, j) * .07, k = c * 4;
      bimg.data[k] = col.r * 255 * v; bimg.data[k + 1] = col.g * 255 * v; bimg.data[k + 2] = col.b * 255 * v; bimg.data[k + 3] = 255;
    }
    bx.putImageData(bimg, 0, 0);
    tex = document.createElement("canvas"); tex.width = TW; tex.height = TH;
    const t = tex.getContext("2d");
    t.imageSmoothingEnabled = true; t.drawImage(base, 0, 0, TW, TH);
    t.setTransform(T, 0, 0, T, T * HX, T * HZ); t.lineJoin = t.lineCap = "round";
    t.globalAlpha = .55; t.fillStyle = "#b3c077"; G.green.forEach(w => { if (w.c === 3) { path(t, w.p, 1); t.fill(); } }); t.globalAlpha = 1;
    t.fillStyle = "#9ac76c"; G.green.forEach(w => { if (w.c === 1) { path(t, w.p, 1); t.fill(); } });
    t.fillStyle = "#6f9f55"; G.green.forEach(w => { if (w.c === 2) { path(t, w.p, 1); t.fill(); } });
    t.fillStyle = "#b7cf8f"; G.landuse.forEach(l => { if (l.c === 10) { path(t, l.p, 1); t.fill(); } });
    paints.forEach(([k, x, z, w, h]) => { t.fillStyle = k === "pool" ? "#58b7d6" : "#a5cc79"; t.fillRect(x - w / 2, z - h / 2, w, h); });
    t.fillStyle = "#5c9fb2"; t.strokeStyle = "#8fae7a"; t.lineWidth = .35; G.water.forEach(w => { if (w.c > 0) { path(t, w.p, 1); t.stroke(); t.fill(); } });
    t.lineCap = "butt"; G.runways.forEach(r => { t.strokeStyle = "#6e7275"; t.lineWidth = r.w * 1.2; path(t, r.p); t.stroke(); t.strokeStyle = "#f4f4f0"; t.lineWidth = .05; t.setLineDash([.5, .4]); path(t, r.p); t.stroke(); t.setLineDash([]); });
    t.lineCap = "round"; t.strokeStyle = "#8d8378"; t.lineWidth = .22; G.rail.forEach(p => { path(t, p); t.stroke(); });
    // roads for far views (near the camera the crisp road meshes sit on top)
        // one path per class keeps this to a handful of canvas calls
    const byCls = [0, 1, 2, 3, 4].map(k => { const pth = new Path2D(); G.roads.forEach(r => { if (r.c === k) { pth.moveTo(r.p[0], r.p[1]); for (let i = 2; i < r.p.length; i += 2) pth.lineTo(r.p[i], r.p[i + 1]); } }); return pth; });
    [3, 2, 1, 0].forEach(k => { t.strokeStyle = "#e3ddd0"; t.lineWidth = RW[k] + .16; t.stroke(byCls[k]); });
    [4, 3, 2, 1, 0].forEach(k => { t.strokeStyle = ["#4a4e54", "#50545a", "#585c61", "#63676b", "#8a8d90"][k]; t.lineWidth = RW[k]; t.stroke(byCls[k]); });
    // baked contact shadows, then the rooftops themselves
    { const S = 4, ac = document.createElement("canvas"); ac.width = Math.ceil(GW * S); ac.height = Math.ceil(GH * S); const ax = ac.getContext("2d");
      ax.setTransform(S, 0, 0, S, S * HX, S * HZ); ax.fillStyle = "rgba(20,24,30,0.5)";
      for (let k = 0; k < baked.length; k += 9) { const x = baked[k], z = baked[k + 1], L = baked[k + 2], D = baked[k + 3], h = baked[k + 8], o = Math.min(.35, h * .35), e = Math.max(L, D); ax.fillRect(x - e / 2 - .04, z - e / 2 - .04, e + .08 + o, e + .08 + o); }
      const bl = document.createElement("canvas"); bl.width = ac.width >> 2; bl.height = ac.height >> 2; const bb = bl.getContext("2d"); bb.imageSmoothingEnabled = true; bb.drawImage(ac, 0, 0, bl.width, bl.height);
      t.setTransform(1, 0, 0, 1, 0, 0); t.globalAlpha = .55; t.drawImage(bl, 0, 0, TW, TH); t.globalAlpha = 1; }
    t.setTransform(T, 0, 0, T, T * HX, T * HZ);
    { const byCol = new Map();
      for (let k = 0; k < baked.length; k += 9) {
        const x = baked[k], z = baked[k + 1], L = baked[k + 2] / 2, D = baked[k + 3] / 2, rot = baked[k + 4], sh = .86;
        const key = `rgb(${baked[k + 5] * 255 * sh | 0},${baked[k + 6] * 255 * sh | 0},${baked[k + 7] * 255 * sh | 0})`;
        let pth = byCol.get(key); if (!pth) byCol.set(key, pth = new Path2D());
        const c = Math.cos(rot), s = Math.sin(rot);
        pth.moveTo(x - L * c - D * s, z + L * s - D * c); pth.lineTo(x + L * c - D * s, z - L * s - D * c); pth.lineTo(x + L * c + D * s, z - L * s + D * c); pth.lineTo(x - L * c + D * s, z + L * s + D * c); pth.closePath();
      }
      byCol.forEach((pth, col) => { t.fillStyle = col; t.fill(pth); }); }
    // canopies as soft green dots, so trees read from far away even when the 3D ones are culled
    { const byCol = new Map(); const add = (x, z, r, cr, cg, cb) => { const key = `rgb(${cr * 205 | 0},${cg * 205 | 0},${cb * 205 | 0})`; let p2 = byCol.get(key); if (!p2) byCol.set(key, p2 = new Path2D()); p2.moveTo(x + r, z); p2.arc(x, z, r, 0, 6.2832); };
      for (let k = 0; k < REC.canopy.length; k += 13) add(REC.canopy[k], REC.canopy[k + 1], REC.canopy[k + 3] * .9, REC.canopy[k + 7], REC.canopy[k + 8], REC.canopy[k + 9]);
      for (let k = 0; k < REC.palm.length; k += 13) add(REC.palm[k], REC.palm[k + 1], .16, .32, .55, .25);
      byCol.forEach((p2, col) => { t.fillStyle = col; t.fill(p2); }); }
    }
    if (EXPORT) NO.exportCity(REC, tex);
    P(70); await tick();

    // ── 5. three.js scene
    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, alpha: true, powerPreference: "high-performance", stencil: false });
    NO.basePR = Math.min(devicePixelRatio, MOBILE ? 1.3 : 1.75);
    renderer.setPixelRatio(NO.basePR);
    renderer.shadowMap.enabled = TIER === "high"; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    const host = document.getElementById("scene"); host.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(34, 1, .3, 4000);
    const resize = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    addEventListener("resize", resize); resize();
    const controls = new THREE.MapControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .085; controls.screenSpacePanning = false;
    controls.maxPolarAngle = 1.3; controls.minDistance = 2.5; controls.maxDistance = 1000; controls.zoomSpeed = 1.15;
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    camera.position.set(140, 330, 420); controls.target.set(0, 0, 10);
    scene.fog = new THREE.Fog(0xdfe8e4, 600, 2400);
    const hemi = new THREE.HemisphereLight(0xe3efff, 0x8a7a60, .6); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3dc, 1.0);
    sun.castShadow = TIER === "high"; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0006; sun.shadow.normalBias = .02;
    scene.add(sun, sun.target);
    const amb = new THREE.AmbientLight(0x40507a, 0); scene.add(amb);

    const gtex = PRE ? new THREE.Texture(tex) : new THREE.CanvasTexture(tex); gtex.needsUpdate = true; gtex.anisotropy = Math.min(MOBILE ? 4 : 8, renderer.capabilities.getMaxAnisotropy()); gtex.minFilter = THREE.LinearMipmapLinearFilter;
    const groundMat = new THREE.MeshLambertMaterial({ map: gtex });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), groundMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const side = new THREE.MeshLambertMaterial({ color: 0x9a5434 }), bottom = new THREE.MeshLambertMaterial({ color: 0x5e3322 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(GW, 7, GH), [side, side, bottom, bottom, side, side]); board.position.y = -3.62; scene.add(board);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(GW + .02, 1.2, GH + .02), new THREE.MeshLambertMaterial({ color: 0x6c8f45 })); strip.position.y = -.7; scene.add(strip);

    // ── water: crisp polygons with a sun glint
    {
      const shapes = []; let last = null;
      const area = p => { let a = 0; for (let i = 0, n = p.length; i < n; i += 2) { const j = (i + 2) % n; a += p[i] * p[j + 1] - p[j] * p[i + 1]; } return Math.abs(a) / 2; };
      G.water.forEach(w => {
        if (w.c > 0 && area(w.p) < (MOBILE ? 3 : 1.2)) { last = null; return; }
        const pts = []; for (let i = 0; i < w.p.length; i += 2) pts.push(new THREE.Vector2(w.p[i], -w.p[i + 1]));
        if (w.c > 0) { last = new THREE.Shape(pts); shapes.push(last); } else if (last) last.holes.push(new THREE.Path(pts));
      });
      const geo = new THREE.ShapeGeometry(shapes, 1); geo.rotateX(-Math.PI / 2); geo.translate(0, .01, 0);
      const wm = new THREE.MeshPhongMaterial({ color: 0x4f9ab0, specular: 0x9fd8ea, shininess: 70, depthWrite: false, side: THREE.DoubleSide });
      const wmesh = new THREE.Mesh(geo, wm); wmesh.renderOrder = 1; wmesh.receiveShadow = true; scene.add(wmesh); NO.waterMat = wm;
    }

    // ── roads as real geometry: pavement, asphalt, lane markings
    P(76); await tick();
    const roadLayers = {};
    NO.lod = { road: [], house: [], tree: [] };
    const RCOL = [C("#464a50"), C("#4b4f55"), C("#53575c"), C("#5d6166"), C("#7a7d80")];
    const grow = (L, need) => { if (L.n + need <= L.pos.length / 3) return; let cap = L.pos.length / 3 || 4096; while (cap < L.n + need) cap *= 2; const np = new Float32Array(cap * 3), nc = new Uint8Array(cap * 3); np.set(L.pos); nc.set(L.col); L.pos = np; L.col = nc; };
    const addStrip = (L, p, w, col, y) => {
      const n = p.length / 2; if (n < 2) return;
      grow(L, (n - 1) * 6);
      const cr = col.r * 255 | 0, cg = col.g * 255 | 0, cb = col.b * 255 | 0;
      let px0, pz0, px1, pz1;
      for (let i = 0; i < n; i++) {
        const x = p[2 * i], z = p[2 * i + 1];
        let dx, dz;
        if (i === 0) { dx = p[2] - x; dz = p[3] - z; }
        else if (i === n - 1) { dx = x - p[2 * i - 2]; dz = z - p[2 * i - 1]; }
        else { const ax = x - p[2 * i - 2], az = z - p[2 * i - 1], bx2 = p[2 * i + 2] - x, bz = p[2 * i + 3] - z, la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx2, bz) || 1; dx = ax / la + bx2 / lb; dz = az / la + bz / lb; }
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        let m = 1;
        if (i > 0 && i < n - 1) { const ax = x - p[2 * i - 2], az = z - p[2 * i - 1], la = Math.hypot(ax, az) || 1; const cos = (ax / la) * dx + (az / la) * dz; m = Math.min(2, 1 / Math.max(.5, cos)); }
        const nx = -dz * w / 2 * m, nz = dx * w / 2 * m;
        const lx = x + nx, lz = z + nz, rx = x - nx, rz = z - nz;
        if (i > 0) {
          const P3 = L.pos, C3 = L.col, o = L.n * 3;
          P3[o] = px0; P3[o + 1] = y; P3[o + 2] = pz0; P3[o + 3] = lx; P3[o + 4] = y; P3[o + 5] = lz; P3[o + 6] = px1; P3[o + 7] = y; P3[o + 8] = pz1;
          P3[o + 9] = px1; P3[o + 10] = y; P3[o + 11] = pz1; P3[o + 12] = lx; P3[o + 13] = y; P3[o + 14] = lz; P3[o + 15] = rx; P3[o + 16] = y; P3[o + 17] = rz;
          for (let q = 0; q < 6; q++) { C3[o + q * 3] = cr; C3[o + q * 3 + 1] = cg; C3[o + q * 3 + 2] = cb; }
          L.n += 6;
        }
        px0 = lx; pz0 = lz; px1 = rx; pz1 = rz;
      }
    };
    NO.addStrip = addStrip;
    const layer = (name, chunk) => { const k = name + chunk; return roadLayers[k] = roadLayers[k] || { name, pos: new Float32Array(0), col: new Uint8Array(0), n: 0 }; };
    const RCH = 64, chunkOf = p => { const m = (p.length >> 2) << 1; return clamp(Math.floor((p[m] + HX) / RCH), 0, 20) + "_" + clamp(Math.floor((p[m + 1] + HZ) / RCH), 0, 20); };
    const white = C("#f4f1e8"), curb = C("#d7d0c1"), median = C("#79a24f");
    G.roads.forEach(r => {
      if (r.elev) return;
      const ch = chunkOf(r.p), w = RW[r.c];
      if (r.c < 4) addStrip(layer("pave", ch), r.p, w + .16, curb, .012);
      addStrip(layer("asph", ch), r.p, w, RCOL[r.c], .018);
      if (r.c <= 2 && !MOBILE) {
        const L = layer("mark", ch), p = r.p;
        if (r.c === 0) addStrip(L, p, .07, median, .024);
        else for (let i = 0; i < p.length - 2; i += 2) {
          const ax = p[i], az = p[i + 1], bx2 = p[i + 2], bz = p[i + 3], sl = Math.hypot(bx2 - ax, bz - az);
          for (let s = .1; s < sl - .12; s += .34) { const u0 = s / sl, u1 = (s + .16) / sl; addStrip(L, [ax + (bx2 - ax) * u0, az + (bz - az) * u0, ax + (bx2 - ax) * u1, az + (bz - az) * u1], .025, white, .024); }
        }
      }
    });
    const roadMats = {
      pave: new THREE.MeshLambertMaterial({ vertexColors: true, depthWrite: false }),
      asph: new THREE.MeshLambertMaterial({ vertexColors: true, depthWrite: false }),
      mark: new THREE.MeshLambertMaterial({ vertexColors: true, depthWrite: false }),
    };
    NO.roadMats = roadMats;
    const ORDER = { pave: 2, asph: 3, mark: 4 };
    Object.values(roadLayers).forEach(L => {
      if (!L.n) return;
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(L.pos.subarray(0, L.n * 3), 3)); g.setAttribute("color", new THREE.BufferAttribute(L.col.subarray(0, L.n * 3), 3, true));
      const nrm = new Float32Array(L.n * 3); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, roadMats[L.name]); m.renderOrder = ORDER[L.name]; m.receiveShadow = true; scene.add(m);
      NO.lod.road.push({ m, x: g.boundingSphere.center.x, z: g.boundingSphere.center.z, r: g.boundingSphere.radius });
    });
    P(80); await tick();

    // building material: facades per kind — windows, shop signs, balconies, curtain walls, roof parapets, ground AO
    const uni = NO.uni;
    const bmat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    bmat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = "attribute vec2 aInfo; varying vec2 vInfo; varying vec3 vWP; varying vec3 vWN; varying vec3 vLoc;\n" + sh.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
        vec4 wp4 = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWP = ( modelMatrix * wp4 ).xyz; vLoc = position; vInfo = aInfo;
        vec3 n0 = objectNormal;
        #ifdef USE_INSTANCING
          n0 = mat3( instanceMatrix ) * n0;
        #endif
        vWN = normalize( n0 );`);
      sh.fragmentShader = "uniform float uNight; uniform float uDay; varying vec2 vInfo; varying vec3 vWP; varying vec3 vWN; varying vec3 vLoc;\n" +
        "float hsh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nvec3 hue(float h){return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);}\n" +
        sh.fragmentShader.replace("#include <fog_fragment>", `
        {
          float kind = vInfo.x, seed = vInfo.y;
          vec3 col = gl_FragColor.rgb;
          float wall = 1.0 - step( 0.5, abs( vWN.y ) );
          float hc = vWP.x * abs( vWN.z ) + vWP.z * abs( vWN.x );
          float y = vWP.y;
          if ( wall > 0.5 && ( kind < 2.5 || ( kind > 3.5 && kind < 4.5 ) ) ) {
            bool glassK = kind > 1.5 && kind < 2.5;
            float ww = glassK ? 0.06 : 0.085;
            vec2 cl = vec2( hc / ww, ( y - 0.012 ) / 0.1 );
            vec2 f = fract( cl );
            float lit = hsh( floor( cl ) + floor( vWP.xz * 1.7 ) * 13.0 + seed * 7.0 );
            if ( glassK ) {
              float mull = clamp( step( 0.9, f.x ) + step( 0.88, f.y ), 0.0, 1.0 );
              col = mix( col * 0.78, col * 1.18 + vec3( 0.05, 0.08, 0.1 ), smoothstep( 0.0, 3.0, y ) * 0.5 );
              col *= 1.0 - mull * 0.35;
              col += step( 0.45, lit ) * uNight * vec3( 0.95, 0.85, 0.6 ) * ( 1.0 - mull ) * 0.8;
            } else {
              float win = step( 0.24, f.x ) * step( f.x, 0.76 ) * step( 0.3, f.y ) * step( f.y, 0.78 ) * step( 0.1, y );
              if ( kind > 3.5 ) {
                float slab = step( f.y, 0.12 );
                col = mix( col, col * 1.1 + 0.05, slab );
                win = step( 0.14, f.x ) * step( f.x, 0.86 ) * step( 0.25, f.y ) * step( f.y, 0.8 ) * step( 0.1, y );
              }
              vec3 glass = mix( vec3( 0.24, 0.3, 0.36 ), col * 0.55, 0.35 );
              col = mix( col, glass, win * ( 0.55 + 0.25 * uDay ) );
              col += win * step( 0.52, lit ) * uNight * mix( vec3( 1.0, 0.76, 0.4 ), vec3( 0.7, 0.88, 1.0 ), step( 0.88, lit ) ) * 0.95;
              if ( kind > 0.5 && kind < 1.5 && y < 0.1 ) {
                float band = step( 0.062, y ) * step( y, 0.094 );
                vec3 sign = hue( fract( seed * 7.3 ) ) * 0.75 + 0.2;
                col = mix( col * 0.55, sign, band );
                col += band * uNight * sign * 0.8;
                col = mix( col, vec3( 0.35, 0.33, 0.3 ), step( y, 0.06 ) * step( 0.5, fract( hc * 3.0 ) ) * 0.4 );
              }
            }
          }
          if ( kind > 4.5 && wall > 0.5 ) col *= 0.92 + 0.08 * step( 0.5, fract( hc * 8.0 ) );
          if ( wall < 0.5 && vWN.y > 0.5 ) {
            float rim = step( 0.43, max( abs( vLoc.x ), abs( vLoc.z ) ) );
            col *= mix( 0.93, 1.1, rim );
          }
          col *= mix( 0.62, 1.0, smoothstep( 0.0, 0.18, y ) );
          gl_FragColor.rgb = col;
        }
        #include <fog_fragment>`);
    };
    NO.bmat = bmat;

    const GEO = {
      bld: new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0),
      house: new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0),
      roof: new THREE.CylinderGeometry(.5, .5, 1, 3, 1).rotateX(-Math.PI / 2).scale(.577, .667, 1).translate(0, .333, 0),
      trunk: new THREE.CylinderGeometry(.5, .5, 1, 3, 1, true).translate(0, .5, 0),
      canopy: new THREE.IcosahedronGeometry(1, 0),
      rock: new THREE.DodecahedronGeometry(.5, 0),
      palm: (() => { const parts = [[new THREE.CylinderGeometry(.025, .035, 1, 3, 1, true).translate(0, .5, 0), "#8a6b4a"]];
        for (let k = 0; k < 6; k++) parts.push([new THREE.PlaneGeometry(.42, .1).rotateX(-Math.PI / 2).translate(.21, 0, 0).rotateZ(-.35).rotateY(k * Math.PI / 3).translate(0, 1, 0), k % 2 ? "#4c8a3a" : "#5e9d45"]);
        return NO.mergeColored(parts); })(),
    };
    GEO.bldS = GEO.bld;
    const MAT = {
      bld: bmat, house: bmat, bldS: bmat, roof: new THREE.MeshLambertMaterial({ color: 0xffffff }), trunk: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      canopy: new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), rock: new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      palm: new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide }),
    };
    NO.buildingMeshes = []; NO.smallMeshes = []; let nInst = 0;
    for (const type in buckets) {
      buckets[type].forEach((arr, ci) => {
        if (!arr || !arr.length) return;
        const n = arr.length / 12; nInst += n;
        const geo = GEO[type].clone(), CHt = CHS[type] || 96, ncx = Math.ceil(NX / CHt);
        const cx = (ci % ncx + .5) * CHt - HX, cz = (Math.floor(ci / ncx) + .5) * CHt - HZ;
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 1, cz), CHt * .75 + 4);
        const info = new Float32Array(n * 2);
        const m = new THREE.InstancedMesh(geo, MAT[type], n);
        const mat = m.instanceMatrix.array, col = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) {
          const o = k * 12, x = arr[o], y = arr[o + 1], z = arr[o + 2], sx = arr[o + 3], sy = arr[o + 4], sz = arr[o + 5], r = arr[o + 6];
          const cs = Math.cos(r), sn = Math.sin(r), q = k * 16;
          mat[q] = cs * sx; mat[q + 1] = 0; mat[q + 2] = -sn * sx; mat[q + 3] = 0; mat[q + 4] = 0; mat[q + 5] = sy; mat[q + 6] = 0; mat[q + 7] = 0;
          mat[q + 8] = sn * sz; mat[q + 9] = 0; mat[q + 10] = cs * sz; mat[q + 11] = 0; mat[q + 12] = x; mat[q + 13] = y; mat[q + 14] = z; mat[q + 15] = 1;
          col[k * 3] = arr[o + 7]; col[k * 3 + 1] = arr[o + 8]; col[k * 3 + 2] = arr[o + 9]; info[k * 2] = arr[o + 10]; info[k * 2 + 1] = arr[o + 11];
        }
        geo.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 2));
        m.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
        m.castShadow = type !== "trunk" && type !== "rock" && type !== "bldS"; m.receiveShadow = type !== "canopy";
        if (type === "bld" || type === "house" || type === "bldS") { NO.buildingMeshes.push(m); m.userData.base = mat.slice(); }
        if (type === "house" || type === "roof" || type === "bldS" || type === "trunk") NO.lod.house.push({ m, x: cx, z: cz, r: CHt * .72 });
        if (type === "canopy" || type === "palm") NO.lod.tree.push({ m, x: cx, z: cz, r: CHt * .72 });
        if (type === "rock") NO.smallMeshes.push(m);
        scene.add(m);
      });
    }
    NO.stats = { buildings: nB, houses: nH, towers: nTall, instances: nInst };

    // ── 6. Namma Metro viaducts & stations
    P(84); await tick();
    const HM = .55;
    const ug = (ref, x, z) => { const l = NO.w2ll(x, z);
      if (ref === "Purple") return l.lon > 77.562 && l.lon < 77.602 && l.lat > 12.968 && l.lat < 12.987;
      if (ref === "Green") return l.lat > 12.957 && l.lat < 12.986 && l.lon > 77.562 && l.lon < 77.586;
      return false; };
    const deck = [], rails = [], pillars = [], stations = [];
    NO.metroLines = G.metro.map(ln => {
      const p = ln.p, pts = [];
      for (let k = 0; k < p.length; k += 2) pts.push({ x: p[k], z: p[k + 1], ug: ug(ln.ref, p[k], p[k + 1]) });
      const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
      const color = new THREE.Color(ln.color);
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k]; if (a.ug && b.ug) continue;
        const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), rot = Math.atan2(-dz, dx), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        deck.push([mx, HM - .07, mz, L + .05, .07, .36, rot]);
        const nx = -dz / L * .16, nz = dx / L * .16;
        rails.push([mx + nx, HM - .09, mz + nz, L + .05, .06, .03, rot, color], [mx - nx, HM - .09, mz - nz, L + .05, .06, .03, rot, color]);
        for (let s = .8; s < L; s += 1.7) pillars.push([a.x + dx * s / L, 0, a.z + dz * s / L, .12, HM - .07, .12, rot]);
      }
      const st = ln.stops, stops = [];
      for (let k = 0; k < st.length; k += 2) {
        let best = 1e9, bd = 0, bi = 1;
        for (let q = 1; q < pts.length; q++) {
          const a = pts[q - 1], b = pts[q], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-6;
          const u = clamp(((st[k] - a.x) * dx + (st[k + 1] - a.z) * dz) / L2, 0, 1), dd2 = Math.hypot(a.x + dx * u - st[k], a.z + dz * u - st[k + 1]);
          if (dd2 < best) { best = dd2; bd = cum[q - 1] + Math.sqrt(L2) * u; bi = q; }
        }
        if (best > 2) continue;
        const a = pts[bi - 1], b = pts[bi], rot = Math.atan2(-(b.z - a.z), b.x - a.x), u = (bd - cum[bi - 1]) / ((cum[bi] - cum[bi - 1]) || 1);
        stops.push(bd); stations.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, rot, under: a.ug || b.ug, color });
      }
      stops.sort((a, b) => a - b);
      return { ref: ln.ref, color, pts, cum, len: cum[cum.length - 1], stops, h: HM };
    });
    const inst = (geo, mat, list, withColor, shadow = TIER === "high") => {
      if (!list.length) return null;
      const m = new THREE.InstancedMesh(geo, mat, list.length); const d = new THREE.Object3D();
      list.forEach((r, k) => { d.position.set(r[0], r[1], r[2]); d.scale.set(r[3], r[4], r[5]); d.rotation.set(0, r[6] || 0, 0); d.updateMatrix(); m.setMatrixAt(k, d.matrix); if (withColor) m.setColorAt(k, r[7]); });
      m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m;
    };
    NO.inst = inst;
    const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
    NO.unitBox = unitBox;
    inst(unitBox, M("#d7d2c7"), deck); inst(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), rails, true); inst(unitBox, M("#c4beb2"), pillars);
    const stBody = [], stRoof = [], stKiosk = [];
    stations.forEach(s => {
      if (s.under) { stKiosk.push([s.x + .5, 0, s.z + .3, .3, .18, .22, s.rot, s.color]); return; }
      stBody.push([s.x, HM - .12, s.z, 1.2, .22, .56, s.rot], [s.x, 0, s.z, .24, HM - .12, .44, s.rot]);
      stRoof.push([s.x, HM + .14, s.z, 1.3, .06, .64, s.rot, s.color]);
    });
    inst(unitBox, M("#eeeae2"), stBody); inst(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), stRoof, true); inst(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), stKiosk, true);
    NO.stations = stations;

    // flyovers & elevated corridors
    const fdeck = [], fpil = []; NO.elevSet = new Set();
    G.roads.forEach((r, idx) => {
      if (!r.elev) return;
      const p = r.p; let L = 0; for (let k = 2; k < p.length; k += 2) L += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
      if (L < 1.4 || r.c > 3) { r.elev = false; return; }
      NO.elevSet.add(idx);
      const w = RW[r.c] * .95;
      for (let k = 2; k < p.length; k += 2) {
        const ax = p[k - 2], az = p[k - 1], bx2 = p[k], bz = p[k + 1], dx = bx2 - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < .01) continue;
        const rot = Math.atan2(-dz, dx);
        fdeck.push([(ax + bx2) / 2, .24, (az + bz) / 2, l + .04, .06, w, rot]);
        for (let s = .6; s < l; s += 1.4) fpil.push([ax + dx * s / l, 0, az + dz * s / l, .1, .24, .1, rot]);
      }
    });
    inst(unitBox, M("#55595e"), fdeck); inst(unitBox, M("#b7b2a8"), fpil);

    // ── 7. street furniture, landmarks, organisations
    P(88); await tick();
    NO.scene = scene;
    NO.buildProps(scene, G, RW, free);
    NO.landmarkObjs = [];
    NO.LANDMARKS.forEach(l => {
      const g = NO.buildLandmark(l); if (!g) return;
      const w = NO.ll2w(l.lat, l.lon); g.position.set(w.x, 0, w.z);
      g.userData.landmark = l; g.traverse(o => { if (o.isMesh) { o.castShadow = TIER === "high"; o.receiveShadow = true; o.userData.landmark = l; } });
      scene.add(g); NO.landmarkObjs.push(g); l.obj = g; l.w = w;
    });
    P(92); await tick();
    await NO.buildBadges(scene, bmat, GEO.bld, unitBox);

    P(97); await tick();
    Object.assign(NO, { scene, renderer, camera, controls, sun, hemi, amb, ground, groundMat, board, strip, HM });
    return NO;
  };

  // ── static street furniture
  NO.buildProps = function (scene, G, RW, free) {
    const rnd = NO.rnd, MOB = NO.MOBILE, d = new THREE.Object3D();
    const B = (w, h, dd, x, y, z) => new THREE.BoxGeometry(w, h, dd).translate(x, y + h / 2, z);
    // street lamps on the arterials
    const lampGeo = NO.mergeColored([[B(.02, .34, .02, 0, 0, 0), "#6f7478"], [B(.12, .015, .02, -.06, .33, 0), "#6f7478"], [B(.05, .02, .04, -.11, .32, 0), "#fff2c9", 0, 4]]);
    const lamps = [], spacing = MOB ? 4 : 2.2;
    G.roads.forEach(r => {
      if (r.c > 2 || r.elev) return;
      const p = r.p, off = RW[r.c] / 2 + .1;
      let acc = rnd() * spacing;
      for (let i = 0; i < p.length - 2; i += 2) {
        const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, l = Math.hypot(dx, dz); if (l < .01) continue;
        const ux = dx / l, uz = dz / l;
        for (; acc < l; acc += spacing) {
          const s = (lamps.length & 1) ? 1 : -1, x = ax + ux * acc + uz * off * s, z = az + uz * acc - ux * off * s;
          lamps.push([x, z, Math.atan2(-uz, ux) + (s > 0 ? Math.PI / 2 : -Math.PI / 2)]);
        }
        acc -= l;
      }
    });
    const lm = new THREE.InstancedMesh(lampGeo, NO.modelMat(), lamps.length);
    lamps.forEach((q, k) => { d.position.set(q[0], 0, q[1]); d.rotation.set(0, q[2], 0); d.updateMatrix(); lm.setMatrixAt(k, d.matrix); });
    lm.frustumCulled = false; scene.add(lm); NO.lampMesh = lm;

    // vendors: fruit carts, tender coconut stalls, flower sellers, chai kiosks
    const umb = (c) => [new THREE.ConeGeometry(.13, .05, 8).translate(0, .26, 0), c];
    const V = [
      NO.mergeColored([[B(.18, .04, .1, 0, .06, 0), "#8a5a33"], [B(.02, .06, .02, -.07, 0, .04), "#333"], [B(.02, .06, .02, .07, 0, -.04), "#333"], [B(.14, .04, .08, 0, .1, 0), "#e8a22c"], [B(.06, .03, .05, -.03, .13, 0), "#d9432b"], [B(.05, .03, .05, .04, .13, .01), "#7cb342"], [B(.01, .14, .01, 0, .1, 0), "#555"], umb("#2f6fb5")]),
      NO.mergeColored([[B(.16, .05, .12, 0, 0, 0), "#6b4a2b"], [new THREE.IcosahedronGeometry(.045, 0).translate(-.03, .08, 0), "#5c9a2e"], [new THREE.IcosahedronGeometry(.045, 0).translate(.03, .08, .02), "#6aaa33"], [new THREE.IcosahedronGeometry(.04, 0).translate(0, .12, 0), "#4f8a28"], [new THREE.IcosahedronGeometry(.04, 0).translate(.05, .07, -.04), "#6aaa33"]]),
      NO.mergeColored([[B(.18, .04, .12, 0, .04, 0), "#8a5a33"], [B(.05, .03, .1, -.05, .08, 0), "#f2c230"], [B(.05, .03, .1, 0, .08, 0), "#e84a5f"], [B(.05, .03, .1, .05, .08, 0), "#ffffff"], [B(.01, .14, .01, 0, .08, 0), "#555"], umb("#d9432b")]),
      NO.mergeColored([[B(.16, .14, .12, 0, 0, 0), "#e9e1cf"], [B(.17, .03, .13, 0, .14, 0), "#c0392b"], [B(.14, .02, .02, 0, .1, .07), "#f2c230", 0, 4], [B(.04, .06, .03, .03, .06, .07), "#8a5a33"]]),
    ];
    const hot = [[12.9650, 77.5770, 2.2], [12.9822, 77.6083, 1.3], [12.9740, 77.6070, 1.3], [12.9774, 77.5713, 1.6], [12.9700, 77.5780, 1.3], [12.9507, 77.5848, 2.5], [13.0030, 77.5700, 1.1], [12.9250, 77.5830, 1.1],
      [12.9352, 77.6245, 1.5], [12.9784, 77.6408, 1.3], [12.9311, 77.6905, 1.1], [13.0450, 77.6200, 1.2], [12.9857, 77.7310, 1.1], [12.8452, 77.6602, 1.2], [12.9420, 77.5720, 1.2], [12.9166, 77.6101, 1.2]];
    NO.HOTSPOTS = hot;
    const spots = [[], [], [], []];
    const per = MOB ? 10 : 22;
    hot.forEach(([la, lo, rr]) => { const c = NO.ll2w(la, lo); for (let k = 0, t = 0; k < per && t < 200; t++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * rr, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; if (!NO.isRoad(x, z) && !NO.isWater(x, z)) { spots[k % 4].push([x, z, rnd() * 6.28]); k++; } } });
    V.forEach((g, vi) => { const list = spots[vi]; if (!list.length) return; const m = new THREE.InstancedMesh(g, NO.modelMat(), list.length); list.forEach((q, k) => { d.position.set(q[0], 0, q[1]); d.rotation.set(0, q[2], 0); d.scale.setScalar(1.1); d.updateMatrix(); m.setMatrixAt(k, d.matrix); }); m.castShadow = NO.TIER === "high"; m.frustumCulled = false; m.userData.pick = ["fruit", "coconut", "flowers", "chai"][vi]; scene.add(m); });

    // hoardings at big junctions — the city's unofficial skyline
    const ADS = [["PLOTS FOR SALE", "Devanahalli · 5 min from airport*", "#f2c230", "#1b1b1b"], ["HIRING 10x ENGINEERS", "Koramangala · free filter coffee", "#1f3a5f", "#ffffff"],
      ["ಸ್ವಲ್ಪ ಅಡ್ಜಸ್ಟ್ ಮಾಡಿ", "Swalpa adjust maadi", "#d0392b", "#ffffff"], ["METRO PHASE 3", "Coming soon™", "#8a3fa5", "#ffffff"], ["COORG THIS WEEKEND?", "Only 5 hours* away", "#2e7d4f", "#ffffff"],
      ["4 PM RAIN JACKETS", "Stay dry, stay pleasant", "#12607a", "#ffffff"], ["PRE-SEED? WE FUND VIBES", "Pitch us over dosa", "#f46036", "#ffffff"], ["ಬೆಂಗಳೂರು ಹಬ್ಬ", "Bengaluru Habba · Cubbon Park", "#f2efe6", "#1b1b1b"]];
    const ac = document.createElement("canvas"); ac.width = 512; ac.height = 1024; const ax = ac.getContext("2d");
    ADS.forEach(([t1, t2, bg, fg], k) => { const y = k * 128; ax.fillStyle = bg; ax.fillRect(0, y, 512, 128); ax.fillStyle = fg; ax.font = "800 50px 'Baloo Tamma 2', sans-serif"; ax.fillText(t1, 22, y + 66, 470); ax.font = "600 28px 'Instrument Sans', sans-serif"; ax.fillText(t2, 24, y + 106, 470); ax.fillStyle = "rgba(0,0,0,.25)"; ax.fillRect(0, y + 122, 512, 6); });
    const adTex = new THREE.CanvasTexture(ac); adTex.anisotropy = 4;
    const adMat = new THREE.MeshLambertMaterial({ map: adTex, emissive: 0xffffff, emissiveMap: adTex, emissiveIntensity: 0, side: THREE.DoubleSide });
    adMat.onBeforeCompile = sh => { sh.vertexShader = "attribute float aAd;\n" + sh.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_UV\n vUv = vec2( uv.x, ( uv.y + 7.0 - aAd ) / 8.0 );\n#endif"); };
    NO.adMat = adMat;
    const junc = new Map(); G.roads.forEach(r => { if (r.c > 1 || r.elev) return; [[r.p[0], r.p[1]], [r.p[r.p.length - 2], r.p[r.p.length - 1]]].forEach(([x, z]) => { const k = Math.round(x) + "," + Math.round(z); junc.set(k, (junc.get(k) || 0) + 1); }); });
    const ads = []; junc.forEach((n, k) => { if (n >= 3 && rnd() < (MOB ? .12 : .28)) { const [x, z] = k.split(",").map(Number); const a = rnd() * 6.28, ox = x + Math.cos(a) * 1.1, oz = z + Math.sin(a) * 1.1; if (free(ox, oz)) ads.push([ox, oz, rnd() * 6.28, Math.floor(rnd() * ADS.length)]); } });
    if (ads.length) {
      const boardGeo = new THREE.PlaneGeometry(1.1, .275), poleGeo = B(.03, .7, .03, 0, 0, 0);
      const bm = new THREE.InstancedMesh(boardGeo, adMat, ads.length), pm = new THREE.InstancedMesh(poleGeo, NO.M("#5b5f63"), ads.length * 2);
      const idx = new Float32Array(ads.length);
      ads.forEach((q, k) => { d.position.set(q[0], .84, q[1]); d.rotation.set(0, q[2], 0); d.scale.setScalar(1); d.updateMatrix(); bm.setMatrixAt(k, d.matrix); idx[k] = q[3];
        [-.4, .4].forEach((o, s) => { d.position.set(q[0] + Math.cos(q[2]) * o, 0, q[1] - Math.sin(q[2]) * o); d.rotation.set(0, 0, 0); d.updateMatrix(); pm.setMatrixAt(k * 2 + s, d.matrix); }); });
      boardGeo.setAttribute("aAd", new THREE.InstancedBufferAttribute(idx, 1));
      bm.frustumCulled = pm.frustumCulled = false; scene.add(bm, pm);
    }

    // clouds drifting over the Deccan plateau
    const cg = NO.mergeColored([[new THREE.IcosahedronGeometry(3, 0).scale(1.4, .6, 1), "#ffffff"], [new THREE.IcosahedronGeometry(2.4, 0).scale(1.3, .6, 1).translate(3, .5, 1), "#f4f6f8"], [new THREE.IcosahedronGeometry(2.2, 0).scale(1.3, .6, 1).translate(-3, .3, -.5), "#f7f8fa"], [new THREE.IcosahedronGeometry(1.8, 0).translate(1, 1.4, 0), "#ffffff"]]);
    const nC = MOB ? 14 : 26, cm = new THREE.InstancedMesh(cg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: .92, depthWrite: false }), nC);
    NO.clouds = []; for (let k = 0; k < nC; k++) NO.clouds.push({ x: (rnd() - .5) * NO.GW * 1.2, z: (rnd() - .5) * NO.GH * 1.2, y: 40 + rnd() * 30, s: .8 + rnd() * 1.4, r: rnd() * 6 });
    cm.frustumCulled = false; cm.renderOrder = 20; scene.add(cm); NO.cloudMesh = cm;
  };

  // ── HQ buildings + logo badges (billboards from one atlas) + logos painted on the roofs
  NO.buildBadges = async function (scene, bmat, bldGeo, unitBox) {
    const rnd = NO.rnd;
    try { await Promise.race([document.fonts.load("800 52px 'Baloo Tamma 2'"), new Promise(r => setTimeout(r, 1500))]); } catch (e) { }
    let logoImg = null;
    try { logoImg = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = "assets/logos.png"; }); } catch (e) { logoImg = null; }
    const CELLP = 128, COLS = 16, ROWS = 8, atlas = document.createElement("canvas"); atlas.width = CELLP * COLS; atlas.height = CELLP * ROWS;
    const ax = atlas.getContext("2d");
    const BRAND = { flipkart: "#2874f0", swiggy: "#fc8019", byjus: "#813588", sap: "#0a6ed1", bigbasket: "#84c225", dunzo: "#00d290", khatabook: "#1e5ed8", licious: "#d11243", yulu: "#1fb8d4", ather: "#10b981", biocon: "#0f6a3b", iimb: "#7a1f2b", isro: "#1f4e9c", bel: "#16325c", cisco: "#049fd9", bajaj: "#005baa", softbank: "#1a1a1a", iiitb: "#0b4f8a", ncbs: "#3a7d44" };
    NO.BRAND = BRAND;
    const drawBadge = (k, o) => {
      const cx = (k % COLS) * CELLP + 64, cy = Math.floor(k / COLS) * CELLP + 64, ring = NO.catInfo[o.cat].color;
      ax.save(); ax.beginPath(); ax.arc(cx, cy, 60, 0, 6.2832); ax.fillStyle = "rgba(0,0,0,.18)"; ax.fill();
      ax.beginPath(); ax.arc(cx, cy, 58, 0, 6.2832); ax.fillStyle = ring; ax.fill();
      ax.beginPath(); ax.arc(cx, cy, 52, 0, 6.2832); ax.fillStyle = "#ffffff"; ax.fill(); ax.clip();
      const li = NO.LOGOS && NO.LOGOS.idx[o.id];
      if (logoImg && li !== undefined) {
        const S = NO.LOGOS.size, sx = (li % NO.LOGOS.cols) * S, sy = Math.floor(li / NO.LOGOS.cols) * S;
        ax.drawImage(logoImg, sx, sy, S, S, cx - 38, cy - 38, 76, 76);
      } else {
        ax.fillStyle = BRAND[o.id] || ring; ax.fillRect(cx - 60, cy - 60, 120, 120);
        const ini = o.name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
        ax.fillStyle = "#fff"; ax.font = `800 ${ini.length > 1 ? 44 : 56}px 'Baloo Tamma 2', sans-serif`; ax.textAlign = "center"; ax.textBaseline = "middle"; ax.fillText(ini, cx, cy + 4);
      }
      ax.restore();
    };
    NO.catInfo = {}; NO.GROUPS.forEach(g => g.cats.forEach(c => NO.catInfo[c.id] = c));
    const catGroup = {}; NO.GROUPS.forEach(g => g.cats.forEach(c => catGroup[c.id] = g.id));
    // every organisation gets a badge slot (also used by the cards and the network view)
    NO.badgeSlot = {};
    NO.ORGS.forEach((o, k) => { NO.badgeSlot[o.id] = k; drawBadge(k, o); });
    const tex = new THREE.CanvasTexture(atlas); tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
    NO.badgeAtlas = atlas; NO.badgeCell = { size: CELLP, cols: COLS, rows: ROWS };
    NO.markers = [];
    const hq = [], caps = [], roofs = [];
    NO.ORGS.forEach(o => {
      const w = NO.orgPos[o.id]; if (!w) return;
      const k = NO.badgeSlot[o.id];
      const hasBuilding = !(o.cat === "techpark" || o.id === "isro" || o.id === "infosys");
      let top = .4, wv = .64, dv = .64;
      if (hasBuilding) {
        const g = catGroup[o.cat]; let h = 1.1, body = "#e4e9ec", kind = 2;
        if (g === "companies") { h = 1.1 + NO.hashStr(o.id) * 1.1; body = ["#dfe7ec", "#e9ecef", "#cfdde6"][Math.floor(rnd() * 3)]; }
        else if (g === "capital") { h = .8 + NO.hashStr(o.id) * .4; body = "#efe8da"; kind = 1; }
        else if (o.cat === "univ") { wv = 1.5; dv = 1; h = .32; body = "#c6704f"; kind = 0; }
        else if (o.cat === "incubator") { wv = 1; dv = .7; h = .45; body = "#efe6d6"; kind = 0; }
        else if (o.cat === "cowork") { h = .7; body = "#f1e6d2"; kind = 1; }
        else if (o.cat === "corporate") { wv = .9; dv = .7; h = 1.5 + NO.hashStr(o.id); body = "#9fbccb"; }
        else if (o.cat === "public") { wv = 1.2; dv = .8; h = .45; body = "#e8e0cc"; kind = 0; }
        hq.push([w.x, 0, w.z, wv, h, dv, new THREE.Color(body), kind]);
        caps.push([w.x, h, w.z, wv * 1.02, .05, dv * 1.02, 0, new THREE.Color(NO.catInfo[o.cat].color)]);
        roofs.push([w.x, h + .052, w.z, Math.min(wv, dv) * .82, k]);
        top = h + .05;
      } else top = o.id === "isro" ? 1.6 : o.id === "infosys" ? 1.2 : .3;
      NO.markers.push({ org: o, k, pos: new THREE.Vector3(w.x, top + .75, w.z), top, visible: true, base: new THREE.Vector3(w.x, top, w.z) });
    });
    { const m = new THREE.InstancedMesh(bldGeo.clone(), bmat, hq.length), d = new THREE.Object3D(), info = new Float32Array(hq.length * 2);
      hq.forEach((r, k) => { d.position.set(r[0], r[1], r[2]); d.scale.set(r[3], r[4], r[5]); d.updateMatrix(); m.setMatrixAt(k, d.matrix); m.setColorAt(k, r[6]); info[k * 2] = r[7]; info[k * 2 + 1] = rnd(); });
      m.geometry.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 2)); m.castShadow = NO.TIER === "high"; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
    NO.inst(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), caps, true);
    const uvCell = `vec2 cell = vec2(mod(slot,16.0), floor(slot/16.0)); vUv = vec2((cell.x + uv.x)/16.0, 1.0 - (cell.y + 1.0 - uv.y)/8.0);`;
    const decalMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uNight: NO.uni.uNight },
      vertexShader: `attribute float aSlot; varying vec2 vUv; void main(){ float slot = aSlot; ${uvCell} gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D map; uniform float uNight; varying vec2 vUv; void main(){ vec4 c = texture2D(map, vUv); if (c.a < 0.4) discard; gl_FragColor = vec4(c.rgb * (0.95 - uNight * 0.4), 1.0); }`,
    });
    if (roofs.length) { const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m = new THREE.InstancedMesh(g, decalMat, roofs.length), d = new THREE.Object3D(), slot = new Float32Array(roofs.length);
      roofs.forEach((r, k) => { d.position.set(r[0], r[1], r[2]); d.scale.set(r[3], 1, r[3]); d.updateMatrix(); m.setMatrixAt(k, d.matrix); slot[k] = r[4]; });
      g.setAttribute("aSlot", new THREE.InstancedBufferAttribute(slot, 1)); m.frustumCulled = false; scene.add(m); }
    { const stems = NO.markers.map(m => [m.base.x, m.top, m.base.z, .03, .75, .03, 0]); NO.stemMesh = NO.inst(new THREE.CylinderGeometry(.5, .5, 1, 5).translate(0, .5, 0), M("#5d6862"), stems, false, false); }
    // badges: screen-sized billboards, always on top
    const n = NO.markers.length, g = new THREE.InstancedBufferGeometry(), pg = new THREE.PlaneGeometry(1, 1);
    g.index = pg.index; g.setAttribute("position", pg.attributes.position); g.setAttribute("uv", pg.attributes.uv);
    const iPos = new Float32Array(n * 3), iSlot = new Float32Array(n), iScale = new Float32Array(n).fill(1);
    NO.markers.forEach((m, k) => { iPos.set([m.pos.x, m.pos.y, m.pos.z], k * 3); iSlot[k] = m.k; });
    g.setAttribute("iPos", new THREE.InstancedBufferAttribute(iPos, 3)); g.setAttribute("iSlot", new THREE.InstancedBufferAttribute(iSlot, 1));
    const sAttr = new THREE.InstancedBufferAttribute(iScale, 1); sAttr.setUsage(THREE.DynamicDrawUsage); g.setAttribute("iScale", sAttr);
    g.instanceCount = n;
    const badgeMat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { map: { value: tex }, uPx: { value: .05 }, uMin: { value: .45 } },
      vertexShader: `attribute vec3 iPos; attribute float iSlot; attribute float iScale; uniform float uPx; uniform float uMin; varying vec2 vUv; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(iPos,1.0); float s = max(uMin, -mv.z * uPx) * iScale; mv.xy += (position.xy + vec2(0.0,0.5)) * s;
          float slot = iSlot; ${uvCell} vA = step(0.01, iScale); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying float vA; void main(){ vec4 c = texture2D(map, vUv); if (c.a < 0.05 || vA < 0.5) discard; gl_FragColor = c; }`,
    });
    const badges = new THREE.Mesh(g, badgeMat); badges.frustumCulled = false; badges.renderOrder = 30; scene.add(badges);
    NO.badges = { mesh: badges, mat: badgeMat, scale: sAttr };
  };

  // ── landmark models (units: 60 m cells, heights exaggerated ~1.8×)
  NO.buildLandmark = function (l) {
    const g = new THREE.Group();
    const box = (w, h, d, c, x = 0, y = 0, z = 0, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), typeof c === "string" ? M(c) : c); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
    const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 12, open = false) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(0, h / 2, 0), typeof c === "string" ? M(c) : c); m.position.set(x, y, z); g.add(m); return m; };
    const sph = (r, c, x, y, z, sy = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(c)); m.position.set(x, y, z); m.scale.y = sy; g.add(m); return m; };
    const hit = (r, h) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10).translate(0, h / 2, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); m.userData.hit = true; g.add(m); return m; };
    switch (l.kind) {
      case "vidhana": {
        box(4.4, .08, 2.3, "#c9c1ab"); box(3.7, .58, 1.6, "#e2dac4", 0, .08, 0); box(1.9, .34, 1.05, "#ddd4bd", 0, .66, 0);
        sph(.42, "#d4caae", 0, 1.0, 0, 1.1); cyl(.02, .06, .25, "#c9a13b", 0, 1.44, 0, 6);
        [[-1.6, -.6], [1.6, -.6], [-1.6, .6], [1.6, .6]].forEach(([x, z]) => sph(.17, "#d4caae", x, .66, z));
        for (let k = 0; k < 12; k++) box(.06, .5, .06, "#f1ecde", -.83 + k * .15, .08, .95);
        box(1.9, .1, .32, "#e8e1cd", 0, .58, .95);
        for (let k = 0; k < 14; k++) box(.1, .12, .02, "#6d6a60", -1.6 + k * .245, .25, .81);
        break;
      }
      case "attara": box(2.6, .45, .9, "#b5412e"); box(2.7, .06, 1.0, "#8f2f22", 0, .45, 0); box(.5, .7, .5, "#b5412e", 0, 0, .2); for (let k = 0; k < 10; k++) box(.1, .14, .02, "#f1e3c8", -1.1 + k * .245, .18, .46); break;
      case "library": box(1.5, .34, .6, "#b8452f"); sph(.22, "#8f2f22", 0, .34, 0); box(.4, .5, .4, "#b8452f", .6, 0, 0); break;
      case "palace": {
        box(2.0, .5, 1.0, "#9e978a"); box(1.2, .7, .6, "#a39c8e", 0, 0, 0);
        for (const [x, z] of [[-1, -.5], [1, -.5], [-1, .5], [1, .5], [-.35, .5], [.35, .5]]) { cyl(.13, .13, .82, "#8f897d", x, 0, z, 8); cyl(0, .17, .3, "#4d4a45", x, .82, z, 8); }
        for (let k = 0; k < 9; k++) box(.1, .08, .08, "#8f897d", -.9 + k * .225, .5, -.5);
        break;
      }
      case "glasshouse": {
        const glass = new THREE.MeshLambertMaterial({ color: 0xd4eef5, transparent: true, opacity: .55 });
        box(1.6, .28, .42, glass); box(.42, .28, 1.1, glass);
        const d = new THREE.Mesh(new THREE.SphereGeometry(.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass); d.position.y = .28; g.add(d);
        g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.6, .28, .42).translate(0, .14, 0)), new THREE.LineBasicMaterial({ color: 0xffffff })));
        hit(.9, .6); break;
      }
      case "kgtower": { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(.5, 0), M("#8f8c85", { flatShading: true })); r.scale.set(1.3, .5, 1); r.position.y = .1; g.add(r); box(.24, .3, .24, "#b9ad96", 0, .3, 0); cyl(0, .16, .18, "#9a8f7c", 0, .6, 0, 4); break; }
      case "ubcity": box(.6, 3.3, .6, "#aebcc5"); cyl(.46, .32, .5, "#7f8e98", 0, 3.3, 0, 8); cyl(.05, .05, .5, "#7f8e98", 0, 3.8, 0, 6); box(.55, 2.0, .5, "#bfc9cf", .75, 0, .3); box(.5, 1.6, .55, "#c9d0d4", -.7, 0, -.2); box(1.8, .3, 1.4, "#d9d2c3"); break;
      case "stadium": {
        cyl(1.45, 1.6, .38, new THREE.MeshLambertMaterial({ color: 0xe8e4dc, side: THREE.DoubleSide }), 0, 0, 0, 36, true);
        cyl(1.4, 1.08, .34, new THREE.MeshLambertMaterial({ color: 0xc0392b, side: THREE.DoubleSide }), 0, .02, 0, 36, true);
        const f = new THREE.Mesh(new THREE.CircleGeometry(1.1, 36).rotateX(-Math.PI / 2), M("#4f9a3f")); f.position.y = .02; g.add(f);
        box(.12, .005, .45, "#d8c08c", 0, .025, 0);
        for (const [x, z] of [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]]) { cyl(.03, .04, 1.4, "#9aa0a4", x, 0, z, 5); const lamp = box(.3, .16, .06, new THREE.MeshLambertMaterial({ color: 0xf5f5f0, emissive: 0xfff6d5, emissiveIntensity: 0 }), x, 1.4, z, Math.atan2(x, z)); lamp.userData.lamp = true; }
        hit(1.6, .6); break;
      }
      case "iskcon": { g.add(new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.4, .3, 10).translate(0, .15, 0), M("#8d9a6a"))); box(1.1, .36, .75, "#f4efe3", 0, .3, 0);
        for (let k = 0; k < 5; k++) box(.42 - k * .07, .14, .42 - k * .07, k % 2 ? "#f4efe3" : "#e3b341", 0, .66 + k * .14, 0); cyl(0, .05, .2, "#e3b341", 0, 1.36, 0, 6); break; }
      case "nandi": box(.7, .3, .55, "#d8c9a8"); box(.3, .1, .2, "#6f6a60", 0, .3, .1); box(.32, .16, .14, "#2c2b2a", 0, .4, .1); box(.08, .1, .1, "#2c2b2a", .17, .5, .1); cyl(0, .12, .3, "#c7a458", 0, .3, -.15, 4); break;
      case "tipu": box(1.0, .3, .6, "#8a5a3b"); box(1.1, .06, .7, "#6b3f28", 0, .3, 0); for (let k = 0; k < 7; k++) box(.04, .28, .04, "#b98a5e", -.45 + k * .15, 0, .34); break;
      case "rocket": {
        box(1.3, .5, .8, "#e9eef2"); box(1.3, .06, .8, "#2f5aa8", 0, .5, 0);
        const rk = new THREE.Group(); rk.position.set(.95, 0, .6);
        const add = (m, y) => { m.position.y = y; rk.add(m); };
        add(new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1.3, 10).translate(0, .65, 0), M("#f4f4f2")), .05);
        add(new THREE.Mesh(new THREE.ConeGeometry(.09, .3, 10).translate(0, .15, 0), M("#e9772f")), 1.35);
        [[.13, 0], [-.13, 0], [0, .13], [0, -.13]].forEach(([x, z]) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .55, 8).translate(0, .28, 0), M("#e7e4dc")); b.position.set(x, .05, z); rk.add(b); const c = new THREE.Mesh(new THREE.ConeGeometry(.04, .1, 8).translate(0, .05, 0), M("#e9772f")); c.position.set(x, .6, z); rk.add(c); });
        g.add(rk); g.userData.rocket = rk;
        box(.08, 1.7, .08, "#c0392b", 1.2, 0, .6); box(.3, .04, .04, "#c0392b", 1.08, 1.2, .6); box(.6, .05, .6, "#9aa0a4", .95, 0, .6);
        hit(1.2, 1.8); break;
      }
      case "pyramid": { const p = new THREE.Mesh(new THREE.ConeGeometry(.95, 1.1, 4).translate(0, .55, 0), new THREE.MeshLambertMaterial({ color: 0x4e8fbf, transparent: true, opacity: .92 })); p.rotation.y = Math.PI / 4; g.add(p); box(2.2, .03, 2.2, "#dcd6c8"); break; }
      case "silkboard": { hit(2.2, 1); for (const [x, z] of [[-.8, -.8], [.8, .8]]) { cyl(.02, .02, .45, "#333", x, 0, z, 4); box(.08, .18, .06, "#222", x, .42, z); } break; }
      case "foam": hit(4.5, .4); break;
      case "tower": box(.62, 3.0, .62, "#35607f"); box(.4, .35, .4, "#2d506a", 0, 3.0, 0); box(1.4, .3, 1.1, "#d6d0c4"); break;
      case "busstand": {
        for (let k = 0; k < 3; k++) { box(2.2, .04, .35, "#d6d0c4", 0, .28, -.6 + k * .6); for (let q = 0; q < 4; q++) box(.04, .28, .04, "#9a958b", -1 + q * .66, 0, -.6 + k * .6); }
        for (let k = 0; k < 6; k++) box(.6, .16, .16, k % 2 ? "#2a5caa" : "#c0392b", -.8 + (k % 3) * .8, 0, -.3 + Math.floor(k / 3) * .6);
        break;
      }
      case "darshini": box(.46, .26, .46, "#f4e6c3"); box(.48, .07, .02, "#c0392b", 0, .19, .24); box(.5, .03, .5, "#8c4a2f", 0, .26, 0); hit(.5, .6); break;
      case "sign": {
        box(.04, .7, .04, "#6b6f73", -.4, 0, 0); box(.04, .7, .04, "#6b6f73", .4, 0, 0);
        const c = document.createElement("canvas"); c.width = 256; c.height = 96; const x = c.getContext("2d");
        x.fillStyle = "#1f7a45"; x.fillRect(0, 0, 256, 96); x.strokeStyle = "#fff"; x.lineWidth = 4; x.strokeRect(6, 6, 244, 84);
        x.fillStyle = "#fff"; x.font = "700 30px Instrument Sans, sans-serif"; x.fillText("↑ Airport  KIA", 18, 44); x.font = "500 22px Instrument Sans, sans-serif"; x.fillText("ವಿಮಾನ ನಿಲ್ದಾಣ  25 km", 18, 78);
        const m = new THREE.Mesh(new THREE.BoxGeometry(.9, .34, .03), [M("#1f7a45"), M("#1f7a45"), M("#1f7a45"), M("#1f7a45"), new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c) }), M("#1f7a45")]);
        m.position.y = .82; g.add(m); break;
      }
      default: return null;
    }
    return g;
  };
})();
