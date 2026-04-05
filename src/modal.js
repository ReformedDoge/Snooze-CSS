import { buildBuilderTab, refreshValues, restoreScrollPos, startElementPicker, cleanupBuilderTab } from "./builder.js";
import { buildRawTab, cleanupRawTab } from "./raw.js";
import { buildSettingsTab, loadSettings, startMonitor, cleanupSettingsTab } from "./settings.js";
import { buildAnalyzerTab, cleanupAnalyzerTab } from "./analyzer.js";
import { buildAssetsTab, extractAndNavigate, setSwitchTab, cleanupAssetsTab } from "./assets.js";
import { STYLES } from "./styles.js";

let modalHost = null;
let shadowRoot = null;
let modalEl = null; // Points to modal window inside the shadow DOM
let minimized = false;

// Helper for builder.js to reach backdrop inside shadow DOM
export function getBackdrop() {
  return shadowRoot ? shadowRoot.getElementById("css-injector-backdrop") : null;
}

export function getModalEl() {
  return modalEl;
}

export function createModal() {
  if (modalHost) {
    if (minimized) {
      restoreModal();
      return;
    }
    destroyModal(); // Make sure we fully clean up if toggling off
    return;
  }

  minimized = false;

  // Create the protective Host Element
  modalHost = document.createElement("div");
  modalHost.id = "snooze-css-host";
  modalHost.style.cssText = "position: fixed; inset: 0; z-index: 999999; pointer-events: none; -webkit-app-region: no-drag;";
  document.body.appendChild(modalHost);
  // Ensure modal stacks above viewport overlay
  const overlay = document.querySelector("section.rcp-fe-viewport-overlay");
  if (overlay && overlay.parentNode === document.body) {
    overlay.after(modalHost);
  }
  // Attach a Shadow DOM
  shadowRoot = modalHost.attachShadow({ mode: "open" });

  const backdrop = document.createElement("div");
  backdrop.id = "css-injector-backdrop";

  const modal = document.createElement("div");
  modal.id = "css-injector-modal";
  modalEl = modal;

  modal.innerHTML = `
    <div class="ci-resize-handle ci-rh-n"  data-dir="n"></div>
    <div class="ci-resize-handle ci-rh-s"  data-dir="s"></div>
    <div class="ci-resize-handle ci-rh-e"  data-dir="e"></div>
    <div class="ci-resize-handle ci-rh-w"  data-dir="w"></div>
    <div class="ci-resize-handle ci-rh-ne" data-dir="ne"></div>
    <div class="ci-resize-handle ci-rh-nw" data-dir="nw"></div>
    <div class="ci-resize-handle ci-rh-se" data-dir="se"></div>
    <div class="ci-resize-handle ci-rh-sw" data-dir="sw"></div>
    <div class="ci-header" id="ci-drag-handle">
      <span class="ci-title">Snooze-CSS</span>
      <span class="ci-hotkey">Alt + C</span>
      <button class="ci-minimize" id="ci-minimize" title="Minimize">&#x2212;</button>
      <button class="ci-close"    id="ci-close"    title="Close">&#x2715;</button>
    </div>
    <div class="ci-tabs" id="ci-tabs-bar">
      <button class="ci-tab ci-tab-active" data-tab="builder">Visual Builder</button>
      <button class="ci-tab" data-tab="raw">Raw CSS</button>
      <button class="ci-tab" data-tab="analyzer">Analyzer</button>
      <button class="ci-tab" data-tab="assets">Assets</button>
      <button class="ci-tab" data-tab="settings">Settings</button>
    </div>
    <div class="ci-body" id="ci-body">
      <div class="ci-panel" id="ci-panel-builder"></div>
      <div class="ci-panel ci-panel-hidden" id="ci-panel-raw"></div>
      <div class="ci-panel ci-panel-hidden" id="ci-panel-analyzer"></div>
      <div class="ci-panel ci-panel-hidden ci-panel--flush" id="ci-panel-assets"></div>
      <div class="ci-panel ci-panel-hidden" id="ci-panel-settings"></div>
    </div>
  `;

  const initW = 720,
    initH = Math.round(window.innerHeight * 0.82);
  modal.style.width = initW + "px";
  modal.style.height = initH + "px";
  modal.style.left = Math.round((window.innerWidth - initW) / 2) + "px";
  modal.style.top = Math.round((window.innerHeight - initH) / 2) + "px";

  backdrop.appendChild(modal);
  shadowRoot.appendChild(backdrop);

  // Allow drag events bubble to modal content for file drop
  backdrop.addEventListener("dragover", (e) => {
    e.stopPropagation();
  });

  backdrop.addEventListener("drop", (e) => {
    e.stopPropagation();
  });

  // Prevent OS drag conflicts
  backdrop.style.webkitAppRegion = "no-drag";

  // Inject styles into shadow root
  injectStyles(shadowRoot);

  buildBuilderTab(shadowRoot.querySelector("#ci-panel-builder"));
  buildRawTab(shadowRoot.querySelector("#ci-panel-raw"));
  buildAnalyzerTab(shadowRoot.querySelector("#ci-panel-analyzer"));
  buildAssetsTab(shadowRoot.querySelector("#ci-panel-assets"));
  buildSettingsTab(shadowRoot.querySelector("#ci-panel-settings"));

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
  shadowRoot
    .querySelector("#ci-minimize")
    .addEventListener("click", toggleMinimize);

  const onKey = (e) => {
    if (e.key === "Escape") destroyModal();
  };
  document.addEventListener("keydown", onKey);
  modalHost._onKey = onKey; // Attach reference to the host so we can remove it later

  // Global drag/drop for CEF support
  const onWindowDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onWindowDrop = (e) => {
    e.preventDefault();
  };
  window.addEventListener("dragover", onWindowDragOver);
  window.addEventListener("drop", onWindowDrop);
  modalHost._dragHandlers = { onWindowDragOver, onWindowDrop };

  initDrag(modal, shadowRoot.querySelector("#ci-drag-handle"));
  initResize(modal);

  loadSettings().then((s) => {
    if (s.autoMonitor) startMonitor();
  });
}

