"use strict";

const APP = {
  schemaVersion: "map-builder-1",
  scenarioVersion: "gallup-flood-v1",
  maxScore: 15,
  endpoint: window.MAP_BUILDER_ENDPOINT || "",
  storagePrefix: "hmhs-gallup-map-builder:",
  queueKey: "hmhs-gallup-map-builder:event-queue",
  bounds: [[35.485, -108.805], [35.548, -108.680]],
  initialView: [35.512, -108.742],
  initialZoom: 13,
  depot: [-108.7395907, 35.5081410],
};

const DATA_SOURCES = {
  flood: { file: "data/flood-zones.geojson", label: "Simulated flood zones", color: "#d34a4a", defaultVisible: true },
  water: { file: "data/waterways.geojson", label: "Waterways & drainage", color: "#277cc1", defaultVisible: false },
  roads: { file: "data/roads.geojson", label: "Open emergency roads", color: "#168c83", defaultVisible: true },
  closures: { file: "data/road-closures.geojson", label: "Simulated road closures", color: "#b52e2e", defaultVisible: true },
  needs: { file: "data/need-zones.geojson", label: "Priority-need areas", color: "#dd7d20", defaultVisible: true },
  facilities: { file: "data/candidate-facilities.geojson", label: "Candidate facilities", color: "#6d45a4", defaultVisible: true },
  landmarks: { file: "data/landmarks.geojson", label: "Real reference landmarks", color: "#2973a8", defaultVisible: false },
  depot: { file: "data/supply-depot.geojson", label: "Emergency supply depot", color: "#152f4d", defaultVisible: true },
};

const BASEMAPS = {
  streets: {
    label: "Streets",
    reason: "streets",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" },
  },
  topo: {
    label: "Topographic",
    reason: "topo",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
    options: { maxZoom: 16, attribution: "USGS The National Map" },
  },
  aerial: {
    label: "Aerial",
    reason: "aerial",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    options: { maxZoom: 16, attribution: "USGS The National Map" },
  },
};

const CHECKPOINTS = [
  { id: "p1_basemaps", phase: 0, label: "Compare all three basemaps." },
  { id: "p1_inspection", phase: 0, label: "Inspect features from at least three reference layers." },
  { id: "p2_basemap_reason", phase: 1, label: "Choose a final basemap and the reason that matches it." },
  { id: "p2_layers", phase: 1, label: "Show every required evidence layer." },
  { id: "p3_point", phase: 2, label: "Create one proposed relief-center point." },
  { id: "p3_candidate", phase: 2, label: "Place the point on a candidate facility." },
  { id: "p3_flood", phase: 2, label: "Keep the point outside both simulated flood zones." },
  { id: "p3_access", phase: 2, label: "Place it near an open road and a priority-need area." },
  { id: "p4_route", phase: 3, label: "Create a supply route with at least two points." },
  { id: "p4_endpoints", phase: 3, label: "Start at the depot and finish at the relief center." },
  { id: "p4_safe", phase: 3, label: "Follow open roads and avoid closures and high flood risk." },
  { id: "p5_area", phase: 4, label: "Finish a service-area polygon with at least three points." },
  { id: "p5_coverage", phase: 4, label: "Include the center and at least two high-priority need areas." },
  { id: "p6_cartography", phase: 5, label: "Use the required title and confirm the legend." },
  { id: "p6_evidence", phase: 5, label: "Complete a claim supported by two valid pieces of map evidence." },
];

const PHASES = [
  {
    short: "Investigate",
    title: "Investigate the map",
    purpose: "Learn what each basemap and reference layer contributes before making a design decision.",
    instructions: [
      "Select Streets, Topographic, and Aerial. Notice how the background changes while the GIS layers remain aligned.",
      "Turn reference layers on and off. A layer is mapped information placed over the basemap.",
      "Use Inspect and click symbols, lines, or shaded areas. Read evidence from at least three different layer types.",
    ],
  },
  {
    short: "Prepare",
    title: "Prepare the final map",
    purpose: "Choose a useful background and display the evidence needed to make a defensible decision.",
    instructions: [
      "Choose the basemap you want behind your final map.",
      "Select the statement that correctly explains what that basemap helps a reader see.",
      "Turn on flood zones, open roads, closures, need areas, candidate facilities, and the supply depot.",
    ],
  },
  {
    short: "Center",
    title: "Create the relief-center layer",
    purpose: "Create a point layer that identifies a safe, accessible facility near people who need supplies.",
    instructions: [
      "Select the Point tool, then click a candidate facility. The point snaps to a nearby candidate.",
      "Use the map evidence to keep the center outside both flood zones.",
      "Make sure the center is close to an open emergency road and a priority-need area.",
    ],
  },
  {
    short: "Route",
    title: "Create the supply-route layer",
    purpose: "Create a line layer that shows how supplies can move from the depot to the proposed center.",
    instructions: [
      "Select Route. The route begins automatically at the Emergency Supply Depot.",
      "Click along the open-road corridors to add route points. Finish by clicking near your relief center.",
      "Use Undo or Clear Current if the line enters a closure or the high flood zone.",
    ],
  },
  {
    short: "Area",
    title: "Create the service-area layer",
    purpose: "Create a polygon layer showing which priority-need areas your relief center will serve.",
    instructions: [
      "Select Area and click at least three locations to outline the service area.",
      "Draw the polygon around your relief center and at least two high-priority need symbols.",
      "Select Finish Area when the shape is complete. Use Undo or Clear Current to revise it.",
    ],
  },
  {
    short: "Defend",
    title: "Complete and defend the map",
    purpose: "Finish the cartographic elements and explain why your mapped solution is supported by geographic evidence.",
    instructions: [
      "Use the required map title and confirm that the visible legend matches the map.",
      "Identify your selected facility and choose two different pieces of evidence that the map actually supports.",
      "Explain why your route is appropriate, then write a short claim using the mapped evidence.",
    ],
  },
];

let state = null;
let map = null;
let basemapLayers = {};
let activeBasemapLayer = null;
let referenceData = {};
let referenceLayers = {};
let studentLayers = {};
let activeTool = "inspect";
let activePhase = 0;
let storageKey = "";
let tileErrorCount = 0;
let autosaveTimer = null;
let lastPhaseResults = {};

