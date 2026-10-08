/* Blocus Assault — application */
(() => {
"use strict";

const CFG = window.BA_CONFIG, KINDS = window.BA_KINDS, STATUS = window.BA_STATUS, CPK = window.BA_CP_KINDS;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("ba_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ba_" + k, JSON.stringify(v)); } catch {} },
};
const HOUR = 3600e3;
const ago = (t) => {
  const s = Math.max(0, (Date.now() - new Date(t)) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
};
const distKm = (a, b, c, d) => {
  const R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const toast = (msg, ms = 2600) => {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms);
};

/* ---------------- État ---------------- */
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false } });
let session = store.get("session", null);
let guestId = store.get("guest", null);
if (!guestId) { guestId = Math.random().toString(36).slice(2, 6).toUpperCase(); store.set("guest", guestId); }
const favs = new Set(store.get("favs", []));
const voted = store.get("voted", {});
const modes = Object.assign({ fiable: false, discret: false, sound: false, notif: false, wake: false, heat: false, radar: false, allSchools: false }, store.get("modes", {}));
const schools = new Map();       // id -> école
const reports = [];              // signalements récents (48 h)
const byId = new Map();
const checkpoints = new Map();   // id -> checkpoint
let timeShift = 0;               // mode "remonter le temps" (ms dans le passé)
let feedFilter = "all", rankSort = "blocus", rankRows = [];
let currentSchool = null, myPos = null, chatRoom = "global";
let pending = null, pickMode = false;

