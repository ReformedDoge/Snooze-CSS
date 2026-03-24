import { CATALOG } from "./catalog.js";
import { setCssProperty, setCssBatch, sendToRaw } from "./raw.js";
import { setRefreshCallback } from "./settings.js";
import { rgbToHex, flashMessage } from "./utils.js";
import { getBackdrop } from "./modal.js";

// SESSION STATE
const _collapseState = new Map();
let _scrollPos = 0;
let _inputs = [];
let _bodyEl = null;

export function buildBuilderTab(container) {
  _inputs = [];
  container.innerHTML = "";

  const topBar = document.createElement("div");
  topBar.style.cssText =
    "display:flex;gap:6px;align-items:center;margin-bottom:10px;";

  const searchInput = document.createElement("input");
  searchInput.id = "ci-search";
  searchInput.type = "text";
  searchInput.placeholder = "Search elements…";
  searchInput.autocomplete = "off";
  searchInput.style.cssText =
    "flex:1;background:rgba(0,0,0,0.35);border:1px solid #1e2d3d;border-bottom-color:#785a28;color:#a0b4c8;font-family:Sora,Arial,sans-serif;font-size:11px;padding:7px 10px;outline:none;";
  topBar.appendChild(searchInput);

  const refreshBtn = makeIconBtn("↻", "Refresh live values from DOM", () =>
    refreshValues("manual"),
  );
  topBar.appendChild(refreshBtn);

  container.appendChild(topBar);

  CATALOG.forEach((group) => container.appendChild(buildGroup(group)));

  requestAnimationFrame(() => {
    _bodyEl = container.closest(".ci-body");
    if (_bodyEl) {
      _bodyEl.scrollTop = _scrollPos;
      if (!_bodyEl._scrollListenerAttached) {
        _bodyEl.addEventListener(
          "scroll",
          () => {
            _scrollPos = _bodyEl.scrollTop;
          },
          { passive: true },
        );
        _bodyEl._scrollListenerAttached = true;
      }

      const toTop = document.createElement("button");
      toTop.title = "Scroll to top";
      toTop.style.cssText =
        "position:sticky;bottom:12px;float:right;margin-right:4px;width:28px;height:28px;background:#060e1a;border:1px solid #785a28;color:#785a28;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;transition:background 0.15s,color 0.15s;";
      toTop.textContent = "↑";
      toTop.addEventListener("mouseenter", () => {
        toTop.style.background = "#785a28";
        toTop.style.color = "#f0e6d3";
      });
      toTop.addEventListener("mouseleave", () => {
        toTop.style.background = "#060e1a";
        toTop.style.color = "#785a28";
      });
      toTop.addEventListener("click", () => {
        _bodyEl.scrollTo({ top: 0, behavior: "smooth" });
      });
      container.appendChild(toTop);
    }
  });

  searchInput.addEventListener("input", function () {
    const q = this.value.toLowerCase().trim();
    container.querySelectorAll(".ci-group").forEach((g) => {
      if (g.dataset.generic) return;
      const body = g._bodyEl;
      if (!body) return;
      const rows = g.querySelectorAll(".ci-element-row");
      let anyVisible = false;
      rows.forEach((row) => {
        const match = !q || row.dataset.search.includes(q);
        row.style.display = match ? "" : "none";
        if (match) anyVisible = true;
      });
      g.style.display = anyVisible || !q ? "" : "none";
      if (q && anyVisible) body.style.display = "block";
      else if (!q) {
        const savedOpen = _collapseState.has(g.dataset.groupLabel)
          ? _collapseState.get(g.dataset.groupLabel)
          : g.dataset.defaultOpen === "true";
        body.style.display = savedOpen ? "block" : "none";
      }
    });
  });

  setRefreshCallback(refreshValues);
  refreshValues("init");
}

export function refreshValues(source) {
  // Only refresh inputs that are currently VISIBLE to prevent lag
  _inputs.forEach((reg) => {
    if (!reg.inputEl) return;
    const groupBody = reg.inputEl.closest(".ci-group-body");
    if (!groupBody || groupBody.style.display !== "none") {
      try {
        populateInput(reg);
      } catch {}
    }
  });
}

function register(reg) {
  _inputs.push(reg);
}

// VALUE READING

function getLiveValue(cls, prop) {
  const el = document.querySelector(cls);
  if (!el) return null;
  const cs = getComputedStyle(el);
  switch (prop) {
    case "display":
      return cs.display;
    case "opacity":
      return cs.opacity;
    case "color":
      return rgbToHex(cs.color);
    case "background-color":
      return rgbToHex(cs.backgroundColor);
    case "border-color":
      return rgbToHex(cs.borderTopColor);
    case "background-image":
      return cs.backgroundImage === "none" ? "" : cs.backgroundImage;
    case "background-size":
      return cs.backgroundSize;
    case "background-position":
      return cs.backgroundPosition;
    case "background-repeat":
      return cs.backgroundRepeat;
    case "font-family":
      return cs.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
    case "font-size":
      return cs.fontSize;
    case "filter":
      return cs.filter;
    case "backdrop-filter":
      return cs.backdropFilter || "";
    case "border-radius":
      return cs.borderRadius;
    case "transform":
      return cs.transform !== "none" ? cs.transform : "scale(1)";
    case "width":
      return cs.width;
    case "height":
      return cs.height;
    case "margin":
      return cs.margin;
    case "padding":
      return cs.padding;
    case "visibility":
      return cs.visibility;
    case "mix-blend-mode":
      return cs.mixBlendMode;
    case "left":
      return cs.left;
    case "top":
      return cs.top;
    case "transition":
      return cs.transition !== "all 0s ease 0s" ? cs.transition : "";
    default:
      return "";
  }
}

function isInDOM(cls) {
  return !!document.querySelector(cls);
}

function populateInput(reg) {
  const { cls, prop, inputEl, notBadge } = reg;
  const inDOM = isInDOM(cls);
  if (notBadge) notBadge.style.display = inDOM ? "none" : "inline";
  if (!inDOM || !inputEl) return;
  const val = getLiveValue(cls, prop);
  if (val === null || val === undefined || val === "") return;

  if (inputEl.tagName === "SELECT") {
    const opt = [...inputEl.options].find(
      (o) => o.value === val || val.includes(o.value),
    );
    if (opt) inputEl.value = opt.value;
  } else if (inputEl.type !== "color") {
    inputEl.value = val;
    inputEl.dispatchEvent(new Event("input"));
  }
}

// GROUP BUILDER

function buildGroup(group) {
  const savedOpen = _collapseState.has(group.label)
    ? _collapseState.get(group.label)
    : group.collapsed === false;
  const wrap = document.createElement("div");
  wrap.className = "ci-group";
  wrap.dataset.groupLabel = group.label;
  wrap.dataset.defaultOpen = String(group.collapsed === false);
  if (group.generic) wrap.dataset.generic = "true";

  const icon = document.createElement("span");
  icon.style.cssText = `font-size:9px;color:#785a28;flex-shrink:0;display:inline-block;transition:transform 0.2s;transform:${savedOpen ? "rotate(90deg)" : "rotate(0deg)"}`;
  icon.textContent = "▸";

  const labelEl = document.createElement("span");
  labelEl.style.cssText = `font-size:11px;font-weight:600;letter-spacing:0.04em;flex:1;color:${savedOpen || group.generic ? "#c8aa6e" : "#7a8a9a"}`;
  labelEl.textContent = group.label;

  const countEl = document.createElement("span");
  countEl.style.cssText =
    "font-size:9px;color:#2a3a4a;background:rgba(0,0,0,0.3);border:1px solid #1a2535;padding:1px 6px;border-radius:8px;";
  countEl.textContent = group.elements.length;

  const header = document.createElement("div");
  header.className = "ci-group-header";
  header.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;user-select:none;" +
    (group.generic
      ? "background:#0a1628;border-left:2px solid #c8aa6e;"
      : "background:#060e1a;");
  header.appendChild(icon);
  header.appendChild(labelEl);
  header.appendChild(countEl);
  wrap.appendChild(header);

  const body = document.createElement("div");
  body.className = "ci-group-body";
  body.style.cssText =
    "background:#050c18;border-top:1px solid #1a2535;display:" +
    (savedOpen ? "block" : "none");
  wrap._bodyEl = body;

  if (group.generic) buildGenericTools(body);
  else group.elements.forEach((el) => body.appendChild(buildElementRow(el)));

  wrap.appendChild(body);

  header.addEventListener("click", () => {
    const open = body.style.display === "none";
    body.style.display = open ? "block" : "none";
    icon.style.transform = open ? "rotate(90deg)" : "rotate(0deg)";
    labelEl.style.color = open
      ? "#c8aa6e"
      : group.generic
        ? "#c8aa6e"
        : "#7a8a9a";
    _collapseState.set(group.label, open);

    // Load live DOM values *only* when the group is opened!
    if (open) {
      _inputs
        .filter((reg) => body.contains(reg.inputEl))
        .forEach((reg) => {
          try {
            populateInput(reg);
          } catch {}
        });
    }
  });

  return wrap;
}

// GENERIC TOOLS

function buildGenericTools(body) {
  // --- Quick Theme (Level 1 User Hero Block) ---
  body.appendChild(buildQuickThemeRow());

  // Inspectors
  body.appendChild(buildOmniRow());

  // High-value one-click tools
  body.appendChild(buildHoverRevealRow());
  body.appendChild(buildMinimalModeRow());
  body.appendChild(buildClientFrameRow());
  body.appendChild(buildHueRotateRow());
  body.appendChild(buildFontRow());
  body.appendChild(buildCssVarsRow());
  body.appendChild(buildGradientBgRow());
  body.appendChild(buildScreenTintRow());
  body.appendChild(buildRootOverlayRow());
  body.appendChild(buildGlassPanelRow());
  body.appendChild(buildMaskFadeRow());

  // Asset / background tools
  body.appendChild(buildLocalAssetRow());
  body.appendChild(buildBgRow());
  body.appendChild(buildImgReplaceRow());

  // Element tools
  body.appendChild(buildHideRow());
  body.appendChild(buildColorRow());
  body.appendChild(buildScrollbarRow());
  body.appendChild(buildCustomRow());
}

