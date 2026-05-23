import { buildBuilderTab, refreshValues, restoreScrollPos, startElementPicker, cleanupBuilderTab } from "./builder.js";
import { buildRawTab, cleanupRawTab } from "./raw.js";
import { buildSettingsTab, loadSettings, startMonitor, cleanupSettingsTab, setUpdateBadgeCallback, getLatestRelease, getCurrentVersion, getSettings, updateSetting } from "./settings.js";
import { buildAnalyzerTab, cleanupAnalyzerTab } from "./analyzer.js";
import { buildAssetsTab, extractAndNavigate, setSwitchTab, cleanupAssetsTab } from "./assets.js";
import { STYLES } from "./styles.js";

let modalHost = null;
let shadowRoot = null;
let modalEl = null; // Points to modal window inside the shadow DOM
let minimized = false;

// Popout window state
const POPUP_WINDOW_NAME = "snoozeCssPopout";
let popupWindowRef = null;

const POPUP_SIZE_PRESETS = {
  small:    { width: 800,  height: 560 },
  medium:   { width: 960,  height: 680 },
  large:    { width: 1200, height: 800 },
};

function clampDim(value, fallback, min, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getPopupSize(settings) {
  const s = settings || getSettings();
  const preset = s.popoutWindowSize || "medium";
  if (preset === "custom") {
    return {
      width:  clampDim(s.popoutWindowWidth,  960, 600, 3840),
      height: clampDim(s.popoutWindowHeight, 680, 400, 2160),
    };
  }
  return POPUP_SIZE_PRESETS[preset] || POPUP_SIZE_PRESETS.medium;
}

function getPopupFeatures(settings) {
  const { width, height } = getPopupSize(settings);
  return `left=100,top=100,width=${width},height=${height},resizable=yes,scrollbars=yes`;
}

function sendWindowCommand(win, name, params = []) {
  try {
    if (typeof win.riotInvoke !== "function") return;
    win.riotInvoke({ request: JSON.stringify({ name, params }) });
  } catch {}
}

function getPopupWindow() {
  if (popupWindowRef && popupWindowRef.closed) popupWindowRef = null;
  return popupWindowRef;
}

function closePopupWindow() {
  const win = getPopupWindow();
  if (!win) return;
  try { win.close(); } catch {}
  if (popupWindowRef === win) popupWindowRef = null;
}

/**
 * Write a minimal HTML shell into the popup window and return the body element
 * that will host the shadow-DOM host div.
 */
// Approximate header-only height for the minimized popup window (px)
const POPUP_MINIMIZED_HEIGHT = 52;

function ensurePopupDocument(win) {
  const doc = win.document;
  doc.open();
  doc.write("<!doctype html><html><head><title>Snooze-CSS</title></head><body class=\"snooze-popout-body\"></body></html>");
  doc.close();

  // Inject a tiny style so the body fills the window and has the right bg
  const styleEl = doc.createElement("style");
  styleEl.textContent = `
    body.snooze-popout-body {
      margin: 0;
      overflow: hidden;
      background: #0a1428;
    }
    body.snooze-popout-body #snooze-css-host {
      position: fixed;
      inset: 0;
      z-index: 999999;
      pointer-events: none;
      -webkit-app-region: no-drag;
    }
  `;
  doc.head.appendChild(styleEl);

  return doc.body;
}

/**
 * Attach a drag-to-resize handle in the bottom-right corner of the popup window.
 * Uses Window.ResizeTo (riotInvoke) and saves the resulting size to settings.
 *
 * Key insight: Window.ResizeTo controls the *inner* viewport (win.innerWidth/Height),
 * not the outer window including OS chrome. We must baseline against innerWidth/Height,
 * not outerWidth/Height or doc.body.offsetWidth (which can be 0 before layout or
 * includes different measurements). We also use frame-to-frame deltas so that any
 * coordinate space difference between the mousedown and first mousemove events doesn't
 * cause a snap.
 */
function initPopupWindowResize(win, resizeHandleEl) {
  let isDragging = false;
  let prevScreenX = 0, prevScreenY = 0;
  let currentW = 0, currentH = 0;
  let lastSentW = 0, lastSentH = 0;

  const onDragMove = (e) => {
    if (!isDragging) return;

    const dx = e.screenX - prevScreenX;
    const dy = e.screenY - prevScreenY;
    prevScreenX = e.screenX;
    prevScreenY = e.screenY;

    const isMinimizedState = currentH <= 100;

    currentW = Math.max(600, Math.min(3840, currentW + dx));
    
    if (isMinimizedState) {
      // Lock height when minimized, only allow width resizing
      if (modalEl && modalEl._savedPopupW) modalEl._savedPopupW = Math.round(currentW);
      if (modalEl && modalEl._pickerSavedW) modalEl._pickerSavedW = Math.round(currentW);
    } else {
      currentH = Math.max(400, Math.min(2160, currentH + dy));
    }

    const rW = Math.round(currentW);
    const rH = Math.round(currentH);
    if (Math.abs(rW - lastSentW) >= 4 || Math.abs(rH - lastSentH) >= 4) {
      lastSentW = rW;
      lastSentH = rH;
      sendWindowCommand(win, "Window.ResizeTo", [rW, rH]);
    }
  };

  const onDragStart = (e) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging  = true;
    prevScreenX = e.screenX;
    prevScreenY = e.screenY;
    currentW  = win.innerWidth  || 900;
    currentH  = win.innerHeight || 600;
    lastSentW = currentW;
    lastSentH = currentH;
    win.addEventListener("mousemove", onDragMove);
  };

  const onDragEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    win.removeEventListener("mousemove", onDragMove);
    
    updateSetting("popoutWindowSize", "custom");
    updateSetting("popoutWindowWidth", lastSentW || currentW);
    // Don't overwrite the saved height setting if we are currently minimized
    if (currentH > 100) {
      updateSetting("popoutWindowHeight", lastSentH || currentH);
    }
  };

  resizeHandleEl.addEventListener("mousedown", onDragStart);
  win.addEventListener("mouseup", onDragEnd);
}