/* ---------------- Carte ---------------- */
const map = L.map("map", { zoomControl: true, worldCopyJump: true, minZoom: 2 }).setView(store.get("view", [46.6, 2.4]), store.get("zoom", 6));
const bases = {
  dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 20, subdomains: "abcd", attribution: "© OpenStreetMap © CARTO" }),
  streets: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }),
  sat: L.layerGroup([
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "© Esri" }),
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 20, subdomains: "abcd" }),
  ]),
};
const GKEY = (CFG.googleMapsKey || "").trim();
if (GKEY && L.gridLayer.googleMutant) {
  const sc = document.createElement("script");
  sc.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GKEY)}&language=fr&v=weekly`;
  sc.async = true; document.head.appendChild(sc);
  bases.google = L.gridLayer.googleMutant({ type: "roadmap", maxZoom: 21, attribution: "© Google" });
  bases.gsat = L.gridLayer.googleMutant({ type: "hybrid", maxZoom: 21, attribution: "© Google" });
}
let baseName = store.get("base", GKEY ? "google" : "dark");
if (!bases[baseName]) baseName = "dark";
bases[baseName].addTo(map);
const setBase = (n) => {
  map.removeLayer(bases[baseName]); baseName = n; bases[n].addTo(map); store.set("base", n);
  $$(".map-tools [data-layer]").forEach((b) => b.classList.toggle("on", b.dataset.layer === n));
  $("#googleBtn").classList.toggle("on", n === "google" || n === "gsat");
};
$$(".map-tools [data-layer]").forEach((b) => b.onclick = () => setBase(b.dataset.layer));
setBase(baseName);

/* Google Maps intégré (sans clé) : URL d'intégration publique de Google */
const gEmbed = (lat, lng, z, t, q) => `https://maps.google.com/maps?q=${encodeURIComponent(q || `${lat},${lng}`)}&ll=${lat},${lng}&z=${z}&t=${t}&hl=fr&output=embed`;
const gOpen = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const gStreet = (lat, lng) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
let gviewT = "k";
function showGView() {
  const c = map.getCenter(), z = Math.min(20, Math.max(3, map.getZoom()));
  $("#gviewFrame").src = gEmbed(c.lat.toFixed(6), c.lng.toFixed(6), z, gviewT, `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`);
  $("#gviewOpen").href = gOpen(c.lat.toFixed(6), c.lng.toFixed(6));
  $$("#gviewSeg button").forEach((b) => b.classList.toggle("active", b.dataset.t === gviewT));
  $("#gview").classList.remove("hidden"); $("#fabReport").classList.add("hidden"); document.body.classList.add("gview-on");
  $("#googleBtn").classList.add("on");
}
function hideGView() {
  $("#gview").classList.add("hidden"); $("#fabReport").classList.remove("hidden"); document.body.classList.remove("gview-on");
  $("#googleBtn").classList.toggle("on", baseName === "google" || baseName === "gsat");
}
$("#googleBtn").onclick = () => {
  if (bases.google) return setBase(baseName === "google" ? "gsat" : "google");
  $("#gview").classList.contains("hidden") ? showGView() : hideGView();
};
$("#gviewBack").onclick = hideGView;
$("#gviewSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) { gviewT = b.dataset.t; showGView(); } });

const statusRank = { blocus: 6, partiel: 5, annule: 4, incident: 3, debloque: 2, calme: 1, none: 0 };
const cluster = L.markerClusterGroup({
  disableClusteringAtZoom: 15, maxClusterRadius: 50, showCoverageOnHover: false,
  iconCreateFunction(c) {
    const kids = c.getAllChildMarkers();
    const hot = kids.filter((m) => ["blocus", "partiel"].includes(m.options.st)).length;
    const n = c.getChildCount();
    return L.divIcon({ html: `<div><span>${hot ? "⛔" + hot : n}</span></div>`, className: "marker-cluster " + (hot ? "hot" : ""), iconSize: [40, 40] });
  },
}).addTo(map);
const eventLayer = L.layerGroup().addTo(map);
const gateLayer = L.layerGroup().addTo(map);
const meLayer = L.layerGroup().addTo(map);
const cpLayer = L.layerGroup().addTo(map);
let heatLayer = null;

map.on("moveend", () => {
  store.set("view", [map.getCenter().lat, map.getCenter().lng]); store.set("zoom", map.getZoom());
  map.getContainer().classList.toggle("show-labels", map.getZoom() >= 14);
  scheduleOSM();
  renderEvents();
});

/* ---------------- Statut d'un lycée ---------------- */
const now = () => Date.now() - timeShift;
const isTrusted = (r) => !modes.fiable || (r.denies <= r.confirms && (r.confirms >= 1 || now() - new Date(r.created_at) < 20 * 60e3));
const isContested = (r) => r.denies >= 3 && r.denies > r.confirms * 2;
function recentFor(id, hours = CFG.statusWindowHours) {
  const t = now(), min = t - hours * HOUR;
  return reports.filter((r) => r.school_id === id && +new Date(r.created_at) <= t && +new Date(r.created_at) >= min && !isContested(r) && isTrusted(r));
}
function statusOf(id) {
  const list = recentFor(id);
  const st = list.find((r) => KINDS[r.kind]?.status);
  if (st) return st.kind;
  if (list.some((r) => KINDS[r.kind]?.sev >= 2)) return "incident";
  return "none";
}

function schoolIcon(s, st) {
  const c = STATUS[st].color, big = st !== "none";
  const pulse = st === "blocus" || st === "incident" ? " pulse" : "";
  const star = favs.has(s.id) ? "⭐ " : "";
  return L.divIcon({
    className: "", iconSize: [24, 24], iconAnchor: [12, 12],
    html: `<div class="mk${big ? " big" : ""}${pulse}" style="background:${c};color:${c}"></div><div class="mk-lbl" style="color:${big ? c : "#cfd6e2"}">${star}${esc(s.name)}</div>`,
  });
}
function addSchool(s) {
  let e = schools.get(s.id);
  if (e) { Object.assign(e, Object.fromEntries(Object.entries(s).filter(([, v]) => v != null))); return e; }
  e = s; schools.set(s.id, e);
  if (s.id.startsWith("cp:")) return e; // lieu indépendant : affiché via son checkpoint
  const st = statusOf(s.id);
  e.marker = L.marker([s.lat, s.lng], { icon: schoolIcon(s, st), st, zIndexOffset: statusRank[st] * 100 })
    .on("click", () => openSchool(s.id));
  cluster.addLayer(e.marker);
  return e;
}
function refreshSchool(id, batch = false) {
  const s = schools.get(id); if (!s?.marker) return;
  const st = statusOf(id);
  if (batch && st === s.marker.options.st && st === "none" && !favs.has(id)) return;
  s.marker.options.st = st;
  s.marker.setIcon(schoolIcon(s, st));
  s.marker.setZIndexOffset(statusRank[st] * 100);
  if (!batch) cluster.refreshClusters(s.marker);
}
const refreshAll = () => { schools.forEach((_, id) => refreshSchool(id, true)); cluster.refreshClusters(); renderEvents(); renderAll(); };

window.BA_SEED.forEach(([id, name, city, country, lat, lng]) => addSchool({ id: "seed:" + id, name, city, country, lat, lng, src: "seed" }));

/* ---------------- OpenStreetMap : lycées & portails ---------------- */
const LYCEE_RE = "Lyc[ée]e|Lycee|High School|Highschool|Gymnas|Liceo|Lyceum|Secondary|Instituto|Colegio|Gimnazj|Gimnasio|Lisesi|Grammar|Liceu|Secundária|Athénée|Oberschule|Gesamtschule|Senior";
const loadedBoxes = [];
let osmTimer = null, osmBusy = false;
async function overpass(q) {
  for (const url of CFG.overpass) {
    try {
      const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (r.ok) return await r.json();
    } catch {}
  }
  throw new Error("Overpass indisponible");
}
function scheduleOSM() { clearTimeout(osmTimer); osmTimer = setTimeout(loadOSM, 700); }
async function loadOSM() {
  const hint = $("#mapHint");
  if (map.getZoom() < 12) { hint.classList.remove("hidden"); return; }
  hint.classList.add("hidden");
  const b = map.getBounds().pad(0.25);
  const box = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
  const all = modes.allSchools;
  if (loadedBoxes.some((x) => x[4] === all && x[0] <= box[0] && x[1] <= box[1] && x[2] >= box[2] && x[3] >= box[3])) return;
  if (osmBusy) return scheduleOSM();
  osmBusy = true; $("#loading").classList.remove("hidden");
  const bb = box.map((v) => v.toFixed(5)).join(",");
  const q = all
    ? `[out:json][timeout:25];nwr["amenity"="school"](${bb});out center tags 1500;`
    : `[out:json][timeout:25];(nwr["amenity"="school"]["name"~"${LYCEE_RE}",i](${bb});nwr["amenity"="school"]["isced:level"~"3"](${bb});nwr["amenity"="school"]["school:FR"~"lyc",i](${bb});nwr["amenity"="college"]["name"~"Lyc",i](${bb}););out center tags 1500;`;
  try {
    const data = await overpass(q);
    for (const el of data.elements) {
      const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
      const t = el.tags || {};
      if (lat == null || !t.name) continue;
      addSchool({ id: `osm:${el.type}/${el.id}`, name: t.name, city: t["addr:city"] || t["is_in:city"] || null, lat, lng, src: "osm", osmType: el.type, osmId: el.id, web: t.website || null });
    }
    loadedBoxes.push([...box, all]);
  } catch (e) { toast("⚠️ Impossible de charger les lycées (OpenStreetMap saturé), réessai bientôt"); }
  osmBusy = false; $("#loading").classList.add("hidden");
}

const cardinal = (s, lat, lng) => {
  const a = (Math.atan2(lat - s.lat, (lng - s.lng) * Math.cos(s.lat * Math.PI / 180)) * 180) / Math.PI;
  return ["Est", "Nord-Est", "Nord", "Nord-Ouest", "Ouest", "Sud-Ouest", "Sud", "Sud-Est"][Math.round(((a + 360) % 360) / 45) % 8];
};
async function loadGates(s) {
  if (s.gates) return s.gates;
  let sel = `node(around:180,${s.lat},${s.lng})`;
  let pre = "";
  if (s.osmType === "way") { pre = `way(${s.osmId})->.w;`; sel = "node(around.w:30)"; }
  else if (s.osmType === "relation") { pre = `rel(${s.osmId});way(r)->.w;`; sel = "node(around.w:30)"; }
  const q = `[out:json][timeout:20];${pre}(${sel}["barrier"~"^(gate|entrance|turnstile|lift_gate|swing_gate|sliding_gate|full-height_turnstile)$"];${sel}["entrance"];);out 80;`;
  const typeLbl = { main: "Entrée principale", service: "Entrée de service", emergency: "Sortie de secours", staircase: "Accès" };
  let gates = [];
  try {
    const data = await overpass(q);
    const counts = {};
    gates = data.elements.map((n) => {
      const t = n.tags || {}, dir = cardinal(s, n.lat, n.lon);
      let base = t.name || t.ref || typeLbl[t.entrance] || (t.barrier ? "Portail" : "Entrée");
      counts[base + dir] = (counts[base + dir] || 0) + 1;
      const label = `${base} ${dir}${counts[base + dir] > 1 ? " " + counts[base + dir] : ""}`;
      return { label, lat: n.lat, lng: n.lon, src: "osm" };
    });
  } catch {}
  // Portails ajoutés par la communauté (signalements avec un portail précisé)
  for (const r of reports) {
    if (r.school_id === s.id && r.gate_label && !gates.some((g) => g.label === r.gate_label)) gates.push({ label: r.gate_label, lat: r.lat, lng: r.lng, src: "user" });
  }
  for (const cp of checkpoints.values()) {
    if (cp.school_id === s.id && !gates.some((g) => g.label === cp.name)) gates.push(cpGate(cp));
  }
  s.gates = gates;
  return gates;
}
function gateState(s, label) {
  const r = recentFor(s.id).find((x) => x.gate_label === label);
  return r ? r.kind : null;
}
function drawGates(s) {
  gateLayer.clearLayers();
  for (const g of s.gates || []) {
    if (g.src === "cp") continue; // déjà sur la carte (calque checkpoints)
    const st = gateState(s, g.label);
    const color = st ? KINDS[st].color : g.src === "user" ? "#ffd166" : "#ffffff";
    L.marker([g.lat, g.lng], {
      icon: L.divIcon({ className: "", iconSize: [24, 24], html: `<div class="gate" style="border-color:${color}">${st ? KINDS[st].icon : "🚪"}</div>` }),
      zIndexOffset: 2000,
    }).bindTooltip(`${esc(g.label)}${st ? " — " + KINDS[st].label : ""}`).on("click", () => openReport(s, g)).addTo(gateLayer);
  }
}

/* ---------------- Checkpoints ---------------- */
const cpGate = (cp) => ({ label: cp.name, lat: cp.lat, lng: cp.lng, src: "cp", kind: cp.kind });
function cpSchool(cp) {
  return schools.get(cp.school_id) || addSchool({ id: cp.school_id, name: cp.school_name, lat: cp.lat, lng: cp.lng, src: "zone", gates: [] });
}
function addCheckpoint(cp) {
  checkpoints.set(cp.id, cp);
  const s = schools.get(cp.school_id);
  if (s?.gates && !s.gates.some((g) => g.label === cp.name)) s.gates.push(cpGate(cp));
}
async function loadCheckpoints() {
  const { data } = await sb.from("ba_checkpoints").select("*").order("id", { ascending: false }).limit(5000);
  (data || []).forEach(addCheckpoint);
  drawCheckpoints();
}
function cpState(cp) { return recentFor(cp.school_id).find((r) => r.gate_label === cp.name) || null; }
function drawCheckpoints() {
  cpLayer.clearLayers();
  if (map.getZoom() < 13) return;
  const b = map.getBounds().pad(0.2);
  for (const cp of checkpoints.values()) {
    if (!b.contains([cp.lat, cp.lng])) continue;
    const last = cpState(cp), K = last ? KINDS[last.kind] : null;
    const color = K ? K.color : "#4da3ff";
    L.marker([cp.lat, cp.lng], {
      icon: L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<div class="cp${K && K.sev >= 2 ? " hot" : ""}" style="border-color:${color};color:${color}">${(CPK[cp.kind] || CPK.autre).icon}${K ? `<i>${K.icon}</i>` : ""}</div><div class="mk-lbl cp-lbl" style="color:${K ? color : "#cfe3ff"}">${esc(cp.name)}</div>` }),
      zIndexOffset: 2500,
    }).bindPopup(() => cpPopup(cp), { className: "qp-wrap" }).addTo(cpLayer);
  }
}
function cpPopup(cp) {
  const last = cpState(cp), K = last ? KINDS[last.kind] : null, T = CPK[cp.kind] || CPK.autre;
  return `<div class="qp"><b>${T.icon} ${esc(cp.name)}</b>
    <small>${T.label}${cp.school_id.startsWith("cp:") ? "" : " · " + esc(cp.school_name)}</small>
    <span class="status-pill" style="background:${K ? K.color : "#6b7686"}">${K ? K.icon + " " + esc(K.label) : "Pas d'info récente"}</span>
    ${last ? `<small>${ago(last.created_at)} · par ${esc(last.author)}${last.message ? ` — « ${esc(last.message)} »` : ""}</small>` : ""}
    <button class="btn sm" data-cp-report="${cp.id}">📢 Signaler son état</button>
    <a class="btn ghost sm" target="_blank" rel="noopener" href="${gStreet(cp.lat, cp.lng)}">👁️ Street View</a>
    <small class="muted">Créé par ${esc(cp.author)} · ${ago(cp.created_at)}</small></div>`;
}

/* Toucher la carte : petit menu « signaler ici / créer un checkpoint » */
let closedAt = 0, quickAt = null;
map.on("popupclose", () => (closedAt = Date.now()));
map.on("click", (e) => {
  if (pickMode) { pickMode = false; map.getContainer().style.cursor = ""; return reportAt(e.latlng); }
  if (Date.now() - closedAt < 350) return; // ce toucher servait juste à fermer la bulle
  quickAt = e.latlng;
  const s = nearestSchool(e.latlng.lat, e.latlng.lng, 0.4);
  L.popup({ className: "qp-wrap", offset: [0, -4] }).setLatLng(e.latlng).setContent(
    `<div class="qp"><b>📍 Cet endroit</b>${s ? `<small>près de ${esc(s.name)}</small>` : ""}
      <button class="btn sm" data-qp="report">📢 Signaler ici</button>
      <button class="btn ghost sm" data-qp="cp">➕ Créer un checkpoint</button></div>`).openOn(map);
});
map.on("contextmenu", (e) => reportAt(e.latlng));
document.addEventListener("click", (e) => {
  const q = e.target.closest("[data-qp]");
  if (q) { map.closePopup(); return q.dataset.qp === "report" ? reportAt(quickAt) : openCheckpointForm(quickAt); }
  const r = e.target.closest("[data-cp-report]");
  if (r) { const cp = checkpoints.get(+r.dataset.cpReport); if (cp) { map.closePopup(); openReport(cpSchool(cp), cpGate(cp)); } }
});

let cpKind = "portail", cpAt = null, cpNear = [];
$("#cpKinds").innerHTML = Object.entries(CPK).map(([k, K]) => `<button type="button" data-cpk="${k}"><span>${K.icon}</span>${K.label}</button>`).join("");
$("#cpKinds").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cpk]"); if (!b) return;
  cpKind = b.dataset.cpk; $$("#cpKinds button").forEach((x) => x.classList.toggle("active", x === b));
});
function openCheckpointForm(latlng) {
  cpAt = latlng;
  cpNear = [...schools.values()].filter((s) => !s.id.startsWith("cp:") && s.src !== "zone")
    .map((s) => [s, distKm(latlng.lat, latlng.lng, s.lat, s.lng)]).filter(([, d]) => d < 0.8).sort((a, b) => a[1] - b[1]).slice(0, 6);
  $("#cpSchool").innerHTML = cpNear.map(([s, d], i) => `<option value="${i}">🏫 ${esc(s.name)} (${Math.round(d * 1000)} m)</option>`).join("") +
    `<option value="none" ${cpNear.length ? "" : "selected"}>📍 Aucun — lieu indépendant</option>`;
  cpKind = cpNear.length && cpNear[0][1] < 0.15 ? "portail" : "carrefour";
  $$("#cpKinds button").forEach((x) => x.classList.toggle("active", x.dataset.cpk === cpKind));
  $("#cpName").value = "";
  openSheet("cpSheet");
  setTimeout(() => $("#cpName").focus(), 50);
}
$("#cpForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#cpName").value.trim();
  if (name.length < 2) return toast("Donne un nom au checkpoint");
  const v = $("#cpSchool").value;
  const s = v === "none" ? null : cpNear[+v][0];
  const school_id = s ? s.id : `cp:${cpAt.lat.toFixed(5)},${cpAt.lng.toFixed(5)}`;
  const school_name = s ? s.name : name;
  const btn = $("#cpSubmit"); btn.disabled = true;
  const { data: id, error } = await sb.rpc("ba_add_checkpoint", {
    p_token: session?.token || null, p_school_id: school_id, p_school_name: school_name,
    p_name: name, p_kind: cpKind, p_lat: cpAt.lat, p_lng: cpAt.lng,
  });
  btn.disabled = false;
  if (error) return toast("❌ " + error.message);
  const cp = { id, school_id, school_name, name, kind: cpKind, lat: cpAt.lat, lng: cpAt.lng, author: session?.pseudo || "Anonyme", created_at: new Date().toISOString() };
  addCheckpoint(cp); drawCheckpoints();
  closeSheet("cpSheet"); toast("✅ Checkpoint créé — dis maintenant ce qui s'y passe");
  openReport(cpSchool(cp), cpGate(cp));
});

