import { resolveAssetUrls } from "./resolver.js";
import { Storage } from "./storage.js";
import { escHtml } from "./utils.js";
import { updateCssString } from "./css-parser.js";
import { switchTab } from "./modal.js";
import { applyCSSToAllRoots } from "./shadow-manager.js";

export function sendToRaw(snippet = null) {
  if (snippet) appendToRaw(snippet);
  switchTab("raw");
  scrollRawToBottom();
}
let textareaEl = null;
let tabSize = 2; // visual width of \t
let acDropdown = null; // single reused autocomplete dropdown element
let acDebounce = null;
let lineCountEl = null;
let tabSizeValEl = null;
let scrollTopBtn = null;
let scrollBottomBtn = null;
let flashEl = null;

// DYNAMIC PROPERTIES: Pulls every supported CSS property natively from the client's CEF engine
const CSS_PROPS = Array.from(window.getComputedStyle(document.documentElement))
  .filter(
    (prop) =>
      !prop.startsWith("-webkit-") ||
      prop === "-webkit-mask" ||
      prop === "-webkit-app-region",
  )
  .sort();

// FALLBACK VALUES
const FALLBACK_VALUES = {
  display: [
    "none",
    "block",
    "flex",
    "grid",
    "inline",
    "inline-block",
    "inline-flex",
    "inline-grid",
    "contents",
  ],
  position: ["static", "relative", "absolute", "fixed", "sticky"],
  visibility: ["visible", "hidden", "collapse"],
  "box-sizing": ["content-box", "border-box"],
  overflow: ["visible", "hidden", "scroll", "auto", "overlay", "clip"],
  "overflow-x": ["visible", "hidden", "scroll", "auto", "overlay"],
  "overflow-y": ["visible", "hidden", "scroll", "auto", "overlay"],
  float: ["left", "right", "none", "inline-start", "inline-end"],
  clear: ["none", "left", "right", "both", "inline-start", "inline-end"],
  isolation: ["auto", "isolate"],
  width: [
    "auto",
    "100%",
    "100vw",
    "max-content",
    "min-content",
    "fit-content",
    "0",
    "100px",
  ],
  height: [
    "auto",
    "100%",
    "100vh",
    "max-content",
    "min-content",
    "fit-content",
    "0",
    "100px",
  ],
  margin: ["0", "auto", "0 auto", "4px", "8px", "10px", "16px", "20px"],
  padding: ["0", "4px", "8px", "10px", "12px", "16px", "20px"],
  "flex-direction": ["row", "row-reverse", "column", "column-reverse"],
  "flex-wrap": ["nowrap", "wrap", "wrap-reverse"],
  "justify-content": [
    "flex-start",
    "flex-end",
    "center",
    "space-between",
    "space-around",
    "space-evenly",
  ],
  "align-items": ["flex-start", "flex-end", "center", "stretch", "baseline"],
  "align-content": [
    "flex-start",
    "flex-end",
    "center",
    "space-between",
    "space-around",
    "stretch",
  ],
  "align-self": [
    "auto",
    "flex-start",
    "flex-end",
    "center",
    "baseline",
    "stretch",
  ],
  "grid-auto-flow": ["row", "column", "row dense", "column dense"],
  "grid-template-columns": [
    "1fr",
    "repeat(auto-fill, minmax(100px, 1fr))",
    "auto",
    "100%",
  ],
  "text-align": ["left", "right", "center", "justify"],
  "text-transform": ["none", "uppercase", "lowercase", "capitalize"],
  "text-decoration": ["none", "underline", "line-through", "overline"],
  "white-space": ["normal", "nowrap", "pre", "pre-wrap", "pre-line"],
  "word-break": ["normal", "break-all", "keep-all", "break-word"],
  "font-style": ["normal", "italic", "oblique"],
  "font-weight": [
    "normal",
    "bold",
    "100",
    "200",
    "300",
    "400",
    "500",
    "600",
    "700",
    "800",
    "900",
  ],
  "vertical-align": [
    "baseline",
    "sub",
    "super",
    "text-top",
    "text-bottom",
    "middle",
    "top",
    "bottom",
  ],
  color: [
    "transparent",
    "currentColor",
    "inherit",
    "initial",
    "#c8aa6e",
    "#f0e6d3",
    "#a0b4c8",
    "#000",
    "#fff",
  ],
  "background-color": [
    "transparent",
    "currentColor",
    "inherit",
    "initial",
    "rgba(0,0,0,0.5)",
    "#060e1a",
    "#0a1428",
    "#c8aa6e",
    "#000",
    "#fff",
  ],
  "background-size": ["cover", "contain", "auto", "100%", "100% 100%"],
  "background-repeat": [
    "no-repeat",
    "repeat",
    "repeat-x",
    "repeat-y",
    "space",
    "round",
  ],
  "background-position": [
    "center",
    "top",
    "bottom",
    "left",
    "right",
    "center center",
    "center top",
    "center bottom",
  ],
  "background-attachment": ["scroll", "fixed", "local"],
  "background-blend-mode": [
    "normal",
    "multiply",
    "screen",
    "overlay",
    "darken",
    "lighten",
    "color-dodge",
    "color-burn",
    "hard-light",
    "soft-light",
    "difference",
    "exclusion",
    "hue",
    "saturation",
    "color",
    "luminosity",
  ],
  "border-style": ["none", "solid", "dashed", "dotted", "double", "hidden"],
  "border-width": ["0", "1px", "2px", "medium", "thick", "thin"],
  opacity: [
    "0",
    "0.1",
    "0.2",
    "0.3",
    "0.4",
    "0.5",
    "0.6",
    "0.7",
    "0.8",
    "0.9",
    "1",
  ],
  "mix-blend-mode": [
    "normal",
    "multiply",
    "screen",
    "overlay",
    "darken",
    "lighten",
    "color-dodge",
    "color-burn",
    "hard-light",
    "soft-light",
    "difference",
    "exclusion",
    "hue",
    "saturation",
    "color",
    "luminosity",
  ],
  filter: [
    "none",
    "blur(4px)",
    "blur(10px)",
    "grayscale(1)",
    "grayscale(0.5)",
    "brightness(0.5)",
    "brightness(1.5)",
    "hue-rotate(90deg)",
    "hue-rotate(180deg)",
    "saturate(0)",
    "saturate(2)",
    "sepia(1)",
    "invert(1)",
    "contrast(1.5)",
    "drop-shadow(0 0 5px #000)",
  ],
  "backdrop-filter": [
    "none",
    "blur(4px)",
    "blur(8px)",
    "blur(16px)",
    "blur(24px)",
    "blur(8px) brightness(0.7)",
    "blur(120px) brightness(0.2)",
  ],
  "box-shadow": [
    "none",
    "0 0 10px rgba(0,0,0,0.5)",
    "0 4px 8px rgba(0,0,0,0.3)",
    "inset 0 0 10px #000",
  ],
  "text-shadow": [
    "none",
    "0 0 10px #c8aa6e",
    "0 0 5px #000",
    "1px 1px 2px #000",
  ],
  transform: [
    "none",
    "scale(1)",
    "scale(0.8)",
    "scale(1.2)",
    "rotate(0deg)",
    "rotate(90deg)",
    "translateX(0)",
    "translateY(0)",
    "translate(-50%, -50%)",
  ],
  "transform-origin": [
    "center",
    "top",
    "bottom",
    "left",
    "right",
    "top left",
    "top right",
    "bottom left",
    "bottom right",
  ],
  transition: [
    "none",
    "all 0.2s",
    "all 0.3s ease",
    "opacity 0.2s",
    "0.2s",
    "0.3s",
    "0.5s",
  ],
  animation: ["none"],
  "animation-direction": [
    "normal",
    "reverse",
    "alternate",
    "alternate-reverse",
  ],
  "animation-fill-mode": ["none", "forwards", "backwards", "both"],
  "animation-play-state": ["running", "paused"],
  "animation-timing-function": [
    "ease",
    "linear",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "step-start",
    "step-end",
  ],
  cursor: [
    "auto",
    "default",
    "pointer",
    "text",
    "move",
    "not-allowed",
    "grab",
    "crosshair",
    "none",
  ],
  "pointer-events": ["none", "auto", "all"],
  "user-select": ["none", "auto", "text", "all"],
  resize: ["none", "both", "horizontal", "vertical"],
  "-webkit-app-region": ["drag", "no-drag"],
};

