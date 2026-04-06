// Settings state
import { Storage } from "./storage.js";
import { makeSection, makeToggle } from "./utils.js";
import { CATALOG } from "./catalog.js";

const SETTINGS_KEY = "Snooze-CSS-settings";
let CURRENT_VERSION = "1.0.0"; //Fallback
const GITHUB_RELEASES_API = "https://api.github.com/repos/ReformedDoge/Snooze-CSS/releases/latest";

let _latestRelease = null; // { version, url, name, body } or null
let _updateCheckPending = false;
let _updateBadgeCallback = null; // called when update state changes

const defaults = {
  autoMonitor: true,
  blurEnabled: false,
  blurColor: "#ff000010",
  selectorConfig: {
    ids: true,
    attrs: true,
    media: true,
    classes: true,
    climbing: false,
  },
  lastGlobalToggle: false,
  checkUpdates: true,
};

let state = { ...defaults };
let observer = null;
let refreshCallback = null;

const SENTINEL_SELECTORS = [
  "rcp-fe-lol-champ-select",
  "rcp-fe-lol-postgame-ember",
  "rcp-fe-viewport-main",
  "rcp-fe-viewport-persistent",
];

async function syncVersionWithMetadata() {
  try {
    // Determine path to index.js relative to this file
    const indexUrl = new URL('../index.js', import.meta.url);
    const response = await fetch(indexUrl);
    const text = await response.text();
    
    // Regex to find @version x.x.x
    const match = text.match(/@version\s+([\d.]+)/);
    if (match && match[1]) {
      CURRENT_VERSION = match[1];
      console.log(`[Snooze-CSS] Logic synced to version ${CURRENT_VERSION}`);
    }
  } catch (err) {
    console.warn("[Snooze-CSS] Failed to sync version from metadata:", err);
  }
}

export async function loadSettings() {
  await syncVersionWithMetadata(); // Run this once on startup
  const saved = await Storage.get(SETTINGS_KEY, null);
  if (saved) state = { ...defaults, ...saved };
  return state;
}

export async function saveSettings() {
  await Storage.set(SETTINGS_KEY, state);
}

export function getSettings() {
  return state;
}

export function setRefreshCallback(fn) {
  refreshCallback = fn;
}

