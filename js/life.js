// Namma Ooru — everything that moves: traffic & signals, people, animals, metro, planes, weather, particles.
// Traffic and pedestrians live in a "bubble" around wherever the camera looks, so a phone only
// simulates what can actually be seen.
(function () {
  const NO = window.NO;
  const L = NO.life = {};
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rand = Math.random;

  // ── models (+x is forward). mergeColored parts: [geometry, colour, tint, glow]
  const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  const wheel = (r, w, x, z) => new THREE.CylinderGeometry(r, r, w, 8).rotateX(Math.PI / 2).translate(x, r, z);
  const P = (g, part) => { g.userData.part = part; return g; };
  const TYRE = "#1b1c1e", GLASS = "#22303a", SKIN = ["#8d5a3b", "#6f4630", "#a06b48", "#7b4f35"];
  const MODELS = {
    auto: () => NO.mergeColored([
      [B(.22, .055, .16, -.02, .03, 0), "#ffffff", 1], [B(.08, .07, .09, .12, .03, 0), "#ffffff", 1],
      [B(.2, .018, .175, -.03, .175, 0), "#f2c230"], [B(.2, .085, .012, -.03, .09, .082), "#f2c230"], [B(.2, .085, .012, -.03, .09, -.082), "#f2c230"],
      [B(.02, .1, .17, -.13, .075, 0), "#1c1d1f"], [B(.012, .075, .14, .075, .1, 0), GLASS], [B(.07, .02, .16, .1, .16, 0), "#f2c230"],
      [B(.04, .045, .05, .03, .085, 0), "#c2a878"], [B(.03, .03, .03, .03, .13, 0), SKIN[0]],
      [B(.05, .04, .1, -.07, .085, 0), "#3a3f45"],
      [B(.012, .022, .03, .163, .075, 0), "#fff6d8", 0, 1], [B(.01, .016, .02, -.141, .05, .06), "#ff3b30", 0, 2], [B(.01, .016, .02, -.141, .05, -.06), "#ff3b30", 0, 2],
      [wheel(.03, .02, .12, 0), TYRE], [wheel(.03, .02, -.08, .075), TYRE], [wheel(.03, .02, -.08, -.075), TYRE]]),
    car: () => NO.mergeColored([
      [B(.34, .065, .16, 0, .03, 0), "#ffffff", 1], [B(.18, .06, .145, -.02, .095, 0), GLASS], [B(.17, .012, .15, -.02, .155, 0), "#ffffff", 1],
      [B(.012, .02, .03, .171, .065, .05), "#fff6d8", 0, 1], [B(.012, .02, .03, .171, .065, -.05), "#fff6d8", 0, 1],
      [B(.012, .018, .035, -.171, .065, .05), "#ff3b30", 0, 2], [B(.012, .018, .035, -.171, .065, -.05), "#ff3b30", 0, 2],
      [wheel(.032, .022, .1, .075), TYRE], [wheel(.032, .022, .1, -.075), TYRE], [wheel(.032, .022, -.1, .075), TYRE], [wheel(.032, .022, -.1, -.075), TYRE]]),
    suv: () => NO.mergeColored([
      [B(.36, .085, .17, 0, .03, 0), "#ffffff", 1], [B(.24, .07, .155, -.03, .115, 0), GLASS], [B(.24, .014, .165, -.03, .185, 0), "#ffffff", 1],
      [B(.012, .024, .03, .181, .08, .055), "#fff6d8", 0, 1], [B(.012, .024, .03, .181, .08, -.055), "#fff6d8", 0, 1],
      [B(.012, .02, .035, -.181, .08, .055), "#ff3b30", 0, 2], [B(.012, .02, .035, -.181, .08, -.055), "#ff3b30", 0, 2],
      [wheel(.036, .024, .11, .08), TYRE], [wheel(.036, .024, .11, -.08), TYRE], [wheel(.036, .024, -.11, .08), TYRE], [wheel(.036, .024, -.11, -.08), TYRE]]),
    bus: () => NO.mergeColored([
      [B(.8, .17, .21, 0, .035, 0), "#ffffff", 1], [B(.76, .05, .215, -.01, .12, 0), GLASS, 0, 4], [B(.02, .08, .19, .395, .1, 0), GLASS],
      [B(.8, .02, .21, 0, .205, 0), "#e9ecef"], [B(.8, .018, .213, 0, .085, 0), "#f4f4f4"], [B(.01, .03, .15, .401, .17, 0), "#ff9a1f", 0, 3],
      [B(.012, .025, .04, .401, .06, .07), "#fff6d8", 0, 1], [B(.012, .025, .04, .401, .06, -.07), "#fff6d8", 0, 1], [B(.012, .025, .04, -.401, .06, .07), "#ff3b30", 0, 2], [B(.012, .025, .04, -.401, .06, -.07), "#ff3b30", 0, 2],
      [wheel(.04, .03, .26, .095), TYRE], [wheel(.04, .03, .26, -.095), TYRE], [wheel(.04, .03, -.24, .095), TYRE], [wheel(.04, .03, -.24, -.095), TYRE]]),
    truck: () => NO.mergeColored([
      [B(.14, .15, .2, .22, .035, 0), "#e8801c"], [B(.012, .05, .16, .291, .12, 0), GLASS], [B(.38, .19, .21, -.06, .045, 0), "#ffffff", 1],
      [B(.38, .025, .215, -.06, .11, 0), "#2a9d8f"], [B(.38, .025, .215, -.06, .16, 0), "#e63946"],
      [B(.012, .025, .04, .291, .07, .07), "#fff6d8", 0, 1], [B(.012, .025, .04, .291, .07, -.07), "#fff6d8", 0, 1], [B(.012, .02, .04, -.251, .07, .07), "#ff3b30", 0, 2], [B(.012, .02, .04, -.251, .07, -.07), "#ff3b30", 0, 2],
      [wheel(.042, .03, .2, .095), TYRE], [wheel(.042, .03, .2, -.095), TYRE], [wheel(.042, .03, -.15, .095), TYRE], [wheel(.042, .03, -.15, -.095), TYRE]]),
    delivery: () => NO.mergeColored([
      [wheel(.026, .012, .06, 0), TYRE], [wheel(.026, .012, -.06, 0), TYRE], [B(.12, .035, .03, 0, .03, 0), "#2b2f33"],
      [B(.035, .022, .06, -.015, .05, 0), "#2f3438"], [B(.04, .065, .06, -.01, .07, 0), "#ffffff", 1], [B(.035, .036, .042, -.005, .135, 0), "#ffffff", 1],
      [B(.065, .065, .075, -.075, .07, 0), "#ffffff", 1], [B(.01, .015, .02, .065, .06, 0), "#fff6d8", 0, 1], [B(.01, .012, .015, -.11, .05, 0), "#ff3b30", 0, 2]]),
    scooter: () => NO.mergeColored([
      [wheel(.026, .012, .06, 0), TYRE], [wheel(.026, .012, -.06, 0), TYRE], [B(.12, .04, .035, 0, .03, 0), "#ffffff", 1],
      [B(.035, .022, .06, -.015, .055, 0), "#2f3438"], [B(.04, .065, .06, -.01, .075, 0), "#dfe6ec"], [B(.035, .036, .042, -.005, .14, 0), "#16181a"],
      [B(.035, .06, .05, -.055, .075, 0), "#c94f7c"], [B(.03, .03, .03, -.055, .135, 0), "#16181a"],
      [B(.01, .015, .02, .065, .065, 0), "#fff6d8", 0, 1], [B(.01, .012, .015, -.066, .05, 0), "#ff3b30", 0, 2]]),
    man: () => NO.mergeColored([
      [P(B(.018, .055, .02, 0, 0, .012), 1), "#2f3438"], [P(B(.018, .055, .02, 0, 0, -.012), 2), "#2f3438"],
      [B(.03, .06, .05, 0, .055, 0), "#ffffff", 1], [P(B(.014, .05, .014, 0, .06, .032), 3), "#ffffff", 1], [P(B(.014, .05, .014, 0, .06, -.032), 4), "#ffffff", 1],
      [B(.028, .03, .028, 0, .117, 0), SKIN[1]], [B(.03, .01, .03, -.002, .145, 0), "#1b1a19"]]),
    woman: () => NO.mergeColored([
      [new THREE.CylinderGeometry(.018, .03, .07, 6).translate(0, .035, 0), "#ffffff", 1], [B(.028, .05, .045, 0, .065, 0), "#ffffff", 1],
      [B(.03, .052, .012, .004, .062, .018), "#f2c230"], [P(B(.012, .045, .012, 0, .065, .029), 3), SKIN[2]], [P(B(.012, .045, .012, 0, .065, -.029), 4), SKIN[2]],
      [B(.026, .028, .026, 0, .115, 0), SKIN[2]], [B(.03, .012, .03, -.003, .14, 0), "#141312"], [B(.014, .016, .014, -.018, .13, 0), "#141312"]]),
    office: () => NO.mergeColored([
      [P(B(.018, .055, .02, 0, 0, .012), 1), "#2a2f3a"], [P(B(.018, .055, .02, 0, 0, -.012), 2), "#2a2f3a"],
      [B(.03, .06, .05, 0, .055, 0), "#ffffff", 1], [P(B(.014, .05, .014, 0, .06, .032), 3), "#ffffff", 1], [P(B(.014, .05, .014, 0, .06, -.032), 4), "#ffffff", 1],
      [B(.004, .03, .012, .016, .07, 0), "#d0392b"], [B(.02, .05, .045, -.025, .06, 0), "#2d3436"],
      [B(.028, .03, .028, 0, .117, 0), SKIN[3]], [B(.03, .01, .03, -.002, .145, 0), "#1b1a19"]]),
    cow: () => NO.mergeColored([
      [B(.24, .09, .11, 0, .06, 0), "#ffffff", 1], [B(.07, .045, .075, .065, .15, 0), "#ffffff", 1], [B(.075, .06, .06, .15, .11, 0), "#ffffff", 1],
      [B(.012, .045, .012, .165, .165, .025), "#3b3024"], [B(.012, .045, .012, .165, .165, -.025), "#3b3024"], [B(.02, .02, .03, .19, .115, 0), "#5a4a3e"],
      [B(.024, .065, .024, .08, 0, .035), "#ffffff", 1], [B(.024, .065, .024, .08, 0, -.035), "#ffffff", 1], [B(.024, .065, .024, -.09, 0, .035), "#ffffff", 1], [B(.024, .065, .024, -.09, 0, -.035), "#ffffff", 1],
      [B(.01, .07, .01, -.125, .07, 0), "#ffffff", 1]]),
    dog: () => NO.mergeColored([
      [B(.12, .045, .048, 0, .045, 0), "#ffffff", 1], [B(.045, .042, .042, .075, .07, 0), "#ffffff", 1], [B(.024, .02, .024, .106, .07, 0), "#ffffff", 1],
      [B(.012, .02, .012, .07, .112, .014), "#ffffff", 1], [B(.012, .02, .012, .07, .112, -.014), "#ffffff", 1],
      [B(.012, .045, .012, .045, 0, .016), "#ffffff", 1], [B(.012, .045, .012, .045, 0, -.016), "#ffffff", 1], [B(.012, .045, .012, -.045, 0, .016), "#ffffff", 1], [B(.012, .045, .012, -.045, 0, -.016), "#ffffff", 1],
      [B(.045, .012, .012, -.075, .085, 0).rotateZ(.5), "#ffffff", 1]]),
    train: () => NO.mergeColored([[B(.37, .13, .17, 0, .03, 0), "#ffffff", 1], [B(.372, .045, .172, 0, .09, 0), GLASS, 0, 4], [B(.36, .02, .16, 0, .16, 0), "#dfe3e6"], [B(.03, .1, .175, 0, .03, 0), "#dfe3e6"]]),
    umbrella: () => NO.mergeColored([[new THREE.ConeGeometry(.05, .025, 8).translate(0, .175, 0), "#ffffff", 1], [B(.004, .05, .004, 0, .13, 0), "#333"]]),
  };

  function makeInst(geo, n, pick, mat) {
    const m = new THREE.InstancedMesh(geo, mat || NO.modelMat(), Math.max(1, n));
    m.frustumCulled = false; m.castShadow = NO.TIER === "high"; m.receiveShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    NO.scene.add(m); if (pick) m.userData.pick = pick; return m;
  }
  function setM(arr, k, x, y, z, rot, s = 1) {
    const c = Math.cos(rot) * s, sn = Math.sin(rot) * s, q = k * 16;
    arr[q] = c; arr[q + 1] = 0; arr[q + 2] = -sn; arr[q + 3] = 0; arr[q + 4] = 0; arr[q + 5] = s; arr[q + 6] = 0; arr[q + 7] = 0;
    arr[q + 8] = sn; arr[q + 9] = 0; arr[q + 10] = c; arr[q + 11] = 0; arr[q + 12] = x; arr[q + 13] = y; arr[q + 14] = z; arr[q + 15] = 1;
  }
  const hideM = (arr, k) => { arr[k * 16 + 13] = -80; };

  // ── road graph + spatial index for the traffic bubble
  let paths = [], ends = new Map(), junctions = new Map();
  const key = (x, z) => Math.round(x * 3) + "," + Math.round(z * 3);
  const BK = 12, buckets = new Map();
  function buildGraph() {
    NO.G.roads.forEach((r, idx) => {
      const p = r.p, n = p.length / 2; if (n < 2) return;
      const cum = new Float32Array(n); for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(p[k * 2] - p[k * 2 - 2], p[k * 2 + 1] - p[k * 2 - 1]);
      const len = cum[n - 1]; if (len < .15) return;
      const P2 = { p, cum, n, len, cls: r.c, elev: NO.elevSet.has(idx), sk: key(p[0], p[1]), ek: key(p[n * 2 - 2], p[n * 2 - 1]), id: paths.length };
      paths.push(P2);
      for (const [k, s] of [[P2.sk, true], [P2.ek, false]]) { if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ P: P2, atStart: s }); }
      const seen = new Set();
      for (let k = 0; k < n; k++) { const bk = Math.floor(p[2 * k] / BK) + "," + Math.floor(p[2 * k + 1] / BK); if (seen.has(bk)) continue; seen.add(bk); if (!buckets.has(bk)) buckets.set(bk, []); buckets.get(bk).push(P2); }
    });
    ends.forEach((list, k) => { if (list.length >= 3 && list.some(e => e.P.cls <= 2)) junctions.set(k, { off: NO.hashStr(k) * 20 }); });
    byMax = [0, 1, 2, 3, 4].map(m => paths.filter(P2 => P2.cls <= m));
  }
  // candidate paths near the camera target (weighted towards the arterials that actually carry traffic)
  const near = { x: 1e9, z: 1e9, r: 0, veh: [], ped: [] };
  function refreshNear(tx, tz, r) {
    if (Math.hypot(tx - near.x, tz - near.z) < r * .25 && Math.abs(r - near.r) < r * .3) return;
    near.x = tx; near.z = tz; near.r = r; near.veh = []; near.ped = [];
    const i0 = Math.floor((tx - r) / BK), i1 = Math.floor((tx + r) / BK), j0 = Math.floor((tz - r) / BK), j1 = Math.floor((tz + r) / BK), seen = new Set();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const b = buckets.get(i + "," + j); if (!b) continue; for (const P2 of b) { if (seen.has(P2)) continue; seen.add(P2); const w = [5, 4, 3, 2, 1][P2.cls]; for (let q = 0; q < w; q++) near.veh.push(P2); if (P2.cls >= 1) near.ped.push(P2); } }
    if (!near.veh.length) near.veh = paths.slice(0, 50);
    if (!near.ped.length) near.ped = near.veh;
  }
  function sample(P2, d, out) {
    let s = out.seg || 0; if (s > P2.n - 2) s = P2.n - 2;
    while (s < P2.n - 2 && P2.cum[s + 1] < d) s++;
    while (s > 0 && P2.cum[s] > d) s--;
    out.seg = s;
    const a = s * 2, Lg = (P2.cum[s + 1] - P2.cum[s]) || 1e-6, u = clamp((d - P2.cum[s]) / Lg, 0, 1);
    out.x = P2.p[a] + (P2.p[a + 2] - P2.p[a]) * u; out.z = P2.p[a + 1] + (P2.p[a + 3] - P2.p[a + 1]) * u;
    out.hx = (P2.p[a + 2] - P2.p[a]) / Lg; out.hz = (P2.p[a + 3] - P2.p[a + 1]) / Lg;
    return out;
  }
  function nextPath(a, maxCls) {
    const k = a.dir > 0 ? a.P.ek : a.P.sk, list = (ends.get(k) || []).filter(e => e.P !== a.P && e.P.cls <= maxCls);
    if (!list.length) { a.dir *= -1; a.d = clamp(a.d, 0, a.P.len); return; }
    const e = list[Math.floor(rand() * list.length)];
    a.P = e.P; a.dir = e.atStart ? 1 : -1; a.d = e.atStart ? 0 : a.P.len; a.seg = e.atStart ? 0 : a.P.n - 2;
  }
  let byMax = [];
  function respawn(a, pool, maxCls) {
    let P2 = null;
    for (let t = 0; t < 12 && !P2; t++) { const c = pool[Math.floor(rand() * pool.length)]; if (c && c.cls <= maxCls) P2 = c; }
    if (!P2) { const g = byMax[maxCls] || paths; P2 = g[Math.floor(rand() * g.length)]; }
    a.P = P2; a.d = rand() * P2.len; a.dir = rand() < .5 ? 1 : -1; a.seg = 0; if (a.ty) a.v = a.vmax * .5;
  }

  // ── congestion: Bengaluru's real choke points
  let jam; const JW = Math.ceil(NO.GW), JH = Math.ceil(NO.GH);
  function buildJam() {
    jam = new Float32Array(JW * JH).fill(1);
    const spots = [[12.91604, 77.62391, .07, 3.5, 9], [13.04086, 77.5898, .35, 3, 6], [13.0050, 77.6960, .35, 3, 6], [12.9560, 77.7010, .45, 3, 5],
      [12.9975, 77.6700, .4, 2.5, 5], [12.9340, 77.6900, .45, 3, 6], [12.97818, 77.57219, .5, 3, 5], [12.8950, 77.5990, .5, 2, 4], [12.9260, 77.6780, .45, 3, 6]];
    spots.forEach(([la, lo, f, r1, r2]) => { const w = NO.ll2w(la, lo), cx = w.x + NO.GW / 2, cz = w.z + NO.GH / 2;
      for (let j = Math.floor(cz - r2); j <= cz + r2; j++) for (let i = Math.floor(cx - r2); i <= cx + r2; i++) { if (i < 0 || j < 0 || i >= JW || j >= JH) continue;
        const d = Math.hypot(i - cx, j - cz), v = d < r1 ? f : d < r2 ? f + (1 - f) * (d - r1) / (r2 - r1) : 1; jam[j * JW + i] = Math.min(jam[j * JW + i], v); } });
    L.silkBoard = NO.ll2w(12.91604, 77.62391);
  }
  const jamAt = (x, z) => { const i = (x + NO.GW / 2) | 0, j = (z + NO.GH / 2) | 0; return (i < 0 || j < 0 || i >= JW || j >= JH) ? 1 : jam[j * JW + i]; };

  // ── state
  const walkers = [], wanderers = [];
  const meshes = {};
  L.konami = false;
  const tmp = {};
  const LOW = NO.TIER === "low";

  L.init = function () {
    buildGraph(); buildJam();
    const tg = NO.controls.target; refreshNear(tg.x, tg.z, 60);
    const K = LOW ? .36 : NO.TIER === "mid" ? .7 : 1;
    // vehicles — body paint comes from the instance colour
    const types = [
      { t: "auto", n: 380 * K, geo: MODELS.auto(), v: .72, lane: .11, max: 4, colors: ["#2f8f3a", "#2f8f3a", "#2f8f3a", "#1f2326", "#2f8f3a", "#1f2326"] },
      { t: "car", n: 330 * K, geo: MODELS.car(), v: .95, lane: .15, max: 4, colors: ["#f4f4f4", "#f4f4f4", "#f4f4f4", "#c9ccd0", "#9ea4aa", "#4a5058", "#b0302a", "#2d4f8a", "#d8c9a8", "#1e2226"] },
      { t: "car", n: 170 * K, geo: MODELS.suv(), v: .9, lane: .16, max: 3, colors: ["#f4f4f4", "#1e2226", "#9ea4aa", "#6b1f1f", "#f4f4f4", "#3c4a3e"] },
      { t: "bike", n: 250 * K, geo: MODELS.delivery(), v: 1.05, lane: .21, max: 4, colors: ["#fc8019", "#e23744", "#5a189a", "#f8cb46", "#ffd500", "#2874f0", "#0c831f"] },
      { t: "bike", n: 260 * K, geo: MODELS.scooter(), v: .98, lane: .2, max: 4, colors: ["#e8e8e8", "#1e2226", "#b0302a", "#2d4f8a", "#9ea4aa", "#2bb6d6", "#f2c230"] },
      { t: "bus", n: 70 * K, geo: MODELS.bus(), v: .58, lane: .19, max: 2, colors: ["#2a5caa", "#2a5caa", "#c0392b", "#1f8a4c", "#e0e6ea"] },
      { t: "truck", n: 45 * K, geo: MODELS.truck(), v: .55, lane: .19, max: 1, colors: ["#f1c40f", "#3498db", "#e74c3c", "#9b59b6", "#16a085"], night: true },
    ];
    types.forEach(ty => {
      const n = Math.round(ty.n), mesh = makeInst(ty.geo, n, ty.t);
      ty.mesh = mesh; ty.list = [];
      for (let k = 0; k < n; k++) {
        const a = { ty, P: null, d: 0, dir: 1, v: ty.v, vmax: ty.v * (.8 + rand() * .4), lane: ty.lane + (rand() - .5) * .05, stopD: .15 + rand() * .9, seg: 0, idx: k, wx: 0, wz: 0, whx: 1, whz: 0, y: 0 };
        respawn(a, near.veh, ty.max);
        mesh.setColorAt(k, new THREE.Color(ty.colors[Math.floor(rand() * ty.colors.length)]));
        ty.list.push(a);
      }
      mesh.instanceColor.needsUpdate = true;
    });
    L.types = types;
    L.autos = types.filter(t => t.t === "auto");

    // the Silk Board jam never clears
    const jamList = []; const sb = L.silkBoard;
    for (let t = 0; t < 5000 && jamList.length < (LOW ? 90 : 170); t++) {
      const x = sb.x + (rand() - .5) * 7, z = sb.z + (rand() - .5) * 7;
      if (!NO.isRoad(x, z) || Math.hypot(x - sb.x, z - sb.z) > 3.6) continue;
      jamList.push([x, z, Math.floor(rand() * 4) * Math.PI / 2 + (rand() - .5) * .3, rand()]);
    }
    const jc = jamList.filter(q => q[3] < .5), ja = jamList.filter(q => q[3] >= .5);
    const jamCars = makeInst(MODELS.car(), jc.length, "jam"), jamAutos = makeInst(MODELS.auto(), ja.length, "jam");
    const cc = ["#f4f4f4", "#c9ccd0", "#4a5058", "#b0302a", "#2d4f8a"];
    jc.forEach(([x, z, r], k) => { setM(jamCars.instanceMatrix.array, k, x, 0, z, r); jamCars.setColorAt(k, new THREE.Color(cc[k % 5])); });
    ja.forEach(([x, z, r], k) => { setM(jamAutos.instanceMatrix.array, k, x, 0, z, r); jamAutos.setColorAt(k, new THREE.Color(k % 3 ? "#2f8f3a" : "#1f2326")); });
    [jamCars, jamAutos].forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });

    // pedestrians: men, women in saris, office crowds — limbs swing in the vertex shader
    const CLOTH = ["#d7263d", "#f46036", "#2e294e", "#1b998b", "#c5d86d", "#e2b6cf", "#ffffff", "#3a86ff", "#8338ec", "#ff006e", "#fb5607", "#ffbe0b", "#0f7173", "#e9c46a", "#7a4f9a", "#1d7874"];
    const SARI = ["#c1121f", "#f77f00", "#fcbf49", "#2a9d8f", "#9d4edd", "#e5383b", "#06d6a0", "#ef476f", "#118ab2", "#ffd166"];
    const SHIRT = ["#dfe9f5", "#ffffff", "#c9d6e3", "#a9c4e0", "#e8e2d4", "#b8d8d8"];
    const walkMat = NO.modelMat({ walk: true });
    const mkPeople = (geo, n, palette) => {
      const g = geo.clone ? geo : geo; const ph = new Float32Array(n), mv = new Float32Array(n);
      for (let k = 0; k < n; k++) ph[k] = rand() * 6.28;
      g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(ph, 1)); const mvA = new THREE.InstancedBufferAttribute(mv, 1); mvA.setUsage(THREE.DynamicDrawUsage); g.setAttribute("aMove", mvA);
      const m = makeInst(g, n, "person", walkMat); m.castShadow = false;
      for (let k = 0; k < n; k++) m.setColorAt(k, new THREE.Color(palette[k % palette.length]));
      m.instanceColor.needsUpdate = true; m.userData.move = mvA; return m;
    };
    const PK = LOW ? .32 : NO.TIER === "mid" ? .7 : 1;
    const nWalk = Math.round(900 * PK);
    const groups = [[MODELS.man(), Math.round(nWalk * .4), CLOTH], [MODELS.woman(), Math.round(nWalk * .35), SARI], [MODELS.office(), Math.round(nWalk * .25), SHIRT]];
    const hot = NO.HOTSPOTS || [];
    const perHot = Math.round(45 * PK);
    const nWand = hot.length * perHot;
    meshes.people = groups.map(([geo, n, pal], gi) => {
      const extra = Math.round(nWand * [.4, .4, .2][gi]);
      const m = mkPeople(geo, n + extra, pal);
      for (let k = 0; k < n; k++) walkers.push({ P: null, d: 0, dir: 1, v: .09 + rand() * .08, lane: .36 + rand() * .12, seg: 0, idx: k, mesh: m, vmax: .12 });
      for (let k = 0; k < extra; k++) { const h = hot[(k * 7 + gi) % hot.length], c = NO.ll2w(h[0], h[1]), a = rand() * 6.28, rr = Math.sqrt(rand()) * h[2];
        wanderers.push({ cx: c.x, cz: c.z, R: h[2], x: c.x + Math.cos(a) * rr, z: c.z + Math.sin(a) * rr, h: rand() * 6.28, v: .05 + rand() * .06, idx: n + k, mesh: m, pause: 0 }); }
      return m;
    });
    walkers.forEach(w => respawn(w, near.ped, 4));
    // umbrellas come out when it rains
    meshes.umb = makeInst(MODELS.umbrella(), walkers.length, null); meshes.umb.castShadow = false;
    walkers.forEach((w, k) => meshes.umb.setColorAt(k, new THREE.Color(k % 3 ? "#1b1b1b" : ["#2a5caa", "#c0392b", "#f2c230"][k % 9 % 3]))); meshes.umb.instanceColor.needsUpdate = true;
    meshes.umb.visible = false;

    // cows (on the road, naturally) and street dogs
    const nCow = Math.round(70 * PK), cm = makeInst(MODELS.cow(), nCow, "cow"); meshes.cow = cm; L.cows = [];
    for (let k = 0; k < nCow; k++) { const P2 = paths[Math.floor(rand() * paths.length)]; sample(P2, rand() * P2.len, tmp); const cow = { x: tmp.x, z: tmp.z, rot: rand() * 6.28, t: rand() * 10 }; L.cows.push(cow); setM(cm.instanceMatrix.array, k, cow.x, 0, cow.z, cow.rot); cm.setColorAt(k, new THREE.Color(rand() < .7 ? "#f5f2ec" : ["#d9cfc1", "#8b6a4f", "#c8b49a"][k % 3])); }
    cm.instanceMatrix.needsUpdate = true; cm.instanceColor.needsUpdate = true;
    const DOGS = ["#c89a5b", "#c89a5b", "#b07d45", "#2a2522", "#d9c4a0", "#8a5a33", "#c89a5b", "#efe6d6"];
    const nDog = Math.round(220 * PK), dm = makeInst(MODELS.dog(), nDog, "dog"); meshes.dog = dm; L.dogs = [];
    for (let k = 0; k < nDog; k++) {
      const trot = rand() < .3;
      if (trot) { const w = { P: null, d: 0, dir: 1, v: .18 + rand() * .1, lane: .42, seg: 0, idx: k, mesh: dm, dog: true }; respawn(w, near.ped, 4); walkers.push(w); }
      else { const P2 = paths[Math.floor(rand() * paths.length)]; sample(P2, rand() * P2.len, tmp); const s = rand() < .5 ? 1 : -1; setM(dm.instanceMatrix.array, k, tmp.x + tmp.hz * .44 * s, 0, tmp.z - tmp.hx * .44 * s, rand() * 6.28, .9); }
      dm.setColorAt(k, new THREE.Color(DOGS[k % DOGS.length]));
    }
    dm.instanceMatrix.needsUpdate = true; dm.instanceColor.needsUpdate = true;

    // Yulu bikes parked at metro stations
    const yl = []; NO.stations.forEach(s => { if (s.under) return; for (let k = 0; k < 4; k++) yl.push([s.x + Math.cos(s.rot + 1.57) * .45 + k * .06, s.z - Math.sin(s.rot + 1.57) * .45, s.rot]); });
    if (yl.length) { const ym = makeInst(MODELS.scooter(), yl.length); yl.forEach((p, k) => { setM(ym.instanceMatrix.array, k, p[0], 0, p[1], p[2] + 1.57, .8); ym.setColorAt(k, new THREE.Color("#2bb6d6")); }); ym.instanceMatrix.needsUpdate = true; }

    // metro trains
    L.trains = [];
    NO.metroLines.forEach(line => {
      const nT = line.ref === "Yellow" ? 2 : 3, cars = line.ref === "Yellow" ? 3 : 4;
      const m = makeInst(MODELS.train(), nT * cars, "train"); m.userData.line = line;
      for (let k = 0; k < nT * cars; k++) m.setColorAt(k, line.color);
      for (let k = 0; k < nT; k++) L.trains.push({ line, m, cars, base: k * cars, d: line.len * (k + .3) / nT, dir: k % 2 ? -1 : 1, dwell: 0, v: 1.25 });
    });

    L.planes = [];
    for (let k = 0; k < 3; k++) { const p = makePlane(k); NO.scene.add(p.g); L.planes.push(p); resetPlane(p, true); }
    initParticles(); initRain(); initFoam();
  };

  function makePlane(k) {
    const g = new THREE.Group(), s = 1.4, tail = ["#1f2a7a", "#c8102e", "#1f2a7a"][k];
    const add = (geo, c, x, y, z, glow) => { const m = new THREE.Mesh(geo, glow ? new THREE.MeshBasicMaterial({ color: c }) : NO.M(c)); m.position.set(x * s, y * s, z * s); m.scale.setScalar(s); g.add(m); return m; };
    add(new THREE.CylinderGeometry(.11, .11, 1.7, 10).rotateZ(Math.PI / 2), "#f4f5f6", 0, 0, 0);
    add(new THREE.ConeGeometry(.11, .3, 10).rotateZ(-Math.PI / 2), "#f4f5f6", 1.0, 0, 0);
    add(new THREE.ConeGeometry(.11, .4, 10).rotateZ(Math.PI / 2), tail, -1.05, .02, 0);
    add(new THREE.BoxGeometry(.34, .03, 1.9), "#e3e6e9", .1, -.03, 0); add(new THREE.BoxGeometry(.2, .02, .6), "#e3e6e9", -.9, .02, 0);
    add(new THREE.BoxGeometry(.28, .36, .03), tail, -.95, .2, 0);
    add(new THREE.CylinderGeometry(.06, .06, .2, 8).rotateZ(Math.PI / 2), "#9aa0a6", .15, -.1, .45); add(new THREE.CylinderGeometry(.06, .06, .2, 8).rotateZ(Math.PI / 2), "#9aa0a6", .15, -.1, -.45);
    const blinkR = add(new THREE.SphereGeometry(.035, 6, 4), "#ff2d2d", .1, -.02, .96, true), blinkG = add(new THREE.SphereGeometry(.035, 6, 4), "#2dff6a", .1, -.02, -.96, true);
    g.traverse(o => o.userData.plane = true);
    return { g, t: 0, blink: [blinkR, blinkG] };
  }
  function resetPlane(p, first) {
    const GH = NO.GH, arriving = rand() < .55, x0 = (rand() - .5) * 260, x1 = x0 * .3 + (rand() - .5) * 60;
    if (arriving) { p.a = new THREE.Vector3(x0, 34, GH / 2 + 140); p.b = new THREE.Vector3(x1 + 40, 9, -GH / 2 - 160); }
    else { p.a = new THREE.Vector3(x1 + 40, 7, -GH / 2 - 160); p.b = new THREE.Vector3(x0, 40, GH / 2 + 140); }
    p.arriving = arriving; p.dur = p.a.distanceTo(p.b) / 10; p.t = first ? rand() * p.dur : 0;
  }

  // ── particles (fireworks, smoke, steam, petals, groundnuts)
  let pts, pPos, pCol, pVel, pLife, pN = 4000, pHead = 0, pAlive = 0;
  function initParticles() {
    const g = new THREE.BufferGeometry(); pPos = new Float32Array(pN * 3).fill(-999); pCol = new Float32Array(pN * 3); pVel = new Float32Array(pN * 4); pLife = new Float32Array(pN);
    g.setAttribute("position", new THREE.BufferAttribute(pPos, 3)); g.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
    pts = new THREE.Points(g, new THREE.PointsMaterial({ size: .16, vertexColors: true, transparent: true, opacity: .95, depthWrite: false }));
    pts.frustumCulled = false; NO.scene.add(pts);
  }
  L.burst = function (x, y, z, colors, n, speed, grav, life, spread = 1) {
    const c = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const i = pHead; pHead = (pHead + 1) % pN;
      const th = rand() * 6.28, ph = Math.acos(2 * rand() - 1), s = speed * (.4 + rand() * .6);
      pPos[i * 3] = x + (rand() - .5) * spread * .2; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z + (rand() - .5) * spread * .2;
      pVel[i * 4] = Math.sin(ph) * Math.cos(th) * s * spread; pVel[i * 4 + 1] = Math.cos(ph) * s; pVel[i * 4 + 2] = Math.sin(ph) * Math.sin(th) * s * spread; pVel[i * 4 + 3] = grav;
      c.set(colors[k % colors.length]); pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b; pLife[i] = life * (.6 + rand() * .4);
    }
    pAlive = 4;
  };
  function updParticles(dt) {
    if (pAlive <= 0) return; pAlive -= dt * .1;
    let any = false;
    for (let i = 0; i < pN; i++) {
      if (pLife[i] <= 0) continue; any = true;
      pLife[i] -= dt; if (pLife[i] <= 0) { pPos[i * 3 + 1] = -999; continue; }
      pVel[i * 4 + 1] -= pVel[i * 4 + 3] * dt;
      pPos[i * 3] += pVel[i * 4] * dt; pPos[i * 3 + 1] += pVel[i * 4 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 4 + 2] * dt;
    }
    if (!any) pAlive = 0;
    pts.geometry.attributes.position.needsUpdate = true; pts.geometry.attributes.color.needsUpdate = true;
  }

  // ── rain (it's 4 pm somewhere in Bengaluru)
  let rain, rainPos, rainSeed, rainN = LOW ? 1400 : 3000; L.rainK = 0; L.raining = false;
  function initRain() {
    rainPos = new Float32Array(rainN * 6); rainSeed = new Float32Array(rainN * 3);
    for (let k = 0; k < rainN; k++) { rainSeed[k * 3] = rand() - .5; rainSeed[k * 3 + 1] = rand(); rainSeed[k * 3 + 2] = rand() - .5; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xa9c2d6, transparent: true, opacity: .55 })); rain.frustumCulled = false; rain.visible = false; NO.scene.add(rain);
  }
  function updRain(dt) {
    L.rainK += ((L.raining ? 1 : 0) - L.rainK) * Math.min(1, dt * .8);
    rain.visible = L.rainK > .02; meshes.umb.visible = L.rainK > .3 && pedVisible;
    if (!rain.visible) return;
    const t = NO.controls.target, dist = NO.camera.position.distanceTo(t), S = clamp(dist * .9, 10, 200), H = clamp(dist * .55, 5, 90), len = H * .035;
    rain.material.opacity = .6 * L.rainK;
    for (let k = 0; k < rainN; k++) {
      let y = rainSeed[k * 3 + 1] - dt * 1.4; if (y < 0) y += 1; rainSeed[k * 3 + 1] = y;
      const x = t.x + rainSeed[k * 3] * S, z = t.z + rainSeed[k * 3 + 2] * S, yy = y * H, o = k * 6;
      rainPos[o] = x; rainPos[o + 1] = yy; rainPos[o + 2] = z; rainPos[o + 3] = x - len * .12; rainPos[o + 4] = yy + len; rainPos[o + 5] = z;
    }
    rain.geometry.attributes.position.needsUpdate = true;
  }

  // ── Bellandur foam
  let foam, foamPts = [], foamBurst = 0;
  function initFoam() {
    const c = NO.ll2w(12.93714, 77.67202); const list = [];
    for (let t = 0; t < 8000 && list.length < (LOW ? 160 : 320); t++) { const x = c.x + (rand() - .5) * 26, z = c.z + (rand() - .5) * 20; if (NO.isWater(x, z)) list.push([x, z, .12 + rand() * .3, rand() * 6]); }
    foam = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), Math.max(1, list.length));
    foam.frustumCulled = false; foam.userData.pick = "foam"; foamPts = list; NO.scene.add(foam); L.foamCenter = c;
  }
  L.foamUp = () => { foamBurst = 7; };
  function updFoam(t, dt) {
    foamBurst = Math.max(0, foamBurst - dt);
    const a = foam.instanceMatrix.array, k0 = foamBurst > 0 ? Math.sin((7 - foamBurst) / 7 * Math.PI) : 0;
    foamPts.forEach(([x, z, s, ph], k) => { setM(a, k, x + k0 * Math.sin(ph + t * .5) * 1.5, .02 + Math.sin(t * 1.3 + ph) * .02 + k0 * (1.2 + Math.sin(ph * 3) * .8), z, ph, s * (1 + k0 * .8)); a[k * 16 + 5] *= .55; });
    foam.instanceMatrix.needsUpdate = true;
  }

  // ── rocket
  let rocketT = -1;
  L.launch = () => { if (rocketT < 0) rocketT = 0; };
  const wp = new THREE.Vector3();
  function updRocket(dt) {
    if (rocketT < 0) return;
    const lm = NO.LANDMARKS.find(l => l.kind === "rocket"); const rk = lm && lm.obj && lm.obj.userData.rocket; if (!rk) return;
    rocketT += dt;
    rk.position.y = rocketT < 1.2 ? 0 : .55 * Math.pow(rocketT - 1.2, 2); rk.rotation.z = -Math.min(.35, Math.max(0, rocketT - 4) * .05);
    rk.getWorldPosition(wp);
    L.burst(wp.x, wp.y, wp.z, ["#f7f3ea", "#d9d4ca", "#ffb347", "#ffd27a"], rocketT < 1.2 ? 8 : 5, .5, -.05, 2.5, 1.5);
    if (rocketT > 14) { rocketT = -1; rk.position.y = 0; rk.rotation.z = 0; }
  }

  // ── lighting & time (IST)
  L.istHours = () => { const d = new Date(); return (d.getUTCHours() + 5.5 + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600) % 24; };
  L.timeMode = "live"; const FIXED = { day: 11.2, dusk: 18.05, night: 21.5 };
  L.hours = () => L.timeMode === "live" ? L.istHours() : FIXED[L.timeMode];
  const cA = new THREE.Color(), cB = new THREE.Color();
  const hx_ = h => h[0] === "#" ? h : "#" + h;
  const lerpHex = (a, b, t) => cA.set(hx_(a)).lerp(cB.set(hx_(b)), clamp(t, 0, 1)).getHexString();
  L.light = { day: 1, night: 0 };
  const sunDir = new THREE.Vector3();
  function applyTime(h) {
    const e = Math.sin(Math.PI * (h - 6.1) / 12.4);
    const day = clamp((e + .06) / .3, 0, 1), dusk = clamp(1 - Math.abs(e - .08) / .22, 0, 1) * (h > 12 ? 1 : .6);
    const rk = L.rainK, night = 1 - day;
    L.light.day = day; L.light.night = night;
    const az = Math.PI * (h - 6.1) / 12.4, t = NO.controls.target;
    if (day > 0) sunDir.set(Math.cos(az), Math.max(.08, e), .35).normalize(); else sunDir.set(-.4, .8, -.3).normalize();
    const dist = NO.camera.position.distanceTo(t), S = clamp(dist * .55, 18, 260);
    NO.sun.position.copy(t).addScaledVector(sunDir, 300); NO.sun.target.position.copy(t);
    if (NO.sun.castShadow) { const cam = NO.sun.shadow.camera; if (Math.abs(cam.right - S) > S * .1) { cam.left = cam.bottom = -S; cam.right = cam.top = S; cam.near = 1; cam.far = 700; cam.updateProjectionMatrix(); } }
    NO.sun.color.set("#" + (day > 0 ? lerpHex("#ffb070", "#fff4e0", e / .45) : "9fb4e6"));
    NO.sun.intensity = (day > 0 ? .25 + .72 * day : .22) * (1 - rk * .45);
    NO.hemi.intensity = (.22 + .36 * day) * (1 - rk * .2);
    NO.hemi.color.set("#" + lerpHex("#3a4a7a", "#e6f0ff", day)); NO.hemi.groundColor.set("#" + lerpHex("#24283a", "#8a7a60", day));
    NO.amb.intensity = .15 * night;
    NO.uni.uNight.value = clamp(night * 1.1 + rk * .25, 0, 1); NO.uni.uDay.value = day;
    const sodium = new THREE.Color(0xff9a3c).multiplyScalar(night * .22);
    NO.roadMats.asph.emissive.copy(sodium); NO.roadMats.pave.emissive.copy(sodium).multiplyScalar(.6);
    if (NO.adMat) NO.adMat.emissiveIntensity = night * .55;
    if (NO.waterMat) NO.waterMat.specular.set("#" + lerpHex("#1a2230", "#9fd8ea", day));
    let top = lerpHex("#0b1226", "#b9d5e6", day), bot = lerpHex("#1c2443", "#eef3ee", day);
    if (dusk > 0 && day > 0) { top = lerpHex(top, "#8f86b8", dusk * .8); bot = lerpHex(bot, "#f4bf95", dusk); }
    if (rk > 0) { top = lerpHex(top, "#6f7c86", rk * .7); bot = lerpHex(bot, "#aab4b8", rk * .7); }
    const sky = document.getElementById("sky").style, bg = `linear-gradient(180deg,#${top} 0%,#${bot} 78%)`;
    if (sky.background !== bg) sky.background = bg;
    NO.scene.fog.color.set("#" + bot);
    NO.scene.fog.near = dist * 1.1; NO.scene.fog.far = dist * 3.2 + 250 + NO.camera.position.y * 2;
    const st = NO.LANDMARKS.find(l => l.kind === "stadium"); if (st && st.obj) st.obj.traverse(o => { if (o.userData.lamp) o.material.emissiveIntensity = night; });
    L.trucksOn = night > .5;
  }
  L.applyTime = applyTime;

  // ── per-frame
  let squishT = 0, pedVisible = true; L._lodN = 0;
  L.adjust = () => { squishT = 3.2; };
  L.update = function (dt, t) {
    dt = Math.min(dt, .05);
    NO.uni.uTime.value = t;
    const h = L.hours(), peak = (h > 8.5 && h < 11) || (h > 17 && h < 21), kon = L.konami;
    const tg = NO.controls.target, camD = NO.camera.position.distanceTo(tg);
    const vehVisible = camD < 340; pedVisible = camD < 170;
    const Rv = clamp(camD * .9, 18, 140), Rp = clamp(camD * .7, 10, 55);
    refreshNear(tg.x, tg.z, Rv);
    // vehicles
    for (const ty of L.types) {
      ty.mesh.visible = vehVisible && !(ty.night && !L.trucksOn);
      if (!ty.mesh.visible) continue;
      const arr = ty.mesh.instanceMatrix.array;
      for (const a of ty.list) {
        if (Math.abs(a.wx - tg.x) > Rv * 1.3 || Math.abs(a.wz - tg.z) > Rv * 1.3) { respawn(a, near.veh, ty.max); sample(a.P, a.d, a); a.wx = a.x; a.wz = a.z; }
        let target = a.vmax;
        if (!kon) {
          const jf = jamAt(a.wx, a.wz); target *= peak ? jf : Math.sqrt(jf);
          const rem = a.dir > 0 ? a.P.len - a.d : a.d;
          if (rem < a.stopD) { const j = junctions.get(a.dir > 0 ? a.P.ek : a.P.sk); if (j) { const axis = Math.abs(a.whx) > Math.abs(a.whz) ? 0 : 1; if ((Math.floor((t + j.off) / 9) % 2) !== axis) target = 0; } }
          if (a.P.cls === 4) target *= .6;
        } else target *= 2.6;
        a.v += (target - a.v) * Math.min(1, dt * 2.5);
        a.d += a.dir * a.v * dt;
        if (a.d > a.P.len || a.d < 0) nextPath(a, ty.max);
        sample(a.P, clamp(a.d, 0, a.P.len), a);
        const hx = a.hx * a.dir, hz = a.hz * a.dir, lane = a.P.cls === 4 ? a.lane * .5 : a.lane;
        a.wx = a.x + hz * lane; a.wz = a.z - hx * lane; a.whx = hx; a.whz = hz;
        a.y = a.P.elev ? .3 : 0;
        setM(arr, a.idx, a.wx, a.y, a.wz, Math.atan2(-hz, hx));
      }
      ty.mesh.instanceMatrix.needsUpdate = true;
    }
    // walkers (people & trotting dogs)
    meshes.people.forEach(m => m.visible = pedVisible); meshes.dog.visible = camD < 220; meshes.cow.visible = camD < 260;
    if (pedVisible) {
      const umb = meshes.umb.instanceMatrix.array, showU = meshes.umb.visible;
      walkers.forEach((w, wi) => {
        if (!w.P || Math.abs(w.wx - tg.x) > Rp * 1.3 || Math.abs(w.wz - tg.z) > Rp * 1.3 || isNaN(w.wx)) { respawn(w, near.ped, 4); }
        w.d += w.dir * w.v * dt;
        if (w.d > w.P.len || w.d < 0) nextPath(w, 4);
        sample(w.P, clamp(w.d, 0, w.P.len), w);
        const hx = w.hx * w.dir, hz = w.hz * w.dir, lane = w.P.cls === 4 ? w.lane * .6 : w.lane;
        w.wx = w.x + hz * lane; w.wz = w.z - hx * lane;
        const y = w.P.elev ? .3 : 0;
        setM(w.mesh.instanceMatrix.array, w.idx, w.wx, y, w.wz, Math.atan2(-hz, hx), w.dog ? .9 : 1);
        if (!w.dog) { w.mesh.userData.move.array[w.idx] = 1; if (showU && wi % 2 === 0) setM(umb, wi, w.wx, y, w.wz, 0); else hideM(umb, wi); }
      });
      if (showU) meshes.umb.instanceMatrix.needsUpdate = true;
      for (const w of wanderers) {
        if (w.pause > 0) w.pause -= dt;
        else {
          w.h += (rand() - .5) * dt * 2;
          const dx = w.x - w.cx, dz = w.z - w.cz; if (dx * dx + dz * dz > w.R * w.R) w.h = Math.atan2(-dz, -dx) + (rand() - .5);
          w.x += Math.cos(w.h) * w.v * dt; w.z += Math.sin(w.h) * w.v * dt;
          if (rand() < dt * .08) w.pause = 1 + rand() * 4;
        }
        w.mesh.userData.move.array[w.idx] = w.pause > 0 ? 0 : 1;
        setM(w.mesh.instanceMatrix.array, w.idx, w.x, 0, w.z, -w.h);
      }
      meshes.people.forEach(m => { m.instanceMatrix.needsUpdate = true; m.userData.move.needsUpdate = true; });
      meshes.dog.instanceMatrix.needsUpdate = true;
    }
    if (meshes.cow.visible) { const ca = meshes.cow.instanceMatrix.array; L.cows.forEach((c, k) => { c.t += dt; if (c.t > 8) { c.t = rand() * 4; c.rot += (rand() - .5) * .8; } setM(ca, k, c.x, 0, c.z, c.rot); }); meshes.cow.instanceMatrix.needsUpdate = true; }
    // metro
    for (const tr of L.trains) {
      const ln = tr.line;
      if (tr.dwell > 0) tr.dwell -= dt;
      else {
        const prev = tr.d; tr.d += tr.dir * tr.v * (kon ? 2 : 1) * dt;
        for (const s of ln.stops) if ((prev - s) * (tr.d - s) < 0) { tr.d = s; tr.dwell = 1.6; break; }
        if (tr.d > ln.len - .01 || tr.d < .01) { tr.dir *= -1; tr.d = clamp(tr.d, .01, ln.len - .01); tr.dwell = 3; }
      }
      const arr = tr.m.instanceMatrix.array;
      for (let c = 0; c < tr.cars; c++) {
        const p = lineAt(ln, clamp(tr.d - tr.dir * c * .39, 0, ln.len));
        setM(arr, tr.base + c, p.x, p.ug ? -1.5 : ln.h, p.z, Math.atan2(-p.hz, p.hx));
        if (c === 0) { tr.x = p.x; tr.z = p.z; tr.ug = p.ug; tr.hx = p.hx * tr.dir; tr.hz = p.hz * tr.dir; }
      }
      tr.m.instanceMatrix.needsUpdate = true;
    }
    // planes
    for (const p of L.planes) {
      p.t += dt; const u = p.t / p.dur; if (u >= 1) { resetPlane(p); continue; }
      p.g.position.lerpVectors(p.a, p.b, u);
      const d = (p.dir = p.dir || new THREE.Vector3()).subVectors(p.b, p.a).normalize();
      p.g.rotation.set(0, Math.atan2(-d.z, d.x), 0); p.g.rotateZ(Math.asin(d.y));
      const on = (t * 1.2) % 1 < .15; p.blink.forEach(b => b.visible = on);
    }
    // clouds
    if (NO.cloudMesh) { const a = NO.cloudMesh.instanceMatrix.array; NO.clouds.forEach((c, k) => { c.x += dt * .9; if (c.x > NO.GW * .7) c.x = -NO.GW * .7; setM(a, k, c.x, c.y, c.z, c.r, c.s); }); NO.cloudMesh.instanceMatrix.needsUpdate = true; NO.cloudMesh.material.opacity = .92 * (.35 + .65 * L.light.day); }
    // coffee steam at the darshinis
    if (camD < 120 && rand() < dt * 3) NO.LANDMARKS.forEach(l => { if (l.kind === "darshini" && l.w) L.burst(l.w.x + (rand() - .5) * .2, .32, l.w.z, ["#ffffff", "#efe9df"], 1, .18, -.12, 2.2, .3); });
    // swalpa adjust maadi
    if (squishT > 0) {
      squishT = Math.max(0, squishT - dt); const f = 1 - .45 * Math.sin((3.2 - squishT) / 3.2 * Math.PI);
      NO.buildingMeshes.forEach(m => { const a = m.instanceMatrix.array, b = m.userData.base; for (let q = 0; q < a.length; q += 16) { a[q] = b[q] * f; a[q + 2] = b[q + 2] * f; a[q + 8] = b[q + 8] * f; a[q + 10] = b[q + 10] * f; } m.instanceMatrix.needsUpdate = true; });
    }
    // small things vanish and shadows switch off when the whole city is in view
    const far = camD > 300; if (far !== L._far) { L._far = far; (NO.smallMeshes || []).forEach(m => m.visible = !far); if (NO.lampMesh) NO.lampMesh.visible = !far || L.light.night > .5; }
    // level of detail: street-level houses and crisp roads only near the camera; far away the painted ground takes over
    if (++L._lodN % 6 === 0 || !L._lodN) {
      const hr = Math.min(LOW ? 58 : NO.TIER === "mid" ? 115 : 160, camD * 2.4 + 34), rr = Math.min(LOW ? 85 : 190, camD * 3 + 50);
      NO.lod.house.forEach(c => c.m.visible = camD < 260 && Math.hypot(c.x - tg.x, c.z - tg.z) - c.r < hr);
      NO.lod.road.forEach(c => c.m.visible = camD < 330 && Math.hypot(c.x - tg.x, c.z - tg.z) - c.r < rr);
      const tr = LOW ? Math.min(95, camD * 2.6 + 40) : 1e9, tfar = LOW ? 250 : 1e9;
      NO.lod.tree.forEach(c => c.m.visible = camD < tfar && Math.hypot(c.x - tg.x, c.z - tg.z) - c.r < tr);
    }
    if (NO.TIER === "high") { if (NO.sun.castShadow && camD > 215) NO.sun.castShadow = false; else if (!NO.sun.castShadow && camD < 185 && !L.noShadow) NO.sun.castShadow = true; }
    updParticles(dt); updFoam(t, dt); updRocket(dt); updRain(dt);
    applyTime(h);
  };

  function lineAt(ln, d) {
    let lo = 0, hi = ln.cum.length - 1; while (lo < hi - 1) { const m = (lo + hi) >> 1; if (ln.cum[m] <= d) lo = m; else hi = m; }
    const a = ln.pts[lo], b = ln.pts[hi], L2 = (ln.cum[hi] - ln.cum[lo]) || 1e-6, u = clamp((d - ln.cum[lo]) / L2, 0, 1);
    return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, hx: (b.x - a.x) / L2, hz: (b.z - a.z) / L2, ug: u < .5 ? a.ug : b.ug };
  }
  L.lineAt = lineAt;
})();
