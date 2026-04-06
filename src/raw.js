import { resolveAssetUrls } from "./resolver.js";
import {
  Storage,
  getProfiles,
  saveProfiles,
  createProfile,
  exportProfile,
  importProfile,
} from "./storage.js";
import { escHtml, customConfirm } from "./utils.js";
import { updateCssString, parseCssToMap, serializeMapToCss } from "./css-parser.js";
import { switchTab, getBackdrop, getModalEl } from "./modal.js";
import { applyCSSToAllRoots } from "./shadow-manager.js";

export function sendToRaw(snippet = null) {
  if (snippet) appendToRaw(snippet);
  switchTab("raw");
  scrollRawToBottom();
}

// Update single CSS property in raw textarea
export function setCssProperty(selector, prop, val) {
  if (!textareaEl) return;
  const valStr = String(val).trim();
  const finalVal = (valStr && !valStr.toLowerCase().includes("!important"))
    ? `${valStr} !important`
    : valStr;
  textareaEl.value = updateCssString(textareaEl.value, selector, { [prop]: finalVal });
  updateLineCount();
  updateScrollBtns();
}

export function setCssBatch(selector, propsObj) {
  if (!textareaEl) return;
  const importantProps = {};
  for (const [p, v] of Object.entries(propsObj)) {
    const valStr = String(v).trim();
    importantProps[p] = (valStr && !valStr.toLowerCase().includes("!important"))
      ? `${valStr} !important`
      : valStr;
  }
  textareaEl.value = updateCssString(textareaEl.value, selector, importantProps);
  updateLineCount();
  updateScrollBtns();
}

export function replaceOrAppendBlock(snippet, startMarker, endMarker) {
  if (!textareaEl) return;
  const val = textareaEl.value;
  const startIdx = val.indexOf(startMarker);
  if (startIdx !== -1) {
    const endIdx = val.indexOf(endMarker, startIdx);
    if (endIdx !== -1) {
      textareaEl.value =
        val.substring(0, startIdx) +
        snippet +
        val.substring(endIdx + endMarker.length);
      updateLineCount();
      updateScrollBtns();
      switchTab("raw");
      scrollRawToBottom();
      return;
    }
  }
  sendToRaw(snippet);
}

let textareaEl = null;
let tabSize = 2;
let acDropdown = null;
let acDebounce = null;
let _acContext = null;
let lineCountEl = null;
let tabSizeValEl = null;
let scrollTopBtn = null;
let scrollBottomBtn = null;
let flashEl = null;

let _profilesData = null;
let _profilePanelEl = null;
let _profilePanelOpen = false;

const CSS_PROPS = Array.from(window.getComputedStyle(document.documentElement))
  .filter(p => !p.startsWith("-webkit-") || p === "-webkit-mask" || p === "-webkit-app-region")
  .sort();