let mdnProps = null;
let mdnSyntaxes = null;
const dynamicValueCache = new Map();

// Fetch the raw MDN data asynchronously
async function initMDN() {
  try {
    const [pRes, sRes] = await Promise.all([
      fetch("https://cdn.jsdelivr.net/npm/mdn-data/css/properties.json"),
      fetch("https://cdn.jsdelivr.net/npm/mdn-data/css/syntaxes.json"),
    ]);
    mdnProps = await pRes.json();
    mdnSyntaxes = await sRes.json();
    console.log(
      "[Snooze-CSS] MDN Autocomplete Data Loaded Successfully! (Using dynamic values + fallback)",
    );
  } catch (err) {
    console.warn(
      "[Snooze-CSS] MDN data failed to load. Falling back to offline dictionary.",
      err,
    );
  }
}
initMDN();

// Recursively parses the MDN Syntax Tree & Merges with Fallback
function getValuesForProp(prop) {
  if (dynamicValueCache.has(prop)) return dynamicValueCache.get(prop);

  // Initialize Set with our rock-solid fallback values (League colors, common sizes)
  const values = new Set(FALLBACK_VALUES[prop] || []);

  // If MDN loaded successfully, enrich the Set with dynamic keywords
  if (mdnProps && mdnProps[prop]) {
    function parseSyntax(syntaxStr, depth = 0) {
      if (depth > 10) return;
      const tokens = syntaxStr.split(/[\s|\[\]?+*(){},]+/);
      for (const t of tokens) {
        if (!t) continue;
        if (t.startsWith("<") && t.endsWith(">")) {
          const typeName = t.slice(1, -1);
          if (mdnSyntaxes[typeName]) {
            parseSyntax(mdnSyntaxes[typeName].syntax, depth + 1);
          }
        } else if (/^[a-z-]+$/.test(t)) {
          values.add(t);
        }
      }
    }
    parseSyntax(mdnProps[prop].syntax);
  }

  // Convert Set to Array and cache it forever
  const resultArr = Array.from(values).sort();
  dynamicValueCache.set(prop, resultArr);
  return resultArr;
}