function bindPopupLifecycle(win) {
  if (win.__snoozeCssLifecycleBound) return;
  const clearRef = () => {
    if (popupWindowRef === win) popupWindowRef = null;
    if (modalHost) destroyModal();
  };
  win.addEventListener("beforeunload", clearRef);
  win.addEventListener("pagehide", clearRef);
  win.__snoozeCssLifecycleBound = true;
}

// Helper for builder.js to reach backdrop inside shadow DOM
export function getBackdrop() {
  return shadowRoot ? shadowRoot.getElementById("css-injector-backdrop") : null;
}

export function getModalEl() {
  return modalEl;
}

/**
 * Returns the document that owns the modal UI.
 * In inline mode this is the main `document`.
 * In popup mode this is the popup window's document.
 */
export function getModalDocument() {
  return (modalHost && modalHost.ownerDocument) || document;
}

/**
 * Returns true when the modal is currently rendered inside a popup window.
 */
export function isPopoutMode() {
  return !!(popupWindowRef && !popupWindowRef.closed && modalHost);
}

/**
 * Shrink the popup window to a slim header strip so the user can interact
 * Restores on call with restore=true.
 */
export function setPopupPickerMode(picking) {
  if (!isPopoutMode()) return;
  const win = popupWindowRef;
  if (picking) {
    // We must use win.innerWidth/innerHeight because Window.ResizeTo sets inner dimensions.
    modalEl._pickerSavedW = win.innerWidth  || 1360;
    modalEl._pickerSavedH = win.innerHeight || 860;
    sendWindowCommand(win, "Window.ResizeTo", [modalEl._pickerSavedW, POPUP_MINIMIZED_HEIGHT]);
  } else {
    const w = modalEl?._pickerSavedW || 1360;
    const h = modalEl?._pickerSavedH || 860;
    sendWindowCommand(win, "Window.ResizeTo", [w, h]);
    
    // Pull the window to the front via riotInvoke's Window.Activate
    sendWindowCommand(win, "Window.Activate");

  }
}