/* ---------------- Signalements sur la carte ---------------- */
function renderEvents() {
  drawCheckpoints();
  eventLayer.clearLayers();
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
  const t = now();
  const live = reports.filter((r) => +new Date(r.created_at) <= t && t - new Date(r.created_at) < CFG.statusWindowHours * HOUR && !isContested(r) && isTrusted(r));
  if (modes.heat && L.heatLayer) {
    heatLayer = L.heatLayer(reports.filter((r) => t - new Date(r.created_at) < 24 * HOUR).map((r) => [r.lat, r.lng, 0.3 + (KINDS[r.kind]?.sev || 0) * 0.25]), { radius: 28, blur: 22, maxZoom: 15 }).addTo(map);
  }
  if (map.getZoom() < 14) return;
  const seen = {};
  for (const r of live) {
    if (KINDS[r.kind]?.status && !r.gate_label) continue; // déjà visible via la couleur du lycée
    const k = r.lat.toFixed(5) + r.lng.toFixed(5); const n = (seen[k] = (seen[k] || 0) + 1) - 1;
    const off = n ? [Math.cos(n * 2) * 0.00012 * n, Math.sin(n * 2) * 0.00012 * n] : [0, 0];
    const K = KINDS[r.kind] || KINDS.info;
    L.marker([r.lat + off[0], r.lng + off[1]], {
      icon: L.divIcon({ className: "", iconSize: [28, 28], html: `<div class="ev" style="border-color:${K.color}">${K.icon}</div>` }),
      zIndexOffset: 1500,
    }).bindPopup(() => reportCard(r, true)).addTo(eventLayer);
  }
}

