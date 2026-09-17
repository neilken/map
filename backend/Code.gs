const MAP_BUILDER_CONFIG = {
  spreadsheetId: "1sudZ4V65DI5IY67IhIWCI5znN-0ZsE9eurhR6P8Y87U",
  maxScore: 15,
  allowedPeriods: ["6", "7"],
  allowedScenario: "gallup-flood-v1",
  allowedEvents: ["start", "checkpoint_attempt", "autosave", "complete"],
  maxPayloadCharacters: 250000,
};

const ATTEMPT_HEADERS = [
  "Received At", "Client At", "Event ID", "Event Type", "Session ID", "Student Name", "Period", "Phase",
  "Checkpoint ID", "Correct", "Wrong Attempts", "Points Available", "Points Earned", "Score", "Max Score",
  "Status", "Detail", "Scenario Version"
];

const SUMMARY_HEADERS = [
  "Updated At", "Student Name", "Period", "Session ID", "Phase Reached", "Score", "Max Score", "Status",
  "Completed At", "Last Event ID", "Last Detail"
];

const FINAL_HEADERS = [
  "Submitted At", "Student Name", "Period", "Session ID", "Score", "Max Score", "Basemap", "Visible Layers",
  "Relief Center GeoJSON", "Supply Route GeoJSON", "Service Area GeoJSON", "Final Title", "Legend Entries",
  "Basemap Reason", "Selected Facility", "Evidence 1", "Evidence 2", "Route Reason", "Written Claim",
  "Checkpoints JSON", "Scenario Version", "Submission Event ID"
];

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    if (!raw || raw.length > MAP_BUILDER_CONFIG.maxPayloadCharacters) {
      return jsonOutput_({ ok: false, error: "Missing or oversized payload." });
    }
    const event = JSON.parse(raw);
    validateEvent_(event);
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const sheets = ensureSheets_();
      if (eventExists_(sheets.attempts, event.eventId)) {
        return jsonOutput_({ ok: true, acknowledged: true, duplicate: true, eventId: event.eventId });
      }
      appendAttempt_(sheets.attempts, event);
      updateSummary_(sheets.summary, event);
      if (event.eventType === "complete") appendFinalMap_(sheets.finalMaps, event);
      CacheService.getScriptCache().put("event:" + event.eventId, "1", 21600);
    } finally {
      lock.releaseLock();
    }
    return jsonOutput_({ ok: true, acknowledged: true, eventId: event.eventId });
  } catch (error) {
    return jsonOutput_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const callback = validCallback_(params.callback) ? params.callback : "callback";
  let response;
  try {
    if (params.action !== "status" || !params.eventId) throw new Error("A status action and eventId are required.");
    const cached = CacheService.getScriptCache().get("event:" + params.eventId);
    const acknowledged = Boolean(cached) || eventExists_(ensureSheets_().attempts, params.eventId);
    response = { ok: true, acknowledged: acknowledged, eventId: params.eventId };
  } catch (error) {
    response = { ok: false, acknowledged: false, error: String(error && error.message ? error.message : error) };
  }
  return ContentService.createTextOutput(callback + "(" + JSON.stringify(response) + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function validateEvent_(event) {
  if (!event || typeof event !== "object") throw new Error("Invalid event.");
  if (!MAP_BUILDER_CONFIG.allowedEvents.includes(String(event.eventType))) throw new Error("Unknown event type.");
  if (!event.eventId || String(event.eventId).length > 100) throw new Error("Invalid event ID.");
  if (!event.sessionId || String(event.sessionId).length > 100) throw new Error("Invalid session ID.");
  const name = String(event.studentName || "").trim();
  if (name.length < 5 || name.length > 60 || name.split(/\s+/).length < 2) throw new Error("A full student name is required.");
  if (!MAP_BUILDER_CONFIG.allowedPeriods.includes(String(event.period))) throw new Error("Period must be 6 or 7.");
  if (String(event.scenarioVersion) !== MAP_BUILDER_CONFIG.allowedScenario) throw new Error("Unknown scenario version.");
  const score = Number(event.score);
  if (!Number.isFinite(score) || score < 0 || score > MAP_BUILDER_CONFIG.maxScore) throw new Error("Invalid score.");
  const phase = Number(event.phase);
  if (!Number.isInteger(phase) || phase < 1 || phase > 6) throw new Error("Invalid phase.");
  if (event.eventType === "checkpoint_attempt") {
    const checkpoint = event.detail && event.detail.checkpointId;
    const allowedCheckpoints = [
      "p1_basemaps", "p1_inspection", "p2_basemap_reason", "p2_layers", "p3_point", "p3_candidate",
      "p3_flood", "p3_access", "p4_route", "p4_endpoints", "p4_safe", "p5_area", "p5_coverage",
      "p6_cartography", "p6_evidence"
    ];
    if (!allowedCheckpoints.includes(String(checkpoint))) throw new Error("Unknown checkpoint.");
  }
}

function ensureSheets_() {
  const spreadsheet = SpreadsheetApp.openById(MAP_BUILDER_CONFIG.spreadsheetId);
  return {
    attempts: ensureSheet_(spreadsheet, "Attempts", ATTEMPT_HEADERS),
    summary: ensureSheet_(spreadsheet, "Student Summary", SUMMARY_HEADERS),
    finalMaps: ensureSheet_(spreadsheet, "Final Maps", FINAL_HEADERS),
  };
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#eeeeee").setWrap(true);
  if (!sheet.getFilter()) sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), headers.length).createFilter();
  return sheet;
}