// Modal creation

/**
 * Build the host + shadow DOM in a given parent element (either document.body
 * for inline mode, or the popup window's body for popout mode).
 */
function _buildModalInParent(parentEl, isPopout = false) {
  // Create the protective Host Element
  modalHost = parentEl.ownerDocument
    ? parentEl.ownerDocument.createElement("div")
    : document.createElement("div");
  modalHost.id = "snooze-css-host";
  modalHost.style.cssText = "position: fixed; inset: 0; z-index: 999999; pointer-events: none; -webkit-app-region: no-drag;";
  if (isPopout) modalHost.classList.add("popout");
  parentEl.appendChild(modalHost);

  if (!isPopout) {
    // Ensure modal stacks above viewport overlay in the main window
    const overlay = document.querySelector("section.rcp-fe-viewport-overlay");
    if (overlay && overlay.parentNode === document.body) {
      overlay.after(modalHost);
    }
  }

  // Attach a Shadow DOM
  shadowRoot = modalHost.attachShadow({ mode: "open" });

  const ownerDoc = parentEl.ownerDocument || document;

  const backdrop = ownerDoc.createElement("div");
  backdrop.id = "css-injector-backdrop";

  const modal = ownerDoc.createElement("div");
  modal.id = "css-injector-modal";
  modalEl = modal;

  modal.innerHTML = `
    ${isPopout ? "" : `
    <div class="ci-resize-handle ci-rh-n"  data-dir="n"></div>
    <div class="ci-resize-handle ci-rh-s"  data-dir="s"></div>
    <div class="ci-resize-handle ci-rh-e"  data-dir="e"></div>
    <div class="ci-resize-handle ci-rh-w"  data-dir="w"></div>
    <div class="ci-resize-handle ci-rh-ne" data-dir="ne"></div>
    <div class="ci-resize-handle ci-rh-nw" data-dir="nw"></div>
    <div class="ci-resize-handle ci-rh-se" data-dir="se"></div>
    <div class="ci-resize-handle ci-rh-sw" data-dir="sw"></div>
    `}
    <div class="ci-header" id="ci-drag-handle">
    <span class="ci-title">
      Snooze-CSS <span class="ci-version-tag">v${getCurrentVersion()}</span>
    </span>
    <span class="ci-hotkey">Alt + C</span>
    <button class="ci-minimize" id="ci-minimize" title="Minimize">&#x2212;</button>
    <button class="ci-close"    id="ci-close"    title="Close">&#x2715;</button>
    </div>
    <div class="ci-tabs" id="ci-tabs-bar">
      <button class="ci-tab ci-tab-active" data-tab="builder">Visual Builder</button>
      <button class="ci-tab" data-tab="raw">Raw CSS</button>
      <button class="ci-tab" data-tab="analyzer">Analyzer</button>
      <button class="ci-tab" data-tab="assets">Assets</button>
      <button class="ci-tab" data-tab="settings">Settings<span id="ci-update-badge" style="display:none;width:6px;height:6px;background:#c8aa6e;border-radius:50%;margin-left:5px;vertical-align:middle;display:inline-block;opacity:0;transition:opacity 0.2s;"></span></button>
    </div>
    <div class="ci-body" id="ci-body">
      <div class="ci-panel" id="ci-panel-builder"></div>
      <div class="ci-panel ci-panel-hidden" id="ci-panel-raw"></div>
      <div class="ci-panel ci-panel-hidden" id="ci-panel-analyzer"></div>
      <div class="ci-panel ci-panel-hidden ci-panel--flush" id="ci-panel-assets"></div>
      <div class="ci-panel ci-panel-hidden" id="ci-panel-settings"></div>
    </div>
  `;

  if (isPopout) {
    // Fill the popup window
    modal.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    // Make drag handle non-draggable (popup has a native title bar)
    const dragHandle = modal.querySelector("#ci-drag-handle");
    if (dragHandle) dragHandle.style.cursor = "default";

    // Corner drag-resize handle (bottom-right)
    const resizeHandle = ownerDoc.createElement("div");
    resizeHandle.id = "sc-popup-resize";
    resizeHandle.style.cssText =
      "position:fixed;bottom:0;right:0;width:18px;height:18px;" +
      "cursor:se-resize;z-index:10000001;opacity:0.5;" +
      "background:linear-gradient(135deg,transparent 50%,#785a28 50%);";
    ownerDoc.body.appendChild(resizeHandle);
    initPopupWindowResize(popupWindowRef, resizeHandle);
  } else {
    const initW = 720;
    const initH = Math.round(window.innerHeight * 0.82);
    modal.style.width = initW + "px";
    modal.style.height = initH + "px";
    modal.style.left = Math.round((window.innerWidth - initW) / 2) + "px";
    modal.style.top = Math.round((window.innerHeight - initH) / 2) + "px";
  }

  backdrop.appendChild(modal);
  shadowRoot.appendChild(backdrop);

  // Allow drag events to bubble to modal content for file drop
  backdrop.addEventListener("dragover", (e) => { e.stopPropagation(); });
  backdrop.addEventListener("drop",     (e) => { e.stopPropagation(); });
  backdrop.style.webkitAppRegion = "no-drag";

  // Inject styles into shadow root
  injectStyles(shadowRoot);

  buildBuilderTab(shadowRoot.querySelector("#ci-panel-builder"));
  buildRawTab(shadowRoot.querySelector("#ci-panel-raw"));
  buildAnalyzerTab(shadowRoot.querySelector("#ci-panel-analyzer"));
  buildAssetsTab(shadowRoot.querySelector("#ci-panel-assets"));
  buildSettingsTab(shadowRoot.querySelector("#ci-panel-settings"));

  // Wire up update badge on the Settings tab button
  const updateBadge = shadowRoot.querySelector("#ci-update-badge");
  function applyUpdateBadge(release) {
    if (!updateBadge) return;
    updateBadge.style.opacity = release ? "1" : "0";
  }
  setUpdateBadgeCallback(applyUpdateBadge);
  applyUpdateBadge(getLatestRelease());

  // Asset tab switch handler
  setSwitchTab(switchTab);

  // Asset element picker integration
  shadowRoot.querySelector("#ci-panel-assets").addEventListener("ax-pick-element", () => {
    startElementPicker((sel, targetNode) => {
      const input = shadowRoot.querySelector("#ax-sel-input");
      if (input) input.value = sel;
      extractAndNavigate(sel, targetNode);
    });
  });

  modal.querySelectorAll(".ci-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prev = shadowRoot.querySelector(".ci-tab-active")?.dataset.tab;
      switchTab(btn.dataset.tab);
      if (btn.dataset.tab === "builder" && prev !== "builder") {
        refreshValues("tab-switch");
        requestAnimationFrame(() => restoreScrollPos());
      }
    });
  });

  shadowRoot.querySelector("#ci-close").addEventListener("click", destroyModal);
  shadowRoot.querySelector("#ci-minimize").addEventListener("click", toggleMinimize);

  // Keyboard shortcut to close
  const targetDoc = isPopout ? parentEl.ownerDocument : document;
  const onKey = (e) => {
    if (e.key === "Escape") destroyModal();
  };
  targetDoc.addEventListener("keydown", onKey);
  modalHost._onKey = onKey;
  modalHost._onKeyDoc = targetDoc;

  // Global drag/drop for CEF support (only needed for inline mode)
  if (!isPopout) {
    const onWindowDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };
    const onWindowDrop = (e) => { e.preventDefault(); };
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);
    modalHost._dragHandlers = { onWindowDragOver, onWindowDrop };
  }

  if (!isPopout) {
    initDrag(modal, shadowRoot.querySelector("#ci-drag-handle"));
    initResize(modal);
  }

  loadSettings().then((s) => {
    if (s.autoMonitor) startMonitor();
  });
}