/* ---------------- Données temps réel ---------------- */
function ingest(r, isNew) {
  if (byId.has(r.id)) { Object.assign(byId.get(r.id), r); return; }
  byId.set(r.id, r);
  reports.push(r); reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (!schools.has(r.school_id)) addSchool({ id: r.school_id, name: r.school_name, city: r.city, lat: r.lat, lng: r.lng, src: "report" });
  const s = schools.get(r.school_id);
  if (s?.gates && r.gate_label && !s.gates.some((g) => g.label === r.gate_label)) s.gates.push({ label: r.gate_label, lat: r.lat, lng: r.lng, src: "user" });
  if (isNew) notifyNew(r);
}
async function loadReports() {
  const since = new Date(Date.now() - 48 * HOUR).toISOString();
  const { data, error } = await sb.from("ba_reports").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(3000);
  if (error) { toast("⚠️ Base de données injoignable"); return; }
  data.forEach((r) => ingest(r, false));
  refreshAll();
}
async function loadRanking() {
  const { data } = await sb.from("ba_ranking").select("*").limit(500);
  rankRows = data || [];
  renderRank();
}
let rankTimer;
const channel = sb.channel("blocus-live", { config: { presence: { key: guestId + Math.random().toString(36).slice(2, 5) } } })
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "ba_reports" }, ({ new: r }) => {
    ingest(r, true); refreshSchool(r.school_id); renderEvents(); renderAll();
    if (currentSchool?.id === r.school_id) { openSchool(r.school_id, true); }
    clearTimeout(rankTimer); rankTimer = setTimeout(loadRanking, 1500);
  })
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ba_reports" }, ({ new: r }) => {
    ingest(r, false); refreshSchool(r.school_id); renderAll();
  })
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "ba_chat" }, ({ new: m }) => onChat(m))
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "ba_checkpoints" }, ({ new: cp }) => { addCheckpoint(cp); drawCheckpoints(); })
  .on("presence", { event: "sync" }, () => {
    const n = Object.keys(channel.presenceState()).length;
    $("#liveCount").textContent = `EN DIRECT · ${n} en ligne`;
  })
  .subscribe((st) => {
    if (st === "SUBSCRIBED") channel.track({ at: Date.now() });
    else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") $("#liveCount").textContent = "reconnexion…";
  });

/* ---------------- Alertes / notifications ---------------- */
let audioCtx;
function beep() {
  if (!modes.sound || modes.discret) return;
  try {
    audioCtx = audioCtx || new AudioContext();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = "sawtooth"; o.connect(g); g.connect(audioCtx.destination);
    o.frequency.setValueAtTime(880, audioCtx.currentTime); o.frequency.linearRampToValueAtTime(440, audioCtx.currentTime + 0.5);
    g.gain.setValueAtTime(0.15, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    o.start(); o.stop(audioCtx.currentTime + 0.6);
  } catch {}
}
function notifyNew(r) {
  const K = KINDS[r.kind] || KINDS.info;
  const near = myPos && modes.radar && distKm(myPos[0], myPos[1], r.lat, r.lng) <= (store.get("radius", 3));
  const fav = favs.has(r.school_id);
  if (K.urgent || fav || near) {
    if (K.urgent) beep();
    if (modes.notif && !modes.discret && "Notification" in window && Notification.permission === "granted" && (fav || near || K.urgent)) {
      try { new Notification(`${K.icon} ${K.label} — ${r.school_name}`, { body: r.message || (fav ? "Ton lycée favori" : "Près de toi"), tag: "ba" + r.id }); } catch {}
    }
  }
  if (K.urgent) showBanner(r);
}
function showBanner(r) {
  if (modes.discret) return;
  const K = KINDS[r.kind];
  const b = $("#alertBanner");
  b.innerHTML = `${K.icon} ALERTE · ${esc(K.label)} — ${esc(r.school_name)} · ${ago(r.created_at)} <span style="opacity:.8">(toucher pour voir)</span>`;
  b.onclick = () => { b.classList.add("hidden"); openSchool(r.school_id); };
  b.classList.remove("hidden");
  clearTimeout(showBanner._t); showBanner._t = setTimeout(() => b.classList.add("hidden"), 20000);
}

/* ---------------- Rendu des panneaux ---------------- */
function reportCard(r, popup = false) {
  const K = KINDS[r.kind] || KINDS.info;
  const old = now() - new Date(r.created_at) > CFG.statusWindowHours * HOUR;
  const v = voted[r.id];
  const score = r.confirms - r.denies;
  const rel = r.confirms + r.denies === 0 ? "" : `<span class="reliab" style="color:${score >= 0 ? "var(--green)" : "var(--red)"}">${score >= 0 ? "Fiable" : "Contesté"} ${r.confirms}/${r.confirms + r.denies}</span>`;
  return `<div class="card${old ? " old" : ""}" style="--c:${K.color}">
    <div class="h"><span class="k">${K.icon} ${esc(K.label)}${r.severity >= 3 ? " · CRITIQUE" : ""}</span><span class="muted small">${ago(r.created_at)}</span></div>
    <div class="s" data-school="${esc(r.school_id)}">${esc(r.school_name)}${r.city ? " · " + esc(r.city) : ""}${r.gate_label ? " · 🚪 " + esc(r.gate_label) : ""}</div>
    ${r.message ? `<p>${esc(r.message)}</p>` : ""}
    <div class="f">par <b>${esc(r.author)}</b>
      <button class="vote" data-vote="${r.id}" data-up="1" ${v ? "disabled" : ""}>👍 Je confirme ${r.confirms || ""}</button>
      <button class="vote" data-vote="${r.id}" data-up="0" ${v ? "disabled" : ""}>👎 Faux / fini ${r.denies || ""}</button>
      ${popup ? "" : rel}</div></div>`;
}
document.addEventListener("click", async (e) => {
  const v = e.target.closest("[data-vote]");
  if (v) {
    const id = +v.dataset.vote; if (voted[id]) return;
    voted[id] = 1; store.set("voted", voted);
    $$(`[data-vote="${id}"]`).forEach((b) => (b.disabled = true));
    const { error } = await sb.rpc("ba_vote", { p_id: id, p_confirm: v.dataset.up === "1" });
    toast(error ? "Erreur : " + error.message : "Merci, vote pris en compte");
    return;
  }
  const s = e.target.closest("[data-school]");
  if (s) { const sc = schools.get(s.dataset.school); if (sc) { map.flyTo([sc.lat, sc.lng], 17); openSchool(sc.id); } }
  const c = e.target.closest("[data-close]");
  if (c) closeSheet(c.dataset.close);
});

function renderStats() {
  const t = now(); const today = new Date(t); today.setHours(0, 0, 0, 0);
  let bloq = 0, inc = 0;
  schools.forEach((s, id) => { const st = statusOf(id); if (st === "blocus" || st === "partiel") bloq++; if (st === "incident") inc++; });
  const todayN = reports.filter((r) => new Date(r.created_at) >= today && +new Date(r.created_at) <= t).length;
  const urg = reports.filter((r) => KINDS[r.kind]?.urgent && t - new Date(r.created_at) < CFG.statusWindowHours * HOUR && +new Date(r.created_at) <= t).length;
  $("#stats").innerHTML = [["⛔", bloq, "bloqués"], ["⚠️", inc, "incidents"], ["🚨", urg, "alertes"], ["📝", todayN, "auj."]]
    .map(([i, n, l]) => `<div class="stat"><b>${n}</b><span>${i} ${l}</span></div>`).join("");
}
const FEED_FILTERS = { all: "Tout", status: "Blocus", incident: "Incidents", police: "Police", traffic: "Trafic", fav: "⭐ Favoris", near: "📍 Près de moi" };
function renderFeed() {
  $("#feedFilters").innerHTML = Object.entries(FEED_FILTERS).map(([k, l]) => `<button data-ff="${k}" class="${k === feedFilter ? "active" : ""}">${l}</button>`).join("");
  const t = now();
  let list = reports.filter((r) => +new Date(r.created_at) <= t && isTrusted(r));
  const f = feedFilter;
  if (f === "status") list = list.filter((r) => KINDS[r.kind]?.status);
  if (f === "incident") list = list.filter((r) => ["incendie", "portail", "intrusion", "lacrymo", "danger", "medical"].includes(r.kind));
  if (f === "police") list = list.filter((r) => r.kind === "police");
  if (f === "traffic") list = list.filter((r) => ["bouchon", "transport", "manif"].includes(r.kind));
  if (f === "fav") list = list.filter((r) => favs.has(r.school_id));
  if (f === "near") {
    if (!myPos) { locate(); list = []; } else list = list.filter((r) => distKm(myPos[0], myPos[1], r.lat, r.lng) < 10);
  }
  $("#feedList").innerHTML = list.slice(0, 150).map((r) => reportCard(r)).join("") ||
    `<div class="empty">Aucun signalement pour l'instant.<br>Sois le premier : touche un lycée sur la carte puis « Signaler ».</div>`;
}
$("#feedFilters").addEventListener("click", (e) => { const b = e.target.closest("[data-ff]"); if (b) { feedFilter = b.dataset.ff; renderFeed(); } });
function renderAlerts() {
  const t = now();
  const list = reports.filter((r) => KINDS[r.kind]?.urgent && t - new Date(r.created_at) < CFG.statusWindowHours * HOUR && +new Date(r.created_at) <= t && !isContested(r));
  $("#alertList").innerHTML = list.map((r) => reportCard(r)).join("") || `<div class="empty">✅ Aucune alerte urgente en cours.</div>`;
  const b = $("#alertCount"); b.textContent = list.length; b.classList.toggle("hidden", !list.length);
}
function renderRank() {
  const rows = [...rankRows].sort((a, b) => b[rankSort] - a[rankSort] || b.total - a.total).filter((r) => r[rankSort] > 0).slice(0, 100);
  const max = rows[0]?.[rankSort] || 1;
  $("#rankList").innerHTML = rows.map((r) => `<li data-school="${esc(r.school_id)}"><div class="n"><b>${esc(r.school_name)}</b><span class="muted small">${esc(r.city || "")} · ${r.total} signalements · dernier ${ago(r.last_at)}</span><div class="bar"><i style="width:${(r[rankSort] / max) * 100}%"></i></div></div><span class="v">${r[rankSort]}</span></li>`).join("")
    || `<div class="empty">Le classement des 30 derniers jours apparaîtra dès les premiers signalements.</div>`;
  rows.forEach((r) => { if (!schools.has(r.school_id)) addSchool({ id: r.school_id, name: r.school_name, city: r.city, lat: r.lat, lng: r.lng, src: "report" }); });
}
$("#rankSort").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sort]"); if (!b) return;
  rankSort = b.dataset.sort; $$("#rankSort button").forEach((x) => x.classList.toggle("active", x === b)); renderRank();
});
function renderLegend() {
  $("#legend").innerHTML = Object.entries(STATUS).filter(([k]) => k !== "calme").map(([, s]) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("");
}
function renderAll() { renderStats(); renderFeed(); renderAlerts(); if ($("#tab-modes").classList.contains("active")) renderModeOutput(); }

/* ---------------- Fiche lycée ---------------- */
function openSheet(id) { $("#" + id).classList.remove("hidden"); }
function closeSheet(id) {
  $("#" + id).classList.add("hidden");
  if (id === "schoolSheet") { currentSchool = null; $("#schoolMap").dataset.id = ""; }
}
$$(".sheet").forEach((s) => s.addEventListener("click", (e) => { if (e.target === s) closeSheet(s.id); }));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $$(".sheet:not(.hidden)").forEach((s) => closeSheet(s.id)); });

