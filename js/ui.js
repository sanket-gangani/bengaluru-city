// Namma Ooru — interface: views, search, filters, cards, Easter eggs, network, ride-along, intro.
(async function () {
  const NO = window.NO, $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  document.body.classList.add("intro");

  // ── loading
  let li = 0; const lt = setInterval(() => { $("progTxt").textContent = NO.LOADING[li++ % NO.LOADING.length]; }, 900);
  $("progTxt").textContent = NO.LOADING[0];
  try {
    await NO.buildWorld((n) => { $("progN").textContent = Math.round(n); $("progBar").style.width = n + "%"; });
    NO.life.init();
  } catch (err) {
    clearInterval(lt); console.error(err); window.__log && window.__log("build failed " + (err && (err.stack || err.message)));
    $("progTxt").textContent = "The city didn't load: " + err.message + ". Try a browser with WebGL enabled.";
    return;
  }
  clearInterval(lt); window.__log && window.__log("built " + JSON.stringify(NO.stats) + " prebuilt=" + NO.prebuilt + " tier=" + NO.TIER);
  $("progN").textContent = 100; $("progBar").style.width = "100%";
  const L = NO.life, cam = NO.camera, ctl = NO.controls;
  const V3 = THREE.Vector3;

  // ── lookups
  const ORG = Object.fromEntries(NO.ORGS.map(o => [o.id, o]));
  const CAT = NO.catInfo;
  const groupOf = {}; NO.GROUPS.forEach(g => g.cats.forEach(c => groupOf[c.id] = g.id));
  const backs = {}; NO.ORGS.forEach(o => (o.backers || []).forEach(b => (backs[b] = backs[b] || []).push(o.id)));
  const areaOrgs = {}; NO.ORGS.forEach(o => { if (o.prec !== "none" && o.area) (areaOrgs[o.area] = areaOrgs[o.area] || []).push(o.id); });
  const LM = Object.fromEntries(NO.LANDMARKS.map(l => [l.id, l]));
  const nearestArea = (x, z) => { let best = null, bd = 1e9; for (const k in NO.AREAS) { const a = NO.AREAS[k], w = NO.ll2w(a.lat, a.lon), d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; best = k; } } return { id: best, d: bd }; };

  // ── camera tweening (spherical, around the target)
  let tween = null, ride = null, view = "3d";
  const sph = () => { const o = new V3().subVectors(cam.position, ctl.target), r = o.length(); return { r, polar: Math.acos(clamp(o.y / r, -1, 1)), az: Math.atan2(o.x, o.z) }; };
  function flyTo(target, r, polar, az, dur = 1.6) {
    const s = sph(); if (az === undefined) az = s.az; if (polar === undefined) polar = s.polar;
    let da = az - s.az; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    tween = { t: 0, dur, from: { tg: ctl.target.clone(), ...s }, to: { tg: target.clone(), r, polar, az: s.az + da } };
  }
  function stepTween(dt) {
    if (!tween) return; tween.t += dt; const u = clamp(tween.t / tween.dur, 0, 1), e = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    const f = tween.from, t = tween.to, r = Math.exp(Math.log(f.r) + (Math.log(t.r) - Math.log(f.r)) * e), p = f.polar + (t.polar - f.polar) * e, a = f.az + (t.az - f.az) * e;
    ctl.target.lerpVectors(f.tg, t.tg, e);
    cam.position.set(ctl.target.x + r * Math.sin(p) * Math.sin(a), ctl.target.y + r * Math.cos(p), ctl.target.z + r * Math.sin(p) * Math.cos(a));
    cam.lookAt(ctl.target);
    if (u >= 1) { const done = tween.done; tween = null; done && done(); }
  }
  const HOME = { tg: new V3(-25, 0, 5), r: 430, polar: .86, az: .3 };

  // ── toasts
  function toast({ eyebrow, title, body, egg, ms = 6000 }) {
    const el = document.createElement("div"); el.className = "panel toast" + (egg ? " egg" : "");
    el.innerHTML = (eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : "") + `<div class="t">${esc(title)}</div>` + (body ? `<div class="b">${esc(body)}</div>` : "");
    const box = $("toasts"); box.appendChild(el); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, ms);
  }

  // ── Easter eggs
  const EGG_IDS = Object.keys(NO.EGGS);
  const HINTS = {
    silkboard: "The junction everyone plans their day around", foam: "A lake that looks like it snowed", cup: "Where the 12th Man Army gathers",
    rocket: "New BEL Road has a launch pad?", auto: "Hail a green-and-yellow ride", cow: "Someone's sitting in the middle of the road",
    rain: "Wait for 4 pm, or ask about the weather", konami: "An old cheat code still works here", soudha: "The big granite building near Cubbon Park",
    coffee: "Lalbagh Road, since 1924", dosa: "Basavanagudi breakfast", adjust: "Type the city's motto", startup: "Knock on a building in Koramangala",
    plane: "Catch a flight to KIA", nandi: "The big bull in Basavanagudi", flowers: "A glass house full of flowers", metro: "Purple, green or yellow", dog: "Say hi to a street dog",
  };
  let found = new Set();
  try { found = new Set(JSON.parse(localStorage.getItem("no-eggs") || "[]")); } catch (e) { }
  $("eggTotal").textContent = EGG_IDS.length;
  const refreshEggs = () => { $("eggCount").textContent = [...found].filter(k => NO.EGGS[k]).length; if (!$("eggPop").hidden) renderEggPop(); };
  refreshEggs();
  function egg(id, title, body) {
    const first = !found.has(id);
    if (first) {
      found.add(id); try { localStorage.setItem("no-eggs", JSON.stringify([...found])); } catch (e) { } refreshEggs();
      // Pageviews say how many people opened the map; this says which Easter eggs they actually find.
      if (window.track) window.track("egg", { id });
    }
    toast({ eyebrow: first ? `Easter egg ${found.size} / ${EGG_IDS.length}` : NO.EGGS[id], title, body, egg: first });
  }
  function renderEggPop() {
    const n = [...found].filter(k => NO.EGGS[k]).length;
    $("eggPop").innerHTML = `<h3>Easter eggs</h3><div class="eyebrow">${n} of ${EGG_IDS.length} found</div><ul>` +
      EGG_IDS.map(k => found.has(k)
        ? `<li class="found"><svg width="11" height="14" viewBox="0 0 11 14"><path d="M5.5 0C2.6 0 0 4.6 0 8.2 0 11.4 2.4 14 5.5 14S11 11.4 11 8.2C11 4.6 8.4 0 5.5 0z" fill="#f2c230"/></svg><div><div class="n">${esc(NO.EGGS[k])}</div><div class="h">${esc(HINTS[k])}</div></div></li>`
        : `<li><svg width="11" height="14" viewBox="0 0 11 14"><path d="M5.5 0C2.6 0 0 4.6 0 8.2 0 11.4 2.4 14 5.5 14S11 11.4 11 8.2C11 4.6 8.4 0 5.5 0z" fill="none" stroke="currentColor" opacity=".35"/></svg><div><div class="n">???</div><div class="h">${esc(HINTS[k])}</div></div></li>`).join("") +
      `</ul><button class="pill" id="eggReset" style="margin-top:12px">Reset progress</button>`;
    $("eggReset").onclick = () => { found.clear(); try { localStorage.removeItem("no-eggs"); } catch (e) { } refreshEggs(); };
  }
  $("eggChip").onclick = () => { const p = $("eggPop"); p.hidden = !p.hidden; $("eggChip").setAttribute("aria-expanded", String(!p.hidden)); if (!p.hidden) renderEggPop(); };

  // honk (sound only ever starts from a click)
  let actx;
  function honk() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [0, .18].forEach(d => { const o = actx.createOscillator(), g = actx.createGain(); o.type = "square"; o.frequency.value = 520; g.gain.setValueAtTime(0, actx.currentTime + d); g.gain.linearRampToValueAtTime(.05, actx.currentTime + d + .01); g.gain.linearRampToValueAtTime(0, actx.currentTime + d + .12); o.connect(g).connect(actx.destination); o.start(actx.currentTime + d); o.stop(actx.currentTime + d + .14); });
    } catch (e) { }
  }

  const eggActions = {
    silkboard() { const l = LM.silkboard; selectLandmark(l); },
    foam() { L.foamUp(); egg("foam", "Yes, that's foam. No, it isn't snow.", "Untreated sewage whipped up by the outflow. The lake has had a long clean-up since the 2015 fire."); },
    cup() {
      const w = LM.stadium.w; const C = ["#d1172b", "#f2c230", "#ffffff", "#d1172b", "#1a1a1a"];
      for (let k = 0; k < 7; k++) setTimeout(() => L.burst(w.x + (Math.random() - .5) * 3, 3.5 + Math.random() * 2, w.z + (Math.random() - .5) * 3, C, 180, 2.2, 1.4, 2.6), k * 380);
      egg("cup", "Ee Sala Cup Namde!", "“This year the cup is ours”, said every season from 2008. In 2025 it finally was.");
    },
    rocket() { L.launch(); egg("rocket", "Liftoff from Antariksh Bhavan", "Real launches happen at Sriharikota. ISRO HQ just watches, and this one's for fun."); },
    auto() { honk(); egg("auto", NO.AUTO_LINES[Math.floor(Math.random() * NO.AUTO_LINES.length)], "Tip: \"Meter haaki\" means \"please put the meter on\"."); },
    cow() { egg("cow", "The cow has right of way.", "Traffic will adjust. Traffic always adjusts."); },
    dog() { egg("dog", "Street dog union, in session.", "They've held this corner since before the flyover. Please take the other lane."); },
    rain() { L.raining = true; clearTimeout(eggActions._rt); eggActions._rt = setTimeout(() => { if (!rainAuto()) L.raining = false; }, 45000); egg("rain", "4 pm, right on cue.", "Pleasant weather all year, and a surprise shower most afternoons. Carry an umbrella and a light jacket."); },
    konami() { L.konami = true; egg("konami", "Zero-traffic mode unlocked", "Every signal green. ORR empty. Silk Board flowing…"); setTimeout(() => { L.konami = false; toast({ eyebrow: "Zero-traffic dream", title: "…and then you wake up.", body: "Still at Silk Board." }); }, 22000); },
    soudha() { egg("soudha", "ಸರ್ಕಾರದ ಕೆಲಸ ದೇವರ ಕೆಲಸ", "Sarkarada kelasa devara kelasa: Government's work is God's work, carved above the entrance."); },
    coffee() { const w = LM.mtr.w; L.burst(w.x, .4, w.z, ["#ffffff", "#f3eadb"], 90, .5, -.25, 3, .6); egg("coffee", "One by-two coffee, please.", "One filter coffee split into two tumblers. The most Bengaluru way to pause a meeting."); },
    dosa() { egg("dosa", "Sixteen plates, one arm.", "Order the masale dose. In Kannada it's dose, not dosa."); },
    adjust() { L.adjust(); egg("adjust", "ಸ್ವಲ್ಪ ಅಡ್ಜಸ್ಟ್ ಮಾಡಿ", "Swalpa adjust maadi: please adjust a little. The whole city just did."); },
    startup() { egg("startup", "Third floor, above a café.", "Four founders, one pitch deck, zero revenue, unlimited filter coffee. Raising a pre-seed round."); },
    plane() { egg("plane", "Now landing at Kempegowda International.", "The flight took two hours. The cab to Koramangala will take about as long."); },
    nandi() { const w = LM.bulltemple.w; L.burst(w.x, .8, w.z, ["#b07a3c", "#c79552", "#8a5a2b"], 140, 1.3, 2.5, 2); egg("nandi", "Kadalekai Parishe", "Every November, farmers bring their first groundnut harvest to the Bull Temple fair."); },
    flowers() { const w = LM.glasshouse.w; L.burst(w.x, 1, w.z, ["#f29bc0", "#f2c230", "#e0452b", "#ffffff", "#8a6fd1"], 220, 1.4, .9, 3); egg("flowers", "Lalbagh Flower Show", "Twice a year, for Republic Day and Independence Day, the Glass House fills with a floral replica of a landmark."); },
    metro(line) { egg("metro", `Namma Metro · ${line || "Purple"} line`, "Please stand behind the yellow line. Doors are closing."); },
  };

  // logo badge as an image (drawn from the same atlas the 3D badges use)
  const badgeCache = {};
  function badgeURL(id) {
    if (badgeCache[id]) return badgeCache[id];
    const k = NO.badgeSlot[id]; if (k === undefined || !NO.badgeAtlas) return "";
    const c = document.createElement("canvas"); c.width = c.height = 128; const S = NO.badgeCell.size;
    c.getContext("2d").drawImage(NO.badgeAtlas, (k % NO.badgeCell.cols) * S, Math.floor(k / NO.badgeCell.cols) * S, S, S, 0, 0, 128, 128);
    return badgeCache[id] = c.toDataURL();
  }

  // ── cards
  const card = $("card"), hint = $("hint");
  let sbTimer = null, selected = null;
  function showCard(html) { card.innerHTML = html; card.hidden = false; hint.hidden = true; card.scrollTop = 0; const x = card.querySelector(".x"); if (x) x.onclick = closeCard; card.querySelectorAll("[data-org]").forEach(b => b.onclick = () => selectOrg(ORG[b.dataset.org])); card.querySelectorAll("[data-net]").forEach(b => b.onclick = () => openNet(b.dataset.net)); }
  function closeCard() { card.hidden = true; hint.hidden = false; clearInterval(sbTimer); highlight(null); }
  const pills = ids => ids.map(id => ORG[id]).filter(Boolean).map(o => `<button class="pill" data-org="${o.id}"><img src="${badgeURL(o.id)}" alt="" width="16" height="16">${esc(o.name)}</button>`).join("");
  const precNote = o => o.prec === "area" ? `Placed in ${esc(NO.AREAS[o.area] ? NO.AREAS[o.area].name : "its area")} at neighbourhood level.` :
    o.prec === "city" ? `Bengaluru-based. The office isn't pinned, so it's placed approximately in ${esc(NO.AREAS[o.area] ? NO.AREAS[o.area].name : "the city")}.` : "Not on the board. This investor is based outside Bengaluru and appears in the Network view.";

  function selectOrg(o, fly = true) {
    if (!o) return;
    const c = CAT[o.cat], area = NO.AREAS[o.area];
    const meta = [c.label, area && o.prec !== "none" ? area.name : null, o.year ? "Est. " + o.year : null].filter(Boolean).join(" · ");
    const bk = o.backers || [], by = backs[o.id] || [];
    showCard(`<div class="top"><img class="logo" src="${badgeURL(o.id)}" alt="" width="46" height="46"><div style="flex:1"><div class="eyebrow" style="color:${c.color}">${esc(meta)}</div><h2>${esc(o.name)}</h2></div><button class="x" aria-label="Close">✕</button></div>
      <p class="blurb">${esc(o.blurb || "")}</p>
      ${groupOf[o.cat] === "companies" ? `<div class="eyebrow" style="margin-top:12px">Backed by</div><div class="backers">${bk.length ? pills(bk) : `<span class="pill" style="cursor:default">No outside investors recorded here</span>`}</div>` : ""}
      ${by.length ? `<div class="eyebrow" style="margin-top:12px">Backed</div><div class="backers">${pills(by)}</div>` : ""}
      ${(bk.length || by.length) ? `<div class="backers"><button class="pill" data-net="${o.id}">Trace in network →</button></div>` : ""}
      <div class="note">${precNote(o)}</div>`);
    highlight(o.id);
    const w = NO.orgPos[o.id];
    if (fly && w && view !== "net") { stopRide(); flyTo(new V3(w.x, 0, w.z), 16, view === "plan" ? .001 : .95); }
  }
  function selectLandmark(l) {
    const a = nearestArea(l.w.x, l.w.z);
    let extra = "";
    if (l.id === "silkboard") {
      extra = `<div class="note">You've been waiting at Silk Board for <b id="sbT">0:00</b>. Estimated time to Koramangala: yes.</div>`;
    }
    showCard(`<div class="top"><div><div class="eyebrow">Landmark · ${esc(NO.AREAS[a.id].name)}</div><h2>${esc(l.name)}</h2></div><button class="x" aria-label="Close">✕</button></div><p class="blurb">${esc(l.text)}</p>${extra}`);
    clearInterval(sbTimer);
    if (l.id === "silkboard") { const t0 = Date.now(); sbTimer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000), el = $("sbT"); if (el) el.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }, 1000); egg("silkboard", "Welcome to Silk Board.", "Two flyovers, one metro line, and still the city's most famous traffic jam."); }
    if (l.egg && l.egg !== "silkboard" && eggActions[l.egg]) eggActions[l.egg]();
    if (view !== "net") { stopRide(); flyTo(new V3(l.w.x, 0, l.w.z), l.id === "bellandur" ? 40 : 14, view === "plan" ? .001 : .9); }
  }
  function selectArea(id) {
    const a = NO.AREAS[id], ids = areaOrgs[id] || [], w = NO.ll2w(a.lat, a.lon);
    showCard(`<div class="top"><div><div class="eyebrow">Neighbourhood</div><h2>${esc(a.name)}</h2></div><button class="x" aria-label="Close">✕</button></div>
      <p class="blurb">${ids.length ? `${ids.length} organisation${ids.length > 1 ? "s" : ""} on the map here.` : "No organisations mapped here yet."}</p><div class="backers">${pills(ids)}</div>`);
    if (view !== "net") { stopRide(); flyTo(new V3(w.x, 0, w.z), view === "plan" ? 90 : 45, view === "plan" ? .001 : .9); }
  }
  function info(eyebrow, title, text) { showCard(`<div class="top"><div><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2></div><button class="x" aria-label="Close">✕</button></div><p class="blurb">${esc(text)}</p>`); }

  // ── filters
  const catOn = {}; NO.GROUPS.forEach(g => g.cats.forEach(c => catOn[c.id] = true));
  const catCount = {}; NO.ORGS.forEach(o => catCount[o.cat] = (catCount[o.cat] || 0) + 1);
  const maxC = Math.max(...Object.values(catCount));
  function renderFilters() {
    const prec = { area: 0, city: 0, none: 0 }; NO.ORGS.forEach(o => prec[o.prec]++);
    $("filters").innerHTML = `<div class="head eyebrow" style="padding-top:8px">Filter the map</div>` + NO.GROUPS.map(g => {
      const tot = g.cats.reduce((s, c) => s + (catCount[c.id] || 0), 0);
      return `<div class="grp eyebrow"><span>${esc(g.label)}</span><span>${tot}</span></div>` + g.cats.map(c =>
        `<button class="frow" data-cat="${c.id}" aria-pressed="${catOn[c.id]}"><i style="background:${c.color}"></i><span class="lab">${esc(c.label)}</span><span class="bar"><span style="width:${(catCount[c.id] || 0) / maxC * 100}%;background:${c.color}"></span></span><span class="c">${catCount[c.id] || 0}</span></button>`).join("");
    }).join("") + `<div class="fsum">${prec.area} placed by area · ${prec.city} approximate · ${prec.none} network only</div>`;
    $("filters").querySelectorAll(".frow").forEach(b => b.onclick = () => { catOn[b.dataset.cat] = !catOn[b.dataset.cat]; b.setAttribute("aria-pressed", catOn[b.dataset.cat]); applyFilter(); });
  }
  function applyFilter() {
    const d = new THREE.Object3D();
    NO.markers.forEach((m, k) => { m.visible = catOn[m.org.cat]; d.position.set(m.base.x, m.top, m.base.z); d.scale.set(.03, m.visible ? .75 : 0, .03); d.updateMatrix(); NO.stemMesh.setMatrixAt(k, d.matrix); });
    NO.stemMesh.instanceMatrix.needsUpdate = true; if (view === "plan") buildLabels();
  }
  renderFilters();
  $("filterToggle").onclick = () => { const s = $("side"); s.classList.toggle("open"); $("filterToggle").setAttribute("aria-expanded", s.classList.contains("open")); };

  // ── search
  const KEYWORDS = [
    { kw: ["traffic", "jam", "silk board", "silkboard"], label: "Traffic", sub: "Take me to the jam", go: () => selectLandmark(LM.silkboard) },
    { kw: ["rain", "weather", "4pm", "4 pm", "umbrella"], label: "Weather", sub: "What's it like right now?", go: () => eggActions.rain() },
    { kw: ["coffee", "kaapi", "filter coffee", "by two", "by-two"], label: "Filter coffee", sub: "MTR, Lalbagh Road", go: () => selectLandmark(LM.mtr) },
    { kw: ["dosa", "dose", "breakfast"], label: "Dosa", sub: "Vidyarthi Bhavan", go: () => selectLandmark(LM.vb) },
    { kw: ["rcb", "cup", "cricket", "ee sala"], label: "Ee Sala Cup Namde", sub: "Chinnaswamy Stadium", go: () => selectLandmark(LM.stadium) },
    { kw: ["isro", "rocket", "chandrayaan", "space"], label: "ISRO", sub: "Antariksh Bhavan", go: () => selectLandmark(LM.isro) },
    { kw: ["foam", "snow"], label: "Foam", sub: "Bellandur Lake", go: () => selectLandmark(LM.bellandur) },
    { kw: ["adjust", "swalpa"], label: "Swalpa adjust maadi", sub: "The city motto", go: () => eggActions.adjust() },
    { kw: ["auto", "rickshaw", "meter"], label: "Hail an auto", sub: "Ride along at street level", go: () => startRide("auto") },
    { kw: ["metro", "namma metro", "purple line", "green line", "yellow line"], label: "Ride Namma Metro", sub: "Street-level ride along", go: () => startRide("metro") },
    { kw: ["plane", "airport", "kia", "flight", "fly"], label: "Fly in to KIA", sub: "Follow a plane", go: () => startRide("plane") },
    { kw: ["kannada", "maga", "guru", "namaskara"], label: "Learn a Kannada phrase", sub: "One phrase at a time", go: () => nextPhrase(true) },
    { kw: ["pub", "beer", "brewery"], label: "Pub city", sub: "Indiranagar & Church Street", go: () => { selectArea("indiranagar"); info("Nickname", "India's pub capital", "Brewpubs cluster on Indiranagar's 100 Feet Road and around Church Street. Last orders come early, so start early."); } },
    { kw: ["startup", "founder", "pitch"], label: "Startup central", sub: "Koramangala", go: () => { selectArea("koramangala"); eggActions.startup(); } },
  ];
  const index = [];
  NO.ORGS.forEach(o => index.push({ label: o.name, sub: `${CAT[o.cat].label} · ${o.prec === "none" ? "Network only" : (NO.AREAS[o.area] || {}).name || "Bengaluru"}`, go: () => o.prec === "none" ? openNet(o.id) : selectOrg(o) }));
  Object.entries(NO.AREAS).forEach(([id, a]) => index.push({ label: a.name, sub: `Neighbourhood · ${(areaOrgs[id] || []).length} organisations`, go: () => selectArea(id) }));
  NO.LANDMARKS.forEach(l => index.push({ label: l.name, sub: "Landmark", go: () => selectLandmark(l) }));
  const nameCase = s => s.replace(/\b\w/g, c => c.toUpperCase());
  NO.WORLD.lakes.forEach(([n, x, z]) => index.push({ label: nameCase(n), sub: "Lake", go: () => { stopRide(); flyTo(new V3(x - NO.GW / 2, 0, z - NO.GH / 2), 30, view === "plan" ? .001 : .9); info("Lake", nameCase(n), "One of the hundreds of tanks (kere) built over centuries to catch the monsoon. Bengaluru's lakes are linked by storm-water channels called rajakaluves."); } }));
  NO.WORLD.parks.forEach(([n, x, z]) => index.push({ label: n, sub: "Park", go: () => { stopRide(); flyTo(new V3(x - NO.GW / 2, 0, z - NO.GH / 2), 30, view === "plan" ? .001 : .9); info("Park", n, "The Garden City keeps its green in parks like this one, and in the rain trees lining its older roads."); } }));
  let sel = -1, res = [];
  function search(q) {
    q = q.trim().toLowerCase(); $("qClear").hidden = !q;
    if (!q) { $("results").hidden = true; return; }
    const kw = KEYWORDS.filter(k => k.kw.some(w => w.startsWith(q) || q.startsWith(w)));
    const hits = index.map(it => { const l = it.label.toLowerCase(); const s = l.startsWith(q) ? 0 : l.includes(q) ? 1 : it.sub.toLowerCase().includes(q) ? 2 : 9; return [s, it]; }).filter(r => r[0] < 9).sort((a, b) => a[0] - b[0] || a[1].label.localeCompare(b[1].label)).map(r => r[1]);
    res = [...kw.map(k => ({ label: k.label, sub: k.sub, go: k.go })), ...hits].slice(0, 9); sel = res.length ? 0 : -1;
    $("results").innerHTML = res.length ? res.map((r, i) => `<button role="option" aria-selected="${i === sel}" data-i="${i}"><div class="n">${esc(r.label)}</div><div class="s">${esc(r.sub)}</div></button>`).join("") : `<div class="hint">Nothing called that here. Try "Koramangala" or "coffee".</div>`;
    $("results").hidden = false;
    $("results").querySelectorAll("button").forEach(b => b.onclick = () => choose(+b.dataset.i));
  }
  function choose(i) { const r = res[i]; if (!r) return; $("results").hidden = true; $("q").blur(); r.go(); }
  $("q").addEventListener("input", e => search(e.target.value));
  $("q").addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!res.length) return; sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + res.length) % res.length; $("results").querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-selected", i === sel)); }
    else if (e.key === "Enter") { choose(Math.max(0, sel)); }
    else if (e.key === "Escape") { $("results").hidden = true; }
  });
  $("q").addEventListener("focus", e => e.target.value && search(e.target.value));
  $("qClear").onclick = () => { $("q").value = ""; search(""); $("q").focus(); };
  document.addEventListener("pointerdown", e => { if (!e.target.closest(".search")) $("results").hidden = true; if (!e.target.closest("#eggPop,#eggChip")) { $("eggPop").hidden = true; $("eggChip").setAttribute("aria-expanded", "false"); } });

  // ── Kannada, one phrase at a time
  let ph = Math.floor(Date.now() / 86400000) % NO.KANNADA.length;
  function renderPhrase() { const [kn, tr, en] = NO.KANNADA[ph]; $("kannada").innerHTML = `<div class="row"><span class="eyebrow">Learn Kannada · ${ph + 1}/${NO.KANNADA.length}</span><button id="phNext">Next</button></div><div class="kn">${esc(kn)}</div><div class="tr">${esc(tr)}</div><div class="en">${esc(en)}</div>`; $("phNext").onclick = () => nextPhrase(); }
  function nextPhrase(toast_) { ph = (ph + 1) % NO.KANNADA.length; renderPhrase(); if (toast_) { const [kn, tr, en] = NO.KANNADA[ph]; toast({ eyebrow: "Learn Kannada", title: `${kn} · ${tr}`, body: en }); } }
  renderPhrase();

  // ── clock
  const MODES = ["live", "day", "dusk", "night"], MODE_LBL = { live: "", day: " · Day", dusk: " · Dusk", night: " · Night" };
  function renderClock() {
    const h = L.hours(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    $("clockTxt").textContent = (L.timeMode === "live" ? "IST " : "") + String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + MODE_LBL[L.timeMode] + (L.raining ? " · Rain" : "");
    $("clockDot").style.background = L.light.day > .5 ? "#f2c230" : "#8fa6d8";
  }
  $("clockChip").onclick = () => { L.timeMode = MODES[(MODES.indexOf(L.timeMode) + 1) % MODES.length]; renderClock(); };
  setInterval(renderClock, 10000);
  let rainAutoShown = false;
  function rainAuto() { const h = L.istHours(); return h >= 16 && h < 17; }

  // ── views
  const labels = $("labels"); let labelEls = [];
  function buildLabels() {
    labels.innerHTML = ""; labelEls = [];
    Object.entries(NO.AREAS).forEach(([id, a]) => {
      const n = (areaOrgs[id] || []).filter(k => catOn[ORG[k].cat]).length;
      const el = document.createElement("button"); el.className = "lbl area" + (n ? " has" : ""); el.innerHTML = `${esc(a.name)}<small>${n} organisation${n === 1 ? "" : "s"}</small>`;
      el.onclick = () => selectArea(id); labels.appendChild(el);
      const w = NO.ll2w(a.lat, a.lon); labelEls.push({ el, p: new V3(w.x, 1, w.z) });
    });
    const taken = Object.values(NO.AREAS).map(a => NO.ll2w(a.lat, a.lon));
    (NO.WORLD.places || []).filter(p => p[3] === 0).slice(0, NO.MOBILE ? 60 : 140).forEach(([n, x, z]) => {
      const wx = x - NO.GW / 2, wz = z - NO.GH / 2; if (taken.some(t => Math.hypot(t.x - wx, t.z - wz) < 9)) return;
      const el = document.createElement("div"); el.className = "lbl place"; el.textContent = n; labels.appendChild(el); labelEls.push({ el, p: new V3(wx, 0, wz), small: true, place: true });
    });
    NO.WORLD.lakes.slice(0, 18).forEach(([n, x, z]) => { const el = document.createElement("div"); el.className = "lbl lake"; el.textContent = nameCase(n); labels.appendChild(el); labelEls.push({ el, p: new V3(x - NO.GW / 2, 0, z - NO.GH / 2), small: true }); });
  }
  const pv = new V3();
  function updateLabels() {
    const w = innerWidth, h = innerHeight, r = cam.position.distanceTo(ctl.target);
    labelEls.forEach(L2 => { pv.copy(L2.p).project(cam); const vis = pv.z < 1 && Math.abs(pv.x) < 1.05 && Math.abs(pv.y) < 1.05 && (!L2.small || r < (L2.place ? 330 : 420)); L2.el.style.display = vis ? "" : "none"; if (vis) L2.el.style.transform = `translate(-50%,-50%) translate(${(pv.x + 1) / 2 * w}px,${(1 - pv.y) / 2 * h}px)`; L2.el.style.left = L2.el.style.top = "0"; });
  }
  function setView(v) {
    if (v === view) return;
    const prev = view; view = v;
    ["3d", "plan", "net"].forEach(k => $("v" + k).setAttribute("aria-pressed", String(k === v)));
    $("net").hidden = v !== "net";
    if (v === "net") { buildNet(); return; }
    stopRide();
    if (v === "plan") { buildLabels(); ctl.maxPolarAngle = .001; ctl.enableRotate = false; flyTo(ctl.target.clone().setY(0), Math.max(120, Math.min(600, sph().r)), .001, 0, 1.4); }
    else { labels.innerHTML = ""; labelEls = []; ctl.enableRotate = true; tween = null; if (prev === "plan") { ctl.maxPolarAngle = 1.3; flyTo(ctl.target.clone(), sph().r, .9, .35, 1.4); } }
  }
  $("v3d").onclick = () => setView("3d"); $("vplan").onclick = () => setView("plan"); $("vnet").onclick = () => setView("net");

  // ── logo badges: constant on-screen size, the selected one grows and bobs
  let hi = null;
  function highlight(id) { hi = id; }
  const BADGE_PX = NO.MOBILE ? 30 : 36;
  const pxPerWorld = () => (2 * Math.tan(cam.fov * Math.PI / 360)) / dom.clientHeight;
  function updateBadges(t) {
    const B = NO.badges; if (!B) return;
    B.mat.uniforms.uPx.value = pxPerWorld() * BADGE_PX; B.mat.uniforms.uMin.value = .35;
    const a = B.scale.array;
    NO.markers.forEach((m, k) => { a[k] = !m.visible ? 0 : m.org.id === hi ? 1.55 + Math.sin(t * 4) * .06 : hoverId === m.org.id ? 1.2 : 1; });
    B.scale.needsUpdate = true;
  }
  // screen-space hit test for badges (they are billboards drawn on top)
  const sp = new V3();
  function badgeAt(cx, cy) {
    const rc = dom.getBoundingClientRect(), per = pxPerWorld(); let best = null, bd = 1e9;
    NO.markers.forEach(m => {
      if (!m.visible) return;
      sp.copy(m.pos).applyMatrix4(cam.matrixWorldInverse); const dist = -sp.z; if (dist <= 0) return;
      const world = Math.max(.35, dist * per * BADGE_PX) * (m.org.id === hi ? 1.55 : 1), px = world / (dist * per);
      sp.copy(m.pos).project(cam);
      const x = rc.left + (sp.x + 1) / 2 * rc.width, y = rc.top + (1 - sp.y) / 2 * rc.height - px / 2;
      const d = Math.hypot(cx - x, cy - y); if (d < px / 2 + 5 && d < bd) { bd = d; best = m; }
    });
    return best;
  }

  // ── picking
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const dom = NO.renderer.domElement;
  function pickables() {
    const list = NO.landmarkObjs.concat(L.planes.map(p => p.g));
    L.types.forEach(t => list.push(t.mesh)); L.trains.forEach(t => { if (!list.includes(t.m)) list.push(t.m); });
    NO.scene.children.forEach(o => { if (o.userData && ["cow", "dog", "person", "foam", "jam", "fruit", "coconut", "flowers", "chai"].includes(o.userData.pick)) list.push(o); });
    return list;
  }
  function hitAt(cx, cy, list) {
    const rc = dom.getBoundingClientRect(); mouse.set((cx - rc.left) / rc.width * 2 - 1, -(cy - rc.top) / rc.height * 2 + 1);
    ray.setFromCamera(mouse, cam); return ray.intersectObjects(list, true)[0];
  }
  function groundAt(cx, cy) { const rc = dom.getBoundingClientRect(); mouse.set((cx - rc.left) / rc.width * 2 - 1, -(cy - rc.top) / rc.height * 2 + 1); ray.setFromCamera(mouse, cam); const p = new V3(); return ray.ray.intersectPlane(new THREE.Plane(new V3(0, 1, 0), 0), p) ? p : null; }
  let down = null;
  dom.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; if (tween && !introOn) tween = null; });
  dom.addEventListener("pointerup", e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || introOn) return; down = null;
    const bm = badgeAt(e.clientX, e.clientY); if (bm) return selectOrg(bm.org);
    const h = hitAt(e.clientX, e.clientY, pickables());
    if (h) {
      let o = h.object;
      while (o && !o.userData.org && !o.userData.landmark && !o.userData.pick && !o.userData.plane) o = o.parent;
      if (o) {
        if (o.userData.org) return selectOrg(o.userData.org);
        if (o.userData.landmark) return selectLandmark(o.userData.landmark);
        if (o.userData.plane) return eggActions.plane();
        const k = o.userData.pick;
        if (k === "auto") return eggActions.auto();
        if (k === "cow" || k === "dog") return eggActions[k]();
        if (k === "train") { eggActions.metro(o.userData.line.ref); return; }
        if (k === "foam") return eggActions.foam();
        if (k === "jam") return selectLandmark(LM.silkboard);
        if (k === "fruit") return toast({ eyebrow: "Fruit cart", title: "Mango season. 100 rupees a dozen, final price.", body: "It is not the final price." });
        if (k === "coconut") return toast({ eyebrow: "Elaneeru", title: "Tender coconut, 50 rupees.", body: "He'll ask if you want the malai. Say houdu." });
        if (k === "flowers") return toast({ eyebrow: "Hoovu", title: "Mallige, a moḷa at a time.", body: "Jasmine is sold by the arm's length here." });
        if (k === "chai") return eggActions.coffee();
        if (k === "person") return toast({ eyebrow: "A fellow Bengalurean", title: ["Late for stand-up.", "Heading for a chai break.", "Looking for an auto that says yes.", "Walking. The Uber was 34 minutes away.", "Off to the flower market.", "Just moved here. Already has opinions on traffic."][Math.floor(Math.random() * 6)] });
        if (k === "car" || k === "bus" || k === "bike" || k === "truck") return toast({ eyebrow: { car: "Car", bus: "BMTC bus", bike: "Two-wheeler", truck: "Night lorry" }[k], title: { car: "Honking at a signal that's already green.", bus: "Standing room only, as always.", bike: "Ten-minute delivery, in theory.", truck: "Out after dark, when lorries are allowed into the city." }[k] });
      }
    }
    const g = groundAt(e.clientX, e.clientY);
    if (g && Math.abs(g.x) < NO.GW / 2 && Math.abs(g.z) < NO.GH / 2) {
      const a = nearestArea(g.x, g.z);
      if (a.id === "koramangala" && a.d < 12) { eggActions.startup(); return; }
      if (NO.isWater(g.x, g.z)) { const lk = NO.WORLD.lakes.map(([n, x, z]) => [n, Math.hypot(x - NO.GW / 2 - g.x, z - NO.GH / 2 - g.z)]).sort((p, q) => p[1] - q[1])[0]; if (lk && lk[1] < 12) return info("Lake", nameCase(lk[0]), "One of Bengaluru's hundreds of kere, the tanks built to catch the monsoon."); }
      if (a.d < 30) selectArea(a.id);
    }
  });
  // hover tooltips
  let lastHover = 0, hoverId = null;
  dom.addEventListener("pointermove", e => {
    if (e.buttons || introOn || performance.now() - lastHover < 70) return; lastHover = performance.now();
    const tip = $("tip");
    const bm = badgeAt(e.clientX, e.clientY);
    hoverId = bm ? bm.org.id : null;
    if (bm) { tip.innerHTML = `${esc(bm.org.name)}<small>${esc(CAT[bm.org.cat].label)}</small>`; tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; tip.hidden = false; dom.style.cursor = "pointer"; return; }
    const h = hitAt(e.clientX, e.clientY, NO.landmarkObjs);
    if (h) { let o = h.object; while (o && !o.userData.org && !o.userData.landmark) o = o.parent; if (o) { const x = o.userData.org || o.userData.landmark; tip.innerHTML = `${esc(x.name)}<small>${esc(o.userData.org ? CAT[x.cat].label : "Landmark")}</small>`; tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; tip.hidden = false; dom.style.cursor = "pointer"; return; } }
    tip.hidden = true; dom.style.cursor = "";
  });

  // ── ride along (street-level follow cams, after the Unreal city demos)
  const rideBtns = { auto: $("rideAuto"), metro: $("rideMetro"), plane: $("ridePlane") };
  // on phones the ride-along buttons live in the bottom sheet, under search
  if (matchMedia("(max-width: 760px)").matches) { const rr = document.querySelector(".ride"); $("side").insertBefore(rr, $("card")); }
  function startRide(kind) {
    if (view !== "3d") setView("3d");
    if (ride && ride.kind === kind) return stopRide(true);
    stopRide(); tween = null;
    if (kind === "auto") { const tg = ctl.target, all = L.autos.flatMap(t => t.list).filter(a => a.wx !== undefined).sort((p, q) => Math.hypot(p.wx - tg.x, p.wz - tg.z) - Math.hypot(q.wx - tg.x, q.wz - tg.z)).slice(0, 25); ride = { kind, a: all[Math.floor(Math.random() * all.length)] }; if (!ride.a) { ride = null; return; } honk(); toast({ eyebrow: "Ride along", title: "You're in an auto.", body: NO.AUTO_LINES[Math.floor(Math.random() * NO.AUTO_LINES.length)] + " Press Esc to get out." }); }
    if (kind === "metro") { const ts = L.trains.filter(t => t.line.ref === "Purple"); ride = { kind, tr: ts[Math.floor(Math.random() * ts.length)] }; eggActions.metro(ride.tr.line.ref); }
    if (kind === "plane") { const ps = L.planes.filter(p => p.arriving); ride = { kind, p: ps[0] || L.planes[0] }; eggActions.plane(); }
    ctl.enabled = false; rideBtns[kind].setAttribute("aria-pressed", "true"); cam.fov = 55; cam.updateProjectionMatrix();
    ride.pos = cam.position.clone(); ride.look = ctl.target.clone();
  }
  function stopRide(fly) {
    if (!ride) return; const k = ride.kind; ride = null; ctl.enabled = true; rideBtns[k].setAttribute("aria-pressed", "false"); cam.fov = 34; cam.updateProjectionMatrix();
    if (fly) { ctl.target.y = 0; flyTo(new V3(ctl.target.x, 0, ctl.target.z), 45, .9); }
  }
  Object.entries(rideBtns).forEach(([k, b]) => b.onclick = () => startRide(k));
  const tp = new V3(), tl = new V3();
  function stepRide(dt) {
    if (!ride) return; const f = 1 - Math.exp(-dt * 3.5);
    if (ride.kind === "auto") { const a = ride.a; tl.set(a.wx + a.whx * 2, .2 + a.y, a.wz + a.whz * 2); tp.set(a.wx - a.whx * 2.1, .95 + a.y, a.wz - a.whz * 2.1); }
    if (ride.kind === "metro") { const t = ride.tr; const y = t.ug ? 1.2 : NO.HM + .2; tl.set(t.x + t.hx * 2.5, y, t.z + t.hz * 2.5); tp.set(t.x - t.hx * 2.6, y + 1.0, t.z - t.hz * 2.6); }
    if (ride.kind === "plane") { const p = ride.p, d = p.dir || new V3(0, 0, -1); tl.copy(p.g.position).addScaledVector(d, 6); tp.copy(p.g.position).addScaledVector(d, -7).add(new V3(0, 2.2, 0)); if (p.t < .2) stopRide(true); }
    if (!ride) return;
    ride.pos.lerp(tp, f); ride.look.lerp(tl, f); cam.position.copy(ride.pos); ctl.target.copy(ride.look); cam.lookAt(ride.look);
  }

  // ── keyboard: Esc, Konami, typed words
  const KON = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]; let kp = 0, typed = "";
  addEventListener("keydown", e => {
    if (e.key === "Escape") { stopRide(true); closeCard(); $("eggPop").hidden = true; if (view === "net") setView("3d"); }
    if (e.target.tagName === "INPUT") return;
    kp = (e.key === KON[kp] || e.key.toLowerCase() === KON[kp]) ? kp + 1 : (e.key === KON[0] ? 1 : 0);
    if (kp === KON.length) { kp = 0; eggActions.konami(); }
    if (e.key.length === 1) { typed = (typed + e.key.toLowerCase()).slice(-12); if (typed.endsWith("adjust")) { typed = ""; eggActions.adjust(); } if (typed.endsWith("maga")) { typed = ""; ph = NO.KANNADA.findIndex(k => k[1] === "Maga") - 1; nextPhrase(true); } }
  });

  // ── network view (d3)
  let netBuilt = false, netSel = null, netNodes, netLinks, gNode, gLink, gText, netTab = "all";
  function openNet(id) { setView("net"); selectNet(id); }
  function buildNet() {
    if (netBuilt) return; netBuilt = true;
    const ids = new Set(); const links = [];
    NO.ORGS.forEach(o => { (o.backers || []).forEach(b => { if (ORG[b]) { ids.add(o.id); ids.add(b); links.push({ source: b, target: o.id }); } }); });
    NO.ORGS.forEach(o => { if (groupOf[o.cat] === "capital" && o.cat !== "strategic") ids.add(o.id); if (groupOf[o.cat] === "companies") ids.add(o.id); });
    const deg = {}; links.forEach(l => { deg[l.source] = (deg[l.source] || 0) + 1; deg[l.target] = (deg[l.target] || 0) + 1; });
    netNodes = [...ids].map(id => ({ id, o: ORG[id], deg: deg[id] || 0, r: 9 + Math.sqrt(deg[id] || 0) * 3.6, inv: !!backs[id] }));
    netLinks = links;
    const inv = netNodes.filter(n => n.inv).length, co = netNodes.filter(n => groupOf[n.o.cat] === "companies").length, boot = netNodes.filter(n => groupOf[n.o.cat] === "companies" && !n.deg).length;
    $("netStats").innerHTML = [[inv, "investors"], [co, "companies"], [links.length, "funding links"], [boot, "no outside capital"]].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join("");
    const box = $("netGraph"), W = box.clientWidth || 800, H = box.clientHeight || 500;
    const sim = d3.forceSimulation(netNodes).force("link", d3.forceLink(netLinks).id(d => d.id).distance(70).strength(.55))
      .force("charge", d3.forceManyBody().strength(-210)).force("center", d3.forceCenter(W / 2, H / 2)).force("collide", d3.forceCollide(d => d.r + 5))
      .force("x", d3.forceX(W / 2).strength(.05)).force("y", d3.forceY(H / 2).strength(.07)).stop();
    for (let i = 0; i < 360; i++) sim.tick();
    const svg = d3.select(box).insert("svg", ":first-child").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g");
    const zoom = d3.zoom().scaleExtent([.2, 4]).on("zoom", e => g.attr("transform", e.transform)); svg.call(zoom);
    const lineCol = getComputedStyle(document.documentElement).getPropertyValue("--line-strong");
    gLink = g.append("g").selectAll("line").data(netLinks).join("line").attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y)
      .attr("stroke", d => CAT[d.source.o.cat].color).attr("stroke-opacity", .45).attr("stroke-width", 1.2);
    gNode = g.append("g").selectAll("g").data(netNodes).join("g").attr("transform", d => `translate(${d.x},${d.y})`).style("cursor", "pointer").on("click", (e, d) => selectNet(d.id));
    gNode.append("image").attr("href", d => badgeURL(d.id)).attr("x", d => -d.r).attr("y", d => -d.r).attr("width", d => d.r * 2).attr("height", d => d.r * 2);
    gNode.append("title").text(d => d.o.name);
    gText = g.append("g").selectAll("text").data(netNodes).join("text").attr("x", d => d.x).attr("y", d => d.y - d.r - 4).attr("text-anchor", "middle").text(d => d.o.name).attr("opacity", d => d.deg >= 2 || !d.deg ? 1 : .0);
    // start zoomed to fit every node (phones get a much smaller canvas than the layout wants)
    { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; netNodes.forEach(n => { x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r - 14); x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r); });
      const top = 44, k = Math.min(1.2, (W - 20) / (x1 - x0), (H - top - 20) / (y1 - y0));
      svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, top + (H - top) / 2 - k * (y0 + y1) / 2).scale(k)); }
    const cats = [...new Set(netNodes.map(n => n.o.cat))];
    $("netLegend").innerHTML = cats.map(c => `<span><svg width="9" height="9"><circle cx="4.5" cy="4.5" r="4" fill="${CAT[c].color}"/></svg> ${esc(CAT[c].label)}</span>`).join("") + `<span>Ring colour = category</span>`;
    renderNetList(); selectNet(netSel || "flipkart");
  }
  function renderNetList() {
    const q = ($("netQ").value || "").toLowerCase();
    const items = netNodes.filter(n => (netTab === "all" || (netTab === "inv" ? n.inv : groupOf[n.o.cat] === "companies")) && n.o.name.toLowerCase().includes(q)).sort((a, b) => b.deg - a.deg || a.o.name.localeCompare(b.o.name));
    $("netItems").innerHTML = items.map(n => `<button class="item" data-id="${n.id}" aria-current="${n.id === netSel}"><span style="display:flex;gap:8px;align-items:center"><img src="${badgeURL(n.id)}" alt="" width="20" height="20">${esc(n.o.name)}</span><span>${n.deg ? n.deg + " link" + (n.deg > 1 ? "s" : "") : "bootstrapped"}</span></button>`).join("") || `<div class="hint">No match</div>`;
    $("netItems").querySelectorAll(".item").forEach(b => b.onclick = () => selectNet(b.dataset.id));
  }
  $("netQ").addEventListener("input", renderNetList);
  document.querySelectorAll("#netList .tabs button").forEach(b => b.onclick = () => { netTab = b.dataset.t; document.querySelectorAll("#netList .tabs button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); renderNetList(); });
  function selectNet(id) {
    if (!netBuilt) { netSel = id; return; }
    const n = netNodes.find(x => x.id === id); if (!n) return; netSel = id;
    const nb = new Set([id]); netLinks.forEach(l => { if (l.source.id === id) nb.add(l.target.id); if (l.target.id === id) nb.add(l.source.id); });
    gNode.attr("opacity", d => nb.has(d.id) ? 1 : .18);
    gLink.attr("stroke-opacity", l => l.source.id === id || l.target.id === id ? .9 : .08).attr("stroke-width", l => l.source.id === id || l.target.id === id ? 2 : 1.2);
    gText.attr("opacity", d => nb.has(d.id) ? 1 : (d.deg >= 2 ? .15 : 0));
    const o = n.o, c = CAT[o.cat], bk = (o.backers || []).filter(b => ORG[b]), by = backs[id] || [];
    $("netDetail").innerHTML = `<div><div class="eyebrow" style="color:${c.color}">${esc(c.label)}${o.prec !== "none" && NO.AREAS[o.area] ? " · " + esc(NO.AREAS[o.area].name) : " · outside Bengaluru"}</div><div style="display:flex;gap:10px;align-items:center"><img src="${badgeURL(o.id)}" alt="" width="38" height="38"><h3>${esc(o.name)}</h3></div><p class="blurb" style="margin:6px 0 0">${esc(o.blurb || "")}</p>
      ${o.prec !== "none" ? `<button class="pill" id="netMap" style="margin-top:10px">Show on the map →</button>` : ""}</div>
      <div>${bk.length ? `<div class="eyebrow">Backed by · ${bk.length}</div><div class="conns" style="margin:8px 0 12px">${pills(bk)}</div>` : ""}
      ${by.length ? `<div class="eyebrow">Backed · ${by.length}</div><div class="conns" style="margin-top:8px">${pills(by)}</div>` : ""}
      ${!bk.length && !by.length ? `<div class="eyebrow">Connections</div><div class="conns" style="margin-top:8px"><span class="pill" style="cursor:default">${groupOf[o.cat] === "companies" ? "Bootstrapped. No outside investors recorded." : "No funding links recorded yet"}</span></div>` : ""}</div>`;
    $("netDetail").querySelectorAll("[data-org]").forEach(b => b.onclick = () => selectNet(b.dataset.org));
    const m = $("netMap"); if (m) m.onclick = () => { setView("3d"); selectOrg(o); };
    renderNetList();
  }

  // ── main loop
  let last = performance.now(), introOn = true;
  // adaptive resolution: hold ~60 fps by trading pixels, never detail the user asked for
  let pr = NO.basePR, fAcc = 0, fN = 0, good = 0, fpsEl = null;
  if (/[?&]fps/.test(location.search) || location.hash === "#fps") { fpsEl = document.createElement("div"); fpsEl.style.cssText = "position:fixed;left:8px;top:50%;z-index:50;font:12px monospace;background:#000a;color:#0f0;padding:4px 6px;border-radius:4px"; document.body.appendChild(fpsEl); }
  function adapt(dt) {
    fAcc += dt; fN++; if (fAcc < 1) return;
    const fps = fN / fAcc; fAcc = 0; fN = 0;
    if (fpsEl) fpsEl.textContent = `${fps.toFixed(0)} fps · ${pr.toFixed(2)}x · ${NO.renderer.info.render.calls} calls · ${(NO.renderer.info.render.triangles / 1e6).toFixed(2)}M tris`;
    if (introOn) return;
    if (fps < 50) { good = 0; if (NO.sun.castShadow && fps < 42) { L.noShadow = true; NO.sun.castShadow = false; } else if (pr > .62) { pr = Math.max(.6, pr - .15); NO.renderer.setPixelRatio(pr); } }
    else if (fps > 58) { if (++good >= 4 && pr < NO.basePR) { pr = Math.min(NO.basePR, pr + .1); NO.renderer.setPixelRatio(pr); good = 0; } }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = (now - last) / 1000, dt = Math.min(.05, rdt); last = now; const t = now / 1000;
    if (rdt < 1) adapt(rdt);
    if (view !== "net") try {
      stepIntro(dt); stepTween(dt); stepRide(dt);
      if (!tween && !ride && !introOn) ctl.update();
      ctl.target.x = clamp(ctl.target.x, -NO.GW / 2, NO.GW / 2); ctl.target.z = clamp(ctl.target.z, -NO.GH / 2, NO.GH / 2);
      const cd = cam.position.distanceTo(ctl.target); cam.near = clamp(cd * .012, .05, 6); cam.far = cd * 3.2 + 260 + cam.position.y * 2; cam.updateProjectionMatrix();
      L.update(dt, t); updateBadges(t);
      if (view === "plan") updateLabels();
      if (L.timeMode === "live" && rainAuto() && !L.raining) { L.raining = true; if (!rainAutoShown && !introOn) { rainAutoShown = true; eggActions.rain(); } }
      NO.renderer.render(NO.scene, cam);
    } catch (err) { console.error(err); if (!frame.logged) { frame.logged = 1; window.__log && window.__log("frame error " + (err && (err.stack || err.message))); } if (ride) stopRide(); }
  }

  // ── intro flight: in from the airport road, over Hebbal, down to Vidhana Soudha, up to the whole city
  const nOrgs = NO.ORGS.filter(o => o.prec !== "none").length;
  const vs = NO.ll2w(12.9794, 77.5907), hb = NO.ll2w(13.0358, 77.5970);
  const KP = [new V3(40, 70, -NO.GH / 2 - 70), new V3(hb.x + 25, 26, hb.z - 45), new V3(vs.x + 16, 9, vs.z - 24), new V3(vs.x + 30, 30, vs.z + 30), new V3(HOME.tg.x + HOME.r * Math.sin(HOME.polar) * Math.sin(HOME.az), HOME.r * Math.cos(HOME.polar), HOME.tg.z + HOME.r * Math.sin(HOME.polar) * Math.cos(HOME.az))];
  const KT = [new V3(15, 0, -NO.GH / 2 + 60), new V3(hb.x, 0, hb.z + 10), new V3(vs.x, .6, vs.z), new V3(vs.x - 10, 0, vs.z - 5), HOME.tg.clone()];
  const cp = new THREE.CatmullRomCurve3(KP, false, "centripetal"), ct = new THREE.CatmullRomCurve3(KT, false, "centripetal");
  const CAPS = [[0, "ನಮ್ಮ ಊರು", "Namma Ooru · our town"], [.2, "Founded 1537", "by Kempegowda, inside four watchtowers"], [.45, "The Garden City", "Pensioners' paradise, then India's Silicon Valley"], [.7, `${nOrgs} organisations`, "One city, block by block"]];
  let it = 0; const ID = 15;
  function stepIntro(dt) {
    if (!introOn) return; it += dt; const u = clamp(it / ID, 0, 1), e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    cam.position.copy(cp.getPoint(e)); ctl.target.copy(ct.getPoint(e)); cam.lookAt(ctl.target);
    const c = [...CAPS].reverse().find(k => u >= k[0]); if (c && $("capT").textContent !== c[1]) { $("capT").textContent = c[1]; $("capS").textContent = c[2]; }
    $("caption").style.opacity = u > .92 ? 0 : 1;
    if (u >= 1) endIntro();
  }
  function endIntro() {
    if (!introOn) return; introOn = false;
    cam.position.copy(KP[KP.length - 1]); ctl.target.copy(KT[KT.length - 1]); cam.lookAt(ctl.target); ctl.update();
    $("intro").classList.add("fade"); $("caption").hidden = true; $("skip").hidden = true; document.body.classList.remove("intro");
    setTimeout(() => $("intro").hidden = true, 1000);
    renderClock();
    if (L.timeMode === "live" && rainAuto()) setTimeout(() => { rainAutoShown = true; eggActions.rain(); }, 5000);
    setTimeout(() => toast({ eyebrow: "Welcome", title: matchMedia("(pointer: coarse)").matches ? "Namaskara! Drag to pan, two fingers to tilt." : "Namaskara! Drag to pan, right-drag to tilt.", body: `There are ${EGG_IDS.length} Easter eggs hidden in the city. Start by clicking an auto.` , ms: 7000 }), 600);
  }
  $("intro").classList.add("clear"); $("intro").querySelector(".inner").style.display = "none";
  $("caption").hidden = false; $("skip").hidden = false; $("skip").onclick = endIntro;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) endIntro();
  L.applyTime(L.hours()); renderClock();
  requestAnimationFrame(frame);
})();