export function createModal() {
  const settings = getSettings();

  if (modalHost) {
    if (minimized) {
      restoreModal();
      return;
    }
    destroyModal();
    return;
  }

  // If there's an existing popup window open, reuse it
  const existingPopup = getPopupWindow();
  if (existingPopup && settings.openModalInNewWindow) {
    try { existingPopup.focus(); } catch {}
    return;
  }

  minimized = false;

  if (settings.openModalInNewWindow) {
    // Popup mode 
    const win = window.open("about:blank", POPUP_WINDOW_NAME, getPopupFeatures(settings));
    if (!win) {
      // Popup blocked? fall through to inline
      console.warn("[Snooze-CSS] Popup window blocked, falling back to inline modal.");
    } else {
      popupWindowRef = win;
      bindPopupLifecycle(win);

      const { width, height } = getPopupSize(settings);
      sendWindowCommand(win, "Window.ResizeTo", [width, height]);
      sendWindowCommand(win, "Window.CenterToScreen");
      sendWindowCommand(win, "Window.Show");

      const popupBody = ensurePopupDocument(win);
      _buildModalInParent(popupBody, true);

      try { win.focus(); } catch {}
      return;
    }
  }

  // Inline mode (default) 
  _buildModalInParent(document.body, false);
}

function toggleMinimize() {
  if (!modalEl || !shadowRoot) return;

  if (isPopoutMode()) {
    // In popup mode: shrink/restore the actual OS window
    const win = popupWindowRef;
    if (!minimized) {
      // Save current window size before minimizing
      // must use win.innerWidth/innerHeight because Window.ResizeTo sets inner dimensions.
      modalEl._savedPopupW = win.innerWidth  || 1360;
      modalEl._savedPopupH = win.innerHeight || 860;

      // Shrink to header-only strip
      sendWindowCommand(win, "Window.ResizeTo", [modalEl._savedPopupW, POPUP_MINIMIZED_HEIGHT]);

      const minBtn = shadowRoot.querySelector("#ci-minimize");
      if (minBtn) minBtn.innerHTML = "&#x25A1;";
      minimized = true;
    } else {
      // Restore to saved size
      const w = modalEl._savedPopupW || 1360;
      const h = modalEl._savedPopupH || 860;
      sendWindowCommand(win, "Window.ResizeTo", [w, h]);

      const minBtn = shadowRoot.querySelector("#ci-minimize");
      if (minBtn) minBtn.innerHTML = "&#x2212;";
      minimized = false;
      requestAnimationFrame(() => restoreScrollPos());
    }
    return;
  }

  // Inline mode
  const body    = shadowRoot.querySelector("#ci-body");
  const tabs    = shadowRoot.querySelector("#ci-tabs-bar");
  const minBtn  = shadowRoot.querySelector("#ci-minimize");
  const handles = modalEl.querySelectorAll(".ci-resize-handle");

  if (!minimized) {
    modalEl._savedHeight = modalEl.style.height;
    modalEl._savedWidth  = modalEl.style.width;
    body.style.display      = "none";
    tabs.style.display      = "none";
    modalEl.style.height    = "auto";
    modalEl.style.minHeight = "0";
    modalEl.style.width     = "auto";
    modalEl.style.minWidth  = "0";
    handles.forEach((h) => (h.style.display = "none"));
    minBtn.innerHTML = "&#x25A1;";
    minimized = true;
  } else {
    restoreModal();
  }
}