function eventExists_(sheet, eventId) {
  if (!eventId || sheet.getLastRow() < 2) return false;
  return Boolean(sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).createTextFinder(String(eventId)).matchEntireCell(true).findNext());
}

function appendAttempt_(sheet, event) {
  const detail = event.detail || {};
  sheet.appendRow([
    new Date(), dateOrText_(event.clientTimestamp), safeCell_(event.eventId), safeCell_(event.eventType), safeCell_(event.sessionId),
    safeCell_(event.studentName), String(event.period), Number(event.phase), safeCell_(detail.checkpointId || ""),
    detail.correct === undefined ? "" : Boolean(detail.correct), numberOrBlank_(detail.wrongAttempts),
    numberOrBlank_(detail.pointsAvailable), numberOrBlank_(detail.pointsEarned), Number(event.score), MAP_BUILDER_CONFIG.maxScore,
    safeCell_(event.status || "in_progress"), safeCell_(detail.detail || detail.reason || ""), safeCell_(event.scenarioVersion)
  ]);
}

function updateSummary_(sheet, event) {
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, SUMMARY_HEADERS.length).getValues() : [];
  const normalizedName = normalizeName_(event.studentName);
  let rowIndex = -1;
  for (let index = 0; index < rows.length; index += 1) {
    if (normalizeName_(rows[index][1]) === normalizedName && String(rows[index][2]) === String(event.period)) {
      rowIndex = index + 2;
      break;
    }
  }
  const mapState = event.detail && event.detail.mapState ? event.detail.mapState : {};
  const candidate = {
    phase: Number(event.phase || 1),
    score: Number(event.score || 0),
    status: String(event.status || "in_progress"),
    completedAt: mapState.completedAt || (event.eventType === "complete" ? event.clientTimestamp : ""),
  };
  if (rowIndex > 0) {
    const existing = sheet.getRange(rowIndex, 1, 1, SUMMARY_HEADERS.length).getValues()[0];
    const existingState = { phase: Number(existing[4] || 0), score: Number(existing[5] || 0), status: String(existing[7] || "in_progress") };
    if (!shouldReplaceSummary_(existingState, candidate)) return;
  }
  const row = [
    new Date(), safeCell_(event.studentName), String(event.period), safeCell_(event.sessionId), candidate.phase, candidate.score,
    MAP_BUILDER_CONFIG.maxScore, safeCell_(candidate.status), dateOrText_(candidate.completedAt), safeCell_(event.eventId),
    safeCell_(event.detail && (event.detail.detail || event.detail.reason) || "")
  ];
  if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
}

function shouldReplaceSummary_(existing, candidate) {
  const existingComplete = existing.status === "completed";
  const candidateComplete = candidate.status === "completed";
  if (candidateComplete !== existingComplete) return candidateComplete;
  if (candidateComplete) return candidate.score >= existing.score;
  if (candidate.phase !== existing.phase) return candidate.phase > existing.phase;
  return candidate.score >= existing.score;
}

function appendFinalMap_(sheet, event) {
  const mapState = event.detail && event.detail.mapState;
  if (!mapState || typeof mapState !== "object") throw new Error("A final map state is required for completion.");
  sheet.appendRow([
    new Date(), safeCell_(event.studentName), String(event.period), safeCell_(event.sessionId), Number(event.score),
    MAP_BUILDER_CONFIG.maxScore, safeCell_(mapState.basemap || ""), safeCell_((mapState.visibleLayers || []).join(", ")),
    jsonCell_(mapState.reliefCenter), jsonCell_(mapState.supplyRoute), jsonCell_(mapState.serviceArea), safeCell_(mapState.finalTitle || ""),
    safeCell_((mapState.legendEntries || []).join(" | ")), safeCell_(mapState.basemapReason || ""),
    safeCell_(mapState.evidence && mapState.evidence.location || ""), safeCell_(mapState.evidence && mapState.evidence.first || ""),
    safeCell_(mapState.evidence && mapState.evidence.second || ""), safeCell_(mapState.evidence && mapState.evidence.route || ""),
    safeCell_(mapState.evidence && mapState.evidence.claim || ""), jsonCell_(mapState.checkpoints), safeCell_(event.scenarioVersion),
    safeCell_(event.eventId)
  ]);
}

function normalizeName_(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function safeCell_(value) {
  let text = String(value === undefined || value === null ? "" : value);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text.slice(0, 45000);
}

function jsonCell_(value) {
  return safeCell_(value === undefined || value === null ? "" : JSON.stringify(value));
}

function numberOrBlank_(value) {
  return value === undefined || value === null || value === "" ? "" : Number(value);
}

function dateOrText_(value) {
  if (!value) return "";
  const date = new Date(value);
  return isNaN(date.getTime()) ? safeCell_(value) : date;
}

function validCallback_(value) {
  return /^[A-Za-z_$][0-9A-Za-z_$\.]{0,100}$/.test(String(value || ""));
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function setupMapBuilderWorkbook() {
  ensureSheets_();
}