async function openSchool(id, silent = false) {
  const s = schools.get(id); if (!s) return;
  currentSchool = s;
  if (!silent) { history.replaceState(null, "", "#l=" + encodeURIComponent(id)); }
  const st = statusOf(id), S = STATUS[st];
  const list = reports.filter((r) => r.school_id === id && +new Date(r.created_at) <= now()).slice(0, 30);
  if ($("#schoolMap").dataset.id !== id) { $("#schoolMap").dataset.id = id; setSchoolMap(s.lat, s.lng, 18, null, s); }
  const render = () => {
    const gates = s.gates;
    $("#schoolHead").innerHTML = `
      <span class="status-pill" style="background:${S.color}">${S.label}</span>
      <h2 style="margin-top:8px">${esc(s.name)}</h2>
      <p class="muted">${esc(s.city || "")}${s.country ? " · " + esc(s.country) : ""} ${s.web ? `· <a href="${esc(s.web)}" target="_blank" rel="noopener">site</a>` : ""}</p>
      <p class="verdict" style="color:${S.color}">${verdict(id)}</p>
      <div class="school-actions">
        <button class="btn" id="sReport">＋ Signaler</button>
        <button class="btn ghost" id="sFav">${favs.has(id) ? "⭐ Favori" : "☆ Ajouter aux favoris"}</button>
        <button class="btn ghost" id="sChat">💬 Chat du lycée</button>
        <button class="btn ghost" id="sShare">🔗 Partager</button>
        <a class="btn ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}">🧭 Itinéraire</a>
      </div>`;
    $("#schoolBody").innerHTML = `
      <h3>🚪 Portails & entrées</h3>
      ${gates == null ? `<p class="muted">Recherche des portails…</p>` : gates.length ? `<div class="gates">${gates.map((g, i) => { const k = gateState(s, g.label); return `<span data-gate="${i}" title="Voir ce portail sur Google Maps" style="border-color:${k ? KINDS[k].color : "var(--line)"}">${k ? KINDS[k].icon : "🚪"} ${esc(g.label)}${g.src === "user" ? " ✍️" : ""}</span>`; }).join("")}</div><p class="muted small">Touche un portail pour le voir sur Google Maps juste au-dessus (ou sur la carte pour signaler son état). ✍️ = ajouté par la communauté.</p>` : `<p class="muted small">Aucun portail connu sur OpenStreetMap. Fais un appui long / clic droit sur la carte à l'emplacement d'une entrée pour l'ajouter.</p>`}
      ${bestGate(s)}
      <h3>📰 Derniers signalements</h3>
      <div class="list">${list.map((r) => reportCard(r)).join("") || `<div class="empty">Rien de signalé ici récemment.</div>`}</div>`;
    $("#sReport").onclick = () => openReport(s);
    $("#sFav").onclick = () => { favs.has(id) ? favs.delete(id) : favs.add(id); store.set("favs", [...favs]); refreshSchool(id); render(); fillRooms(); };
    $("#sChat").onclick = () => { closeSheet("schoolSheet"); currentSchool = s; fillRooms(); switchRoom("s:" + id); showTab("chat"); };
    $("#sShare").onclick = () => share(s);
    $$("#schoolBody [data-gate]").forEach((el) => el.onclick = () => {
      const g = s.gates[+el.dataset.gate];
      setSchoolMap(g.lat, g.lng, 20, g.label, s);
      $("#schoolMap").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };
  render();
  openSheet("schoolSheet");
  if (!silent && map.getZoom() < 16) map.flyTo([s.lat, s.lng], 17, { duration: 0.8 });
  if (!s.gates) { await loadGates(s); if (currentSchool === s) render(); }
  drawGates(s);
}
let schoolMapT = "k", schoolMapAt = null;
function setSchoolMap(lat, lng, z, label, s) {
  schoolMapAt = { lat, lng, z, label, s };
  const la = (+lat).toFixed(6), ln = (+lng).toFixed(6);
  $("#schoolMap").src = gEmbed(la, ln, z, schoolMapT, `${la},${ln}`);
  $("#schoolSV").href = gStreet(la, ln);
  $("#schoolGM").href = gOpen(la, ln);
  $$("#schoolMapSeg [data-t]").forEach((b) => b.classList.toggle("active", b.dataset.t === schoolMapT));
}
$("#schoolMapSeg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-t]"); if (!b || !schoolMapAt) return;
  schoolMapT = b.dataset.t; const a = schoolMapAt; setSchoolMap(a.lat, a.lng, a.z, a.label, a.s);
});
function bestGate(s) {
  if (!s.gates?.length) return "";
  const ok = s.gates.filter((g) => ["debloque", "calme"].includes(gateState(s, g.label)));
  const ko = s.gates.filter((g) => ["blocus", "partiel", "portail", "danger", "incendie"].includes(gateState(s, g.label)));
  if (!ok.length && !ko.length) return "";
  return `<div class="warn">🧭 <b>Conseil d'accès :</b> ${ok.length ? `passe par <b>${ok.map((g) => esc(g.label)).join(", ")}</b> (signalé ouvert).` : "aucune entrée signalée ouverte pour l'instant."} ${ko.length ? `Évite : ${ko.map((g) => esc(g.label)).join(", ")}.` : ""}</div>`;
}
async function share(s) {
  const url = location.origin + location.pathname + "#l=" + encodeURIComponent(s.id);
  const text = `${STATUS[statusOf(s.id)].label} — ${s.name} (Blocus Assault)`;
  try { if (navigator.share) await navigator.share({ title: text, url }); else { await navigator.clipboard.writeText(text + " " + url); toast("Lien copié 📋"); } } catch {}
}

/* ---------------- Formulaire de signalement ---------------- */
let selKind = null, selSev = 1;
$("#kindGrid").innerHTML = Object.entries(KINDS).map(([k, K]) => `<button type="button" data-kind="${k}" style="--c:${K.color}"><span>${K.icon}</span>${K.label}</button>`).join("");
$("#kindGrid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-kind]"); if (!b) return;
  selKind = b.dataset.kind; $$("#kindGrid button").forEach((x) => x.classList.toggle("active", x === b));
  selSev = Math.min(3, KINDS[selKind].sev); $$("#sevSeg button").forEach((x) => x.classList.toggle("active", +x.dataset.sev === selSev));
});
$("#sevSeg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sev]"); if (!b) return;
  selSev = +b.dataset.sev; $$("#sevSeg button").forEach((x) => x.classList.toggle("active", x === b));
});
async function openReport(s, gate, point) {
  pending = { s, point };
  $("#reportTarget").innerHTML = `<b>${esc(s.name)}</b>${s.city ? " · " + esc(s.city) : ""}`;
  const sel = $("#reportGate");
  const gates = s.gates || (s.src !== "zone" ? await loadGates(s) : (s.gates = []));
  if (gate && !gates.some((g) => g.label === gate.label)) gates.push(gate);
  sel.innerHTML = `<option value="">🏫 Le lycée en général</option>` +
    (point ? `<option value="__point" selected>📍 Point choisi sur la carte</option>` : "") +
    gates.map((g, i) => `<option value="${i}" ${gate && g.label === gate.label ? "selected" : ""}>${g.src === "cp" ? (CPK[g.kind] || CPK.autre).icon : "🚪"} ${esc(g.label)}</option>`).join("") +
    `<option value="__new">➕ Autre entrée / lieu précis…</option>`;
  selKind = null; $$("#kindGrid button").forEach((x) => x.classList.remove("active"));
  $("#reportMsg").value = "";
  $("#reportAs").innerHTML = session ? `Publié en tant que <b>${esc(session.pseudo)}</b>` : `Publié en <b>anonyme</b> — <a href="#" id="loginLink">se connecter</a> (facultatif)`;
  const ll = $("#loginLink"); if (ll) ll.onclick = (e) => { e.preventDefault(); openAccount(); };
  closeSheet("schoolSheet");
  openSheet("reportSheet");
}
$("#reportForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selKind) return toast("Choisis ce qui se passe 👆");
  const { s, point } = pending;
  let lat = s.lat, lng = s.lng, gate = null;
  const v = $("#reportGate").value;
  if (v === "__point") { lat = point[0]; lng = point[1]; gate = `Point ${cardinal(s, lat, lng)}`; }
  else if (v === "__new") {
    gate = (prompt("Nom de l'entrée (ex : Portail rue Victor-Hugo, Entrée gymnase)") || "").trim().slice(0, 80);
    if (!gate) return;
    if (point) { lat = point[0]; lng = point[1]; }
  } else if (v !== "") { const g = s.gates[+v]; gate = g.label; lat = g.lat; lng = g.lng; }
  const btn = $("#reportSubmit"); btn.disabled = true; btn.textContent = "Envoi…";
  const { error } = await sb.rpc("ba_post_report", {
    p_token: session?.token || null, p_school_id: s.id, p_school_name: s.name, p_city: s.city || null,
    p_lat: lat, p_lng: lng, p_gate: gate, p_kind: selKind, p_severity: selSev, p_message: $("#reportMsg").value.trim() || null,
  });
  btn.disabled = false; btn.textContent = "Publier le signalement";
  if (error) return toast("Erreur : " + error.message);
  closeSheet("reportSheet"); toast("✅ Signalement publié en direct");
  if (s.gates && gate && !s.gates.some((g) => g.label === gate)) s.gates.push({ label: gate, lat, lng, src: "user" });
});
function nearestSchool(lat, lng, maxKm) {
  let best = null, bd = maxKm;
  schools.forEach((s) => { const d = distKm(lat, lng, s.lat, s.lng); if (d < bd) { bd = d; best = s; } });
  return best;
}
function reportAt(latlng) {
  const { lat, lng } = latlng;
  let s = nearestSchool(lat, lng, 0.4);
  if (!s) {
    const name = (prompt("Aucun lycée connu ici. Nom du lieu (ex : Rond-point de la gare, Lycée X) :") || "").trim().slice(0, 120);
    if (!name) return;
    s = addSchool({ id: `zone:${lat.toFixed(4)},${lng.toFixed(4)}`, name, lat, lng, src: "zone", gates: [] });
    return openReport(s);
  }
  openReport(s, null, [lat, lng]);
}
$("#fabReport").onclick = () => {
  if (currentSchool) return openReport(currentSchool);
  pickMode = true; map.getContainer().style.cursor = "crosshair";
  toast("👆 Touche l'endroit exact sur la carte (portail, rue, lycée…)", 4000);
};