function restoreModal() {
  if (!modalEl || !shadowRoot) return;

  if (isPopoutMode()) {
    return;
  }

  const body    = shadowRoot.querySelector("#ci-body");
  const tabs    = shadowRoot.querySelector("#ci-tabs-bar");
  const minBtn  = shadowRoot.querySelector("#ci-minimize");
  const handles = modalEl.querySelectorAll(".ci-resize-handle");

  body.style.display      = "";
  tabs.style.display      = "";
  modalEl.style.height    = modalEl._savedHeight || "82vh";
  modalEl.style.minHeight = "";
  modalEl.style.width     = modalEl._savedWidth  || "720px";
  modalEl.style.minWidth  = "";
  handles.forEach((h) => (h.style.display = ""));
  minBtn.innerHTML = "&#x2212;";
  minimized = false;
  requestAnimationFrame(() => restoreScrollPos());
}

export function destroyModal() {
  if (modalHost) {
    const onKeyDoc = modalHost._onKeyDoc || document;
    if (modalHost._onKey)
      onKeyDoc.removeEventListener("keydown", modalHost._onKey);

    if (modalHost._dragHandlers) {
      window.removeEventListener(
        "dragover",
        modalHost._dragHandlers.onWindowDragOver,
      );
      window.removeEventListener("drop", modalHost._dragHandlers.onWindowDrop);
      modalHost._dragHandlers = null;
    }

    modalHost.remove();
    modalHost = null;
    shadowRoot = null;
    modalEl = null;
    minimized = false;

    // Call all cleanup functions to reset module state
    cleanupRawTab();
    cleanupBuilderTab();
    cleanupAssetsTab();
    cleanupSettingsTab();
    cleanupAnalyzerTab();
  }

  // Close the popup window if it is still open
  closePopupWindow();
}