// BUILD RAW TAB
export function buildRawTab(container) {
  container.innerHTML = `
    <div class="ci-raw-header">
      <span class="ci-raw-label">Generated &amp; Custom CSS</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="ci-line-count" id="ci-line-count">0 lines</span>
        <div class="ci-tab-size-wrap" title="Tab display width">
          <span class="ci-raw-label">Tab:</span>
          <button class="ci-tab-size-btn" id="ci-tabsize-down">&#x2212;</button>
          <span id="ci-tabsize-val">${tabSize}</span>
          <button class="ci-tab-size-btn" id="ci-tabsize-up">+</button>
        </div>
        <button class="ci-btn-secondary ci-format-btn" id="ci-btn-format" title="Auto-format CSS">&#x21CC; Format</button>
      </div>
    </div>
    <div style="position:relative;">
      <textarea class="ci-textarea" id="ci-raw-textarea" placeholder="/* CSS will appear here from the Visual Builder */\n/* You can also type or paste CSS directly */" spellcheck="false"></textarea>
      <div id="ci-ac-dropdown" class="ci-ac-dropdown" style="display:none;"></div>
      <div id="ci-scroll-btns" class="ci-scroll-btns">
        <button class="ci-scroll-btn" id="ci-scroll-top"    title="Scroll to top">&#x2191;</button>
        <button class="ci-scroll-btn" id="ci-scroll-bottom" title="Scroll to bottom">&#x2193;</button>
      </div>
    </div>
    <div class="ci-raw-actions">
      <button class="ci-btn-primary" id="ci-btn-apply">&#x26A1; Apply</button>
      <button class="ci-btn-secondary" id="ci-btn-save">&#x1F4BE; Save</button>
      <button class="ci-btn-secondary" id="ci-btn-reload">&#x21BA; Restart Client</button>
      <button class="ci-btn-danger" id="ci-btn-clear">Clear</button>
      <span class="ci-flash" id="ci-flash-raw" style="margin-left:4px;"></span>
    </div>
    <div class="ci-note">
      <span>Apply</span> injects styles immediately. <span>Save</span> persists them. <span>Restart Client</span> verifies clean load.
    </div>
  `;

  textareaEl = container.querySelector("#ci-raw-textarea");
  acDropdown = container.querySelector("#ci-ac-dropdown");
  lineCountEl = container.querySelector("#ci-line-count");
  tabSizeValEl = container.querySelector("#ci-tabsize-val");
  scrollTopBtn = container.querySelector("#ci-scroll-top");
  scrollBottomBtn = container.querySelector("#ci-scroll-bottom");
  flashEl = container.querySelector("#ci-flash-raw");

  textareaEl.style.tabSize = tabSize;

  textareaEl.addEventListener("input", onTextareaInput);
  textareaEl.addEventListener("keydown", onTextareaKeydown);
  textareaEl.addEventListener("blur", () => hideAC());
  textareaEl.addEventListener("scroll", () => {
    hideAC();
    updateScrollBtns();
  });

  // Scroll buttons
  container.querySelector("#ci-scroll-top").addEventListener("click", () => {
    textareaEl.scrollTop = 0;
    updateScrollBtns();
  });
  container.querySelector("#ci-scroll-bottom").addEventListener("click", () => {
    textareaEl.scrollTop = textareaEl.scrollHeight;
    updateScrollBtns();
  });
  updateScrollBtns();

  container
    .querySelector("#ci-tabsize-down")
    .addEventListener("click", () => setTabSize(tabSize - 1));
  container
    .querySelector("#ci-tabsize-up")
    .addEventListener("click", () => setTabSize(tabSize + 1));
  container
    .querySelector("#ci-btn-format")
    .addEventListener("click", formatCSS);

  loadSavedCSS();

  container.querySelector("#ci-btn-apply").addEventListener("click", applyCSS);
  container.querySelector("#ci-btn-save").addEventListener("click", saveCSS);
  container
    .querySelector("#ci-btn-reload")
    .addEventListener("click", restartClient);
  container.querySelector("#ci-btn-clear").addEventListener("click", clearCSS);
}