/* ---------------- Recherche ---------------- */
let searchTimer;
$("#searchInput").addEventListener("input", (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => search(e.target.value.trim()), 350); });
$("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); search($("#searchInput").value.trim()); });
document.addEventListener("click", (e) => { if (!e.target.closest(".search")) $("#searchResults").classList.remove("open"); });
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
async function search(q) {
  const box = $("#searchResults");
  if (q.length < 2) { box.classList.remove("open"); return; }
  const nq = norm(q);
  const local = [...schools.values()].filter((s) => norm(s.name + " " + (s.city || "")).includes(nq)).slice(0, 8)
    .map((s) => ({ name: s.name, sub: (s.city || "") + " · " + STATUS[statusOf(s.id)].label, lat: s.lat, lng: s.lng, id: s.id }));
  const draw = (items) => {
    box.innerHTML = items.map((it, i) => `<div data-i="${i}">${esc(it.name)}<small>${esc(it.sub)}</small></div>`).join("") || `<div class="muted">Aucun résultat</div>`;
    box.classList.add("open");
    box.onclick = (e) => {
      const d = e.target.closest("[data-i]"); if (!d) return;
      const it = items[+d.dataset.i]; box.classList.remove("open");
      if (it.id) { openSchool(it.id); } else { map.flyTo([it.lat, it.lng], it.zoom || 15); }
    };
  };
  draw(local);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=8&accept-language=fr&q=${encodeURIComponent(q)}`);
    const data = await r.json();
    draw([...local, ...data.map((d) => {
      const isSchool = d.type === "school" || d.class === "amenity";
      const id = isSchool ? `osm:${d.osm_type}/${d.osm_id}` : null;
      if (id) addSchool({ id, name: d.name || d.display_name.split(",")[0], city: d.display_name.split(",").slice(-4, -3)[0]?.trim(), lat: +d.lat, lng: +d.lon, src: "osm", osmType: d.osm_type, osmId: d.osm_id });
      return { name: d.name || d.display_name.split(",")[0], sub: d.display_name, lat: +d.lat, lng: +d.lon, id, zoom: isSchool ? 17 : 14 };
    })]);
  } catch {}
}

/* ---------------- Géolocalisation ---------------- */
function locate(cb) {
  if (!navigator.geolocation) return toast("Géolocalisation indisponible");
  navigator.geolocation.getCurrentPosition((p) => {
    myPos = [p.coords.latitude, p.coords.longitude];
    meLayer.clearLayers();
    L.circleMarker(myPos, { radius: 8, color: "#fff", weight: 3, fillColor: "#3c8dff", fillOpacity: 1 }).addTo(meLayer);
    if (modes.radar) L.circle(myPos, { radius: store.get("radius", 3) * 1000, color: "#3c8dff", weight: 1, fillOpacity: 0.05 }).addTo(meLayer);
    cb ? cb() : map.flyTo(myPos, 15);
    renderAll();
  }, () => toast("Position refusée"), { enableHighAccuracy: true, timeout: 10000 });
}
$("#locateBtn").onclick = () => locate();

/* ---------------- Chat ---------------- */
const roomName = (r) => r === "global" ? "🌍 Salon général" : "🏫 " + (schools.get(r.slice(2))?.name || "Lycée");
function fillRooms() {
  const rooms = new Set(["global", ...[...favs].map((f) => "s:" + f)]);
  if (currentSchool) rooms.add("s:" + currentSchool.id);
  rooms.add(chatRoom);
  $("#chatRoom").innerHTML = [...rooms].map((r) => `<option value="${esc(r)}" ${r === chatRoom ? "selected" : ""}>${esc(roomName(r))}</option>`).join("");
}
async function switchRoom(r) {
  chatRoom = r; fillRooms();
  $("#chatLog").innerHTML = `<div class="empty">Chargement…</div>`;
  const { data } = await sb.from("ba_chat").select("*").eq("room", r).order("created_at", { ascending: false }).limit(100);
  $("#chatLog").innerHTML = "";
  (data || []).reverse().forEach(drawMsg);
  if (!data?.length) $("#chatLog").innerHTML = `<div class="empty">Personne n'a encore écrit ici. Lance la discussion : qui est sur place ? de quoi avez-vous besoin ?</div>`;
}
const myName = () => session ? session.pseudo : "Invité-" + guestId;
function drawMsg(m) {
  const log = $("#chatLog"); log.querySelector(".empty")?.remove();
  const el = document.createElement("div");
  el.className = "msg" + (m.author === myName() ? " me" : "");
  el.innerHTML = `<b>${esc(m.author)}</b><time>${new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time><div>${esc(m.message)}</div>`;
  const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  log.appendChild(el);
  if (stick || m.author === myName()) log.scrollTop = log.scrollHeight;
}
function onChat(m) { if (m.room === chatRoom) drawMsg(m); }
$("#chatRoom").onchange = (e) => switchRoom(e.target.value);
$("#chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const i = $("#chatInput"), msg = i.value.trim(); if (!msg) return;
  i.value = "";
  const { error } = await sb.rpc("ba_post_chat", { p_token: session?.token || null, p_room: chatRoom, p_message: msg, p_guest: guestId });
  if (error) { toast("Erreur : " + error.message); i.value = msg; }
});