export function switchTab(name) {
  if (!modalEl) return;
  modalEl.querySelectorAll(".ci-tab").forEach((t) => {
    t.classList.toggle("ci-tab-active", t.dataset.tab === name);
  });
  modalEl.querySelectorAll(".ci-panel").forEach((p) => {
    p.classList.add("ci-panel-hidden");
  });
  const panel = modalEl.querySelector("#ci-panel-" + name);
  if (panel) panel.classList.remove("ci-panel-hidden");
}

// DRAG HANDLER
function initDrag(modal, handle) {
  let startX, startY, startL, startT;

  handle.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON") return;
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    startL = parseInt(modal.style.left) || 0;
    startT = parseInt(modal.style.top) || 0;

    const onMove = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const maxL = window.innerWidth - modal.offsetWidth;
      const maxT = window.innerHeight - 40;
      modal.style.left = Math.max(0, Math.min(maxL, startL + dx)) + "px";
      modal.style.top = Math.max(0, Math.min(maxT, startT + dy)) + "px";
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// RESIZE HANDLER
function initResize(modal) {
  const MIN_W = 400,
    MIN_H = 200;

  modal.querySelectorAll(".ci-resize-handle").forEach((handle) => {
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const dir = handle.dataset.dir;
      const startX = e.clientX,
        startY = e.clientY;
      const startW = modal.offsetWidth,
        startH = modal.offsetHeight;
      const startL = parseInt(modal.style.left) || 0;
      const startT = parseInt(modal.style.top) || 0;

      const onMove = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let w = startW,
          h = startH,
          l = startL,
          t = startT;

        if (dir.includes("e")) w = Math.max(MIN_W, startW + dx);
        if (dir.includes("s")) h = Math.max(MIN_H, startH + dy);
        if (dir.includes("w")) {
          w = Math.max(MIN_W, startW - dx);
          l = startL + (startW - w);
        }
        if (dir.includes("n")) {
          h = Math.max(MIN_H, startH - dy);
          t = startT + (startH - h);
        }

        modal.style.width = w + "px";
        modal.style.height = h + "px";
        modal.style.left = l + "px";
        modal.style.top = t + "px";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

// Accept the shadow root as an argument, and query it instead of document
function injectStyles(root) {
  if (root.querySelector("#css-injector-styles")) return;
  // Use the shadow root's ownerDocument so it works in both inline and popup contexts
  const ownerDoc = (root.host && root.host.ownerDocument) || document;
  const style = ownerDoc.createElement("style");
  style.id = "css-injector-styles";
  style.textContent = STYLES;
  root.appendChild(style);
}