const el = (id) => document.getElementById(id);
const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
const unique = (items) => [...new Set(items)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

document.addEventListener("DOMContentLoaded", async () => {
  initializeMap();
  bindStaticEvents();
  renderPhaseNav();
  renderBasemapButtons();
  renderLayerToggles();
  try {
    await loadReferenceData();
    renderReferenceLayers();
    updateLegend();
  } catch (error) {
    console.error(error);
    el("tileWarning").textContent = "Some local map evidence could not load. Refresh the page before beginning.";
    el("tileWarning").classList.remove("hidden");
  }
});

function createInitialState(studentName, period) {
  const checkpoints = {};
  CHECKPOINTS.forEach((checkpoint) => {
    checkpoints[checkpoint.id] = { attempts: 0, available: 1, earned: 0, passed: false };
  });
  return {
    schemaVersion: APP.schemaVersion,
    scenarioVersion: APP.scenarioVersion,
    sessionId: newId(),
    studentName,
    period,
    currentPhase: 0,
    basemap: "streets",
    viewedBasemaps: ["streets"],
    inspectedLayerTypes: [],
    visibleLayers: Object.entries(DATA_SOURCES).filter(([, meta]) => meta.defaultVisible).map(([key]) => key),
    reliefCenter: null,
    supplyRoute: [],
    serviceArea: [],
    serviceAreaFinished: false,
    basemapReason: "",
    finalTitle: `Gallup Flash-Flood Relief Map — ${studentName}`,
    legendConfirmed: false,
    evidence: { location: "", first: "", second: "", route: "", claim: "" },
    checkpoints,
    score: 0,
    status: "in_progress",
    completedAt: null,
    lastSavedAt: null,
  };
}

function initializeMap() {
  const bounds = L.latLngBounds(APP.bounds);
  map = L.map("map", {
    center: APP.initialView,
    zoom: APP.initialZoom,
    minZoom: 12,
    maxZoom: 18,
    maxBounds: bounds.pad(.08),
    maxBoundsViscosity: .9,
    zoomControl: true,
    preferCanvas: true,
  });

  Object.entries(BASEMAPS).forEach(([id, config]) => {
    const layer = L.tileLayer(config.url, config.options);
    layer.on("tileerror", handleTileError);
    basemapLayers[id] = layer;
  });
  basemapLayers.fallback = L.layerGroup();
  activeBasemapLayer = basemapLayers.streets.addTo(map);

  studentLayers.point = L.layerGroup().addTo(map);
  studentLayers.route = L.layerGroup().addTo(map);
  studentLayers.area = L.layerGroup().addTo(map);
  map.on("click", handleMapClick);
}

async function loadReferenceData() {
  const entries = await Promise.all(Object.entries(DATA_SOURCES).map(async ([id, meta]) => {
    const response = await fetch(meta.file, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Could not load ${meta.file}`);
    return [id, await response.json()];
  }));
  referenceData = Object.fromEntries(entries);
}

function renderReferenceLayers() {
  Object.entries(referenceData).forEach(([id, data]) => {
    referenceLayers[id] = L.geoJSON(data, {
      style: (feature) => styleFeature(id, feature),
      pointToLayer: (feature, latlng) => markerForFeature(id, feature, latlng),
      onEachFeature: (feature, layer) => {
        layer.on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          inspectFeature(feature);
        });
        if (["facilities", "needs", "depot", "landmarks"].includes(id)) {
          layer.bindTooltip(feature.properties.name, { direction: "top", offset: [0, -10], className: "feature-label" });
        }
      },
    });
  });
  syncReferenceLayerVisibility();
}

function styleFeature(id, feature) {
  if (id === "flood") {
    const high = feature.properties.risk === "High";
    return { color: high ? "#a91d2b" : "#d45c57", weight: high ? 3 : 2, fillColor: high ? "#cf2b3d" : "#ef8c75", fillOpacity: high ? .34 : .2, dashArray: high ? null : "7 5" };
  }
  if (id === "water") return { color: "#247ac1", weight: 4, opacity: .9, dashArray: "9 5" };
  if (id === "roads") return { color: "#087f79", weight: 7, opacity: .82, lineCap: "round" };
  if (id === "closures") return { color: "#a92330", weight: 7, opacity: .95, dashArray: "4 7", lineCap: "butt" };
  return { color: DATA_SOURCES[id].color, weight: 3, fillOpacity: .25 };
}

function markerForFeature(id, feature, latlng) {
  const symbols = { facilities: "F", needs: "!", landmarks: "◆", depot: "D" };
  const icon = L.divIcon({
    className: "",
    html: `<div class="map-icon ${id === "facilities" ? "facility" : id === "needs" ? "need" : id === "landmarks" ? "landmark" : "depot"}">${symbols[id] || "•"}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  return L.marker(latlng, { icon, keyboard: true, title: feature.properties.name });
}

function inspectFeature(feature) {
  const type = feature.properties.layerType;
  if (state) {
    state.inspectedLayerTypes = unique([...state.inspectedLayerTypes, type]);
    scheduleSave();
    if (activePhase === 0) renderPhase();
  }
  const hiddenKeys = new Set(["id", "layerType", "description", "name"]);
  const details = Object.entries(feature.properties)
    .filter(([key, value]) => !hiddenKeys.has(key) && value !== "")
    .map(([key, value]) => `<dt>${escapeHtml(titleCase(key))}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
  el("featureCard").classList.remove("empty");
  el("featureCard").innerHTML = `<h3>${escapeHtml(feature.properties.name)}</h3><div>${escapeHtml(feature.properties.description || "Mapped reference feature.")}</div>${details ? `<dl>${details}</dl>` : ""}`;
}

function titleCase(text) {
  return String(text).replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}

function bindStaticEvents() {
  el("loginForm").addEventListener("submit", handleLogin);
  el("closeTutorial").addEventListener("click", closeTutorial);
  el("helpButton").addEventListener("click", () => el("tutorialOverlay").classList.remove("hidden"));
  el("checkStep").addEventListener("click", checkCurrentPhase);
  el("resetViewButton").addEventListener("click", resetView);
  el("undoButton").addEventListener("click", undoCurrentFeature);
  el("clearFeatureButton").addEventListener("click", clearCurrentFeature);
  el("finishAreaButton").addEventListener("click", finishServiceArea);
  el("returnToMap").addEventListener("click", () => el("successOverlay").classList.add("hidden"));
  el("printSummary").addEventListener("click", () => window.print());
  document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => activateTool(button.dataset.tool)));
  window.addEventListener("online", processEventQueue);
  window.addEventListener("beforeunload", saveLocalState);
}

function handleLogin(event) {
  event.preventDefault();
  const name = el("studentName").value.trim().replace(/\s+/g, " ");
  const period = new FormData(event.currentTarget).get("period");
  const nameParts = name.split(" ").filter(Boolean);
  if (nameParts.length < 2 || name.length < 5 || name.length > 60) {
    el("loginError").textContent = "Enter your full first and last name.";
    return;
  }
  if (!["6", "7"].includes(period)) {
    el("loginError").textContent = "Select Period 6 or Period 7.";
    return;
  }

  storageKey = `${APP.storagePrefix}${period}:${name.toLowerCase()}`;
  const stored = readStoredState(storageKey);
  const resumed = Boolean(stored && stored.schemaVersion === APP.schemaVersion && stored.studentName.toLowerCase() === name.toLowerCase());
  state = resumed ? normalizeStoredState(stored) : createInitialState(name, period);
  activePhase = clamp(state.currentPhase, 0, PHASES.length - 1);
  el("studentDisplay").textContent = `${state.studentName} · P${state.period}`;
  el("loginOverlay").classList.add("hidden");
  el("app").setAttribute("aria-hidden", "false");
  switchBasemap(state.basemap, false);
  syncReferenceLayerVisibility();
  renderStudentFeatures();
  renderEverything();
  setTimeout(() => map.invalidateSize(), 50);
  saveLocalState();
  queueEvent("start", { resumed });
  if (!resumed) el("tutorialOverlay").classList.remove("hidden");
  if (state.status === "completed") showSuccess();
}

function normalizeStoredState(stored) {
  const fresh = createInitialState(stored.studentName, stored.period);
  const merged = { ...fresh, ...stored, evidence: { ...fresh.evidence, ...(stored.evidence || {}) }, checkpoints: { ...fresh.checkpoints, ...(stored.checkpoints || {}) } };
  merged.score = calculateScore(merged);
  return merged;
}

function closeTutorial() {
  el("tutorialOverlay").classList.add("hidden");
  setTimeout(() => map.invalidateSize(), 50);
}

function renderEverything() {
  renderPhaseNav();
  renderPhase();
  renderBasemapButtons();
  renderLayerToggles();
  updateLegend();
  updateScore();
  updateToolButtons();
  map.getContainer().classList.toggle("drawing-cursor", activeTool !== "inspect");
  updateMapPrompt();
}

function renderPhaseNav() {
  el("phaseNav").innerHTML = PHASES.map((phase, index) => {
    const unlocked = state ? index <= state.currentPhase : index === 0;
    const complete = state ? phaseComplete(index) : false;
    return `<button class="phase-tab ${index === activePhase ? "current" : ""} ${complete ? "complete" : ""} ${unlocked ? "" : "locked"}" data-phase="${index}" ${unlocked ? "" : "disabled"}><span>${complete ? "✓" : index + 1}</span><b>${escapeHtml(phase.short)}</b></button>`;
  }).join("");
  el("phaseNav").querySelectorAll("[data-phase]").forEach((button) => button.addEventListener("click", () => {
    if (!state || Number(button.dataset.phase) > state.currentPhase) return;
    activePhase = Number(button.dataset.phase);
    activateTool("inspect");
    renderEverything();
  }));
}

function renderPhase() {
  if (!state) return;
  const phase = PHASES[activePhase];
  el("phaseNumber").textContent = activePhase + 1;
  el("phaseLabel").textContent = `Phase ${activePhase + 1} of ${PHASES.length}`;
  el("phaseTitle").textContent = phase.title;
  el("phasePurpose").textContent = phase.purpose;
  el("phaseInstructions").innerHTML = phase.instructions.map((instruction, index) => `<div class="instruction"><span>${index + 1}</span><p>${instruction}</p></div>`).join("");
  renderPhaseControls();
  renderRequirements();
  const readyToSubmit = activePhase === 5 && phaseComplete(5) && state.status !== "completed";
  el("checkStep").textContent = readyToSubmit ? "Submit Final Map" : phaseComplete(activePhase) ? "Step Complete" : "Check This Step";
  el("checkStep").disabled = phaseComplete(activePhase) && !readyToSubmit;
}

function renderPhaseControls() {
  const container = el("phaseControls");
  if (activePhase === 0) {
    container.innerHTML = `<div class="feedback neutral">Basemaps viewed: <strong>${state.viewedBasemaps.length}/3</strong> · Layer types inspected: <strong>${state.inspectedLayerTypes.length}/3</strong></div>`;
  } else if (activePhase === 1) {
    container.innerHTML = `<div class="control-block"><label for="basemapReason">Why is your current basemap useful?</label><select id="basemapReason"><option value="">Choose one...</option><option value="streets">It clearly shows roads and transportation access.</option><option value="topo">It clearly shows terrain, contours, and elevation.</option><option value="aerial">It clearly shows buildings and visible ground conditions.</option></select></div>`;
    el("basemapReason").value = state.basemapReason;
    el("basemapReason").addEventListener("change", (event) => { state.basemapReason = event.target.value; scheduleSave(); });
  } else if (activePhase === 2) {
    const nearest = state.reliefCenter ? nearestCandidate(state.reliefCenter) : null;
    container.innerHTML = `<button class="secondary" id="activatePoint">Activate Point Tool</button>${nearest ? `<div class="feedback neutral">Nearest candidate: <strong>${escapeHtml(nearest.feature.properties.name)}</strong> (${Math.round(nearest.distance)} m away)</div>` : ""}`;
    el("activatePoint").addEventListener("click", () => activateTool("point"));
  } else if (activePhase === 3) {
    container.innerHTML = `<button class="secondary" id="activateRoute">Activate Route Tool</button><div class="feedback neutral">Route points: <strong>${state.supplyRoute.length}</strong>. Start and finish are validated when you check the step.</div>`;
    el("activateRoute").addEventListener("click", () => activateTool("route"));
  } else if (activePhase === 4) {
    container.innerHTML = `<button class="secondary" id="activateArea">Activate Area Tool</button><div class="feedback neutral">Area points: <strong>${state.serviceArea.length}</strong> · ${state.serviceAreaFinished ? "Polygon finished" : "Polygon not finished"}</div>`;
    el("activateArea").addEventListener("click", () => activateTool("area"));
  } else {
    renderEvidenceControls(container);
  }
}

function renderEvidenceControls(container) {
  const facilities = referenceData.facilities?.features || [];
  const facilityOptions = facilities.map((feature) => `<option value="${feature.properties.id}">${escapeHtml(feature.properties.name)}</option>`).join("");
  const evidenceOptions = [
    ["outside_flood", "The center is outside both simulated flood zones."],
    ["open_road", "The center is close to an open emergency road."],
    ["near_need", "The center is close to a high-priority need area."],
    ["generator", "The selected facility has a simulated backup generator."],
    ["capacity", "The selected facility has a simulated capacity of at least 350 people."],
  ].map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  container.innerHTML = `
    <div class="control-block"><label for="mapTitle">Final map title</label><input id="mapTitle" value="${escapeHtml(state.finalTitle)}"></div>
    <label class="period-choice"><input id="legendConfirmed" type="checkbox" ${state.legendConfirmed ? "checked" : ""}> I checked that every visible map layer has a matching legend entry.</label>
    <div class="control-block"><label for="evidenceLocation">I placed the relief center at...</label><select id="evidenceLocation"><option value="">Choose the facility...</option>${facilityOptions}</select></div>
    <div class="control-row">
      <div class="control-block"><label for="evidenceFirst">First mapped evidence</label><select id="evidenceFirst"><option value="">Choose evidence...</option>${evidenceOptions}</select></div>
      <div class="control-block"><label for="evidenceSecond">Second mapped evidence</label><select id="evidenceSecond"><option value="">Choose different evidence...</option>${evidenceOptions}</select></div>
    </div>
    <div class="control-block"><label for="routeReason">The supply route is appropriate because...</label><select id="routeReason"><option value="">Choose one...</option><option value="endpoints">It begins at the depot and ends at the relief center.</option><option value="safe">It avoids simulated closures and the high flood zone.</option><option value="roads">It follows the open emergency-road corridors.</option></select></div>
    <div class="control-block"><label for="claimText">Write a short claim using your two pieces of evidence (at least 15 words).</label><textarea id="claimText" placeholder="I chose this location because the map shows...">${escapeHtml(state.evidence.claim)}</textarea></div>`;
  el("evidenceLocation").value = state.evidence.location;
  el("evidenceFirst").value = state.evidence.first;
  el("evidenceSecond").value = state.evidence.second;
  el("routeReason").value = state.evidence.route;
  [["mapTitle", "finalTitle"], ["legendConfirmed", "legendConfirmed"]].forEach(([id, key]) => {
    el(id).addEventListener(id === "legendConfirmed" ? "change" : "input", (event) => { state[key] = id === "legendConfirmed" ? event.target.checked : event.target.value; scheduleSave(); });
  });
  [["evidenceLocation", "location"], ["evidenceFirst", "first"], ["evidenceSecond", "second"], ["routeReason", "route"], ["claimText", "claim"]].forEach(([id, key]) => {
    el(id).addEventListener(id === "claimText" ? "input" : "change", (event) => { state.evidence[key] = event.target.value; scheduleSave(); });
  });
}

function renderRequirements() {
  const checkpoints = CHECKPOINTS.filter((checkpoint) => checkpoint.phase === activePhase);
  el("requirementsList").innerHTML = checkpoints.map((checkpoint) => {
    const progress = state.checkpoints[checkpoint.id];
    const result = lastPhaseResults[checkpoint.id];
    const statusClass = progress.passed ? "passed" : result && !result.pass ? "failed" : "";
    const icon = progress.passed ? "✓" : result && !result.pass ? "!" : "•";
    return `<div class="requirement ${statusClass}"><span class="requirement-icon">${icon}</span><span>${escapeHtml(checkpoint.label)}</span><small>${progress.passed ? progress.earned.toFixed(1) : progress.available.toFixed(1)} pt</small></div>`;
  }).join("");
  const available = checkpoints.reduce((sum, checkpoint) => sum + (state.checkpoints[checkpoint.id].passed ? state.checkpoints[checkpoint.id].earned : state.checkpoints[checkpoint.id].available), 0);
  el("availablePoints").textContent = `${available.toFixed(1)} points available`;
}

function renderBasemapButtons() {
  el("basemapButtons").innerHTML = Object.entries(BASEMAPS).map(([id, config]) => `<button class="basemap-button ${state?.basemap === id ? "active" : ""}" data-basemap="${id}">${config.label}</button>`).join("");
  el("basemapButtons").querySelectorAll("[data-basemap]").forEach((button) => button.addEventListener("click", () => switchBasemap(button.dataset.basemap, true)));
}

function switchBasemap(id, track = true) {
  if (!basemapLayers[id]) return;
  if (activeBasemapLayer) map.removeLayer(activeBasemapLayer);
  activeBasemapLayer = basemapLayers[id].addTo(map);
  if (state) {
    state.basemap = id;
    if (track) state.viewedBasemaps = unique([...state.viewedBasemaps, id]);
    scheduleSave();
    renderBasemapButtons();
    updateLegend();
    if (activePhase === 0) renderPhase();
  }
}

function handleTileError() {
  tileErrorCount += 1;
  if (tileErrorCount < 12 || activeBasemapLayer === basemapLayers.fallback) return;
  if (activeBasemapLayer) map.removeLayer(activeBasemapLayer);
  activeBasemapLayer = basemapLayers.fallback.addTo(map);
  el("tileWarning").classList.remove("hidden");
}

function renderLayerToggles() {
  el("layerToggles").innerHTML = Object.entries(DATA_SOURCES).map(([id, meta]) => {
    const checked = state ? state.visibleLayers.includes(id) : meta.defaultVisible;
    return `<label class="layer-toggle"><input type="checkbox" data-layer="${id}" ${checked ? "checked" : ""}><span class="layer-swatch" style="color:${meta.color};background:${meta.color}22"></span><span>${escapeHtml(meta.label)}</span></label>`;
  }).join("");
  el("layerToggles").querySelectorAll("[data-layer]").forEach((input) => input.addEventListener("change", () => toggleReferenceLayer(input.dataset.layer, input.checked)));
}

function toggleReferenceLayer(id, visible) {
  if (!state) return;
  state.visibleLayers = visible ? unique([...state.visibleLayers, id]) : state.visibleLayers.filter((layer) => layer !== id);
  syncReferenceLayerVisibility();
  updateLegend();
  scheduleSave();
}

function syncReferenceLayerVisibility() {
  const visible = state ? state.visibleLayers : Object.entries(DATA_SOURCES).filter(([, meta]) => meta.defaultVisible).map(([id]) => id);
  Object.entries(referenceLayers).forEach(([id, layer]) => {
    if (visible.includes(id) && !map.hasLayer(layer)) layer.addTo(map);
    if (!visible.includes(id) && map.hasLayer(layer)) map.removeLayer(layer);
  });
}

function activateTool(tool) {
  if (!state) return;
  const allowed = tool === "inspect" || (tool === "point" && activePhase === 2) || (tool === "route" && activePhase === 3) || (tool === "area" && activePhase === 4);
  if (!allowed) {
    setFeedback("Open the matching phase before using that drawing tool.", "error");
    return;
  }
  activeTool = tool;
  if (tool === "route" && state.supplyRoute.length === 0) state.supplyRoute = [[...APP.depot]];
  map.getContainer().classList.toggle("drawing-cursor", tool !== "inspect");
  updateToolButtons();
  renderStudentFeatures();
  renderPhaseControls();
  updateMapPrompt();
  scheduleSave();
}

function updateToolButtons() {
  document.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === activeTool));
  el("finishAreaButton").disabled = !(activeTool === "area" && state && state.serviceArea.length >= 3 && !state.serviceAreaFinished);
  el("undoButton").disabled = activeTool === "inspect";
  el("clearFeatureButton").disabled = activeTool === "inspect";
}

function updateMapPrompt() {
  const messages = {
    inspect: "Inspect: click a mapped feature to read its evidence.",
    point: "Point tool: click a candidate facility to place the proposed relief center.",
    route: "Route tool: click along open road corridors and finish near the relief center.",
    area: "Area tool: click around the center and need areas, then choose Finish area.",
  };
  el("mapPrompt").textContent = messages[activeTool];
}

function handleMapClick(event) {
  if (!state || activeTool === "inspect") return;
  const clicked = [event.latlng.lng, event.latlng.lat];
  if (activeTool === "point") {
    const nearest = nearestCandidate(clicked);
    state.reliefCenter = nearest && nearest.distance <= 450 ? [...nearest.feature.geometry.coordinates] : clicked;
    state.evidence.location = nearest && nearest.distance <= 450 ? nearest.feature.properties.id : "";
    setFeedback(nearest && nearest.distance <= 450 ? `Point placed at ${nearest.feature.properties.name}.` : "Point placed, but it is not on a candidate facility.", nearest && nearest.distance <= 450 ? "neutral" : "error");
  } else if (activeTool === "route") {
    const point = state.reliefCenter && haversine(clicked, state.reliefCenter) <= 350 ? [...state.reliefCenter] : clicked;
    state.supplyRoute.push(point);
  } else if (activeTool === "area") {
    if (state.serviceAreaFinished) state.serviceAreaFinished = false;
    state.serviceArea.push(clicked);
  }
  lastPhaseResults = {};
  renderStudentFeatures();
  renderPhaseControls();
  updateLegend();
  updateToolButtons();
  scheduleSave();
}

function renderStudentFeatures() {
  if (!state) return;
  Object.values(studentLayers).forEach((layer) => layer.clearLayers());
  if (state.reliefCenter) {
    const [lng, lat] = state.reliefCenter;
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({ className: "", html: '<div class="map-icon student">R</div>', iconSize: [34, 34], iconAnchor: [17, 17] }),
      title: "Proposed Relief Center",
    }).bindTooltip("Proposed Relief Center", { direction: "top", className: "feature-label" });
    marker.on("click", (event) => { L.DomEvent.stopPropagation(event); showStudentFeature("Proposed Relief Center", "Student-created point layer identifying the selected facility."); });
    studentLayers.point.addLayer(marker);
  }
  if (state.supplyRoute.length >= 1) {
    const latlngs = state.supplyRoute.map(([lng, lat]) => [lat, lng]);
    const route = L.polyline(latlngs, { color: "#f0b44d", weight: 6, opacity: .95, lineJoin: "round" });
    route.on("click", (event) => { L.DomEvent.stopPropagation(event); showStudentFeature("Supply Route", `Student-created line layer with ${state.supplyRoute.length} route points.`); });
    studentLayers.route.addLayer(route);
    latlngs.forEach((latlng, index) => studentLayers.route.addLayer(L.circleMarker(latlng, { radius: index === 0 ? 6 : 4, color: "#8d5b0e", fillColor: "#ffd173", fillOpacity: 1, weight: 2 })));
  }
  if (state.serviceArea.length >= 1) {
    const latlngs = state.serviceArea.map(([lng, lat]) => [lat, lng]);
    const shape = state.serviceAreaFinished && state.serviceArea.length >= 3
      ? L.polygon(latlngs, { color: "#16a7d5", weight: 4, fillColor: "#4bc4e9", fillOpacity: .18 })
      : L.polyline(latlngs, { color: "#16a7d5", weight: 4, dashArray: "7 5" });
    shape.on("click", (event) => { L.DomEvent.stopPropagation(event); showStudentFeature("Service Area", `Student-created polygon layer with ${state.serviceArea.length} vertices.`); });
    studentLayers.area.addLayer(shape);
    latlngs.forEach((latlng) => studentLayers.area.addLayer(L.circleMarker(latlng, { radius: 4, color: "#0b7799", fillColor: "white", fillOpacity: 1, weight: 2 })));
  }
}

function showStudentFeature(name, description) {
  el("featureCard").classList.remove("empty");
  el("featureCard").innerHTML = `<h3>${escapeHtml(name)}</h3><div>${escapeHtml(description)}</div><dl><dt>Source</dt><dd>Created by student</dd></dl>`;
}

function undoCurrentFeature() {
  if (!state) return;
  if (activeTool === "point") state.reliefCenter = null;
  if (activeTool === "route" && state.supplyRoute.length > 1) state.supplyRoute.pop();
  if (activeTool === "area" && state.serviceArea.length) { state.serviceArea.pop(); state.serviceAreaFinished = false; }
  renderStudentFeatures();
  renderPhaseControls();
  updateLegend();
  updateToolButtons();
  scheduleSave();
}

function clearCurrentFeature() {
  if (!state) return;
  if (activeTool === "point") { state.reliefCenter = null; state.evidence.location = ""; }
  if (activeTool === "route") state.supplyRoute = [[...APP.depot]];
  if (activeTool === "area") { state.serviceArea = []; state.serviceAreaFinished = false; }
  lastPhaseResults = {};
  renderStudentFeatures();
  renderPhaseControls();
  updateLegend();
  updateToolButtons();
  scheduleSave();
}

function finishServiceArea() {
  if (!state || state.serviceArea.length < 3) return;
  state.serviceAreaFinished = true;
  renderStudentFeatures();
  renderPhaseControls();
  updateToolButtons();
  updateLegend();
  scheduleSave();
}

function resetView() {
  map.fitBounds(L.latLngBounds(APP.bounds), { padding: [10, 10] });
}

function checkCurrentPhase() {
  if (!state) return;
  if (activePhase === 5 && phaseComplete(5)) {
    submitFinalMap();
    return;
  }
  const phaseCheckpoints = CHECKPOINTS.filter((checkpoint) => checkpoint.phase === activePhase);
  const results = {};
  phaseCheckpoints.forEach((checkpoint) => {
    const result = evaluateCheckpoint(checkpoint.id);
    results[checkpoint.id] = result;
    const progress = state.checkpoints[checkpoint.id];
    if (!progress.passed) {
      if (result.pass) {
        progress.passed = true;
        progress.earned = progress.available;
      } else {
        progress.attempts += 1;
        progress.available = progress.attempts === 1 ? .5 : 0;
      }
      queueEvent("checkpoint_attempt", {
        checkpointId: checkpoint.id,
        phase: activePhase + 1,
        correct: result.pass,
        wrongAttempts: progress.attempts,
        pointsAvailable: progress.available,
        pointsEarned: progress.earned,
        detail: result.message,
      });
    }
  });
  lastPhaseResults = results;
  updateScore();
  saveLocalState();
  queueEvent("autosave", { reason: "phase_check", mapState: submissionState() });

  const failed = phaseCheckpoints.filter((checkpoint) => !state.checkpoints[checkpoint.id].passed);
  if (failed.length === 0) {
    setFeedback(activePhase === 5 ? "All requirements pass. Select Submit Final Map when you are ready." : "This phase is complete. The next phase is now unlocked.", "success");
    if (activePhase < PHASES.length - 1) {
      state.currentPhase = Math.max(state.currentPhase, activePhase + 1);
      activePhase += 1;
      activeTool = "inspect";
      saveLocalState();
    }
  } else {
    setFeedback(failed.map((checkpoint) => results[checkpoint.id].message).join(" "), "error");
  }
  renderEverything();
}

function evaluateCheckpoint(id) {
  const point = state.reliefCenter;
  const candidate = point ? nearestCandidate(point) : null;
  const highFlood = getFeatureById("flood", "high-flood");
  const moderateFlood = getFeatureById("flood", "moderate-flood");
  const route = state.supplyRoute;
  const highPriorityNeeds = (referenceData.needs?.features || []).filter((feature) => feature.properties.priority === "High");
  const evaluations = {
    p1_basemaps: () => [state.viewedBasemaps.length >= 3, `View all three basemaps. You have viewed ${state.viewedBasemaps.length} of 3.`],
    p1_inspection: () => [state.inspectedLayerTypes.length >= 3, `Inspect features from three different reference layers. You have inspected ${state.inspectedLayerTypes.length} of 3.`],
    p2_basemap_reason: () => [Boolean(state.basemapReason) && state.basemapReason === state.basemap, "Choose the explanation that matches the currently selected basemap."],
    p2_layers: () => {
      const required = ["flood", "roads", "closures", "needs", "facilities", "depot"];
      const missing = required.filter((layer) => !state.visibleLayers.includes(layer));
      return [missing.length === 0, `Turn on every required evidence layer. Missing: ${missing.map((layer) => DATA_SOURCES[layer].label).join(", ") || "none"}.`];
    },
    p3_point: () => [Boolean(point), "Use the Point tool to create a proposed relief-center point."],
    p3_candidate: () => [Boolean(candidate && candidate.distance <= 225), "Place the point directly on one of the five candidate facility symbols."],
    p3_flood: () => [Boolean(point && highFlood && moderateFlood && !pointInPolygon(point, highFlood.geometry.coordinates[0]) && !pointInPolygon(point, moderateFlood.geometry.coordinates[0])), "Move the relief center outside both the high and moderate simulated flood zones."],
    p3_access: () => {
      if (!point) return [false, "Create the relief-center point before checking access."];
      const roadDistance = nearestDistanceToLines(point, referenceData.roads?.features || []);
      const needDistance = nearestDistanceToPoints(point, highPriorityNeeds);
      return [roadDistance <= 350 && needDistance <= 2600, `Move the point closer to both an open road and a high-priority need area. Current distances: road ${Math.round(roadDistance)} m; need area ${Math.round(needDistance)} m.`];
    },
    p4_route: () => [route.length >= 2, "Use the Route tool to create a line with at least two points."],
    p4_endpoints: () => {
      if (route.length < 2 || !point) return [false, "The route needs a start, an end, and a relief-center point."];
      const startDistance = haversine(route[0], APP.depot);
      const endDistance = haversine(route[route.length - 1], point);
      return [startDistance <= 150 && endDistance <= 220, `Start at the depot and finish at the relief center. Start error: ${Math.round(startDistance)} m; end error: ${Math.round(endDistance)} m.`];
    },
    p4_safe: () => {
      if (route.length < 2) return [false, "Create the route before checking its safety."];
      const followsRoad = routeFollowsRoads(route, referenceData.roads?.features || []);
      const crossesHighFlood = lineCrossesPolygon(route, highFlood?.geometry.coordinates[0] || []);
      const crossesClosure = (referenceData.closures?.features || []).some((feature) => linesIntersect(route, feature.geometry.coordinates));
      const messages = [];
      if (!followsRoad) messages.push("Keep every route point close to an open road corridor.");
      if (crossesHighFlood) messages.push("Redraw the route so it does not enter the high flood zone.");
      if (crossesClosure) messages.push("Redraw the route so it does not cross a red closure line.");
      return [followsRoad && !crossesHighFlood && !crossesClosure, messages.join(" ") || "The route follows open roads and avoids hazards."];
    },
    p5_area: () => [state.serviceAreaFinished && state.serviceArea.length >= 3, "Draw at least three polygon points and select Finish Area."],
    p5_coverage: () => {
      if (!state.serviceAreaFinished || state.serviceArea.length < 3 || !point) return [false, "Finish the service-area polygon after creating the relief center."];
      const centerIncluded = pointInPolygon(point, state.serviceArea);
      const needsIncluded = highPriorityNeeds.filter((feature) => pointInPolygon(feature.geometry.coordinates, state.serviceArea)).length;
      return [centerIncluded && needsIncluded >= 2, `Draw the polygon around the relief center and at least two high-priority need areas. Currently included: center ${centerIncluded ? "yes" : "no"}; need areas ${needsIncluded}.`];
    },
    p6_cartography: () => {
      const requiredTitle = `Gallup Flash-Flood Relief Map — ${state.studentName}`;
      return [state.finalTitle.trim() === requiredTitle && state.legendConfirmed, "Use the required title exactly and check the legend-confirmation box." ];
    },
    p6_evidence: () => {
      if (!candidate || candidate.distance > 225) return [false, "Your selected facility must match the relief-center point on the map."];
      const supported = supportedEvidence(candidate.feature);
      const words = state.evidence.claim.trim().split(/\s+/).filter(Boolean).length;
      const pass = state.evidence.location === candidate.feature.properties.id && state.evidence.first && state.evidence.second && state.evidence.first !== state.evidence.second && supported.includes(state.evidence.first) && supported.includes(state.evidence.second) && state.evidence.route && words >= 15;
      return [Boolean(pass), "Select the mapped facility, choose two different supported evidence statements, choose a route reason, and write at least 15 words."];
    },
  };
  const [pass, message] = evaluations[id]();
  return { pass: Boolean(pass), message };
}

function supportedEvidence(candidateFeature) {
  const supported = [];
  const point = candidateFeature.geometry.coordinates;
  const high = getFeatureById("flood", "high-flood");
  const moderate = getFeatureById("flood", "moderate-flood");
  if (!pointInPolygon(point, high.geometry.coordinates[0]) && !pointInPolygon(point, moderate.geometry.coordinates[0])) supported.push("outside_flood");
  if (nearestDistanceToLines(point, referenceData.roads.features) <= 350) supported.push("open_road");
  if (nearestDistanceToPoints(point, referenceData.needs.features.filter((feature) => feature.properties.priority === "High")) <= 2600) supported.push("near_need");
  if (candidateFeature.properties.generator === "Yes") supported.push("generator");
  if (Number(candidateFeature.properties.capacity) >= 350) supported.push("capacity");
  return supported;
}

function phaseComplete(phaseIndex) {
  return Boolean(state) && CHECKPOINTS.filter((checkpoint) => checkpoint.phase === phaseIndex).every((checkpoint) => state.checkpoints[checkpoint.id].passed);
}

function calculateScore(currentState = state) {
  return clamp(CHECKPOINTS.reduce((sum, checkpoint) => sum + Number(currentState.checkpoints?.[checkpoint.id]?.earned || 0), 0), 0, APP.maxScore);
}

function updateScore() {
  if (!state) return;
  state.score = calculateScore();
  el("scoreDisplay").textContent = formatScore(state.score);
}

function formatScore(score) {
  return Number.isInteger(score) ? String(score) : Number(score).toFixed(1);
}

async function submitFinalMap() {
  const invalid = CHECKPOINTS.filter((checkpoint) => !evaluateCheckpoint(checkpoint.id).pass);
  if (invalid.length) {
    const firstPhase = Math.min(...invalid.map((checkpoint) => checkpoint.phase));
    activePhase = firstPhase;
    state.currentPhase = Math.max(state.currentPhase, firstPhase);
    setFeedback("Your map changed after an earlier check. Correct the highlighted requirements before submitting.", "error");
    renderEverything();
    return;
  }
  state.status = "completed";
  state.completedAt = new Date().toISOString();
  saveLocalState();
  setSaveStatus("saving", "Submitting final map...");
  const event = queueEvent("complete", { mapState: submissionState() }, true);
  await processEventQueue();
  showSuccess(event.eventId);
}

function showSuccess(eventId = "") {
  el("finalScore").textContent = formatScore(state.score);
  el("successMessage").textContent = `${state.studentName}, your final point, route, service area, map choices, evidence, and score are recorded on this device${APP.endpoint ? " and queued for the class record" : ""}.`;
  el("submissionId").textContent = `Submission ID: ${eventId || state.sessionId}`;
  el("successOverlay").classList.remove("hidden");
}

function setFeedback(message, type = "neutral") {
  el("feedback").className = `feedback ${type}`;
  el("feedback").textContent = message;
}

function updateLegend() {
  if (!state) return;
  const rows = [{ symbol: "▧", label: `${BASEMAPS[state.basemap]?.label || "Local"} basemap`, color: "#718499" }];
  state.visibleLayers.forEach((id) => rows.push({ symbol: legendSymbol(id), label: DATA_SOURCES[id].label, color: DATA_SOURCES[id].color }));
  if (state.reliefCenter) rows.push({ symbol: "R", label: "Proposed Relief Center", color: "#0a8d7f" });
  if (state.supplyRoute.length >= 2) rows.push({ symbol: "━", label: "Supply Route", color: "#d48a16" });
  if (state.serviceArea.length >= 3) rows.push({ symbol: "▱", label: "Service Area", color: "#16a7d5" });
  el("legend").innerHTML = rows.map((row) => `<div class="legend-row"><span class="legend-symbol" style="color:${row.color}">${row.symbol}</span><span>${escapeHtml(row.label)}</span></div>`).join("");
}

function legendSymbol(id) {
  return ({ flood: "▧", water: "≈", roads: "━", closures: "╳", needs: "!", facilities: "F", landmarks: "◆", depot: "D" })[id] || "●";
}

function getFeatureById(layerId, featureId) {
  return referenceData[layerId]?.features.find((feature) => feature.properties.id === featureId) || null;
}

function nearestCandidate(point) {
  const candidates = referenceData.facilities?.features || [];
  if (!candidates.length) return null;
  return candidates.map((feature) => ({ feature, distance: haversine(point, feature.geometry.coordinates) })).sort((a, b) => a.distance - b.distance)[0];
}

function haversine([lng1, lat1], [lng2, lat2]) {
  const radius = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toLocalMeters([lng, lat], referenceLat = 35.515) {
  return [lng * 111320 * Math.cos(referenceLat * Math.PI / 180), lat * 110540];
}

function distancePointToSegment(point, start, end) {
  const p = toLocalMeters(point);
  const a = toLocalMeters(start);
  const b = toLocalMeters(end);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function nearestDistanceToLines(point, features) {
  let nearest = Infinity;
  features.forEach((feature) => {
    const coordinates = feature.geometry.coordinates;
    for (let index = 0; index < coordinates.length - 1; index += 1) nearest = Math.min(nearest, distancePointToSegment(point, coordinates[index], coordinates[index + 1]));
  });
  return nearest;
}

function routeFollowsRoads(route, roadFeatures) {
  if (!route || route.length < 2) return false;
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const segmentLength = haversine(start, end);
    const sampleCount = Math.max(1, Math.ceil(segmentLength / 180));
    for (let sample = 0; sample <= sampleCount; sample += 1) {
      const ratio = sample / sampleCount;
      const point = [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
      if (nearestDistanceToLines(point, roadFeatures) > 450) return false;
    }
  }
  return true;
}

function nearestDistanceToPoints(point, features) {
  return features.reduce((nearest, feature) => Math.min(nearest, haversine(point, feature.geometry.coordinates)), Infinity);
}

function pointInPolygon(point, polygon) {
  if (!point || !polygon?.length) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function orientation(a, b, c) {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : 2;
}

function segmentsIntersect(a, b, c, d) {
  return orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);
}

function linesIntersect(lineA, lineB) {
  for (let a = 0; a < lineA.length - 1; a += 1) {
    for (let b = 0; b < lineB.length - 1; b += 1) if (segmentsIntersect(lineA[a], lineA[a + 1], lineB[b], lineB[b + 1])) return true;
  }
  return false;
}

function lineCrossesPolygon(line, polygon) {
  if (!line?.length || !polygon?.length) return false;
  if (line.some((point) => pointInPolygon(point, polygon))) return true;
  return linesIntersect(line, polygon);
}

function scheduleSave() {
  if (!state) return;
  saveLocalState();
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => queueEvent("autosave", { reason: "state_change", mapState: submissionState() }), 1800);
}

function saveLocalState() {
  if (!state || !storageKey) return;
  state.lastSavedAt = new Date().toISOString();
  localStorage.setItem(storageKey, JSON.stringify(state));
  setSaveStatus(APP.endpoint ? "saving" : "local", APP.endpoint ? "Saving..." : "Saved on device");
}

function readStoredState(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function submissionState() {
  return {
    schemaVersion: state.schemaVersion,
    scenarioVersion: state.scenarioVersion,
    sessionId: state.sessionId,
    studentName: state.studentName,
    period: state.period,
    currentPhase: state.currentPhase + 1,
    basemap: state.basemap,
    visibleLayers: state.visibleLayers,
    reliefCenter: state.reliefCenter ? { type: "Feature", properties: { name: "Proposed Relief Center" }, geometry: { type: "Point", coordinates: state.reliefCenter } } : null,
    supplyRoute: state.supplyRoute.length >= 2 ? { type: "Feature", properties: { name: "Supply Route" }, geometry: { type: "LineString", coordinates: state.supplyRoute } } : null,
    serviceArea: state.serviceAreaFinished ? { type: "Feature", properties: { name: "Service Area" }, geometry: { type: "Polygon", coordinates: [[...state.serviceArea, state.serviceArea[0]]] } } : null,
    finalTitle: state.finalTitle,
    legendEntries: currentLegendEntries(),
    basemapReason: state.basemapReason,
    evidence: state.evidence,
    checkpoints: state.checkpoints,
    score: state.score,
    status: state.status,
    completedAt: state.completedAt,
  };
}

function currentLegendEntries() {
  const entries = [BASEMAPS[state.basemap]?.label || "Local basemap", ...state.visibleLayers.map((id) => DATA_SOURCES[id].label)];
  if (state.reliefCenter) entries.push("Proposed Relief Center");
  if (state.supplyRoute.length >= 2) entries.push("Supply Route");
  if (state.serviceArea.length >= 3) entries.push("Service Area");
  return entries;
}

function queueEvent(type, detail = {}, immediate = false) {
  if (!state) return null;
  const event = {
    eventId: newId(),
    eventType: type,
    clientTimestamp: new Date().toISOString(),
    schemaVersion: APP.schemaVersion,
    scenarioVersion: APP.scenarioVersion,
    sessionId: state.sessionId,
    studentName: state.studentName,
    period: state.period,
    phase: activePhase + 1,
    score: state.score,
    maxScore: APP.maxScore,
    status: state.status,
    detail,
  };
  const queue = readEventQueue();
  if (!queue.some((item) => item.eventId === event.eventId)) queue.push(event);
  localStorage.setItem(APP.queueKey, JSON.stringify(queue));
  if (immediate) return event;
  processEventQueue();
  return event;
}

function readEventQueue() {
  try { return JSON.parse(localStorage.getItem(APP.queueKey)) || []; } catch { return []; }
}

async function processEventQueue() {
  const queue = readEventQueue();
  if (!queue.length) {
    setSaveStatus(APP.endpoint ? "saved" : "local", APP.endpoint ? "Saved" : "Saved on device");
    return;
  }
  if (!APP.endpoint) {
    setSaveStatus("local", "Saved on device");
    return;
  }
  setSaveStatus("saving", "Saving...");
  const remaining = [...queue];
  while (remaining.length) {
    const event = remaining[0];
    try {
      await fetch(APP.endpoint, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(event) });
      const acknowledged = await waitForAcknowledgement(event.eventId);
      if (!acknowledged) throw new Error("Save acknowledgement timed out");
      remaining.shift();
      localStorage.setItem(APP.queueKey, JSON.stringify(remaining));
    } catch (error) {
      console.warn("Map Builder save queued for retry", error);
      setSaveStatus("error", "Will retry save");
      return;
    }
  }
  setSaveStatus("saved", "Saved");
}

function waitForAcknowledgement(eventId) {
  return new Promise((resolve) => {
    const callback = `mapBuilderAck_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    const timeout = setTimeout(() => finish(false), 7000);
    function finish(value) {
      clearTimeout(timeout);
      delete window[callback];
      script.remove();
      resolve(value);
    }
    window[callback] = (response) => finish(Boolean(response?.acknowledged));
    script.onerror = () => finish(false);
    script.src = `${APP.endpoint}?action=status&eventId=${encodeURIComponent(eventId)}&callback=${encodeURIComponent(callback)}&_=${Date.now()}`;
    document.body.appendChild(script);
  });
}

function setSaveStatus(status, text) {
  el("saveStatus").dataset.status = status;
  el("saveStatus").lastChild.textContent = ` ${text}`;
}