const FALLBACK_VALUES = {
  display: ["none", "block", "flex", "grid", "inline", "inline-block", "inline-flex", "contents"],
  position: ["static", "relative", "absolute", "fixed", "sticky"],
  visibility: ["visible", "hidden", "collapse"],
  "box-sizing": ["border-box", "content-box"],
  overflow: ["visible", "hidden", "scroll", "auto", "overlay"],
  width: ["auto", "100%", "max-content", "min-content", "fit-content"],
  height: ["auto", "100%", "max-content", "min-content", "fit-content"],
  "flex-direction": ["row", "row-reverse", "column", "column-reverse"],
  "justify-content": ["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"],
  "align-items": ["flex-start", "flex-end", "center", "stretch", "baseline"],
  color: ["transparent", "currentColor", "#c8aa6e", "#f0e6d3", "#000", "#fff"],
  "background-color": ["transparent", "#060e1a", "#0a1428", "#c8aa6e", "#000"],
  "background-size": ["cover", "contain", "auto", "100%"],
  cursor: ["auto", "default", "pointer", "text", "move", "not-allowed", "grab"],
  "pointer-events": ["none", "auto"],
  "user-select": ["none", "auto", "text"],
};

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
        <button class="ci-btn-secondary ci-profiles-btn" id="ci-btn-profiles" title="Manage CSS profiles">&#x2630; Profiles</button>
      </div>
    </div>
    <div style="position:relative;display:flex;flex:1;">
      <div style="flex:1;position:relative;min-width:0;">
        <textarea class="ci-textarea" id="ci-raw-textarea" placeholder="/* CSS will appear here from the Visual Builder */" spellcheck="false" wrap="off"></textarea>
        <div id="ci-ac-dropdown" class="ci-ac-dropdown" style="display:none;"></div>
        <div id="ci-scroll-btns" class="ci-scroll-btns">
          <button class="ci-scroll-btn" id="ci-scroll-top" title="Scroll to top">&#x2191;</button>
          <button class="ci-scroll-btn" id="ci-scroll-bottom" title="Scroll to bottom">&#x2193;</button>
        </div>
      </div>
    </div>
    <div class="ci-raw-actions">
      <button class="ci-btn-primary" id="ci-btn-apply">Apply</button>
      <button class="ci-btn-secondary" id="ci-btn-save">Save</button>
      <button class="ci-btn-secondary" id="ci-btn-reload">&#x21BA; Restart Client</button>
      <button class="ci-btn-danger" id="ci-btn-clear">Clear</button>
      <span class="ci-flash" id="ci-flash-raw" style="margin-left:4px;"></span>
    </div>
  `;

  textareaEl = container.querySelector("#ci-raw-textarea");
  acDropdown = container.querySelector("#ci-ac-dropdown");
  lineCountEl = container.querySelector("#ci-line-count");
  tabSizeValEl = container.querySelector("#ci-tabsize-val");
  scrollTopBtn = container.querySelector("#ci-scroll-top");
  scrollBottomBtn = container.querySelector("#ci-scroll-bottom");
  flashEl = container.querySelector("#ci-flash-raw");

  textareaEl.addEventListener("input", onTextareaInput);
  textareaEl.addEventListener("keydown", onTextareaKeydown);
  textareaEl.addEventListener("blur", () => hideAC());
  textareaEl.addEventListener("scroll", updateScrollBtns);

  container.querySelector("#ci-scroll-top").addEventListener("click", () => { textareaEl.scrollTop = 0; updateScrollBtns(); });
  container.querySelector("#ci-scroll-bottom").addEventListener("click", () => { textareaEl.scrollTop = textareaEl.scrollHeight; updateScrollBtns(); });
  container.querySelector("#ci-tabsize-down").addEventListener("click", () => setTabSize(tabSize - 1));
  container.querySelector("#ci-tabsize-up").addEventListener("click", () => setTabSize(tabSize + 1));
  container.querySelector("#ci-btn-format").addEventListener("click", formatCSS);
  container.querySelector("#ci-btn-profiles").addEventListener("click", toggleProfilesPanel);

  loadSavedCSS();
  container.querySelector("#ci-btn-apply").addEventListener("click", applyCSS);
  container.querySelector("#ci-btn-save").addEventListener("click", saveCSS);
  container.querySelector("#ci-btn-reload").addEventListener("click", restartClient);
  container.querySelector("#ci-btn-clear").addEventListener("click", clearCSS);
}

function setTabSize(n) {
  tabSize = Math.max(1, Math.min(8, n));
  if (textareaEl) textareaEl.style.tabSize = tabSize;
  if (tabSizeValEl) tabSizeValEl.textContent = tabSize;
  Storage.set("Snooze-CSS-tabsize", tabSize);
}

function updateScrollBtns() {
  if (!textareaEl) return;
  const atTop = textareaEl.scrollTop <= 2;
  const atBottom = textareaEl.scrollTop + textareaEl.clientHeight >= textareaEl.scrollHeight - 2;
  scrollTopBtn.style.display = atTop ? "none" : "flex";
  scrollBottomBtn.style.display = atBottom ? "none" : "flex";
}

function insertAtCursor(text, deleteCount = 0) {
  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;
  textareaEl.focus();
  textareaEl.setSelectionRange(start - deleteCount, end);
  if (!document.execCommand("insertText", false, text)) {
    const val = textareaEl.value;
    const newCursorPos = start - deleteCount + text.length;
    textareaEl.value = val.substring(0, start - deleteCount) + text + val.substring(end);
    textareaEl.selectionStart = textareaEl.selectionEnd = newCursorPos;
  }
}

function onTextareaKeydown(e) {
  if (acDropdown?.style.display === "block") {
    if (e.key === "ArrowDown") { e.preventDefault(); acMoveFocus(1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); acMoveFocus(-1); return; }
    if (e.key === "Enter" || e.key === "Tab") { 
      const active = acDropdown.querySelector(".ci-ac-item.active");
      if (active) { e.preventDefault(); acConfirm(); return; }
    }
    if (e.key === "Escape") { e.preventDefault(); hideAC(); return; }
  }

  if (e.key === "Enter") {
    const start = textareaEl.selectionStart;
    const val = textareaEl.value;
    const lineStart = val.lastIndexOf("\n", start - 1) + 1;
    const lineText = val.substring(lineStart, start);
    const indentMatch = lineText.match(/^\t+/);
    let indent = indentMatch ? indentMatch[0] : "";
    if (lineText.trim().endsWith("{")) indent += "\t";
    
    // If the next char is "}", add an extra newline for the closing brace
    let extra = "";
    if (val[start] === "}") extra = "\n" + indent.substring(0, Math.max(0, indent.length - 1));

    e.preventDefault();
    insertAtCursor("\n" + indent + extra);
    if (extra) textareaEl.setSelectionRange(start + indent.length + 1, start + indent.length + 1);
  } else if (e.key === "Tab") {
    e.preventDefault();
    insertAtCursor("\t");
  }
}

function onTextareaInput() {
  updateLineCount();
  clearTimeout(acDebounce);
  acDebounce = setTimeout(runAC, 100);
}

function runAC() {
  const pos = textareaEl.selectionStart;
  const text = textareaEl.value;
  const context = getACContext(text, pos);
  if (!context) { hideAC(); return; }

  const candidates = context.type === "prop" 
    ? CSS_PROPS.filter(p => context.query && p.startsWith(context.query)).slice(0, 15)
    : (FALLBACK_VALUES[context.prop] || []).filter(v => v.startsWith(context.query)).slice(0, 15);

  if (!candidates.length || (candidates.length === 1 && candidates[0] === context.query)) { hideAC(); return; }
  _acContext = context; 
  showAC(candidates, context);
}

function getACContext(text, pos) {
  const lastOpen = text.lastIndexOf("{", pos - 1);
  const lastClose = text.lastIndexOf("}", pos - 1);
  if (lastOpen === -1 || lastOpen < lastClose) return null;

  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const lineText = text.substring(lineStart, pos);
  const colon = lineText.lastIndexOf(":");
  
  if (colon === -1) {
    const q = lineText.trim();
    if (q.includes(";") || q.includes("}")) return null;
    return { type: "prop", query: q, start: lineStart + lineText.indexOf(q), end: pos };
  } else {
    const prop = lineText.substring(0, colon).trim();
    const q = lineText.substring(colon + 1).trim();
    if (q.includes(";")) return null;
    return { type: "val", prop, query: q, start: lineStart + colon + 1 + lineText.substring(colon + 1).indexOf(q), end: pos };
  }
}

function showAC(items, ctx) {
  acDropdown.innerHTML = "";
  items.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "ci-ac-item" + (i === 0 ? " active" : "");
    div.dataset.val = item;
    div.innerHTML = `<span>${item}</span><small>${ctx.type}</small>`;
    div.addEventListener("mousedown", e => { e.preventDefault(); acConfirmItem(item, ctx); });
    acDropdown.appendChild(div);
  });
  acDropdown.style.display = "block";
  acDropdown.style.top = "40px";
  acDropdown.style.left = "40px";
}

function acConfirmItem(val, ctx) {
  insertAtCursor(val + (ctx.type === "prop" ? ": " : ""), ctx.end - ctx.start);
  hideAC();
}

function hideAC() { acDropdown.style.display = "none"; _acContext = null; }

function acConfirm() {
  if (!_acContext) return;
  const active = acDropdown.querySelector(".ci-ac-item.active");
  if (active) {
    acConfirmItem(active.dataset.val, _acContext);
  }
}

function acMoveFocus(dir) {
  const items = [...acDropdown.querySelectorAll(".ci-ac-item")];
  const cur = acDropdown.querySelector(".ci-ac-item.active");
  const idx = items.indexOf(cur);
  const next = items[Math.max(0, Math.min(items.length - 1, idx + dir))];
  if (cur) cur.classList.remove("active");
  if (next) next.classList.add("active");
}

function formatCSS() {
  if (!textareaEl) return;
  const nodes = parseCssToNodes(textareaEl.value);
  textareaEl.value = serializeNodesToCss(nodes);
  updateLineCount();
  flash("Formatted");
}

function updateLineCount() {
  const lines = textareaEl.value ? textareaEl.value.split("\n").length : 0;
  lineCountEl.textContent = `${lines} line${lines !== 1 ? 's' : ''}`;
}

function flash(msg, color = "#4caf82") {
  flashEl.textContent = msg;
  flashEl.style.color = color;
  flashEl.classList.add("show");
  setTimeout(() => flashEl.classList.remove("show"), 2000);
}

function applyCSS() {
  applyCSSToAllRoots(resolveAssetUrls(textareaEl.value.trim()));
}

async function saveCSS() {
  const active = _profilesData?.profiles.find(p => p.id === _profilesData.activeId);
  if (active) active.css = textareaEl.value;
  await saveProfiles(_profilesData);
}

async function loadSavedCSS() {
  const tab = await Storage.get("Snooze-CSS-tabsize", 2);
  setTabSize(parseInt(tab));
  _profilesData = await getProfiles();
  const active = _profilesData.profiles.find(p => p.id === _profilesData.activeId);
  if (active) { textareaEl.value = active.css; updateLineCount(); }
}

async function restartClient() {
  await fetch("/riotclient/kill-and-restart-ux", { method: "POST" });
}

function clearCSS() {
  textareaEl.value = "";
  updateLineCount();
  applyCSSToAllRoots("");
}

function toggleProfilesPanel() {
  _profilePanelOpen = !_profilePanelOpen;
  if (_profilePanelOpen) showProfilesPanel();
  else hideProfilesPanel();
}

function showProfilesPanel() {
  const modal = getModalEl();
  if (!modal) return;

  if (!_profilePanelEl) {
    _profilePanelEl = document.createElement("div");
    _profilePanelEl.className = "ci-profiles-panel-float";
    modal.appendChild(_profilePanelEl);
  }

  _profilePanelEl.style.display = "flex";
  renderProfilesList();
}

function hideProfilesPanel() {
  if (_profilePanelEl) _profilePanelEl.style.display = "none";
}

function renderProfilesList() {
  _profilePanelEl.innerHTML = `
    <div class="ci-pp-header">
      <span class="ci-pp-title">Profiles</span>
      <button class="ci-pp-close" title="Close Sidecar">&#x2715;</button>
    </div>
    <div class="ci-pp-list"></div>
    <div class="ci-pp-footer">
      <button class="ci-pp-action-btn" id="ci-pp-add">+ New</button>
      <button class="ci-pp-action-btn" id="ci-pp-import">Import</button>
    </div>
  `;

  _profilePanelEl.querySelector(".ci-pp-close").onclick = () => { 
    _profilePanelOpen = false; 
    hideProfilesPanel(); 
  };
  
  _profilePanelEl.querySelector("#ci-pp-add").onclick = async () => { 
    createProfile(_profilesData, "New Profile"); 
    await saveProfiles(_profilesData); 
    renderProfilesList(); 
  };
  
  _profilePanelEl.querySelector("#ci-pp-import").onclick = async () => { 
    if (await importProfile(_profilesData)) { 
      await saveProfiles(_profilesData); 
      renderProfilesList(); 
    } 
  };

  const list = _profilePanelEl.querySelector(".ci-pp-list");
  _profilesData.profiles.forEach(p => {
    const isActive = p.id === _profilesData.activeId;
    const row = document.createElement("div");
    row.className = "ci-pp-row" + (isActive ? " ci-pp-row--active" : "");
    
    row.innerHTML = `
      <div class="ci-pp-row-main">
        <span class="ci-pp-indicator">${isActive ? "&#x25CF;" : ""}</span>
        <input class="ci-pp-name" value="${escHtml(p.name)}" spellcheck="false">
        <span class="ci-pp-meta">${p.css ? p.css.split("\n").length : 0}L</span>
      </div>
      <div class="ci-pp-row-actions">
        ${!isActive ? `<button class="ci-pp-btn ci-pp-btn--activate">Activate</button>` : ""}
        <button class="ci-pp-btn ci-pp-btn--export" title="Export to .css">Export</button>
        <button class="ci-pp-btn ci-pp-btn--delete" title="Delete Profile">✕</button>
      </div>
    `;
    
    const nameInput = row.querySelector(".ci-pp-name");
    nameInput.onchange = e => { p.name = e.target.value; saveProfiles(_profilesData); };
    
    if (!isActive) {
      row.querySelector(".ci-pp-btn--activate").onclick = async () => {
        // Update the active ID only
        _profilesData.activeId = p.id;
        
        // Load the CSS from the NEW profile into the textarea
        textareaEl.value = p.css || "";
        
        // Updates which ID is 'active'
        await saveProfiles(_profilesData);
        
        updateLineCount();
        applyCSS();
        renderProfilesList();
      };
    }

    row.querySelector(".ci-pp-btn--export").onclick = () => exportProfile(p);
    
    row.querySelector(".ci-pp-btn--delete").onclick = () => {
      if (_profilesData.profiles.length > 1) {
        customConfirm(_profilePanelEl, `Delete "${p.name}"?`, async () => {
          _profilesData.profiles = _profilesData.profiles.filter(x => x.id !== p.id);
          if (isActive) { 
            _profilesData.activeId = _profilesData.profiles[0].id; 
            textareaEl.value = _profilesData.profiles[0].css; 
            applyCSS(); 
          }
          await saveProfiles(_profilesData);
          renderProfilesList();
        });
      }
    };
    
    list.appendChild(row);
  });
}

export function scrollRawToBottom() { if (textareaEl) textareaEl.scrollTop = textareaEl.scrollHeight; }
export function appendToRaw(snippet) { if (textareaEl) { textareaEl.value += (textareaEl.value && !textareaEl.value.endsWith("\n") ? "\n" : "") + snippet + "\n"; updateLineCount(); } }
export function cleanupRawTab() {
  textareaEl = null;
  acDropdown = null;
  lineCountEl = null;
  tabSizeValEl = null;
  scrollTopBtn = null;
  scrollBottomBtn = null;
  flashEl = null;

  _profilePanelEl = null;
  _profilePanelOpen = false; // Also reset the state flag
}
