// Settings state (persisted to DataStore)
import { Storage } from "./storage.js";
import { makeSection, makeToggle } from "./utils.js";

const SETTINGS_KEY = "Snooze-CSS-settings";

const defaults = {
  autoMonitor: true,
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

export async function loadSettings() {
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

// Start watching top-level DOM for screen swaps
export function startMonitor() {
  if (observer) return; // already running

  let debounceTimer = null;

  observer = new MutationObserver((mutations) => {
    // Only care if a sentinel element was added or removed
    let changed = false;
    for (const m of mutations) {
      for (const node of [...m.addedNodes, ...m.removedNodes]) {
        if (node.nodeType !== 1) continue; // elements only
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

    // Debounce (screen transitions fire multiple mutations, wait for them to settle)
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (refreshCallback) refreshCallback("monitor");
    }, 400);
  });

  // Watch body direct children only
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

export function buildSettingsTab(container) {
  container.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;gap:16px;";

  // AUTO MONITOR
  const monSection = makeSection(
    "🔍 Live Value Monitor",
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
      ' Values are also refreshed when you switch to the Visual Builder tab. Elements not present in the current screen show a dim "not in DOM" indicator.',
    ),
  );
  monSection.appendChild(note);

  wrap.appendChild(monSection);

  // DATA / DANGER
  const dangerSection = makeSection("🗑 Data", "");

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
  deleteStatus.textContent = "Deleted ✓";

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
  const aboutSection = makeSection("ℹ️ About", "");

  const aboutContent = document.createElement("div");
  aboutContent.style.cssText =
    "font-size:10px;color:#3a5060;line-height:1.8;margin-top:8px;";

  const aboutLines = [
    ["Plugin:", "Snooze-CSS by Reformed Doge"],
    ["Catalog:", "~470 elements · 44 groups"],
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
    labelEl.textContent = label + " ";
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