export function startMonitor() {
  if (observer) return; // already running

  let debounceTimer = null;

  observer = new MutationObserver((mutations) => {
    let changed = false;
    for (const m of mutations) {
      for (const node of [...m.addedNodes, ...m.removedNodes]) {
        if (node.nodeType !== 1) continue;
        const tag = node.tagName?.toLowerCase() || "";
        if (
          SENTINEL_SELECTORS.includes(tag) ||
          SENTINEL_SELECTORS.some((s) => node.classList?.contains(s))
        ) {
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
    if (!changed) return;

    // Debounce screen transitions
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (refreshCallback) refreshCallback("monitor");
    }, 400);
  });

  observer.observe(document.body, { childList: true, subtree: false });
  console.log("[Snooze-CSS] Monitor started");
}

export function stopMonitor() {
  if (observer) {
    observer.disconnect();
    observer = null;
    console.log("[Snooze-CSS] Monitor stopped");
  }
}

export function setUpdateBadgeCallback(fn) {
  _updateBadgeCallback = fn;
}

export function getLatestRelease() {
  return _latestRelease;
}

export function getCurrentVersion() {
  return CURRENT_VERSION;
}

function parseVersion(v) {
  return (v || "").replace(/^v/, "").trim();
}

function isNewerVersion(latest, current) {
  const latestParts = parseVersion(latest).split(".").map(Number);
  const currentParts = parseVersion(current).split(".").map(Number);
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export async function checkForUpdates(force = false) {
  if (!state.checkUpdates && !force) return;
  if (_updateCheckPending) return;

  _updateCheckPending = true;
  try {
    const resp = await fetch(GITHUB_RELEASES_API);
    if (!resp.ok) return;
    
    const data = await resp.json();
    const latestVersion = parseVersion(data.tag_name || data.name || "");

    if (latestVersion && isNewerVersion(latestVersion, CURRENT_VERSION)) {
      _latestRelease = {
        version: latestVersion,
        url: data.html_url || "https://github.com/ReformedDoge/Snooze-CSS/releases",
        name: data.name || `v${latestVersion}`,
        body: (data.body || "").slice(0, 500),
      };
    } else {
      _latestRelease = null;
    }

    // Update the UI badge if the modal is open
    if (_updateBadgeCallback) _updateBadgeCallback(_latestRelease);
    
  } catch (err) {
    console.warn("[Snooze-CSS] Update check failed:", err);
  } finally {
    _updateCheckPending = false;
  }
}

export function buildSettingsTab(container) {
  container.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;gap:16px;";

  // AUTO MONITOR
  const monSection = makeSection(
    "Live Value Monitor",
    "Watch for screen changes (lobby → champ select → post-game) and automatically refresh the Visual Builder's live values. Uses a lightweight MutationObserver on top-level containers only.",
  );

  const monRow = document.createElement("div");
  monRow.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;margin-top:10px;";

  const monLabel = document.createElement("span");
  monLabel.style.cssText = "font-size:11px;color:#8a9aaa;";
  monLabel.textContent = "Auto-refresh values on screen change";

  const toggle = makeToggle(state.autoMonitor, async (val) => {
    state.autoMonitor = val;
    await saveSettings();
    if (val) startMonitor();
    else stopMonitor();
  });

  monRow.appendChild(monLabel);
  monRow.appendChild(toggle);
  monSection.appendChild(monRow);

  const note = document.createElement("div");
  note.style.cssText =
    "margin-top:10px;padding:8px 10px;background:rgba(200,170,110,0.04);border:1px solid #1a2535;font-size:10px;color:#3a5060;line-height:1.6;";
  const noteSpan = document.createElement("span");
  noteSpan.style.color = "#785a28";
  noteSpan.textContent = "Note:";
  note.appendChild(noteSpan);
  note.appendChild(
    document.createTextNode(
      'Values are also refreshed when you switch to the Visual Builder tab. Elements not present in the current screen show a dim "not in DOM" indicator.',
    ),
  );
  monSection.appendChild(note);

  wrap.appendChild(monSection);

  // UPDATE CHECKER
  const updateSection = makeSection(
    "Updates",
    "Check GitHub for new Snooze-CSS releases. Checks automatically every 6 hours when enabled.",
  );

  // Toggle row
  const updateToggleRow = document.createElement("div");
  updateToggleRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-top:10px;";
  const updateToggleLabel = document.createElement("span");
  updateToggleLabel.style.cssText = "font-size:11px;color:#8a9aaa;";
  updateToggleLabel.textContent = "Auto-check for updates on startup";
  const updateToggle = makeToggle(state.checkUpdates !== false, async (val) => {
    state.checkUpdates = val;
    await saveSettings();
  });
  updateToggleRow.appendChild(updateToggleLabel);
  updateToggleRow.appendChild(updateToggle);
  updateSection.appendChild(updateToggleRow);

  // Status area
  const updateStatusEl = document.createElement("div");
  updateStatusEl.style.cssText = "margin-top:10px;padding:8px 10px;background:rgba(0,0,0,0.2);border:1px solid #1a2535;font-size:10px;line-height:1.6;";

  function renderUpdateStatus() {
    updateStatusEl.innerHTML = "";
    if (_latestRelease) {
      updateStatusEl.style.borderColor = "#785a28";
      updateStatusEl.style.background = "rgba(200,170,110,0.06)";

      const title = document.createElement("div");
      title.style.cssText = "font-size:11px;font-weight:600;color:#c8aa6e;margin-bottom:4px;";
      title.textContent = `Update available: v${_latestRelease.version}`;

      const relName = document.createElement("div");
      relName.style.cssText = "font-size:10px;color:#8a9aaa;margin-bottom:6px;";
      relName.textContent = _latestRelease.name;

      if (_latestRelease.body) {
        const notes = document.createElement("div");
        notes.style.cssText = "font-size:9px;color:#4a6070;margin-bottom:8px;white-space:pre-wrap;max-height:80px;overflow:hidden;";
        notes.textContent = _latestRelease.body;
        updateStatusEl.appendChild(title);
        updateStatusEl.appendChild(relName);
        updateStatusEl.appendChild(notes);
      } else {
        updateStatusEl.appendChild(title);
        updateStatusEl.appendChild(relName);
      }

      const linkRow = document.createElement("div");
      linkRow.style.cssText = "display:flex;gap:8px;align-items:center;";
      const link = document.createElement("a");
      link.href = _latestRelease.url;
      link.target = "_blank";
      link.style.cssText = "font-size:10px;color:#785a28;text-decoration:underline;cursor:pointer;";
      link.textContent = "View release on GitHub";
      linkRow.appendChild(link);
      updateStatusEl.appendChild(linkRow);
    } else {
      updateStatusEl.style.borderColor = "#1a2535";
      updateStatusEl.style.background = "rgba(0,0,0,0.2)";
      const span = document.createElement("span");
      span.style.color = "#3a5060";
      span.textContent = `Current version: v${CURRENT_VERSION} — up to date`;
      updateStatusEl.appendChild(span);
    }
  }

  renderUpdateStatus();
  updateSection.appendChild(updateStatusEl);

  // Manual check button
  const checkBtnRow = document.createElement("div");
  checkBtnRow.style.cssText = "display:flex;gap:8px;align-items:center;margin-top:8px;";
  const checkBtn = document.createElement("button");
  checkBtn.className = "ci-btn-secondary";
  checkBtn.style.cssText = "font-size:10px;padding:5px 12px;";
  checkBtn.textContent = "Check now";
  const checkStatus = document.createElement("span");
  checkStatus.style.cssText = "font-size:10px;color:#4a6070;";

  checkBtn.addEventListener("click", async () => {
    checkBtn.disabled = true;
    checkBtn.textContent = "Checking...";
    checkStatus.textContent = "";
    await checkForUpdates(true);
    renderUpdateStatus();
    checkBtn.disabled = false;
    checkBtn.textContent = "Check now";
    checkStatus.textContent = _latestRelease ? "" : "Already up to date";
    setTimeout(() => { checkStatus.textContent = ""; }, 3000);
  });

  checkBtnRow.appendChild(checkBtn);
  checkBtnRow.appendChild(checkStatus);
  updateSection.appendChild(checkBtnRow);

  wrap.appendChild(updateSection);

  // DATA MANAGEMENT
  const dangerSection = makeSection("Data", "");

  const dangerDesc = document.createElement("div");
  dangerDesc.style.cssText =
    "font-size:10px;color:#3a5060;line-height:1.5;margin-top:6px;margin-bottom:12px;";
  dangerDesc.textContent =
    "Permanently deletes all saved CSS and settings from DataStore. The plugin will reload clean.";
  dangerSection.appendChild(dangerDesc);

  const deleteRow = document.createElement("div");
  deleteRow.style.cssText = "display:flex;align-items:center;gap:10px;";

  const deleteBtn = document.createElement("button");
  deleteBtn.style.cssText =
    "padding:7px 14px;font-family:inherit;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;background:transparent;border:1px solid #5a2828;color:#c84b4b;cursor:pointer;transition:background 0.15s;";
  deleteBtn.textContent = "Delete All Saved Data";
  deleteBtn.addEventListener("mouseenter", () => {
    deleteBtn.style.background = "rgba(200,75,75,0.1)";
  });
  deleteBtn.addEventListener("mouseleave", () => {
    deleteBtn.style.background = "transparent";
  });

  const deleteStatus = document.createElement("span");
  deleteStatus.style.cssText =
    "font-size:10px;color:#4caf82;opacity:0;transition:opacity 0.2s;";
  deleteStatus.textContent = "Deleted";

  deleteBtn.addEventListener("click", async () => {
    const ok = await Storage.removeAll("Snooze-CSS-css", SETTINGS_KEY);
    if (ok) {
      state = { ...defaults };
      deleteStatus.style.opacity = "1";
      setTimeout(() => {
        deleteStatus.style.opacity = "0";
      }, 2500);
    }
  });

  deleteRow.appendChild(deleteBtn);
  deleteRow.appendChild(deleteStatus);
  dangerSection.appendChild(deleteRow);
  wrap.appendChild(dangerSection);

  // ABOUT
  const aboutSection = makeSection("About", "");

  const aboutContent = document.createElement("div");
  aboutContent.style.cssText =
    "font-size:10px;color:#3a5060;line-height:1.8;margin-top:8px;";

  const aboutLines = [
    ["Plugin:", "Snooze-CSS by Reformed Doge"],
    [
      "Catalog:",
      `${CATALOG.reduce((a, g) => a + (g.elements?.length || 0), 0)} elements · ${CATALOG.length} groups`,
    ],
    [
      "Generic Tools:",
      "Omni Inspector · Hover-Reveal · Clean Mode · Client Frame · Hue-Rotate · Font · CSS Vars · Gradient BG · Screen Tint · Root Overlay · Glass Panel · Mask Fade · Local Asset · BG Replace · Img Replace · Hide · Color · Scrollbar · Custom CSS",
    ],
    [
      "Screens:",
      "Home, Lobby, Champ Select, Post-Game, Store, Loot, Collections, TFT, Clash, Events +more",
    ],
  ];

  aboutLines.forEach(([label, value]) => {
    const row = document.createElement("div");
    const labelEl = document.createElement("span");
    labelEl.textContent = label + "";
    const valueEl = document.createElement("span");
    valueEl.style.color = "#7a8a9a";
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    aboutContent.appendChild(row);
  });

  aboutSection.appendChild(aboutContent);
  wrap.appendChild(aboutSection);

  container.appendChild(wrap);
}

export function cleanupSettingsTab() {
  stopMonitor();
  refreshCallback = null;
}