// QUICK THEME (Easy Mode for Level 1 Users)
function buildQuickThemeRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.borderBottom = "2px solid #c8aa6e";
  row.style.background = "rgba(200, 170, 110, 0.05)";
  row.style.padding = "16px 14px";

  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:13px; margin-bottom: 6px;">✨ Quick Theme Builder</div>
    <div class="ci-generic-desc" style="margin-bottom: 12px;">Instantly build a custom theme! Choose a background image, and we'll automatically make the client transparent and apply frosted glass effects. Shows splash art elegantly in a glass card.</div>

    <div class="ci-inline-row" style="margin-bottom: 10px;">
      <div class="ci-field" style="grid-column: span 2;"><div class="ci-label">1. Background Image URL</div>
        <input class="ci-input" id="qt-bg-url" type="text" placeholder="https://... or ./assets/theme/bg.jpg" style="font-size:12px; padding:8px 10px;">
      </div>
    </div>

    <div class="ci-inline-row" style="margin-bottom: 10px;">
      <div class="ci-field"><div class="ci-label">2. Darken Background</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="range" id="qt-dim-slider" class="ci-slider" min="0" max="0.9" step="0.05" value="0.3" style="flex:1;">
          <input class="ci-input" id="qt-dim-text" type="text" value="0.3" style="width:40px;" readonly>
        </div>
      </div>
      <div class="ci-field"><div class="ci-label">3. Glass Card Blur</div>
        <select class="ci-select" id="qt-glass-blur">
          <option value="none">None</option>
          <option value="4px">Light (4px)</option>
          <option value="12px" selected>Medium (12px)</option>
          <option value="20px">Heavy (20px)</option>
        </select>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:6px;margin:12px 0;">
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
        <input type="checkbox" id="qt-transparent" checked style="accent-color:#785a28;cursor:pointer;margin-top:2px;">
        <div style="display:flex;flex-direction:column;">
            <span style="font-size:11px;color:#a0b4c8;font-weight:600;">Make all screens transparent</span>
            <span style="font-size:9px;color:#4a6070;">Removes dark backgrounds from Home, Profile, Loot, Store, etc.</span>
        </div>
      </label>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
        <input type="checkbox" id="qt-hide-riot" checked style="accent-color:#785a28;cursor:pointer;margin-top:2px;">
        <div style="display:flex;flex-direction:column;">
            <span style="font-size:11px;color:#a0b4c8;font-weight:600;">Hide other UI backgrounds</span>
            <span style="font-size:9px;color:#4a6070;">Hides map backgrounds, overlays, and default graphics (keeps splash art visible).</span>
        </div>
      </label>
    </div>

    <button class="ci-btn-primary" id="qt-apply-btn" style="width:100%; text-align:center; padding: 10px; font-size:12px;">🚀 Apply Quick Theme</button>
    <div style="text-align:center; margin-top:6px;">
        <span class="ci-flash" id="qt-flash"></span>
    </div>
  `;

  const dimSlider = row.querySelector("#qt-dim-slider");
  const dimText = row.querySelector("#qt-dim-text");
  dimSlider.addEventListener("input", () => (dimText.value = dimSlider.value));

  row.querySelector("#qt-apply-btn").addEventListener("click", () => {
    const bgUrl = row.querySelector("#qt-bg-url").value.trim();
    const dim = dimSlider.value;
    const blur = row.querySelector("#qt-glass-blur").value;
    const doTrans = row.querySelector("#qt-transparent").checked;
    const doHide = row.querySelector("#qt-hide-riot").checked;

    if (!bgUrl) {
      flashMessage(
        row.querySelector("#qt-flash"),
        "Please enter an image URL!",
        "#c84b4b",
      );
      return;
    }

    const lines = [];
    lines.push(`/* =========================================== */`);
    lines.push(`/* QUICK THEME GENERATOR — PREMIUM EDITION      */`);
    lines.push(`/* =========================================== */`);
    lines.push(`:root { --qt-bg: url('${bgUrl}'); }`);
    lines.push(``);

    lines.push(`/* === BACKGROUND LAYER === */`);
    lines.push(`/* Apply background to all viewports */`);
    lines.push(
      `#rcp-fe-viewport-root, .rcp-fe-lol-game-in-progress, .rcp-fe-lol-pre-end-of-game, .rcp-fe-lol-reconnect, .rcp-fe-lol-waiting-for-stats, .champion-select, .lol-loading-screen-container.lol-loading-screen-default-state, .reconnect-container {`,
    );
    lines.push(`  background-image: var(--qt-bg) !important;`);
    lines.push(`  background-size: cover !important;`);
    lines.push(`  background-position: center center !important;`);
    lines.push(`  background-repeat: no-repeat !important;`);
    lines.push(`  isolation: isolate;`);
    lines.push(`}`);

    if (parseFloat(dim) > 0) {
      lines.push(``);
      lines.push(`/* === BACKGROUND DIM OVERLAY === */`);
      lines.push(`#rcp-fe-viewport-root::before {`);
      lines.push(`  content: ''; position: absolute; inset: 0;`);
      lines.push(`  background: rgba(0, 0, 0, ${dim});`);
      lines.push(`  pointer-events: none; z-index: 0;`);
      lines.push(`}`);
    }

    lines.push(``);
    lines.push(`/* === SPLASH ART GLASS CARD (Champion Select) === */`);
    lines.push(`/* Show splash images */`);
    lines.push(`img.lol-uikit-background-switcher-image,`);
    lines.push(`img.champion-background-image,`);
    lines.push(`div.skin-selection-thumbnail img,`);
    lines.push(`div.portrait-icon img {`);
    lines.push(`  opacity: 1 !important;`);
    lines.push(`  display: block !important;`);
    lines.push(`  visibility: visible !important;`);
    lines.push(`}`);

    lines.push(``);
    lines.push(`/* Frame the splash art in a minimalist glossy glass card */`);
    lines.push(`.champion-select .champion-splash-background {`);
    lines.push(`  position: absolute !important;`);
    lines.push(`  display: block !important;`);
    lines.push(`  width: 60% !important;`);
    lines.push(`  height: 75% !important;`);
    lines.push(`  top: 10% !important;`);
    lines.push(`  left: 50% !important;`);
    lines.push(`  transform: translateX(-50%) !important;`);
    lines.push(
      `  background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(5,5,10,0.4) 100%) !important;`,
    );
    if (blur !== "none") {
      lines.push(`  backdrop-filter: blur(${blur}) saturate(110%) !important;`);
    }
    lines.push(`  border: 1px solid rgba(255,255,255,0.1) !important;`);
    lines.push(`  border-top: 1px solid rgba(255,255,255,0.2) !important;`);
    lines.push(`  border-radius: 12px !important;`);
    lines.push(
      `  box-shadow: 0 24px 48px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.05) !important;`,
    );
    lines.push(`  z-index: 0 !important;`);
    lines.push(`  overflow: hidden !important;`);
    lines.push(`  -webkit-mask-image: none !important;`);
    lines.push(`}`);

    lines.push(``);
    lines.push(`/* Champion splash positioning inside the card */`);
    lines.push(`.champion-select .background-vignette-container,`);
    lines.push(`.champion-select .champ-select-bg {`);
    lines.push(`  position: absolute !important;`);
    lines.push(`  width: 100% !important;`);
    lines.push(`  height: 100% !important;`);
    lines.push(`  inset: 0 !important;`);
    lines.push(`  background: transparent !important;`);
    lines.push(`}`);

    lines.push(``);
    lines.push(`.champion-select .champ-select-bg img {`);
    lines.push(`  width: 100% !important;`);
    lines.push(`  height: 100% !important;`);
    lines.push(`  object-fit: cover !important;`);
    lines.push(`  object-position: top center !important;`);
    lines.push(
      `  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 90%) !important;`,
    );
    lines.push(`}`);

    if (doTrans) {
      const transScreens = [
        "body",
        "html",
        ".parties-view",
        ".parties-background",
        ".parties-background-mask",
        ".parties-content",
        ".parties-lower-section",
        ".lol-social-sidebar",
        ".rcp-fe-viewport-sidebar",
        ".store-backdrop",
        ".__rcp-fe-lol-store",
        ".loot-backdrop",
        ".loot-backdrop.background-static",
        ".loot-loading-screen",
        ".collections-application",
        ".collections-routes",
        ".yourshop-root",
        ".clash-root-background",
        ".clash-root-background-landing",
        ".personalized-offers-root",
        ".champ-select-bg-darken",
        ".stats-backdrop",
        ".match-details-root",
        ".cdp-backdrop-component",
        ".cdp-backdrop:after",
        ".cdp-backdrop.progression:after",
        ".rcp-fe-lol-event-shop-application",
        ".event-shop-index",
        ".event-shop-page-header",
        ".event-shop-progression",
        ".event-shop-progression-info",
        ".postgame-header-section",
        ".postgame-champion-background-wrapper",
        ".ranked-rewards-component",
        ".style-profile-emblem-wrapper",
        ".mission-tray-header",
        ".chat-box",
        ".clash-social-persistent",
        ".mythic-shop-backdrop",
        ".moon-skin-backdrop",
        ".ranked-intro-background",
        ".rcp-fe-lol-tft-application-background",
      ];
      lines.push(``);
      lines.push(`/* === DEEP TRANSPARENCY SWEEP === */`);
      lines.push(`${transScreens.join(",\n")} {`);
      lines.push(`  background: transparent !important;`);
      lines.push(`  background-image: none !important;`);
      lines.push(`  backdrop-filter: none !important;`);
      lines.push(`  filter: none !important;`);
      lines.push(`}`);
    }

    if (doHide) {
      const hiddenElements = [
        ".bg-current img",
        ".parties-background img",
        ".postgame-background-image img",
        ".style-profile-background-image img",
        ".style-profile-masked-image img",
        ".background-edge-backlight",
        "#background-ambient",
        ".lobby-header-overlay",
        ".navbar-blur",
        ".lobby-intro-animation-container",
        ".loading-content",
        ".bottom-gradient",
        ".smoke-background-container",
        ".activity-center__background-component__blend",
        'img[src*="map-south.png"]',
        'img[src*="map-north.png"]',
        'img[src*="champ-select-planning-intro.jpg"]',
        'img[src*="gameflow-background.jpg"]',
        'img[src*="parties-background.jpg"]',
        'img[src*="ready-check-background.png"]',
      ];
      lines.push(``);
      lines.push(`/* === HIDE OTHER UI GRAPHICS === */`);
      lines.push(`/* NOTE: Splash art is kept visible above */`);
      lines.push(`${hiddenElements.join(",\n")} {`);
      lines.push(`  display: none !important;`);
      lines.push(`  opacity: 0 !important;`);
      lines.push(`  visibility: hidden !important;`);
      lines.push(`  pointer-events: none !important;`);
      lines.push(`}`);
    }

    if (blur !== "none") {
      const glassPanels = [
        ".parties-game-info-panel-content",
        ".v2-parties-invite-info-panel",
        ".parties-invite-info-panel",
        ".ready-check-root-element",
        ".lol-social-sidebar",
        "#activity-center .activity-center__tabs_scrollable",
        ".selection-button-image",
      ];
      lines.push(``);
      lines.push(`/* === SUPPLEMENTAL: FROSTED GLASS PANELS === */`);
      lines.push(`${glassPanels.join(",\n")} {`);
      lines.push(`  backdrop-filter: blur(${blur}) !important;`);
      lines.push(`  background: rgba(0, 0, 0, 0.25) !important;`);
      lines.push(`  border-radius: 6px !important;`);
      lines.push(`}`);
    }

    sendToRaw(lines.join("\n"));
    flashMessage(
      row.querySelector("#qt-flash"),
      "✨ Premium Theme Applied! ✓",
      3000,
    );
  });

  return row;
}

function buildOmniRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.borderBottom = "2px solid #785a28";
  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:12px;">✨ Omni Inspector</div>
    <div class="ci-generic-desc">Type any selector OR use the picker (🎯). Then click Inspect to see and edit its live CSS properties.</div>
    
    <div style="display:flex;gap:4px;margin-bottom:8px;">
      <input class="ci-input" id="omni-sel-input" type="text" placeholder=".class-name or #id" style="flex:1;font-family:'Fira Code',monospace;">
      <button class="ci-btn-prop" id="omni-picker-btn" title="Pick element on screen">🎯</button>
      <button class="ci-btn-primary" id="omni-inspect-btn" style="padding:0 14px;">Inspect</button>
    </div>
    
    <div id="omni-status" style="font-size:10px;margin-bottom:8px;display:none;padding:3px 0;"></div>
    
    <div id="omni-panel" style="display:none;background:rgba(0,0,0,0.25);border:1px solid #1a2535;">
      <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid #1a2535;background:rgba(0,0,0,0.2);">
        <code id="omni-sel-badge" style="font-size:10px;color:#c8aa6e;flex:1;font-family:'Fira Code',monospace;"></code>
        <span id="omni-catalog-match" style="font-size:9px;color:#4caf82;flex-shrink:0;display:none;"></span>
        <span id="omni-prop-count" style="font-size:9px;color:#4a6070;flex-shrink:0;"></span>
      </div>
      <div id="omni-controls-wrap" class="ci-element-controls" style="padding:10px 12px;"></div>
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid #1a2535;">
        <button id="omni-add-all-btn" class="ci-btn-primary" style="font-size:10px;padding:5px 12px;">→ Add All to CSS</button>
        <span class="ci-flash" id="omni-add-all-flash">Added ✓</span>
      </div>
    </div>
  `;

  const selInput = row.querySelector("#omni-sel-input");
  const pickerBtn = row.querySelector("#omni-picker-btn");
  const inspectBtn = row.querySelector("#omni-inspect-btn");
  const status = row.querySelector("#omni-status");
  const panel = row.querySelector("#omni-panel");
  const selBadge = row.querySelector("#omni-sel-badge");
  const catalogMatchEl = row.querySelector("#omni-catalog-match");
  const propCount = row.querySelector("#omni-prop-count");
  const controlsWrap = row.querySelector("#omni-controls-wrap");
  const addAllBtn = row.querySelector("#omni-add-all-btn");
  const addAllFlash = row.querySelector("#omni-add-all-flash");

  let _inspInputs = [];

  const runInspect = () => {
    const sel = selInput.value.trim();
    if (!sel) return;
    const el = document.querySelector(sel);
    status.style.display = "block";
    if (!el) {
      status.style.color = "#c84b4b";
      status.textContent = `No element found for "${sel}"`;
      panel.style.display = "none";
      return;
    }
    status.style.color = "#4caf82";
    status.textContent = `Found <${el.tagName.toLowerCase()}>`;
    selBadge.textContent = sel;
    const match = findCatalogMatch(sel);
    if (match) {
      catalogMatchEl.innerHTML = `Matches <b>${match.label}</b>`;
      catalogMatchEl.style.display = "inline";
    } else {
      catalogMatchEl.style.display = "none";
    }
    const props = getSmartProperties(el);
    propCount.textContent = `${props.length} props`;
    _inputs = _inputs.filter((r) => !r.isOmni);
    _inspInputs = [];
    controlsWrap.innerHTML = "";
    const notBadge = document.createElement("span");
    notBadge.style.display = "none";
    props.forEach((prop) => {
      const ctrl = buildPropControl(sel, prop, notBadge);
      if (_inputs.length > 0) {
        _inputs[_inputs.length - 1].isOmni = true;
        _inspInputs.push(_inputs[_inputs.length - 1]);
      }
      controlsWrap.appendChild(ctrl);
    });
    _inspInputs.forEach((reg) => {
      try {
        populateInput(reg);
      } catch {}
    });
    panel.style.display = "block";
  };

  pickerBtn.addEventListener("click", () =>
    startElementPicker((sel) => {
      selInput.value = sel;
      runInspect();
    }),
  );
  inspectBtn.addEventListener("click", runInspect);
  selInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runInspect();
  });

  addAllBtn.addEventListener("click", () => {
    const sel = selInput.value.trim();
    if (!sel || !_inspInputs.length) return;

    // Use batch update to keep CSS clean
    const batch = {};
    _inspInputs.forEach((reg) => {
      const val = reg.inputEl?.value?.trim();
      if (!val || val === "" || val === "auto" || val === "normal") return;
      const finalProp = reg.prop === "scale" ? "transform" : reg.prop;
      batch[finalProp] = val;
    });

    if (Object.keys(batch).length === 0) return;

    setCssBatch(sel, batch); // SMART UPDATE HERE

    flashMessage(addAllFlash);
    sendToRaw();
  });

  return row;
}

// HOVER-TO-REVEAL
function buildHoverRevealRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";

  row.innerHTML = `
    <div class="ci-generic-title">👻 Hover-to-Reveal</div>
    <div class="ci-generic-desc">The most popular theme trick — elements stay hidden until you hover over them. Check what you want to hide, then add to CSS.</div>
    <div id="htr-list" style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin:8px 0;font-size:10px;"></div>
    <div class="ci-inline-row" style="margin-top:6px;">
      <div class="ci-field"><div class="ci-label">Transition Speed</div>
        <select class="ci-select" id="htr-speed">
          <option value="0.2s">Fast (0.2s)</option>
          <option value="0.4s">Medium (0.4s)</option>
          <option value="0.8s">Slow (0.8s)</option>
        </select>
      </div>
    </div>
    <button class="ci-btn-add" data-action="htr" style="margin-top:8px;">→ Add Selected to CSS</button>
    <span class="ci-flash" id="ci-flash-htr">Added ✓</span>
  `;

  const items = [
    {
      id: "htr-invite",
      sel: ".invite-info-panel-container",
      label: "Party invite panel",
    },
    {
      id: "htr-notif",
      sel: ".notifications-button",
      label: "Notifications button",
    },
    {
      id: "htr-xp",
      sel: ".xp-ring",
      label: "XP ring (on avatar hover)",
      hover: ".identity-icon:hover > .summoner-level-icon > .xp-ring",
    },
    { id: "htr-status", sel: ".lower-details", label: "Status / availability" },
    {
      id: "htr-alpha",
      sel: ".alpha-version-panel",
      label: "Version / misc panel",
    },
    {
      id: "htr-social",
      sel: ".lol-social-actions-bar > .actions-bar > buttons:not(:first-child)",
      label: "Social action buttons",
    },
    {
      id: "htr-xpradial",
      sel: ".summoner-xp-radial-container",
      label: "XP radial container",
    },
    {
      id: "htr-skinpicker",
      sel: ".style-profile-skin-picker-button",
      label: "Skin picker button",
    },
    { id: "htr-lor", sel: ".launch-lor-button-container", label: "LoR button" },
    { id: "htr-promo", sel: ".deep-links-promo", label: "Deep links promo" },
    { id: "htr-playbtn", sel: ".play-button-container", label: "Play button" },
    {
      id: "htr-rune",
      sel: ".rune-recommender-button-component",
      label: "Auto-rune button",
    },
    {
      id: "htr-activity",
      sel: "#activity-center .activity-center__tabs_scrollable",
      label: "Activity center tabs",
    },
    {
      id: "htr-navcurrency",
      sel: ".currency-container-stacked",
      label: "Currency display",
    },
    {
      id: "htr-navitems",
      sel: ".main-navigation-menu-item",
      label: "Nav menu items",
    },
  ];

  const list = row.querySelector("#htr-list");
  items.forEach((item) => {
    const label = document.createElement("label");
    label.style.cssText =
      "display:flex;align-items:center;gap:6px;cursor:pointer;color:#8a9aaa;padding:2px 0;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = item.id;
    cb.style.cssText = "accent-color:#785a28;cursor:pointer;flex-shrink:0;";
    const span = document.createElement("span");
    span.textContent = item.label;
    span.style.cssText = "font-size:10px;";
    label.appendChild(cb);
    label.appendChild(span);
    list.appendChild(label);
  });

  row.querySelector('[data-action="htr"]').addEventListener("click", () => {
    const speed = row.querySelector("#htr-speed").value;
    const lines = [];

    items.forEach((item) => {
      const cb = row.querySelector("#" + item.id);
      if (!cb?.checked) return;
      const hideSel = item.sel;
      // If element has a special hover selector (like xp-ring), use that; else self:hover
      const hoverSel = item.hover || hideSel + ":hover";
      lines.push(
        `${hideSel} {\n  opacity: 0 !important;\n  transition: ${speed} !important;\n}`,
      );
      lines.push(
        `${hoverSel} {\n  opacity: 1 !important;\n  transition: ${speed} !important;\n}`,
      );
    });

    if (!lines.length) return;
    flashMessage(row.querySelector("#ci-flash-htr"));
    sendToRaw(lines.join("\n"));
  });

  return row;
}

// MINIMAL
function buildMinimalModeRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";

  // Categories for the sweep
  const categories = [
    {
      id: "min-backgrounds",
      label: "Transparent backgrounds",
      desc: "Party view, sidebar, store, loot, clash, event shop, etc.",
      selectors: [
        ".parties-view",
        ".parties-background",
        ".parties-background-mask",
        ".lol-social-sidebar",
        ".rcp-fe-viewport-sidebar",
        ".store-backdrop",
        ".loot-backdrop.background-static",
        ".clash-root-background",
        ".clash-root-background-landing",
        ".yourshop-root",
        ".collections-application",
        ".postgame-background-image",
        ".postgame-champion-background-wrapper",
        ".champ-select-bg-darken",
        ".stats-backdrop",
        ".match-details-root",
        ".cdp-backdrop-component",
        "body",
        "html",
      ],
      props: {
        "background-color": "transparent",
        background: "transparent",
        "backdrop-filter": "none",
      },
    },
    {
      id: "min-nav",
      label: "Clean navigation",
      desc: "Remove nav borders, blur, dividers, decorations.",
      selectors: [
        ".navbar-blur",
        ".play-button-frame",
        ".navigation-root-component",
        ".lobby-header-overlay",
      ],
      props: {
        background: "transparent",
        border: "none",
        "backdrop-filter": "none",
      },
      displayNone: [
        ".right-nav-vertical-rule",
        ".lobby-header-overlay",
        "#background-ambient",
        ".app-controls-support",
      ],
    },
    {
      id: "min-party",
      label: "Clean party / lobby",
      desc: "Hide empty party banners, search dividers, warnings.",
      displayNone: [
        ".v2-banner-placeholder",
        ".parties-game-search-divider",
        ".parties-footer-warning",
        ".lol-parties-status-card",
        ".point-eligibility-icon",
        ".lol-uikit-flyout-frame",
        ".lol-uikit-contextual-notification-targeted-layer",
      ],
    },
    {
      id: "min-spinners",
      label: "Hide loading spinners",
      desc: "All the loading spinners and store loaders.",
      displayNone: [
        ".rcp-fe-lol-home-loading-spinner",
        ".style-profile-loading-spinner",
        ".spinner",
        ".store-loading",
        ".lol-loading-screen-spinner",
      ],
    },
    {
      id: "min-misc",
      label: "Misc noise",
      desc: "LoR button, status ticker, scrollbar thumb, tooltip layer.",
      displayNone: [
        ".navigation-status-ticker",
        ".deep-links-promo",
        ".arrow-container",
      ],
      extra: `::-webkit-scrollbar-thumb { background-color: transparent !important; }\n.lol-uikit-layer-manager-wrapper > .tooltip { display: none !important; }`,
    },
    {
      id: "min-activity",
      label: "Activity center transparent",
      desc: "Clear backgrounds on all activity-center sub-elements using attribute wildcard.",
      extra: `[class*="activity-center"] {\n  background-color: transparent !important;\n}`,
    },
    {
      id: "min-filterreset",
      label: "Reset inherited filters",
      desc: "Explicitly clear filter/backdrop-filter on elements that inherit unwanted values.",
      selectors: [
        ".collections-application",
        ".yourshop-root",
        ".__rcp-fe-lol-store",
        ".loot-backdrop",
        ".rcp-fe-viewport-sidebar",
        ".lol-social-sidebar",
        ".cdp-backdrop-component",
        ".cdp-backdrop:after",
      ],
      props: { filter: "none", "backdrop-filter": "none" },
    },
  ];

  row.innerHTML = `
    <div class="ci-generic-title">🧹 Minimal / Clean Mode</div>
    <div class="ci-generic-desc">One-click transparency sweep. Select categories to include — generates the same CSS block used by every popular acrylic theme.</div>
    <div id="min-cats" style="display:flex;flex-direction:column;gap:4px;margin:8px 0;"></div>
    <button class="ci-btn-add" data-action="min" style="margin-top:6px;">→ Generate Clean CSS</button>
    <span class="ci-flash" id="ci-flash-min">Added ✓</span>
  `;

  const catWrap = row.querySelector("#min-cats");
  categories.forEach((cat) => {
    const label = document.createElement("label");
    label.style.cssText =
      "display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:4px 0;border-bottom:1px solid #0d1824;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = cat.id;
    cb.checked = true;
    cb.style.cssText =
      "accent-color:#785a28;cursor:pointer;margin-top:2px;flex-shrink:0;";
    const textWrap = document.createElement("div");
    const title = document.createElement("div");
    title.style.cssText = "font-size:10px;color:#a0b4c8;font-weight:600;";
    title.textContent = cat.label;
    const descEl = document.createElement("div");
    descEl.style.cssText = "font-size:9px;color:#3a5060;margin-top:1px;";
    descEl.textContent = cat.desc;
    textWrap.appendChild(title);
    textWrap.appendChild(descEl);
    label.appendChild(cb);
    label.appendChild(textWrap);
    catWrap.appendChild(label);
  });

  row.querySelector('[data-action="min"]').addEventListener("click", () => {
    const lines = [];

    categories.forEach((cat) => {
      const cb = row.querySelector("#" + cat.id);
      if (!cb?.checked) return;

      if (cat.selectors && cat.props) {
        const propLines = Object.entries(cat.props)
          .map(([p, v]) => `  ${p}: ${v} !important;`)
          .join("\n");
        lines.push(`${cat.selectors.join(",\n")} {\n${propLines}\n}`);
      }
      if (cat.displayNone) {
        lines.push(
          `${cat.displayNone.join(",\n")} {\n  display: none !important;\n}`,
        );
      }
      if (cat.extra) {
        lines.push(cat.extra);
      }
    });

    if (!lines.length) return;
    flashMessage(row.querySelector("#ci-flash-min"));
    sendToRaw(lines.join("\n"));
  });

  return row;
}

// CSS VARIABLE PALETTE
// :root color variables
function buildCssVarsRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";

  const vars = [
    {
      id: "var-dark",
      name: "--dark-brown",
      label: "Dark accent",
      default: "#352a17",
    },
    {
      id: "var-light",
      name: "--light-brown",
      label: "Light accent",
      default: "#785a28",
    },
    {
      id: "var-pale",
      name: "--pale-brown",
      label: "Pale accent",
      default: "#c8aa6e",
    },
    { id: "var-text", name: "--text", label: "Text color", default: "#e8dfcc" },
    {
      id: "var-bg",
      name: "--background",
      label: "BG color",
      default: "#0a1428",
    },
  ];

  row.innerHTML = `
    <div class="ci-generic-title">🎨 CSS Variable Palette</div>
    <div class="ci-generic-desc">Set :root color variables used by League's own styles and community themes. Change these to recolor large parts of the UI at once.</div>
    <div id="cssvar-list" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin:8px 0;"></div>
    <div class="ci-inline-row" style="margin-top:4px;">
      <div class="ci-field" style="grid-column:span 2"><div class="ci-label">Add custom variable</div>
        <div style="display:flex;gap:4px;">
          <input class="ci-input" id="var-custom-name" type="text" placeholder="--my-variable" style="width:120px;">
          <input class="ci-input" id="var-custom-val" type="text" placeholder="value" style="width:80px;">
        </div>
      </div>
    </div>
    <button class="ci-btn-add" data-action="cssvar" style="margin-top:8px;">→ Add to CSS</button>
    <span class="ci-flash" id="ci-flash-cssvar">Added ✓</span>
  `;

  const list = row.querySelector("#cssvar-list");
  vars.forEach((v) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:2px;";
    const lbl = document.createElement("div");
    lbl.style.cssText =
      'font-size:9px;color:#4a6070;font-family:"Fira Code",monospace;';
    lbl.textContent = v.name;
    const pair = document.createElement("div");
    pair.className = "ci-color-pair";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.className = "ci-color-input";
    picker.value = v.default;
    picker.id = v.id + "-picker";
    const textIn = document.createElement("input");
    textIn.type = "text";
    textIn.className = "ci-input";
    textIn.value = v.default;
    textIn.style.width = "70px";
    textIn.id = v.id + "-text";
    picker.addEventListener("input", () => (textIn.value = picker.value));
    textIn.addEventListener("input", () => {
      if (/^#[0-9a-f]{6}$/i.test(textIn.value)) picker.value = textIn.value;
    });
    pair.appendChild(picker);
    pair.appendChild(textIn);
    wrap.appendChild(lbl);
    wrap.appendChild(pair);
    list.appendChild(wrap);
  });

  row.querySelector('[data-action="cssvar"]').addEventListener("click", () => {
    const lines = [];
    vars.forEach((v) => {
      const val = row.querySelector("#" + v.id + "-text").value.trim();
      if (val) lines.push(`  ${v.name}: ${val};`);
    });
    const customName = row.querySelector("#var-custom-name").value.trim();
    const customVal = row.querySelector("#var-custom-val").value.trim();
    if (customName && customVal) lines.push(`  ${customName}: ${customVal};`);

    if (!lines.length) return;
    flashMessage(row.querySelector("#ci-flash-cssvar"));
    sendToRaw(`:root {\n${lines.join("\n")}\n}`);
  });

  return row;
}

// CLIENT FRAME GLOW
// Border + drop-shadow on the entire client window
function buildClientFrameRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.innerHTML = `
    <div class="ci-generic-title">🖼 Client Frame & Glow</div>
    <div class="ci-generic-desc">Add a colored border and glow around the entire client window. Targets <code style="color:#c8aa6e;font-size:9px;">#rcp-fe-viewport-root</code>.</div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Border color</div>
        <div class="ci-color-pair">
          <input class="ci-color-input" id="frame-picker" type="color" value="#9100ff">
          <input class="ci-input" id="frame-text" type="text" value="#9100ff" style="width:70px;">
        </div>
      </div>
      <div class="ci-field"><div class="ci-label">Border width</div>
        <select class="ci-select" id="frame-width">
          <option value="1px">Thin (1px)</option>
          <option value="2px" selected>Normal (2px)</option>
          <option value="3px">Thick (3px)</option>
          <option value="0">None</option>
        </select>
      </div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Glow intensity</div>
        <select class="ci-select" id="frame-glow">
          <option value="none">No glow</option>
          <option value="4px">Subtle (4px)</option>
          <option value="8px" selected>Normal (8px)</option>
          <option value="15px">Strong (15px)</option>
          <option value="25px">Intense (25px)</option>
        </select>
      </div>
      <div class="ci-field"><div class="ci-label">Background</div>
        <select class="ci-select" id="frame-bg">
          <option value="none">Keep default</option>
          <option value="#000000">Pure black</option>
          <option value="#0a0a14">Near black</option>
          <option value="#0a1428">League dark</option>
          <option value="transparent">Transparent</option>
        </select>
      </div>
    </div>
    <button class="ci-btn-add" data-action="frame" style="margin-top:8px;">→ Add to CSS</button>
    <span class="ci-flash" id="ci-flash-frame">Added ✓</span>
  `;

  const picker = row.querySelector("#frame-picker");
  const text = row.querySelector("#frame-text");
  picker.addEventListener("input", () => (text.value = picker.value));
  text.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(text.value)) picker.value = text.value;
  });

  row.querySelector('[data-action="frame"]').addEventListener("click", () => {
    const color = text.value.trim() || picker.value;
    const width = row.querySelector("#frame-width").value;
    const glowSize = row.querySelector("#frame-glow").value;
    const bg = row.querySelector("#frame-bg").value;

    const props = {};
    if (width !== "0") {
      props["border"] = `${width} solid ${color}`;
    }
    if (glowSize !== "none") {
      props["filter"] = `drop-shadow(1px 1px ${glowSize} ${color})`;
    }
    if (bg !== "none") {
      props["background"] = bg;
    }

    if (Object.keys(props).length) {
      setCssBatch("#rcp-fe-viewport-root", props);
      flashMessage(row.querySelector("#ci-flash-frame"));
      sendToRaw();
    }
  });
  return row;
}

// GLOBAL HUE-ROTATE
function buildHueRotateRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";

  // Curated target groups from theme analysis
  const targetGroups = [
    {
      id: "hue-nav",
      label: "Navigation & lobby buttons",
      selectors: [
        ".main-navigation-menu-item",
        ".navigation-bar",
        ".navigation-bar.left",
        ".alpha-version-panel",
        ".summoner-level-ring",
        ".summoner-level",
        ".dropdown-container",
      ],
    },
    {
      id: "hue-ui",
      label: "UI kit elements (dialogs, buttons)",
      selectors: [
        ".lol-uikit-dialog-frame",
        ".lol-uikit-flyout-frame-wrapper",
        "lol-uikit-close-button",
        "lol-uikit-flat-button-secondary",
        ".lol-uikit-flat-button-inner",
        ".lol-uikit-flat-button-normal",
        ".dialog-frame",
      ],
    },
    {
      id: "hue-currency",
      label: "Currency & wallet icons",
      selectors: [".currency-be-icon-container", ".currency-rp"],
    },
    {
      id: "hue-lobby",
      label: "Party & lobby elements",
      selectors: [
        ".game-type-card .parties-game-type-upper-half",
        ".parties-game-type-card-categories",
        ".parties-player-positions",
        ".parties-position-selector-hextech-dashed-ring",
        ".confirm-button-container button.confirm",
      ],
    },
    {
      id: "hue-loot",
      label: "Loot & loading",
      selectors: [
        ".loot-backdrop",
        ".loading-spinner",
        ".hextech-loading-animation",
        ".icon-ring",
        ".border",
      ],
    },
    {
      id: "hue-chat",
      label: "Chat & social elements",
      selectors: [
        ".action-bar-button",
        "lol-social-panel",
        ".conversation-close-button",
        "lol-social-chat-input .chat-input",
      ],
    },
    {
      id: "hue-readycheck",
      label: "Ready check / match accept",
      selectors: [".ready-check-state-machine-timer"],
    },
    {
      id: "hue-collections",
      label: "Collections & store",
      selectors: [
        ".collection-details",
        ".collection-ownership-filter",
        ".collection-grouping-options",
        ".rcp-fe-lol-collections-collection-details",
        ".nav-tab",
        ".loot-display-category-tab .loot-category-tab.selected::after",
      ],
    },
  ];

  row.innerHTML = `
    <div class="ci-generic-title">🌈 Global Hue-Rotate</div>
    <div class="ci-generic-desc">Shift the color of large groups of UI elements at once using CSS <code style="color:#c8aa6e;font-size:9px;">filter: hue-rotate()</code>. The fastest way to recolor the entire client's theme.</div>
    <div class="ci-inline-row" style="margin-bottom:8px;">
      <div class="ci-field" style="grid-column:span 2;">
        <div class="ci-label">Hue rotation angle</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="range" id="hue-slider" class="ci-slider" min="-180" max="180" step="1" value="0" style="flex:1;">
          <input class="ci-input" id="hue-text" type="text" value="0deg" style="width:55px;">
          <div id="hue-preview" style="width:22px;height:22px;border-radius:50%;border:1px solid #2a3a4a;background:#c8aa6e;flex-shrink:0;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:#2a3a4a;margin-top:2px;">
          <span>-180°</span><span>0° (gold/default)</span><span>+180°</span>
        </div>
      </div>
    </div>
    <div id="hue-targets" style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;margin-bottom:8px;font-size:10px;"></div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Also apply to custom selector</div>
        <div style="display:flex;gap:4px;">
          <input class="ci-input" id="hue-custom-sel" type="text" placeholder=".my-element">
          <button class="ci-btn-prop ci-picker-btn" title="Pick element">🎯</button>
        </div>
      </div>
    </div>
    <button class="ci-btn-add" data-action="hue" style="margin-top:8px;">→ Add to CSS</button>
    <span class="ci-flash" id="ci-flash-hue">Added ✓</span>
  `;

  const slider = row.querySelector("#hue-slider");
  const text = row.querySelector("#hue-text");
  const preview = row.querySelector("#hue-preview");

  const updateHue = () => {
    const deg = parseInt(slider.value) || 0;
    text.value = deg + "deg";
    // Rotate the gold color to preview
    preview.style.filter = `hue-rotate(${deg}deg)`;
  };
  slider.addEventListener("input", () => {
    updateHue();
  });
  text.addEventListener("input", () => {
    const m = text.value.match(/-?\d+/);
    if (m) {
      slider.value = m[0];
      updateHue();
    }
  });

  // Build target checkboxes
  const targetsWrap = row.querySelector("#hue-targets");
  targetGroups.forEach((g) => {
    const label = document.createElement("label");
    label.style.cssText =
      "display:flex;align-items:center;gap:5px;cursor:pointer;color:#8a9aaa;padding:2px 0;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = g.id;
    cb.checked = false;
    cb.style.cssText = "accent-color:#785a28;cursor:pointer;flex-shrink:0;";
    const span = document.createElement("span");
    span.style.cssText = "font-size:10px;";
    span.textContent = g.label;
    label.appendChild(cb);
    label.appendChild(span);
    targetsWrap.appendChild(label);
  });

  row.querySelector(".ci-picker-btn").addEventListener("click", () => {
    startElementPicker(
      (sel) => (row.querySelector("#hue-custom-sel").value = sel),
    );
  });

  row.querySelector('[data-action="hue"]').addEventListener("click", () => {
    const deg = text.value.trim() || "0deg";
    const lines = [];

    targetGroups.forEach((g) => {
      const cb = row.querySelector("#" + g.id);
      if (!cb?.checked) return;
      lines.push(`${g.selectors.join(",")} {
  filter: hue-rotate(${deg}) !important;
}`);
    });

    const customSel = row.querySelector("#hue-custom-sel").value.trim();
    if (customSel) {
      lines.push(`${customSel} {
  filter: hue-rotate(${deg}) !important;
}`);
    }

    if (!lines.length) return;
    flashMessage(row.querySelector("#ci-flash-hue"));
    sendToRaw(lines.join("\n"));
  });

  return row;
}

// GRADIENT BACKGROUND
function buildGradientBgRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.innerHTML = `
    <div class="ci-generic-title">🎨 Gradient Background</div>
    <div class="ci-generic-desc">Apply a linear gradient to any element. Used by themes on the play button, sidebar, nav items, and screen overlays.</div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Selector</div>
        <div style="display:flex;gap:4px;">
          <input class="ci-input" id="grad-sel" type="text" placeholder=".play-button-container">
          <button class="ci-btn-prop ci-picker-btn" title="Pick element">🎯</button>
        </div>
      </div>
      <div class="ci-field"><div class="ci-label">Direction</div>
        <select class="ci-select" id="grad-dir">
          <option value="to bottom">↓ top → bottom</option>
          <option value="to right">→ left → right</option>
          <option value="to top">↑ bottom → top</option>
          <option value="to left">← right → left</option>
          <option value="135deg">↘ diagonal</option>
        </select>
      </div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Color 1 (start)</div>
        <div class="ci-color-pair">
          <input class="ci-color-input" id="grad-c1-picker" type="color" value="#382b7a">
          <input class="ci-input" id="grad-c1-text" type="text" value="#382b7a" style="width:70px;">
        </div>
      </div>
      <div class="ci-field"><div class="ci-label">Color 2 (end)</div>
        <div class="ci-color-pair">
          <input class="ci-color-input" id="grad-c2-picker" type="color" value="#241666">
          <input class="ci-input" id="grad-c2-text" type="text" value="#241666" style="width:70px;">
        </div>
      </div>
    </div>
    <div style="height:20px;border-radius:2px;margin:6px 0;" id="grad-preview"></div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Property</div>
        <select class="ci-select" id="grad-prop">
          <option value="background">background</option>
          <option value="background-image">background-image</option>
        </select>
      </div>
      <div class="ci-field"><div class="ci-label">Border radius</div>
        <select class="ci-select" id="grad-radius">
          <option value="">None</option>
          <option value="4px">Slight (4px)</option>
          <option value="8px">Rounded (8px)</option>
          <option value="50px">Pill (50px)</option>
        </select>
      </div>
    </div>
    <button class="ci-btn-add" data-action="grad" style="margin-top:8px;">→ Add to CSS</button>
    <span class="ci-flash" id="ci-flash-grad">Added ✓</span>
  `;

  const syncColor = (picker, textEl) => {
    picker.addEventListener("input", () => {
      textEl.value = picker.value;
      updatePreview();
    });
    textEl.addEventListener("input", () => {
      if (/^#[0-9a-f]{6}$/i.test(textEl.value)) {
        picker.value = textEl.value;
        updatePreview();
      }
    });
  };
  syncColor(
    row.querySelector("#grad-c1-picker"),
    row.querySelector("#grad-c1-text"),
  );
  syncColor(
    row.querySelector("#grad-c2-picker"),
    row.querySelector("#grad-c2-text"),
  );
  row.querySelector("#grad-dir").addEventListener("change", updatePreview);

  function updatePreview() {
    const dir = row.querySelector("#grad-dir").value;
    const c1 = row.querySelector("#grad-c1-text").value || "#382b7a";
    const c2 = row.querySelector("#grad-c2-text").value || "#241666";
    row.querySelector("#grad-preview").style.background =
      `linear-gradient(${dir}, ${c1}, ${c2})`;
  }
  updatePreview();

  row.querySelector(".ci-picker-btn").addEventListener("click", () => {
    startElementPicker((sel) => (row.querySelector("#grad-sel").value = sel));
  });

  row.querySelector('[data-action="grad"]').addEventListener("click", () => {
    const sel = row.querySelector("#grad-sel").value.trim();
    const dir = row.querySelector("#grad-dir").value;
    const c1 =
      row.querySelector("#grad-c1-text").value ||
      row.querySelector("#grad-c1-picker").value;
    const c2 =
      row.querySelector("#grad-c2-text").value ||
      row.querySelector("#grad-c2-picker").value;
    const prop = row.querySelector("#grad-prop").value;
    const radius = row.querySelector("#grad-radius").value;
    if (!sel) return;

    const batch = { [prop]: `linear-gradient(${dir}, ${c1}, ${c2})` };
    if (radius) batch["border-radius"] = radius;
    setCssBatch(sel, batch);

    flashMessage(row.querySelector("#ci-flash-grad"));
    sendToRaw();
  });
  return row;
}

// SCREEN TINT (::before)
// mix-blend-mode: hue overlay via ::before
function buildScreenTintRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";

  const screens = [
    {
      id: "tint-collections",
      sel: ".collections-application",
      label: "Collections",
    },
    { id: "tint-yourshop", sel: ".yourshop-root", label: "Your Shop" },
    { id: "tint-store", sel: ".store-backdrop", label: "Store" },
    { id: "tint-loot", sel: ".loot-backdrop", label: "Loot" },
    { id: "tint-home", sel: ".parties-view", label: "Home" },
    { id: "tint-champ", sel: ".champion-select", label: "Champ Select" },
    {
      id: "tint-postgame",
      sel: ".postgame-root-component",
      label: "Post-Game",
    },
    { id: "tint-custom", sel: "", label: "Custom…" },
  ];

  row.innerHTML = `
    <div class="ci-generic-title">🌫 Screen Tint (::before overlay)</div>
    <div class="ci-generic-desc">Tint entire screens using a <code style="color:#c8aa6e;font-size:9px;">::before</code> pseudo-element with <code style="color:#c8aa6e;font-size:9px;">mix-blend-mode: hue</code>. Recolors a screen without touching its contents.</div>
    <div id="tint-screens" style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;margin:8px 0;font-size:10px;"></div>
    <div id="tint-custom-wrap" style="display:none;margin-bottom:6px;">
      <div class="ci-label">Custom selector</div>
      <div style="display:flex;gap:4px;">
        <input class="ci-input" id="tint-custom-sel" type="text" placeholder=".my-screen-container">
        <button class="ci-btn-prop ci-picker-btn" title="Pick element">🎯</button>
      </div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Tint color</div>
        <div class="ci-color-pair">
          <input class="ci-color-input" id="tint-picker" type="color" value="#6519e0">
          <input class="ci-input" id="tint-text" type="text" value="#6519e0" style="width:70px;">
        </div>
      </div>
      <div class="ci-field"><div class="ci-label">Strength</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="range" id="tint-opacity-slider" class="ci-slider" min="0" max="1" step="0.05" value="0.6" style="width:60px;">
          <input class="ci-input" id="tint-opacity-text" type="text" value="0.6" style="width:45px;">
        </div>
      </div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Blend mode</div>
        <select class="ci-select" id="tint-blend">
          <option value="hue">hue (color shift only)</option>
          <option value="color">color (full tint)</option>
          <option value="multiply">multiply (darken)</option>
          <option value="screen">screen (lighten)</option>
          <option value="overlay">overlay (contrast)</option>
        </select>
      </div>
      <div class="ci-field"><div class="ci-label">z-index</div>
        <select class="ci-select" id="tint-z">
          <option value="1">1 (above bg, below content)</option>
          <option value="-1">-1 (behind everything)</option>
          <option value="10">10 (above most)</option>
        </select>
      </div>
    </div>
    <button class="ci-btn-add" data-action="tint" style="margin-top:8px;">→ Add to CSS</button>
    <span class="ci-flash" id="ci-flash-tint">Added ✓</span>
  `;

  // Build screen checkboxes
  const screensWrap = row.querySelector("#tint-screens");
  screens.forEach((s) => {
    const lbl = document.createElement("label");
    lbl.style.cssText =
      "display:flex;align-items:center;gap:5px;cursor:pointer;color:#8a9aaa;padding:2px 0;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = s.id;
    cb.style.cssText = "accent-color:#785a28;cursor:pointer;flex-shrink:0;";
    const span = document.createElement("span");
    span.style.cssText = "font-size:10px;";
    span.textContent = s.label;
    lbl.appendChild(cb);
    lbl.appendChild(span);
    screensWrap.appendChild(lbl);
    if (s.id === "tint-custom") {
      cb.addEventListener("change", () => {
        row.querySelector("#tint-custom-wrap").style.display = cb.checked
          ? "block"
          : "none";
      });
    }
  });

  // Color sync
  const picker = row.querySelector("#tint-picker");
  const text = row.querySelector("#tint-text");
  picker.addEventListener("input", () => (text.value = picker.value));
  text.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(text.value)) picker.value = text.value;
  });

  // Opacity sync
  const opSlider = row.querySelector("#tint-opacity-slider");
  const opText = row.querySelector("#tint-opacity-text");
  opSlider.addEventListener("input", () => (opText.value = opSlider.value));
  opText.addEventListener("input", () => {
    const v = parseFloat(opText.value);
    if (!isNaN(v)) opSlider.value = v;
  });

  row.querySelector(".ci-picker-btn").addEventListener("click", () => {
    startElementPicker(
      (sel) => (row.querySelector("#tint-custom-sel").value = sel),
    );
  });

  row.querySelector('[data-action="tint"]').addEventListener("click", () => {
    const color = text.value.trim() || picker.value;
    const opacity = opText.value.trim() || opSlider.value;
    const blend = row.querySelector("#tint-blend").value;
    const z = row.querySelector("#tint-z").value;

    const sels = [];
    screens.forEach((s) => {
      if (s.id === "tint-custom") return;
      const cb = row.querySelector("#" + s.id);
      if (cb?.checked) sels.push(s.sel);
    });
    const customCb = row.querySelector("#tint-custom");
    if (customCb?.checked) {
      const customSel = row.querySelector("#tint-custom-sel").value.trim();
      if (customSel) sels.push(customSel);
    }
    if (!sels.length) return;

    // Generate ::before block for each selector
    const lines = sels.map(
      (sel) =>
        `${sel} {
  position: relative;
  isolation: isolate;
}