function setTabSize(n) {
  tabSize = Math.max(1, Math.min(8, n));
  if (textareaEl) textareaEl.style.tabSize = tabSize;
  if (tabSizeValEl) tabSizeValEl.textContent = tabSize;
  Storage.set("Snooze-CSS-tabsize", tabSize);
}

// SCROLL BUTTONS
// Smart: at top → ↓ only. At bottom → ↑ only. Middle → both.
function updateScrollBtns() {
  if (!textareaEl || !scrollTopBtn || !scrollBottomBtn) return;
  const atTop = textareaEl.scrollTop <= 2;
  const atBottom =
    textareaEl.scrollTop + textareaEl.clientHeight >=
    textareaEl.scrollHeight - 2;
  scrollTopBtn.style.display = atTop ? "none" : "flex";
  scrollBottomBtn.style.display = atBottom ? "none" : "flex";
}

// KEYBOARD HANDLING & AUTO-INDENTATION
function onTextareaKeydown(e) {
  // Autocomplete navigation takes priority
  if (acDropdown && acDropdown.style.display !== "none") {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      acMoveFocus(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      acMoveFocus(-1);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      const active = acDropdown.querySelector(".ci-ac-item.active");
      if (active) {
        e.preventDefault();
        acConfirm();
        return;
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      hideAC();
      return;
    }
  }

  // Indent on Enter
  if (e.key === "Enter") {
    e.preventDefault();
    const start = textareaEl.selectionStart;
    const end = textareaEl.selectionEnd;
    const text = textareaEl.value;

    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const lineText = text.substring(lineStart, start);

    const match = lineText.match(/^[\t ]*/);
    let indent = match ? match[0] : "";
    let extraStr = "";

    if (lineText.trim().endsWith("{")) {
      indent += "\t";
      if (text.charAt(end) === "}") {
        const outdent = match ? match[0] : "";
        extraStr = "\n" + outdent;
      }
    }

    const insertStr = "\n" + indent + extraStr;
    textareaEl.value =
      text.substring(0, start) + insertStr + text.substring(end);

    const newPos = start + 1 + indent.length;
    textareaEl.selectionStart = textareaEl.selectionEnd = newPos;

    updateLineCount();
    hideAC();
    return;
  }

  // Tab inserts \t at cursor
  if (e.key === "Tab") {
    e.preventDefault();
    const start = textareaEl.selectionStart;
    const end = textareaEl.selectionEnd;
    textareaEl.value =
      textareaEl.value.substring(0, start) +
      "\t" +
      textareaEl.value.substring(end);
    textareaEl.selectionStart = textareaEl.selectionEnd = start + 1;
    updateLineCount();
  }
}

// AUTOCOMPLETE TRIGGER
function onTextareaInput() {
  updateLineCount();
  clearTimeout(acDebounce);
  acDebounce = setTimeout(runAC, 60);
}

function runAC() {
  if (!textareaEl) return;
  const pos = textareaEl.selectionStart;
  const text = textareaEl.value;
  const context = getACContext(text, pos);
  if (!context) {
    hideAC();
    return;
  }

  const { type, query, insertStart, insertEnd } = context;
  let candidates;

  if (type === "prop") {
    if (!query) {
      hideAC();
      return;
    }
    candidates = CSS_PROPS.filter((p) => p.startsWith(query)).slice(0, 12);
  } else {
    // Merged dictionary call!
    const values = getValuesForProp(context.prop) || [];
    candidates = query
      ? values.filter((v) => v.startsWith(query)).slice(0, 12)
      : values.slice(0, 12);
  }

  if (
    !candidates.length ||
    (candidates.length === 1 && candidates[0] === query)
  ) {
    hideAC();
    return;
  }

  showAC(candidates, query, insertStart, insertEnd, type);
}

function getACContext(text, pos) {
  const lastOpen = text.lastIndexOf("{", pos - 1);
  const lastClose = text.lastIndexOf("}", pos - 1);
  if (lastOpen === -1 || lastOpen < lastClose) return null;

  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const lineText = text.substring(lineStart, pos);
  const colonIdx = lineText.lastIndexOf(":");

  if (colonIdx === -1) {
    const propQuery = lineText.replace(/^\s+/, "");
    if (/[{};]/.test(propQuery)) return null;
    return {
      type: "prop",
      query: propQuery,
      insertStart: lineStart + lineText.length - propQuery.length,
      insertEnd: lineStart + lineText.length,
    };
  } else {
    const propRaw = lineText.substring(0, colonIdx).replace(/^\s+/, "").trim();
    const afterColon = lineText.substring(colonIdx + 1);
    const valueRaw = afterColon.replace(/^\s+/, "");
    if (valueRaw.includes(";")) return null;
    return {
      type: "value",
      prop: propRaw,
      query: valueRaw,
      insertStart:
        lineStart + colonIdx + 1 + (afterColon.length - valueRaw.length),
      insertEnd: lineStart + lineText.length,
    };
  }
}

// AUTOCOMPLETE UI
function showAC(items, query, insertStart, insertEnd, type) {
  acDropdown.innerHTML = "";
  items.forEach((item, i) => {
    const el = document.createElement("div");
    el.className = "ci-ac-item" + (i === 0 ? " active" : "");
    el.dataset.value = item;
    el.dataset.type = type;
    el.dataset.insertStart = insertStart;
    el.dataset.insertEnd = insertEnd;

    const matchLen = query ? query.length : 0;
    el.innerHTML = matchLen
      ? '<span class="ci-ac-match">' +
        escHtml(item.substring(0, matchLen)) +
        "</span>" +
        escHtml(item.substring(matchLen))
      : escHtml(item);

    const badge = document.createElement("span");
    badge.className = "ci-ac-badge";
    badge.textContent = type === "prop" ? "prop" : "val";
    el.appendChild(badge);

    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      acConfirmItem(el);
    });
    acDropdown.appendChild(el);
  });

  acDropdown.style.display = "block";
  acDropdown.style.top = textareaEl.offsetTop + textareaEl.offsetHeight + "px";
  acDropdown.style.left = textareaEl.offsetLeft + "px";
  acDropdown.style.width = textareaEl.offsetWidth + "px";
}