function toggleMinimize() {
  if (!modalEl || !shadowRoot) return;

  const body = shadowRoot.querySelector("#ci-body");
  const tabs = shadowRoot.querySelector("#ci-tabs-bar");
  const minBtn = shadowRoot.querySelector("#ci-minimize");
  const handles = modalEl.querySelectorAll(".ci-resize-handle");

  if (!minimized) {
    modalEl._savedHeight = modalEl.style.height;
    modalEl._savedWidth = modalEl.style.width;
    body.style.display = "none";
    tabs.style.display = "none";
    modalEl.style.height = "auto";
    modalEl.style.minHeight = "0";
    modalEl.style.width = "auto";
    modalEl.style.minWidth = "0";
    handles.forEach((h) => (h.style.display = "none"));
    minBtn.innerHTML = "&#x25A1;";
    minimized = true;
  } else {
    restoreModal();
  }
}

function restoreModal() {
  if (!modalEl || !shadowRoot) return;

  const body = shadowRoot.querySelector("#ci-body");
  const tabs = shadowRoot.querySelector("#ci-tabs-bar");
  const minBtn = shadowRoot.querySelector("#ci-minimize");
  const handles = modalEl.querySelectorAll(".ci-resize-handle");

  body.style.display = "";
  tabs.style.display = "";
  modalEl.style.height = modalEl._savedHeight || "82vh";
  modalEl.style.minHeight = "";
  modalEl.style.width = modalEl._savedWidth || "720px";
  modalEl.style.minWidth = "";
  handles.forEach((h) => (h.style.display = ""));
  minBtn.innerHTML = "&#x2212;";
  minimized = false;
  requestAnimationFrame(() => restoreScrollPos());
}

export function destroyModal() {
  if (modalHost) {
    if (modalHost._onKey)
      document.removeEventListener("keydown", modalHost._onKey);

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
  const style = document.createElement("style");
  style.id = "css-injector-styles";
  style.textContent = STYLES;
  root.appendChild(style);
}