${sel}::before {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background-color: ${color};
  opacity: ${opacity};
  mix-blend-mode: ${blend};
  z-index: ${z};
  pointer-events: none;
}`,
    );

    // If content inside needs to be above the ::before, generate z-index rules
    flashMessage(row.querySelector("#ci-flash-tint"));
    sendToRaw(lines.join("\n\n"));
  });

  return row;
}

// ROOT VIEWPORT OVERLAY (::before on #rcp-fe-viewport-root)
// Adds a semi-transparent colour wash to darken/tint the client when using a custom background image.
function buildRootOverlayRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.innerHTML = `
    <div class="ci-generic-title">🌑 Root Viewport Overlay</div>
    <div class="ci-generic-desc">Adds a <code style="color:#c8aa6e;font-size:9px;">::before</code> dark tint behind the entire client. Used in every background-image theme to darken the wallpaper without affecting UI elements. Targets <code style="color:#c8aa6e;font-size:9px;">#rcp-fe-viewport-root</code>.</div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Overlay color</div>
        <div class="ci-color-pair">
          <input class="ci-color-input" id="rovl-picker" type="color" value="#000000">
          <input class="ci-input" id="rovl-text" type="text" value="#000000" style="width:70px;">
        </div>
      </div>
      <div class="ci-field"><div class="ci-label">Opacity (strength)</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="range" id="rovl-slider" class="ci-slider" min="0" max="1" step="0.05" value="0.45" style="width:60px;">
          <input class="ci-input" id="rovl-optext" type="text" value="0.45" style="width:45px;">
        </div>
      </div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">z-index</div>
        <select class="ci-select" id="rovl-z">
          <option value="-1">-1 (behind all content)</option>
          <option value="0">0 (neutral)</option>
          <option value="1">1 (above bg, below UI)</option>
        </select>
      </div>
      <div class="ci-field"><div class="ci-label">Also set isolation</div>
        <select class="ci-select" id="rovl-iso">
          <option value="yes">Yes (recommended)</option>
          <option value="no">No</option>
        </select>
      </div>
    </div>
    <button class="ci-btn-add" data-action="rovl" style="margin-top:8px;">→ Add to CSS</button>
    <span class="ci-flash" id="ci-flash-rovl">Added ✓</span>
  `;

  const picker = row.querySelector("#rovl-picker");
  const text = row.querySelector("#rovl-text");
  const slider = row.querySelector("#rovl-slider");
  const optext = row.querySelector("#rovl-optext");
  picker.addEventListener("input", () => {
    text.value = picker.value;
  });
  text.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(text.value)) picker.value = text.value;
  });
  slider.addEventListener("input", () => {
    optext.value = slider.value;
  });
  optext.addEventListener("input", () => {
    const v = parseFloat(optext.value);
    if (!isNaN(v)) slider.value = v;
  });

  row.querySelector('[data-action="rovl"]').addEventListener("click", () => {
    const color = text.value.trim() || picker.value;
    const opacity = optext.value.trim() || slider.value;
    const z = row.querySelector("#rovl-z").value;
    const iso = row.querySelector("#rovl-iso").value;

    const rootProps = iso === "yes" ? "  isolation: isolate;\n" : "";
    const css =
      "#rcp-fe-viewport-root {\n" +
      rootProps +
      "}\n\n#rcp-fe-viewport-root::before {\n  content: '';\n  position: absolute;\n  inset: 0;\n  background: " +
      color +
      ";\n  opacity: " +
      opacity +
      ";\n  pointer-events: none;\n  z-index: " +
      z +
      ";\n}";
    flashMessage(row.querySelector("#ci-flash-rovl"));
    sendToRaw(css);
  });
  return row;
}

// GLASS PANEL (targeted backdrop-filter)
// Apply blur + optional dark background to give any panel the frosted glass look.
function buildGlassPanelRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";

  const presets = [
    {
      id: "gp-lobby",
      sel: ".parties-game-info-panel-content, .v2-parties-invite-info-panel, .parties-invite-info-panel",
      label: "Lobby invite panels",
    },
    {
      id: "gp-activity",
      sel: "#activity-center .activity-center__tabs_scrollable",
      label: "Activity center tabs",
    },
    {
      id: "gp-readycheck",
      sel: ".ready-check-root-element",
      label: "Ready check popup",
    },
    { id: "gp-social", sel: ".lol-social-sidebar", label: "Social sidebar" },
    { id: "gp-custom", sel: "", label: "Custom…" },
  ];

  row.innerHTML = `
    <div class="ci-generic-title">🪟 Glass Panel (backdrop-filter)</div>
    <div class="ci-generic-desc">Apply a frosted-glass blur to specific panels. Uses <code style="color:#c8aa6e;font-size:9px;">backdrop-filter: blur()</code> with an optional dark tint. Pick presets or enter a custom selector.</div>
    <div id="gp-presets" style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;margin:8px 0;font-size:10px;"></div>
    <div id="gp-custom-wrap" style="display:none;margin-bottom:6px;">
      <div class="ci-label">Custom selector</div>
      <div style="display:flex;gap:4px;">
        <input class="ci-input" id="gp-custom-sel" type="text" placeholder=".my-panel">
        <button class="ci-btn-prop ci-picker-btn" title="Pick element">🎯</button>
      </div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Blur amount</div>
        <select class="ci-select" id="gp-blur">
          <option value="4px">Subtle (4px)</option>
          <option value="8px" selected>Normal (8px)</option>
          <option value="16px">Heavy (16px)</option>
          <option value="24px">Intense (24px)</option>
        </select>
      </div>
      <div class="ci-field"><div class="ci-label">Brightness adjust</div>
        <select class="ci-select" id="gp-bright">
          <option value="">None</option>
          <option value="brightness(0.7)">Darken 70%</option>
          <option value="brightness(0.5)">Darken 50%</option>
          <option value="brightness(0.3)">Darken 30%</option>
          <option value="brightness(1.1)">Brighten 110%</option>
        </select>
      </div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Background tint</div>
        <div class="ci-color-pair">
          <input class="ci-color-input" id="gp-picker" type="color" value="#000000">
          <input class="ci-input" id="gp-text" type="text" value="rgba(0,0,0,0.25)" style="width:110px;" placeholder="rgba(0,0,0,0.25)">
        </div>
      </div>
      <div class="ci-field"><div class="ci-label">Border radius</div>
        <select class="ci-select" id="gp-radius">
          <option value="">None</option>
          <option value="4px">4px</option>
          <option value="6px" selected>6px</option>
          <option value="10px">10px</option>
          <option value="16px">16px</option>
        </select>
      </div>
    </div>
    <button class="ci-btn-add" data-action="gp" style="margin-top:8px;">→ Add to CSS</button>
    <span class="ci-flash" id="ci-flash-gp">Added ✓</span>
  `;

  const presetsWrap = row.querySelector("#gp-presets");
  presets.forEach((p) => {
    const lbl = document.createElement("label");
    lbl.style.cssText =
      "display:flex;align-items:center;gap:5px;cursor:pointer;color:#8a9aaa;padding:2px 0;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = p.id;
    cb.style.cssText = "accent-color:#785a28;cursor:pointer;flex-shrink:0;";
    const span = document.createElement("span");
    span.style.cssText = "font-size:10px;";
    span.textContent = p.label;
    lbl.appendChild(cb);
    lbl.appendChild(span);
    presetsWrap.appendChild(lbl);
    if (p.id === "gp-custom") {
      cb.addEventListener("change", () => {
        row.querySelector("#gp-custom-wrap").style.display = cb.checked
          ? "block"
          : "none";
      });
    }
  });

  const picker = row.querySelector("#gp-picker");
  const text = row.querySelector("#gp-text");
  picker.addEventListener("input", () => {
    text.value = picker.value;
  });

  row.querySelector(".ci-picker-btn").addEventListener("click", () => {
    startElementPicker(
      (sel) => (row.querySelector("#gp-custom-sel").value = sel),
    );
  });

  row.querySelector('[data-action="gp"]').addEventListener("click", () => {
    const blur = row.querySelector("#gp-blur").value;
    const bright = row.querySelector("#gp-bright").value;
    const bg = text.value.trim();
    const radius = row.querySelector("#gp-radius").value;

    const bfVal = bright ? blur + " " + bright : blur;

    const sels = [];
    presets.forEach((p) => {
      if (p.id === "gp-custom") return;
      const cb = row.querySelector("#" + p.id);
      if (cb?.checked) sels.push(p.sel);
    });
    const customCb = row.querySelector("#gp-custom");
    if (customCb?.checked) {
      const customSel = row.querySelector("#gp-custom-sel").value.trim();
      if (customSel) sels.push(customSel);
    }
    if (!sels.length) return;

    const lines = sels.map((sel) => {
      let props =
        "  backdrop-filter: blur(" +
        blur +
        ")" +
        (bright ? " " + bright : "") +
        " !important;";
      if (bg) props += "\n  background: " + bg + " !important;";
      if (radius) props += "\n  border-radius: " + radius + " !important;";
      return sel + " {\n" + props + "\n}";
    });

    flashMessage(row.querySelector("#ci-flash-gp"));
    sendToRaw(lines.join("\n\n"));
  });

  return row;
}

// MASK / FADE EDGE
// -webkit-mask / mask gradients
// Used on banners, party containers etc. to fade elements into transparency.
function buildMaskFadeRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";

  const presets = [
    {
      id: "mf-splash",
      sel: ".background-vignette-container.champ-select-bg > img",
      label: "Champ select splash art",
    },
    {
      id: "mf-party",
      sel: ".party-members-container",
      label: "Party members container",
    },
    {
      id: "mf-ranked",
      sel: ".ranked-banner-component",
      label: "Ranked banner",
    },
    {
      id: "mf-screen",
      sel: ".screen-root.active",
      label: "Active screen root",
    },
    {
      id: "mf-sidebar",
      sel: ".rcp-fe-viewport-persistent",
      label: "Viewport persistent sidebar",
    },
    {
      id: "mf-roster",
      sel: ".clash-roster-team-logo-background",
      label: "Clash team logo",
    },
    { id: "mf-custom", sel: "", label: "Custom…" },
  ];

  row.innerHTML = `
    <div class="ci-generic-title">🎭 Mask / Fade Edge</div>
    <div class="ci-generic-desc">Fade the edges of elements using <code style="color:#c8aa6e;font-size:9px;">-webkit-mask</code> gradients — used by acrylic themes to blend splash art, banners, and sidebars into the background.</div>
    <div id="mf-presets" style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;margin:8px 0;font-size:10px;"></div>
    <div id="mf-custom-wrap" style="display:none;margin-bottom:6px;">
      <div class="ci-label">Custom selector</div>
      <div style="display:flex;gap:4px;">
        <input class="ci-input" id="mf-custom-sel" type="text" placeholder=".my-element">
        <button class="ci-btn-prop ci-picker-btn" title="Pick element">🎯</button>
      </div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Fade pattern</div>
        <select class="ci-select" id="mf-pattern">
          <option value="radial-gradient(white, transparent 70%)">Radial (center visible)</option>
          <option value="linear-gradient(90deg, white 60%, transparent)">→ Fade right edge</option>
          <option value="linear-gradient(270deg, white 60%, transparent)">← Fade left edge</option>
          <option value="linear-gradient(180deg, transparent 0%, white 30%, white 100%)">↓ Fade top edge</option>
          <option value="linear-gradient(180deg, white 60%, transparent)">↑ Fade bottom edge</option>
          <option value="linear-gradient(180deg, transparent 10%, white 50%, white 100%)">↓ Soft top fade</option>
          <option value="radial-gradient(white, transparent 50%)">Radial tight (50%)</option>
        </select>
      </div>
      <div class="ci-field"><div class="ci-label">Apply to</div>
        <select class="ci-select" id="mf-target">
          <option value="both">Both -webkit-mask and mask</option>
          <option value="webkit">-webkit-mask only</option>
          <option value="standard">mask only</option>
        </select>
      </div>
    </div>
    <button class="ci-btn-add" data-action="mf" style="margin-top:8px;">→ Add to CSS</button>
    <span class="ci-flash" id="ci-flash-mf">Added ✓</span>
  `;

  const presetsWrap = row.querySelector("#mf-presets");
  presets.forEach((p) => {
    const lbl = document.createElement("label");
    lbl.style.cssText =
      "display:flex;align-items:center;gap:5px;cursor:pointer;color:#8a9aaa;padding:2px 0;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = p.id;
    cb.style.cssText = "accent-color:#785a28;cursor:pointer;flex-shrink:0;";
    const span = document.createElement("span");
    span.style.cssText = "font-size:10px;";
    span.textContent = p.label;
    lbl.appendChild(cb);
    lbl.appendChild(span);
    presetsWrap.appendChild(lbl);
    if (p.id === "mf-custom") {
      cb.addEventListener("change", () => {
        row.querySelector("#mf-custom-wrap").style.display = cb.checked
          ? "block"
          : "none";
      });
    }
  });

  row.querySelector(".ci-picker-btn").addEventListener("click", () => {
    startElementPicker(
      (sel) => (row.querySelector("#mf-custom-sel").value = sel),
    );
  });

  row.querySelector('[data-action="mf"]').addEventListener("click", () => {
    const pattern = row.querySelector("#mf-pattern").value;
    const target = row.querySelector("#mf-target").value;

    const sels = [];
    presets.forEach((p) => {
      if (p.id === "mf-custom") return;
      const cb = row.querySelector("#" + p.id);
      if (cb?.checked) sels.push(p.sel);
    });
    const customCb = row.querySelector("#mf-custom");
    if (customCb?.checked) {
      const customSel = row.querySelector("#mf-custom-sel").value.trim();
      if (customSel) sels.push(customSel);
    }
    if (!sels.length) return;

    const lines = sels.map((sel) => {
      let props = "";
      if (target === "both" || target === "webkit")
        props += "  -webkit-mask: " + pattern + ";\n";
      if (target === "both" || target === "standard")
        props += "  mask: " + pattern + ";\n";
      return sel + " {\n" + props + "}";
    });

    flashMessage(row.querySelector("#ci-flash-mf"));
    sendToRaw(lines.join("\n\n"));
  });

  return row;
}

// LOCAL ASSET HELPER
function buildLocalAssetRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";

  row.innerHTML = `
    <div class="ci-generic-title">📁 Local Asset Path</div>
    <div class="ci-generic-desc">Reference images from your plugin's <code style="color:#c8aa6e;font-size:9px;">assets/</code> folder. Drop files into <code style="color:#c8aa6e;font-size:9px;">/plugins/snooze-css/assets/yourtheme/</code> — Pengu serves them as static files.</div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Theme folder name</div>
        <input class="ci-input" id="asset-theme" type="text" placeholder="mytheme" style="width:100px;"></div>
      <div class="ci-field"><div class="ci-label">Filename</div>
        <input class="ci-input" id="asset-file" type="text" placeholder="background.jpg"></div>
    </div>
    <div style="margin:6px 0 8px;">
      <div class="ci-label" style="margin-bottom:3px;">Generated path</div>
      <code id="asset-preview" style="font-size:10px;color:#c8aa6e;font-family:'Fira Code',monospace;background:rgba(0,0,0,0.3);padding:4px 8px;display:block;">./assets/mytheme/background.jpg</code>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Use as</div>
        <select class="ci-select" id="asset-use">
          <option value="bg">Background image</option>
          <option value="content">Image replacement (content:)</option>
          <option value="copy">Copy path only</option>
        </select></div>
      <div class="ci-field"><div class="ci-label">Target selector</div>
        <div style="display:flex;gap:4px;">
          <input class="ci-input" id="asset-sel" type="text" placeholder=".bg-current">
          <button class="ci-btn-prop ci-picker-btn" title="Pick element">🎯</button>
        </div></div>
    </div>
    <button class="ci-btn-add" data-action="asset" style="margin-top:8px;">→ Add to CSS</button>
    <span class="ci-flash" id="ci-flash-asset">Added ✓</span>
  `;

  const themeInput = row.querySelector("#asset-theme");
  const fileInput = row.querySelector("#asset-file");
  const preview = row.querySelector("#asset-preview");

  const updatePreview = () => {
    const theme = themeInput.value.trim() || "mytheme";
    const file = fileInput.value.trim() || "image.jpg";
    preview.textContent = `./assets/${theme}/${file}`;
  };
  themeInput.addEventListener("input", updatePreview);
  fileInput.addEventListener("input", updatePreview);

  row.querySelector(".ci-picker-btn").addEventListener("click", () => {
    startElementPicker((sel) => (row.querySelector("#asset-sel").value = sel));
  });

  row.querySelector('[data-action="asset"]').addEventListener("click", () => {
    const path = preview.textContent;
    const use = row.querySelector("#asset-use").value;
    const sel = row.querySelector("#asset-sel").value.trim();

    let cssToAppend = null;
    if (use === "copy") {
      // Just append the path as a comment so user can use it manually
      cssToAppend = `/* Local asset path: ${path} */`;
    } else if (use === "bg" && sel) {
      setCssBatch(sel, {
        "background-image": `url('${path}')`,
        "background-size": "cover",
        "background-position": "center",
        "background-repeat": "no-repeat",
      });
    } else if (use === "content" && sel) {
      setCssProperty(sel, "content", `url('${path}')`);
    } else {
      return;
    }

    flashMessage(row.querySelector("#ci-flash-asset"));
    sendToRaw(cssToAppend);
  });

  return row;
}

// SCROLLBAR STYLER
function buildScrollbarRow() {
  const row = makeGenericRow(
    "↕ Scrollbar Style",
    "Customize the scrollbar used throughout the client.",
    `<div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Thumb style</div>
        <select class="ci-select" id="ci-scroll-style">
          <option value="transparent">Invisible (transparent)</option>
          <option value="#785a28">Gold (League default)</option>
          <option value="#1a2535">Dark subtle</option>
          <option value="custom">Custom color…</option>
        </select></div>
      <div class="ci-field" id="ci-scroll-custom-wrap" style="display:none;"><div class="ci-label">Custom color</div>
        <div class="ci-color-pair">
          <input class="ci-color-input" id="ci-scroll-picker" type="color" value="#785a28">
          <input class="ci-input" id="ci-scroll-text" type="text" value="#785a28" style="width:70px;">
        </div></div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Width</div>
        <select class="ci-select" id="ci-scroll-width">
          <option value="4px">Thin (4px)</option>
          <option value="6px">Medium (6px)</option>
          <option value="0px">Hidden (0px)</option>
        </select></div>
      <div class="ci-field"><div class="ci-label">Border radius</div>
        <select class="ci-select" id="ci-scroll-radius">
          <option value="4px">Rounded (4px)</option>
          <option value="0">Square</option>
        </select></div>
    </div>`,
    "scrollbar",
  );

  const styleSelect = row.querySelector("#ci-scroll-style");
  const customWrap = row.querySelector("#ci-scroll-custom-wrap");
  const colorPicker = row.querySelector("#ci-scroll-picker");
  const colorText = row.querySelector("#ci-scroll-text");
  styleSelect.addEventListener("change", () => {
    customWrap.style.display =
      styleSelect.value === "custom" ? "block" : "none";
  });
  colorPicker.addEventListener(
    "input",
    () => (colorText.value = colorPicker.value),
  );
  colorText.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(colorText.value))
      colorPicker.value = colorText.value;
  });

  row
    .querySelector('[data-action="scrollbar"]')
    .addEventListener("click", () => {
      const width = row.querySelector("#ci-scroll-width").value;
      const radius = row.querySelector("#ci-scroll-radius").value;
      let color = styleSelect.value;
      if (color === "custom")
        color = colorText.value.trim() || colorPicker.value;

      const css = `::-webkit-scrollbar {\n  width: ${width} !important;\n}\n\n::-webkit-scrollbar-thumb {\n  background-color: ${color} !important;\n  border-radius: ${radius} !important;\n}\n\n::-webkit-scrollbar-track {\n  background: transparent !important;\n}`;
      flashMessage(row.querySelector("#ci-flash-scrollbar"));
      sendToRaw(css);
    });

  return row;
}

function buildBgRow() {
  const row = makeGenericRow(
    "Replace Background Image",
    "Replace a container's background with a custom image URL.",
    `<div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Container Selector</div>
        <div style="display:flex; gap:4px;">
          <input class="ci-input" id="ci-bg-sel" type="text" placeholder=".bg-current">
          <button class="ci-btn-prop ci-picker-btn" title="Pick element on screen">🎯</button>
        </div>
      </div>
      <div class="ci-field"><div class="ci-label">Image URL</div>
        <input class="ci-input" id="ci-bg-url" type="text" placeholder="https://... or file:///..."></div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Size</div>
        <select class="ci-select" id="ci-bg-size">
          <option value="cover">cover</option><option value="contain">contain</option><option value="100% 100%">stretch</option>
        </select></div>
      <div class="ci-field"><div class="ci-label">Position</div>
        <select class="ci-select" id="ci-bg-pos">
          <option value="center">center</option><option value="center top">top</option><option value="center bottom">bottom</option>
        </select></div>
    </div>`,
    "bg",
  );
  row
    .querySelector(".ci-picker-btn")
    .addEventListener("click", () =>
      startElementPicker(
        (sel) => (row.querySelector("#ci-bg-sel").value = sel),
      ),
    );
  row.querySelector('[data-action="bg"]').addEventListener("click", () => {
    const sel = row.querySelector("#ci-bg-sel").value.trim();
    const url = row.querySelector("#ci-bg-url").value.trim();
    if (!sel || !url) return;
    const size = row.querySelector("#ci-bg-size").value;
    const pos = row.querySelector("#ci-bg-pos").value;

    setCssBatch(sel, {
      "background-image": `url('${url}')`,
      "background-size": size,
      "background-position": pos,
      "background-repeat": "no-repeat",
    });

    flashMessage(row.querySelector("#ci-flash-bg"));
    sendToRaw();
  });
  return row;
}

function buildImgReplaceRow() {
  const row = makeGenericRow(
    "Replace Image Element",
    "Replace an <img> with a background on its container. Great for avatars.",
    `<div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Container Selector</div>
        <div style="display:flex; gap:4px;">
          <input class="ci-input" id="ci-img-sel" type="text" placeholder=".lol-social-avatar">
          <button class="ci-btn-prop ci-picker-btn" title="Pick parent of image">🎯</button>
        </div>
      </div>
      <div class="ci-field"><div class="ci-label">New Image URL</div>
        <input class="ci-input" id="ci-img-url" type="text" placeholder="https://... or file:///..."></div>
    </div>`,
    "img-replace",
  );
  row
    .querySelector(".ci-picker-btn")
    .addEventListener("click", () =>
      startElementPicker(
        (sel) => (row.querySelector("#ci-img-sel").value = sel),
      ),
    );
  row
    .querySelector('[data-action="img-replace"]')
    .addEventListener("click", () => {
      const sel = row.querySelector("#ci-img-sel").value.trim();
      const url = row.querySelector("#ci-img-url").value.trim();
      if (!sel || !url) return;

      setCssProperty(`${sel} img`, "opacity", "0"); // Hide child img
      setCssBatch(sel, {
        "background-image": `url('${url}')`,
        "background-size": "cover",
        "background-position": "center",
      });

      flashMessage(row.querySelector("#ci-flash-img-replace"));
      sendToRaw();
    });
  return row;
}

function buildFontRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";

  row.innerHTML = `
    <div class="ci-generic-title">🔤 Font Override</div>
    <div class="ci-generic-desc">Replace the client font globally via <code style="color:#c8aa6e;font-size:9px;">:root</code> CSS variables — the correct approach used by every community theme. Find fonts at <a style="color:#785a28;" href="https://fonts.google.com" target="_blank">fonts.google.com</a></div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Font name</div>
        <input class="ci-input" id="ci-font-name" type="text" placeholder="Orbitron"></div>
      <div class="ci-field"><div class="ci-label">Scope</div>
        <select class="ci-select" id="ci-font-scope">
          <option value="both">Both (display + body)</option>
          <option value="display">Display only</option>
          <option value="body">Body only</option>
        </select></div>
    </div>
    <div class="ci-field" style="margin-bottom:8px;"><div class="ci-label">Google Fonts @import URL</div>
      <input class="ci-input" id="ci-font-url" type="text" placeholder="https://fonts.googleapis.com/css2?family=Orbitron&display=swap" style="width:100%;">
    </div>
    <div style="font-size:9px;color:#3a5060;margin-bottom:8px;padding:6px 8px;background:rgba(0,0,0,0.2);border:1px solid #1a2535;">
      💡 On Google Fonts: pick a font → click "Get font" → "Get embed code" → copy the @import URL
    </div>
    <button class="ci-btn-add" data-action="font">→ Add to CSS</button>
    <span class="ci-flash" id="ci-flash-font">Added ✓</span>
  `;

  row.querySelector('[data-action="font"]').addEventListener("click", () => {
    const url = row.querySelector("#ci-font-url").value.trim();
    const name = row.querySelector("#ci-font-name").value.trim();
    const scope = row.querySelector("#ci-font-scope").value;
    if (!name) return;

    const lines = [];
    if (url) lines.push(`@import url('${url}');`);

    const vars = [];
    if (scope === "both" || scope === "display")
      vars.push(`  --font-display: '${name}', sans-serif !important;`);
    if (scope === "both" || scope === "body")
      vars.push(`  --font-body: '${name}', sans-serif !important;`);
    if (vars.length)
      lines.push(`:root {
${vars.join("\n")}
}`);

    flashMessage(row.querySelector("#ci-flash-font"));
    sendToRaw(lines.join("\n"));
  });

  return row;
}

function buildHideRow() {
  const row = makeGenericRow(
    "Hide Any Element",
    "Quickly hide an element. Use the crosshair to pick.",
    `<div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Selector</div>
        <div style="display:flex; gap:4px;">
          <input class="ci-input" id="ci-hide-sel" type="text" placeholder=".class-name">
          <button class="ci-btn-prop ci-picker-btn" title="Pick element on screen">🎯</button>
        </div>
      </div>
      <div class="ci-field"><div class="ci-label">Method</div>
        <select class="ci-select" id="ci-hide-method"><option value="display:none">display: none</option><option value="opacity:0">opacity: 0</option></select>
      </div>
    </div>`,
    "hide",
  );
  row
    .querySelector(".ci-picker-btn")
    .addEventListener("click", () =>
      startElementPicker(
        (sel) => (row.querySelector("#ci-hide-sel").value = sel),
      ),
    );
  row.querySelector('[data-action="hide"]').addEventListener("click", () => {
    const sel = row.querySelector("#ci-hide-sel").value.trim();
    if (!sel) return;
    const [prop, val] = row.querySelector("#ci-hide-method").value.split(":");
    setCssProperty(sel, prop, val); // UPDATE
    flashMessage(row.querySelector("#ci-flash-hide"));
    sendToRaw();
  });
  return row;
}

function buildColorRow() {
  const row = makeGenericRow(
    "Color Override",
    "Change text or background color on any element.",
    `<div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Selector</div>
        <div style="display:flex; gap:4px;">
          <input class="ci-input" id="ci-color-sel" type="text" placeholder=".class-name">
          <button class="ci-btn-prop ci-picker-btn" title="Pick element on screen">🎯</button>
        </div>
      </div>
      <div class="ci-field"><div class="ci-label">Property</div>
        <select class="ci-select" id="ci-color-prop"><option value="color">color</option><option value="background-color">background-color</option></select>
      </div>
    </div>
    <div class="ci-field"><div class="ci-label">Color</div>
      <div class="ci-color-pair">
        <input class="ci-color-input" id="ci-color-picker" type="color" value="#c8aa6e">
        <input class="ci-input" id="ci-color-text" type="text" placeholder="hex / rgba" style="width:100px">
      </div>
    </div>`,
    "color",
  );
  row
    .querySelector(".ci-picker-btn")
    .addEventListener("click", () =>
      startElementPicker(
        (sel) => (row.querySelector("#ci-color-sel").value = sel),
      ),
    );
  const picker = row.querySelector("#ci-color-picker");
  const textIn = row.querySelector("#ci-color-text");
  picker.addEventListener("input", () => (textIn.value = picker.value));
  textIn.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(textIn.value)) picker.value = textIn.value;
  });
  row.querySelector('[data-action="color"]').addEventListener("click", () => {
    const sel = row.querySelector("#ci-color-sel").value.trim();
    const prop = row.querySelector("#ci-color-prop").value;
    const val = textIn.value.trim() || picker.value;
    if (sel && val) {
      setCssProperty(sel, prop, val);
      flashMessage(row.querySelector("#ci-flash-color"));
      sendToRaw();
    }
  });
  return row;
}

function buildCustomRow() {
  const row = makeGenericRow(
    "Custom CSS Rule",
    "Manually write any single CSS property.",
    `<div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Selector</div>
        <div style="display:flex; gap:4px;">
          <input class="ci-input" id="ci-custom-sel" type="text" placeholder=".class-name">
          <button class="ci-btn-prop ci-picker-btn" title="Pick element on screen">🎯</button>
        </div>
      </div>
      <div class="ci-field"><div class="ci-label">Property</div>
        <input class="ci-input" id="ci-custom-prop" type="text" placeholder="transform"></div>
    </div>
    <div class="ci-field"><div class="ci-label">Value</div>
      <input class="ci-input" id="ci-custom-val" type="text" placeholder="scale(1.2)">
    </div>`,
    "custom",
  );
  row
    .querySelector(".ci-picker-btn")
    .addEventListener("click", () =>
      startElementPicker(
        (sel) => (row.querySelector("#ci-custom-sel").value = sel),
      ),
    );
  row.querySelector('[data-action="custom"]').addEventListener("click", () => {
    const sel = row.querySelector("#ci-custom-sel").value.trim();
    const prop = row.querySelector("#ci-custom-prop").value.trim();
    const val = row.querySelector("#ci-custom-val").value.trim();
    if (!sel || !prop || !val) return;
    setCssProperty(sel, prop, val); // UPDATE
    flashMessage(row.querySelector("#ci-flash-custom"));
    sendToRaw();
  });
  return row;
}

function makeGenericRow(title, desc, fieldsHTML, flashId) {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.innerHTML = `
    <div class="ci-generic-title">${title}</div>
    <div class="ci-generic-desc">${desc}</div>
    ${fieldsHTML}
    <button class="ci-btn-add" data-action="${flashId}">→ Add to CSS</button>
    <span class="ci-flash" id="ci-flash-${flashId}">Added ✓</span>
  `;
  return row;
}

// CATALOG ELEMENT ROWS
function buildElementRow(el) {
  const row = document.createElement("div");
  row.className = "ci-element-row";
  row.dataset.search = (el.label + " " + el.cls).toLowerCase();
  const notBadge = document.createElement("span");
  notBadge.title = "Element not found in current DOM";
  notBadge.style.cssText =
    "font-size:8px;color:#2a3a4a;background:rgba(0,0,0,0.3);border:1px solid #1a2535;padding:1px 5px;letter-spacing:0.05em;display:none;flex-shrink:0;";
  notBadge.textContent = "not in DOM";
  const info = document.createElement("div");
  info.style.cssText = "display:flex;align-items:baseline;gap:8px;";
  const labelSpan = document.createElement("span");
  labelSpan.className = "ci-element-label";
  labelSpan.textContent = el.label;
  const clsCode = document.createElement("code");
  clsCode.className = "ci-element-cls";
  clsCode.textContent = el.cls;
  info.appendChild(labelSpan);
  info.appendChild(clsCode);
  info.appendChild(notBadge);
  row.appendChild(info);
  const controls = document.createElement("div");
  controls.className = "ci-element-controls";
  el.props.forEach((prop) =>
    controls.appendChild(buildPropControl(el.cls, prop, notBadge)),
  );
  row.appendChild(controls);
  return row;
}

// PROP CONTROLS
function buildPropControl(cls, prop, notBadge) {
  if (typeof prop === "object") {
    if (prop.type === "bg-replace")
      return buildBgReplaceControl(cls, prop, notBadge);
    if (prop.type === "img-replace")
      return buildImgReplaceControl(cls, prop, notBadge);
    return document.createElement("span");
  }

  // Handle special pseudo-properties generated by the Omni Inspector
  if (prop === "child-img-replace") {
    return buildChildImgReplaceControl(cls);
  }

  const wrap = document.createElement("div");
  wrap.className = "ci-prop-wrap";
  const lbl = document.createElement("div");
  lbl.className = "ci-prop-label";
  lbl.textContent = prop;
  wrap.appendChild(lbl);
  const inner = document.createElement("div");
  inner.className = "ci-prop-inner";

  let input;
  if (prop === "opacity")
    input = makeHybridSlider(
      0,
      1,
      0.05,
      1,
      (v) => v,
      (v) => v,
    );
  else if (prop === "scale")
    input = makeHybridSlider(
      0.1,
      3,
      0.1,
      1,
      (v) => `scale(${v})`,
      (v) => {
        const m = v.match(/scale\(([^)]+)\)/);
        return m ? parseFloat(m[1]) : 1;
      },
    );
  else if (prop === "border-radius")
    input = makeHybridSlider(
      0,
      50,
      1,
      0,
      (v) => `${v}%`,
      (v) => parseFloat(v) || 0,
    );
  else if (prop === "text-shadow") input = makeGlowInput();
  else if (["color", "background-color", "border-color"].includes(prop))
    input = makeColorInput();
  else if (prop === "display")
    input = {
      container: makeSelect([
        ["initial", "initial"],
        ["block", "block"],
        ["flex", "flex"],
        ["grid", "grid"],
        ["inline-flex", "inline-flex"],
        ["none", "none"],
      ]),
      get value() {
        return this.container.value;
      },
    };
  else if (prop === "visibility")
    input = {
      container: makeSelect([
        ["visible", "visible"],
        ["hidden", "hidden"],
        ["collapse", "collapse"],
      ]),
      get value() {
        return this.container.value;
      },
    };
  else if (prop === "background-size")
    input = {
      container: makeSelect([
        ["cover", "cover"],
        ["contain", "contain"],
        ["100% 100%", "stretch"],
      ]),
      get value() {
        return this.container.value;
      },
    };
  else if (prop === "background-position")
    input = {
      container: makeSelect([
        ["center", "center"],
        ["center top", "top"],
        ["center bottom", "bottom"],
        ["left center", "left"],
        ["right center", "right"],
      ]),
      get value() {
        return this.container.value;
      },
    };
  else if (prop === "background-repeat")
    input = {
      container: makeSelect([
        ["no-repeat", "no-repeat"],
        ["repeat", "repeat"],
        ["repeat-x", "repeat-x"],
        ["repeat-y", "repeat-y"],
      ]),
      get value() {
        return this.container.value;
      },
    };
  else if (prop === "filter")
    input = {
      container: makeSelect([
        ["none", "none"],
        ["blur(4px)", "blur (4px)"],
        ["blur(10px)", "blur (10px)"],
        ["grayscale(1)", "grayscale"],
        ["grayscale(0.5)", "grayscale 50%"],
        ["brightness(0.5)", "dim (50%)"],
        ["brightness(1.3)", "brighten (130%)"],
        ["hue-rotate(90deg)", "hue-rotate 90°"],
        ["hue-rotate(180deg)", "hue-rotate 180°"],
        ["saturate(0)", "desaturate"],
        ["saturate(0.5)", "low saturation"],
        ["saturate(1.5)", "oversaturate"],
        ["saturate(2)", "vivid (2x)"],
        ["sepia(1)", "sepia"],
        ["invert(1)", "invert"],
        ["contrast(1.5)", "contrast+"],
        ["contrast(0.7)", "contrast-"],
      ]),
      get value() {
        return this.container.value;
      },
    };
  else if (prop === "backdrop-filter")
    input = {
      container: makeSelect([
        ["none", "none"],
        ["blur(4px)", "blur (4px)"],
        ["blur(10px)", "blur (10px)"],
        ["blur(20px)", "blur (20px)"],
        ["blur(120px) brightness(0.2)", "heavy blur + dim"],
        ["blur(10px) brightness(0.7)", "blur + slight dim"],
        ["blur(1px)", "subtle blur"],
      ]),
      get value() {
        return this.container.value;
      },
    };
  else if (prop === "mix-blend-mode")
    input = {
      container: makeSelect([
        ["normal", "normal"],
        ["multiply", "multiply"],
        ["screen", "screen"],
        ["overlay", "overlay"],
        ["darken", "darken"],
        ["lighten", "lighten"],
        ["color-dodge", "color-dodge"],
        ["hard-light", "hard-light"],
        ["soft-light", "soft-light"],
        ["difference", "difference"],
        ["exclusion", "exclusion"],
        ["hue", "hue"],
        ["saturation", "saturation"],
        ["color", "color"],
        ["luminosity", "luminosity"],
      ]),
      get value() {
        return this.container.value;
      },
    };
  else if (prop === "transition")
    input = {
      container: makeSelect([
        ["none", "none"],
        ["0.2s", "0.2s fast"],
        ["0.3s", "0.3s default"],
        ["0.5s", "0.5s medium"],
        ["0.2s opacity", "0.2s opacity only"],
        ["0.3s all ease-in-out", "0.3s all ease-in-out"],
        ["0.5s all ease", "0.5s all ease"],
      ]),
      get value() {
        return this.container.value;
      },
    };
  else if (prop === "left" || prop === "top") {
    const textIn = makeTextInput("e.g. 3.95px", "75px");
    input = {
      container: textIn,
      get value() {
        return textIn.value;
      },
    };
  } else {
    const textIn = makeTextInput("value", "90px");
    input = {
      container: textIn,
      get value() {
        return textIn.value;
      },
    };
  }

  const btn = makeAddBtn(() => {
    const val = input.value;
    if (!val) return;
    const finalProp = prop === "scale" ? "transform" : prop;
    setCssProperty(cls, finalProp, val);
    sendToRaw();
  });

  inner.appendChild(input.container);
  inner.appendChild(btn);
  wrap.appendChild(inner);
  register({
    cls,
    prop: prop === "scale" ? "transform" : prop,
    inputEl: input.textIn || input.container,
    notBadge,
  });
  return wrap;
}

function buildBgReplaceControl(cls, propObj, notBadge) {
  const wrap = document.createElement("div");
  wrap.className = "ci-prop-wrap";
  wrap.style.cssText = "flex-basis:100%;margin-top:4px;";
  const lbl = document.createElement("div");
  lbl.className = "ci-prop-label";
  lbl.textContent = propObj.label || "replace background image";
  wrap.appendChild(lbl);
  const inner = document.createElement("div");
  inner.style.cssText =
    "display:flex;align-items:center;gap:4px;flex-wrap:wrap;";
  const urlInput = makeTextInput("image URL", "160px");
  const sizeSelect = makeSelect([
    ["cover", "cover"],
    ["contain", "contain"],
    ["100% 100%", "stretch"],
  ]);
  sizeSelect.style.cssText +=
    "padding:4px 22px 4px 6px !important;font-size:10px !important;width:auto !important;";
  const btn = makeAddBtn(() => {
    const url = urlInput.value.trim();
    if (!url) return;
    const size = sizeSelect.value;

    if (propObj.hideImg) setCssProperty(propObj.hideImg, "opacity", "0");

    setCssBatch(cls, {
      "background-image": `url('${url}')`,
      "background-size": size,
      "background-position": "center",
      "background-repeat": "no-repeat",
    });
    sendToRaw();
  });
  inner.appendChild(urlInput);
  inner.appendChild(sizeSelect);
  inner.appendChild(btn);
  wrap.appendChild(inner);
  return wrap;
}

function buildImgReplaceControl(cls, propObj, notBadge) {
  const wrap = document.createElement("div");
  wrap.className = "ci-prop-wrap";
  wrap.style.cssText = "flex-basis:100%;margin-top:4px;";
  const lbl = document.createElement("div");
  lbl.className = "ci-prop-label";
  lbl.textContent = propObj.label || "replace image";
  wrap.appendChild(lbl);
  const inner = document.createElement("div");
  inner.style.cssText =
    "display:flex;align-items:center;gap:4px;flex-wrap:wrap;";
  const urlInput = makeTextInput("image URL or file:/// path", "200px");
  const btn = makeAddBtn(() => {
    const url = urlInput.value.trim();
    if (!url) return;
    setCssProperty(cls, "content", `url('${url}')`);
    sendToRaw();
  });
  inner.appendChild(urlInput);
  inner.appendChild(btn);
  wrap.appendChild(inner);
  return wrap;
}

function buildChildImgReplaceControl(cls) {
  const wrap = document.createElement("div");
  wrap.className = "ci-prop-wrap";
  wrap.style.flexBasis = "100%";
  const lbl = document.createElement("div");
  lbl.className = "ci-prop-label";
  lbl.textContent = "REPLACE CHILD <img>";
  lbl.style.color = "#c8aa6e";
  wrap.appendChild(lbl);
  const inner = document.createElement("div");
  inner.className = "ci-prop-inner";
  inner.style.gap = "6px";
  const urlInput = makeTextInput("new image URL...", "160px");
  const sizeSelect = makeSelect([
    ["cover", "cover"],
    ["contain", "contain"],
    ["100% 100%", "stretch"],
  ]);
  sizeSelect.style.width = "auto";
  const btn = makeAddBtn(() => {
    const url = urlInput.value.trim();
    if (!url) return;
    const size = sizeSelect.value;

    setCssBatch(`${cls} img`, { opacity: "0", visibility: "hidden" });
    setCssBatch(cls, {
      "background-image": `url('${url}')`,
      "background-size": size,
      "background-position": "center",
    });

    sendToRaw();
  });
  inner.appendChild(urlInput);
  inner.appendChild(sizeSelect);
  inner.appendChild(btn);
  wrap.appendChild(inner);
  return wrap;
}

function makeHybridSlider(min, max, step, defaultVal, formatOut, parseIn) {
  const container = document.createElement("div");
  container.style.cssText = "display:flex;align-items:center;gap:6px;";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = min;
  slider.max = max;
  slider.step = step;
  slider.value = defaultVal;
  slider.className = "ci-slider";
  slider.style.width = "60px";
  const textIn = makeTextInput("", "50px");
  textIn.value = formatOut(defaultVal);
  slider.addEventListener(
    "input",
    () => (textIn.value = formatOut(slider.value)),
  );
  textIn.addEventListener("input", () => {
    const p = parseIn(textIn.value);
    if (!isNaN(p)) slider.value = p;
  });
  container.appendChild(slider);
  container.appendChild(textIn);
  return {
    container,
    textIn,
    get value() {
      return textIn.value;
    },
  };
}

function makeColorInput() {
  const container = document.createElement("div");
  container.className = "ci-color-pair";
  const picker = document.createElement("input");
  picker.type = "color";
  picker.className = "ci-color-input";
  picker.value = "#c8aa6e";
  const textIn = makeTextInput("hex / rgba", "80px");
  picker.addEventListener("input", () => (textIn.value = picker.value));
  textIn.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(textIn.value)) picker.value = textIn.value;
  });
  container.appendChild(picker);
  container.appendChild(textIn);
  return {
    container,
    textIn,
    get value() {
      return textIn.value.trim() || picker.value;
    },
  };
}

function makeGlowInput() {
  const container = document.createElement("div");
  container.className = "ci-color-pair";
  const picker = document.createElement("input");
  picker.type = "color";
  picker.className = "ci-color-input";
  picker.value = "#00ffff";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  slider.max = 20;
  slider.step = 1;
  slider.value = 10;
  slider.className = "ci-slider";
  slider.style.width = "50px";
  container.appendChild(picker);
  container.appendChild(slider);
  return {
    container,
    textIn: null,
    get value() {
      return `0 0 ${slider.value}px ${picker.value}, 0 0 ${slider.value * 2}px ${picker.value}`;
    },
  };
}

function makeSelect(options) {
  const sel = document.createElement("select");
  sel.className = "ci-select ci-prop-select";
  options.forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    sel.appendChild(o);
  });
  return sel;
}

function makeTextInput(placeholder, width) {
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "ci-input ci-prop-input";
  inp.placeholder = placeholder;
  inp.style.width = width;
  return inp;
}

function makeIconBtn(icon, title, onClick) {
  const btn = document.createElement("button");
  btn.title = title;
  btn.textContent = icon;
  btn.style.cssText =
    "flex-shrink:0;width:30px;height:30px;background:transparent;border:1px solid #785a28;color:#785a28;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s,color 0.15s;";
  btn.addEventListener("mouseenter", () => {
    btn.style.background = "#785a28";
    btn.style.color = "#f0e6d3";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "transparent";
    btn.style.color = "#785a28";
  });
  btn.addEventListener("click", onClick);
  return btn;
}

function makeAddBtn(onClick) {
  const btn = document.createElement("button");
  btn.className = "ci-btn-prop";
  btn.textContent = "→";
  btn.title = "Add to CSS";
  btn.addEventListener("click", onClick);
  return btn;
}

// THE DYNAMIC PROPERTY ENGINE
function getSmartProperties(el) {
  const props = new Set();
  const genericProps = [
    "display",
    "opacity",
    "scale",
    "border-radius",
    "text-shadow",
  ];
  genericProps.forEach((p) => props.add(p));
  if (!el) return Array.from(props);
  const cs = window.getComputedStyle(el);
  if (
    cs.color &&
    cs.color !== "rgb(0, 0, 0)" &&
    cs.color !== "rgba(0, 0, 0, 0)"
  )
    props.add("color");
  if (
    cs.backgroundColor &&
    cs.backgroundColor !== "rgba(0, 0, 0, 0)" &&
    cs.backgroundColor !== "transparent"
  )
    props.add("background-color");
  if (cs.borderTopWidth && cs.borderTopWidth !== "0px")
    props.add("border-color");
  if (cs.backgroundImage && cs.backgroundImage !== "none") {
    props.add("background-image");
    props.add("background-size");
    props.add("background-position");
    props.add("background-repeat");
  }
  if (cs.fontFamily) props.add("font-family");
  if (cs.fontSize && cs.fontSize !== "16px") props.add("font-size");
  if (cs.width && cs.width !== "auto" && cs.width !== "0px") props.add("width");
  if (cs.height && cs.height !== "auto" && cs.height !== "0px")
    props.add("height");
  if (cs.margin && cs.margin !== "0px") props.add("margin");
  if (cs.padding && cs.padding !== "0px") props.add("padding");
  if (cs.filter && cs.filter !== "none") props.add("filter");
  if (cs.backdropFilter && cs.backdropFilter !== "none")
    props.add("backdrop-filter");
  if (cs.visibility && cs.visibility === "hidden") props.add("visibility");
  if (cs.mixBlendMode && cs.mixBlendMode !== "normal")
    props.add("mix-blend-mode");
  // SMART ADDITIONS
  if (el.querySelector("img")) {
    props.add("child-img-replace");
  }
  return Array.from(props);
}

function findCatalogMatch(sel) {
  for (const group of CATALOG) {
    if (group.generic) continue;
    for (const el of group.elements) {
      if (el.cls === sel || sel.includes(el.cls)) {
        const cleanGroup = group.label.replace(/[\u1000-\uFFFF]/g, "").trim();
        return { group: cleanGroup, label: el.label };
      }
    }
  }
  return null;
}

// ELEMENT PICKER (INSPECTOR WITH DOM TRAVERSAL & TOOLTIP)
export function startElementPicker(onPickCallback) {
  const backdrop = getBackdrop();
  if (backdrop) backdrop.style.display = "none";
  const overlay = document.createElement("div");
  overlay.id = "ci-inspector-overlay";
  overlay.style.cssText =
    "position:fixed; pointer-events:none; z-index:999998; border:2px solid #c8aa6e; background:rgba(200, 170, 110, 0.2); transition:all 0.1s ease-out; display:none;";
  const label = document.createElement("div");
  label.style.cssText =
    'position:fixed; pointer-events:none; z-index:999999; background:#091220; color:#c8aa6e; border:1px solid #c8aa6e; font-family:"Fira Code",monospace; padding:4px 8px; white-space:nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.7); display:none; transition:all 0.1s ease-out;';
  document.body.appendChild(overlay);
  document.body.appendChild(label);
  let currentTarget = null;
  let isLocked = false;
  function renderOverlay() {
    if (!currentTarget) return;
    const rect = currentTarget.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.top = rect.top + "px";
    overlay.style.left = rect.left + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    let selector = currentTarget.tagName.toLowerCase();
    if (currentTarget.id) selector += "#" + currentTarget.id;
    else if (currentTarget.classList.length > 0) {
      const validClasses = [...currentTarget.classList].filter(
        (c) => !/^(ng-|ember|active|hover|focus)/i.test(c),
      );
      if (validClasses.length > 0) selector += "." + validClasses.join(".");
    }
    if (isLocked) {
      overlay.style.borderColor = "#4caf82";
      overlay.style.backgroundColor = "rgba(76, 175, 130, 0.2)";
      label.style.borderColor = "#4caf82";
      label.style.color = "#4caf82";
      label.innerHTML = `<div style="font-weight:bold; font-size:12px; margin-bottom:4px;">${selector}</div><div style="font-size:9px; color:#a0b4c8; font-family:'Sora', sans-serif;">[Scroll / Arrows] Change Depth •[Click / Enter] Confirm • [Esc] Unlock</div>`;
    } else {
      overlay.style.borderColor = "#c8aa6e";
      overlay.style.backgroundColor = "rgba(200, 170, 110, 0.2)";
      label.style.borderColor = "#c8aa6e";
      label.style.color = "#c8aa6e";
      label.innerHTML = `<div style="font-weight:bold; font-size:12px; margin-bottom:4px;">${selector}</div><div style="font-size:9px; color:#a0b4c8; font-family:'Sora', sans-serif;">[Click] Lock element • [Esc] Cancel</div>`;
    }
    label.style.display = "block";
    const pad = 6;
    let lTop = rect.top - label.offsetHeight - pad;
    let lLeft = rect.left;
    if (lTop < pad) lTop = Math.max(pad, rect.top + pad);
    if (lTop + label.offsetHeight > window.innerHeight - pad)
      lTop = window.innerHeight - label.offsetHeight - pad;
    if (lLeft < pad) lLeft = pad;
    else if (lLeft + label.offsetWidth > window.innerWidth - pad)
      lLeft = window.innerWidth - label.offsetWidth - pad;
    label.style.top = lTop + "px";
    label.style.left = lLeft + "px";
  }
  function onMouseMove(e) {
    if (isLocked) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (
      !target ||
      target.id === "css-injector-backdrop" ||
      target.id === "ci-inspector-overlay" ||
      target === currentTarget
    )
      return;
    currentTarget = target;
    renderOverlay();
  }
  function cleanup() {
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("wheel", onWheel, true);
    overlay.remove();
    label.remove();
    if (backdrop) backdrop.style.display = "flex"; // restore modal
  }
  function confirmSelection() {
    cleanup();
    if (!currentTarget) return;
    let finalSelector = currentTarget.tagName.toLowerCase();
    if (currentTarget.id) finalSelector += "#" + currentTarget.id;
    else if (currentTarget.classList.length > 0) {
      const validClasses = [...currentTarget.classList].filter(
        (c) => !/^(ng-|ember|active|hover)/i.test(c),
      );
      if (validClasses.length > 0) finalSelector = "." + validClasses.join(".");
    }
    onPickCallback(finalSelector);
  }
  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!currentTarget) return;
    if (!isLocked) {
      isLocked = true;
      renderOverlay();
    } else {
      confirmSelection();
    }
  }
  function onWheel(e) {
    if (!isLocked) return;
    e.preventDefault();
    e.stopPropagation();
    let nextTarget = null;
    if (e.deltaY < 0) nextTarget = currentTarget.parentElement;
    else if (e.deltaY > 0) nextTarget = currentTarget.firstElementChild;
    if (
      nextTarget &&
      nextTarget.tagName !== "HTML" &&
      nextTarget.tagName !== "BODY"
    ) {
      currentTarget = nextTarget;
      renderOverlay();
    }
  }
  function onKeyDown(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape") {
      if (isLocked) {
        isLocked = false;
        currentTarget = null;
        overlay.style.display = "none";
        label.style.display = "none";
      } else {
        cleanup();
      }
    } else if (isLocked && e.key === "Enter") {
      confirmSelection();
    } else if (isLocked) {
      let nextTarget = null;
      if (e.key === "ArrowUp") nextTarget = currentTarget.parentElement;
      else if (e.key === "ArrowDown")
        nextTarget = currentTarget.firstElementChild;
      else if (e.key === "ArrowLeft")
        nextTarget = currentTarget.previousElementSibling;
      else if (e.key === "ArrowRight")
        nextTarget = currentTarget.nextElementSibling;
      if (
        nextTarget &&
        nextTarget.tagName !== "HTML" &&
        nextTarget.tagName !== "BODY"
      ) {
        currentTarget = nextTarget;
        renderOverlay();
      }
    }
  }
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("wheel", onWheel, {
    capture: true,
    passive: false,
  });
}