function hideAC() {
  if (acDropdown) acDropdown.style.display = "none";
}

function acMoveFocus(dir) {
  const items = [...acDropdown.querySelectorAll(".ci-ac-item")];
  const cur = acDropdown.querySelector(".ci-ac-item.active");
  const idx = items.indexOf(cur);
  const next = items[Math.max(0, Math.min(items.length - 1, idx + dir))];
  if (cur) cur.classList.remove("active");
  if (next) {
    next.classList.add("active");
    next.scrollIntoView({ block: "nearest" });
  }
}

function acConfirm() {
  const active = acDropdown.querySelector(".ci-ac-item.active");
  if (active) acConfirmItem(active);
}

function acConfirmItem(el) {
  const value = el.dataset.value;
  const type = el.dataset.type; // <--- Retrieve type
  const insertStart = parseInt(el.dataset.insertStart);
  const insertEnd = parseInt(el.dataset.insertEnd);

  // Smart Append: Add ": " for properties
  let finalValue = value;
  if (type === "prop") {
    finalValue += ": ";
  }

  textareaEl.value =
    textareaEl.value.substring(0, insertStart) +
    finalValue +
    textareaEl.value.substring(insertEnd);
  const newPos = insertStart + finalValue.length;

  textareaEl.selectionStart = textareaEl.selectionEnd = newPos;
  hideAC();
  updateLineCount();
  textareaEl.focus();

  // If we just added a property (and thus a colon), immediately trigger autocomplete again
  // so the we see the values list right away
  if (type === "prop") {
    setTimeout(runAC, 10);
  }
}