/* ---------------- Compte (pseudo + mot de passe, sans e-mail) ---------------- */
function openAccount() {
  const body = $("#accountBody");
  if (session) {
    body.innerHTML = `<h2>👤 ${esc(session.pseudo)}</h2><p class="muted">Tes signalements et messages apparaissent sous ce pseudo.</p>
      <button class="btn ghost big" id="logout">Se déconnecter</button>`;
    $("#logout").onclick = () => { session = null; store.set("session", null); updateAccount(); closeSheet("accountSheet"); toast("Déconnecté"); };
  } else {
    body.innerHTML = `<h2>Compte (facultatif)</h2>
      <p class="muted">Pas besoin de compte pour signaler ou discuter. Un compte permet juste d'avoir ton pseudo. <b>Aucun e-mail demandé.</b></p>
      <div class="warn">🔐 Choisis un mot de passe que tu n'utilises <b>nulle part ailleurs</b>. N'utilise pas ton vrai nom comme pseudo.</div>
      <div class="seg" id="accMode"><button class="active" data-m="login">Se connecter</button><button data-m="register">Créer un compte</button></div>
      <form id="accForm">
        <label class="lbl">Pseudo</label><input class="field" id="accPseudo" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_.\\-]{3,20}" autocomplete="username">
        <label class="lbl">Mot de passe</label><input class="field" id="accPass" type="password" required minlength="6" autocomplete="current-password">
        <button class="btn big" id="accSubmit">Se connecter</button>
      </form>`;
    let mode = "login";
    $("#accMode").onclick = (e) => {
      const b = e.target.closest("[data-m]"); if (!b) return; mode = b.dataset.m;
      $$("#accMode button").forEach((x) => x.classList.toggle("active", x === b));
      $("#accSubmit").textContent = mode === "login" ? "Se connecter" : "Créer mon compte";
    };
    $("#accForm").onsubmit = async (e) => {
      e.preventDefault();
      const { data, error } = await sb.rpc(mode === "login" ? "ba_login" : "ba_register", { p_pseudo: $("#accPseudo").value.trim(), p_pass: $("#accPass").value });
      if (error) return toast("❌ " + error.message);
      session = data; store.set("session", session); updateAccount(); closeSheet("accountSheet"); toast("Bienvenue " + session.pseudo + " 👋");
    };
  }
  openSheet("accountSheet");
}
function updateAccount() { $("#accountLabel").textContent = session ? session.pseudo : "Connexion"; $("#chatWho").textContent = "Tu écris en tant que " + myName(); }
$("#accountBtn").onclick = openAccount;