function formatCSS() {
  if (!textareaEl) return;
  textareaEl.value = serializeMapToCss(parseCssToMap(textareaEl.value));
  updateLineCount();
}

// CSS UPDATER
export function setCssProperty(selector, prop, value) {
  if (!textareaEl) return;
  textareaEl.value = updateCssString(textareaEl.value, selector, {
    [prop]: value + " !important",
  });
  updateLineCount();
}

export function setCssBatch(selector, propsObj) {
  if (!textareaEl) return;
  const batch = {};
  for (const [prop, val] of Object.entries(propsObj)) {
    batch[prop] = val + " !important";
  }
  textareaEl.value = updateCssString(textareaEl.value, selector, batch);
  updateLineCount();
}

export function scrollRawToBottom() {
  if (!textareaEl) return;
  textareaEl.scrollTop = textareaEl.scrollHeight;
  updateScrollBtns();
}

export function appendToRaw(snippet) {
  if (!textareaEl) return;
  if (textareaEl.value && !textareaEl.value.endsWith("\n"))
    textareaEl.value += "\n";
  textareaEl.value += snippet + "\n";
  updateLineCount();
  updateScrollBtns();
}

// STANDARD ACTIONS
function updateLineCount() {
  if (!textareaEl || !lineCountEl) return;
  const lines = textareaEl.value ? textareaEl.value.split("\n").length : 0;
  lineCountEl.textContent = lines + " line" + (lines !== 1 ? "s" : "");
}

function flash(msg, color = "#4caf82") {
  if (!flashEl) return;
  flashEl.textContent = msg;
  flashEl.style.color = color;
  flashEl.classList.add("show");
  setTimeout(() => flashEl.classList.remove("show"), 2000);
}

function applyCSS() {
  if (!textareaEl) return;
  const css = resolveAssetUrls(textareaEl.value.trim());
  applyCSSToAllRoots(css);
  flash("Applied ✓");
}

async function saveCSS() {
  if (!textareaEl) return;
  const ok = await Storage.set("Snooze-CSS-css", textareaEl.value.trim());
  if (ok) flash("Saved ✓");
  else flash("Save failed ✗", "#c84b4b");
}

async function loadSavedCSS() {
  const savedTab = await Storage.get("Snooze-CSS-tabsize", null);
  if (savedTab !== null) {
    tabSize = parseInt(savedTab);
    if (textareaEl) textareaEl.style.tabSize = tabSize;
    if (tabSizeValEl) tabSizeValEl.textContent = tabSize;
  }

  const saved = await Storage.get("Snooze-CSS-css", null);
  if (saved !== null && textareaEl) {
    textareaEl.value = saved;
    updateLineCount();
    updateScrollBtns();
  }
}

async function restartClient() {
  try {
    await fetch("/riotclient/kill-and-restart-ux", { method: "POST" });
  } catch (err) {
    console.error("[Snooze-CSS] Restart failed:", err);
    flash("Restart failed ✗", "#c84b4b");
  }
}

function clearCSS() {
  if (!textareaEl) return;
  textareaEl.value = "";
  updateLineCount();
  applyCSSToAllRoots("");
  flash("Cleared", "#785a28");
}