/* ---------------- Modes ---------------- */
const MODES = [
  ["wake", "🌅", "Mode Réveil", "Au réveil : l'état de tes lycées favoris et le verdict « j'y vais ou pas »."],
  ["radar", "📡", "Radar trajet", "Alerte dès qu'un incident est signalé autour de toi (rayon réglable)."],
  ["fiable", "✅", "Mode Fiable", "Masque les infos contestées et non confirmées par d'autres."],
  ["heat", "🔥", "Carte de chaleur", "Visualise les zones les plus chaudes des dernières 24 h."],
  ["time", "⏪", "Remonter le temps", "Rejoue la carte telle qu'elle était il y a 1 à 48 h."],
  ["notif", "🔔", "Notifications", "Notification sur ton téléphone/PC pour tes favoris et les urgences."],
  ["sound", "🔊", "Sirène", "Bip sonore à chaque alerte urgente (incendie, gaz, intrusion…)."],
  ["discret", "🕶️", "Mode Discret", "Écran assombri, aucun son ni bandeau. Pour consulter sans attirer l'attention."],
  ["allSchools", "🏫", "Toutes les écoles", "Affiche aussi collèges et écoles, pas seulement les lycées."],
  ["brief", "🗓️", "Résumé du jour", "Les chiffres clés et les villes les plus touchées aujourd'hui."],
];
let openMode = store.get("openMode", modes.wake ? "wake" : null);
function renderModes() {
  $("#modes").innerHTML = MODES.map(([k, ic, n, d]) => {
    const on = k === "time" ? timeShift > 0 : k === "brief" ? openMode === "brief" : modes[k];
    return `<button class="mode${on ? " on" : ""}" data-mode="${k}"><span class="ic">${ic}</span><b>${n}</b><small>${d}</small></button>`;
  }).join("");
  renderModeOutput();
}
$("#modes").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-mode]"); if (!b) return;
  const k = b.dataset.mode;
  if (k === "time" || k === "brief") { openMode = openMode === k ? null : k; if (k === "time" && openMode !== "time") { timeShift = 0; refreshAll(); } }
  else {
    modes[k] = !modes[k];
    if (k === "notif" && modes.notif && "Notification" in window && Notification.permission !== "granted") {
      const p = await Notification.requestPermission(); if (p !== "granted") { modes.notif = false; toast("Notifications refusées par le navigateur"); }
    }
    if (k === "sound" && modes.sound) { beep(); }
    if (k === "radar" && modes.radar) locate(() => {});
    if (k === "allSchools") { loadOSM(); }
    if (k === "heat") $("#heatBtn").classList.toggle("on", modes.heat);
    if (k === "discret") applyDiscret();
    if (k === "fiable") refreshAll();
    if (k === "heat") renderEvents();
    if (k === "wake" || k === "radar") openMode = modes[k] ? k : openMode === k ? null : openMode;
    store.set("modes", modes);
  }
  store.set("openMode", openMode);
  renderModes();
});
$("#heatBtn").onclick = () => { modes.heat = !modes.heat; store.set("modes", modes); $("#heatBtn").classList.toggle("on", modes.heat); renderEvents(); renderModes(); };
$("#heatBtn").classList.toggle("on", modes.heat);
function applyDiscret() {
  $("#discreetVeil").classList.toggle("hidden", !modes.discret);
  if (modes.discret) $("#alertBanner").classList.add("hidden");
}
function verdict(id) {
  const st = statusOf(id);
  return { blocus: "🚫 Accès bloqué — attends ou vérifie les autres entrées", partiel: "⚠️ Partiellement bloqué — passe par une entrée signalée ouverte", annule: "🏠 Cours annulés / lycée fermé", incident: "⚠️ Incidents en cours — prudence", debloque: "✅ Tu peux y aller", calme: "✅ Tu peux y aller", none: "❔ Pas d'info récente — sois le premier à signaler" }[st];
}
function renderModeOutput() {
  const out = $("#modeOutput");
  if (openMode === "wake") {
    const list = [...favs].map((f) => schools.get(f)).filter(Boolean);
    out.innerHTML = `<h3>🌅 Bonjour ! État de tes lycées</h3>` + (list.length ? list.map((s) => {
      const st = statusOf(s.id); const last = recentFor(s.id)[0];
      return `<div class="card" style="--c:${STATUS[st].color}"><div class="h"><span class="k s" data-school="${esc(s.id)}">${esc(s.name)}</span><span class="status-pill" style="background:${STATUS[st].color}">${STATUS[st].label}</span></div><p>${verdict(s.id)}</p><div class="f">${last ? `Dernière info ${ago(last.created_at)} : ${KINDS[last.kind].icon} ${esc(KINDS[last.kind].label)}` : ""}</div></div>`;
    }).join("") + `<button class="btn ghost big" id="shareWake">📤 Envoyer ce résumé à mes potes</button>`
      : `<div class="empty">Ajoute ton lycée en favori ⭐ (touche-le sur la carte) pour voir son état ici chaque matin.</div>`);
    const sw = $("#shareWake");
    if (sw) sw.onclick = async () => {
      const txt = list.map((s) => `${STATUS[statusOf(s.id)].label} — ${s.name}`).join("\n") + "\nvia Blocus Assault " + location.origin;
      try { navigator.share ? await navigator.share({ text: txt }) : (await navigator.clipboard.writeText(txt), toast("Copié 📋")); } catch {}
    };
  } else if (openMode === "radar") {
    const R = store.get("radius", 3);
    let html = `<h3>📡 Radar trajet</h3><div class="seg" id="radSeg">${[1, 3, 5, 10, 25].map((r) => `<button data-r="${r}" class="${r === R ? "active" : ""}">${r} km</button>`).join("")}</div>`;
    if (!myPos) html += `<div class="empty">Autorise la localisation pour activer le radar.<br><button class="btn" id="radLoc" style="margin-top:10px">📍 Me localiser</button></div>`;
    else {
      const t = now();
      const near = reports.filter((r) => t - new Date(r.created_at) < CFG.statusWindowHours * HOUR && !isContested(r) && isTrusted(r))
        .map((r) => [r, distKm(myPos[0], myPos[1], r.lat, r.lng)]).filter(([, d]) => d <= R).sort((a, b) => a[1] - b[1]);
      html += near.length ? near.map(([r, d]) => `<div class="muted small" style="margin:6px 0 2px">📍 à ${d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1) + " km"}</div>` + reportCard(r)).join("") : `<div class="empty">✅ Rien de signalé dans un rayon de ${R} km.</div>`;
    }
    out.innerHTML = html;
    $("#radSeg").onclick = (e) => { const b = e.target.closest("[data-r]"); if (b) { store.set("radius", +b.dataset.r); if (myPos) locate(() => {}); renderModeOutput(); } };
    const rl = $("#radLoc"); if (rl) rl.onclick = () => locate(() => renderModeOutput());
  } else if (openMode === "time") {
    const h = Math.round(timeShift / HOUR);
    out.innerHTML = `<h3>⏪ Remonter le temps</h3><p>Carte affichée : <b>${h ? `il y a ${h} h (${new Date(now()).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })})` : "maintenant"}</b></p>
      <input type="range" id="timeRange" min="0" max="48" step="1" value="${h}" style="width:100%">
      <div class="seg" style="margin-top:8px"><button id="timePlay">▶️ Rejouer les 24 dernières heures</button><button id="timeNow">⏩ Revenir au direct</button></div>`;
    $("#timeRange").oninput = (e) => { timeShift = +e.target.value * HOUR; refreshAll(); };
    $("#timeNow").onclick = () => { clearInterval(renderModeOutput.play); timeShift = 0; refreshAll(); };
    $("#timePlay").onclick = () => {
      clearInterval(renderModeOutput.play); timeShift = 24 * HOUR; refreshAll();
      renderModeOutput.play = setInterval(() => { timeShift = Math.max(0, timeShift - HOUR); refreshAll(); if (!timeShift) clearInterval(renderModeOutput.play); }, 700);
    };
  } else if (openMode === "brief") {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tr = reports.filter((r) => new Date(r.created_at) >= today);
    const cities = {}; tr.forEach((r) => { if (r.city) cities[r.city] = (cities[r.city] || 0) + 1; });
    const kinds = {}; tr.forEach((r) => (kinds[r.kind] = (kinds[r.kind] || 0) + 1));
    const top = Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 8);
    out.innerHTML = `<h3>🗓️ Aujourd'hui</h3><p><b>${tr.length}</b> signalements · <b>${new Set(tr.map((r) => r.school_id)).size}</b> lieux concernés</p>
      <div class="gates">${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span>${KINDS[k]?.icon} ${KINDS[k]?.label} : <b>${n}</b></span>`).join("") || "<span>Rien encore</span>"}</div>
      <h3>🏙️ Villes les plus touchées</h3>${top.map(([c, n]) => `<div class="card"><div class="h"><b>${esc(c)}</b><b>${n}</b></div></div>`).join("") || `<p class="muted">Pas encore de données.</p>`}`;
  } else out.innerHTML = `<p class="muted small">Touche un mode pour l'activer. Les modes restent mémorisés sur cet appareil.</p>`;
}

/* ---------------- Onglets & panneau mobile ---------------- */
function showTab(t) {
  $$("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
  $$(".tab").forEach((x) => x.classList.toggle("active", x.id === "tab-" + t));
  if (t === "modes") renderModes();
  if (t === "chat" && !$("#chatLog").childElementCount) switchRoom(chatRoom);
  if (t === "rank") loadRanking();
  const p = $("#panel"); if (p.classList.contains("collapsed")) { p.classList.remove("collapsed"); document.body.classList.remove("panel-collapsed"); }
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });
$("#panelGrip").onclick = () => {
  const p = $("#panel");
  if (p.classList.contains("collapsed")) { p.classList.remove("collapsed"); p.classList.add("expanded"); }
  else if (p.classList.contains("expanded")) { p.classList.remove("expanded"); }
  else p.classList.add("collapsed");
  document.body.classList.toggle("panel-collapsed", p.classList.contains("collapsed"));
  setTimeout(() => map.invalidateSize(), 300);
};

/* ---------------- Démarrage ---------------- */
renderLegend(); updateAccount(); applyDiscret(); fillRooms(); renderAll();
map.getContainer().classList.toggle("show-labels", map.getZoom() >= 14);
loadReports().then(() => {
  const m = location.hash.match(/^#l=(.+)$/);
  if (m) { const id = decodeURIComponent(m[1]); if (schools.has(id)) openSchool(id); }
});
loadRanking();
loadCheckpoints();
scheduleOSM();
if (modes.wake && favs.size) { showTab("modes"); openMode = "wake"; renderModes(); }
if (modes.radar) locate(() => {});
setInterval(() => { if (!timeShift) refreshAll(); }, 60e3); // les vieux signalements expirent
})();
