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
import {
  updateCssString,
  parseCssToNodes,
  serializeNodesToCss,
  parseCssToMap,
  serializeMapToCss,
  beautifyCSS,
} from "./css-parser.js";
import { switchTab, getBackdrop, getModalEl, getModalDocument } from "./modal.js";
import { applyCSSToAllRoots } from "./shadow-manager.js";
import { getSettings } from "./settings.js";


export function sendToRaw(snippet = null) {
  if (snippet) appendToRaw(snippet);
  switchTab("raw");
  scrollRawToBottom();
}

// Update single CSS property in raw textarea
export function setCssProperty(selector, prop, val) {
  if (!textareaEl) return;
  const valStr = String(val).trim();
  const finalVal =
    valStr && !valStr.toLowerCase().includes("!important")
      ? `${valStr} !important`
      : valStr;
  textareaEl.value = updateCssString(textareaEl.value, selector, {
    [prop]: finalVal,
  });
  markUnsaved();
  refreshRawTextMetrics();
}

export function setCssBatch(selector, propsObj) {
  if (!textareaEl) return;
  const importantProps = {};
  for (const [p, v] of Object.entries(propsObj)) {
    const valStr = String(v).trim();
    importantProps[p] =
      valStr && !valStr.toLowerCase().includes("!important")
        ? `${valStr} !important`
        : valStr;
  }
  textareaEl.value = updateCssString(
    textareaEl.value,
    selector,
    importantProps,
  );
  markUnsaved();
  refreshRawTextMetrics();
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
      markUnsaved();
      refreshRawTextMetrics();
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
let editorStackEl = null;
let searchBarEl = null;
let searchInputEl = null;
let searchCountEl = null;
let searchPrevBtn = null;
let searchNextBtn = null;
let searchCloseBtn = null;
let searchCaseBtn = null;
let searchRegexBtn = null;
let replaceInputEl = null;
let replaceBtn = null;
let replaceAllBtn = null;
let searchHighlightsEl = null;
let rawResizeObserver = null;

let _profilesData = null;
let _profilePanelEl = null;
let _profilePanelOpen = false;

let ideSocket = null;
const SEARCH_MAX_MATCHES = 100000;
const SEARCH_VISIBLE_LINE_BUFFER = 4;
let searchOpen = false;
let searchCaseSensitive = false;
let searchRegexEnabled = false;
let searchQuery = "";
let searchMatches = [];
let searchMatchEnds = [];
let searchActiveIndex = -1;
let searchHitLimitReached = false;
let searchError = "";
let searchLineStarts = [0];
let searchCachedText = "";
let searchRaf = 0;
let searchNeedsMatchRefresh = false;

const CSS_PROPS = Array.from(window.getComputedStyle(document.documentElement))
  .filter(
    (p) =>
      !p.startsWith("-webkit-") ||
      p === "-webkit-mask" ||
      p === "-webkit-app-region",
  )
  .sort();

const FALLBACK_VALUES = {
  display: [
    "none",
    "block",
    "flex",
    "grid",
    "inline",
    "inline-block",
    "inline-flex",
    "contents",
  ],
  position: ["static", "relative", "absolute", "fixed", "sticky"],
  visibility: ["visible", "hidden", "collapse"],
  "box-sizing": ["border-box", "content-box"],
  overflow: ["visible", "hidden", "scroll", "auto", "overlay"],
  width: ["auto", "100%", "max-content", "min-content", "fit-content"],
  height: ["auto", "100%", "max-content", "min-content", "fit-content"],
  "flex-direction": ["row", "row-reverse", "column", "column-reverse"],
  "justify-content": [
    "flex-start",
    "flex-end",
    "center",
    "space-between",
    "space-around",
    "space-evenly",
  ],
  "align-items": ["flex-start", "flex-end", "center", "stretch", "baseline"],
  color: ["transparent", "currentColor", "#c8aa6e", "#f0e6d3", "#000", "#fff"],
  "background-color": ["transparent", "#060e1a", "#0a1428", "#c8aa6e", "#000"],
  "background-size": ["cover", "contain", "auto", "100%"],
  cursor: ["auto", "default", "pointer", "text", "move", "not-allowed", "grab"],
  "pointer-events": ["none", "auto"],
  "user-select": ["none", "auto", "text"],
};

let _hasUnsavedEdits = false;
let _hasUnappliedEdits = false;
let saveBtnEl = null;
let applyBtnEl = null;

function updateSaveStateUI() {
  if (!saveBtnEl || !applyBtnEl) return;
  if (_hasUnsavedEdits) {
    saveBtnEl.textContent = "Save *";
    saveBtnEl.style.color = "#c8aa6e";
  } else {
    saveBtnEl.textContent = "Saved";
    saveBtnEl.style.color = "";
  }
  
  if (_hasUnappliedEdits) {
    applyBtnEl.textContent = "Apply *";
    applyBtnEl.style.color = "#c8aa6e";
  } else {
    applyBtnEl.textContent = "Applied";
    applyBtnEl.style.color = "";
  }
}

function markUnsaved() {
  _hasUnsavedEdits = true;
  _hasUnappliedEdits = true;
  updateSaveStateUI();
}

export function buildRawTab(container) {
  container.innerHTML = `
    <div class="ci-raw-header" style="flex-shrink: 0;">
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
    <div style="position:relative;display:flex;flex:1 1 auto;min-height:120px;flex-direction:column;margin-bottom:12px;">
      <div class="ci-raw-editor-shell" style="flex:1 1 auto;position:relative;min-width:0;display:flex;flex-direction:column;">
        <div class="ci-raw-find" id="ci-raw-find" hidden>
          <div class="ci-raw-find-row">
            <input class="ci-raw-find-input" id="ci-raw-find-input" placeholder="Search CSS" spellcheck="false" autocomplete="off">
            <span class="ci-raw-find-count" id="ci-raw-find-count">0/0</span>
            <button class="ci-raw-find-tool" id="ci-raw-find-case" title="Match case">Aa</button>
            <button class="ci-raw-find-tool" id="ci-raw-find-regex" title="Use regular expression">.*</button>
            <button class="ci-raw-find-tool" id="ci-raw-find-prev" title="Previous match">&#x2191;</button>
            <button class="ci-raw-find-tool" id="ci-raw-find-next" title="Next match">&#x2193;</button>
            <button class="ci-raw-find-close" id="ci-raw-find-close" title="Close search">&#x2715;</button>
          </div>
          <div class="ci-raw-find-row ci-raw-replace-row">
            <input class="ci-raw-find-input ci-raw-replace-input" id="ci-raw-replace-input" placeholder="Replace" spellcheck="false" autocomplete="off">
            <button class="ci-raw-find-action" id="ci-raw-replace-one" title="Replace current match">Replace</button>
            <button class="ci-raw-find-action" id="ci-raw-replace-all" title="Replace all matches">All</button>
          </div>
        </div>
        <div class="ci-textarea-stack" id="ci-textarea-stack" style="flex:1 1 auto;display:flex;flex-direction:column;position:relative;">
          <div class="ci-textarea-backdrop" id="ci-search-backdrop" aria-hidden="true" style="flex:1 1 auto;">
            <div class="ci-search-highlights" id="ci-search-highlights"></div>
          </div>
          <textarea class="ci-textarea" id="ci-raw-textarea" placeholder="/* CSS will appear here from the Visual Builder */" spellcheck="false" wrap="off" style="flex:1 1 auto; height:auto; min-height:120px; box-sizing:border-box;"></textarea>
        </div>
        <div id="ci-ac-dropdown" class="ci-ac-dropdown" style="display:none;"></div>
        <div id="ci-scroll-btns" class="ci-scroll-btns">
          <button class="ci-scroll-btn" id="ci-scroll-top" title="Scroll to top">&#x2191;</button>
          <button class="ci-scroll-btn" id="ci-scroll-bottom" title="Scroll to bottom">&#x2193;</button>
        </div>
      </div>
    </div>
    <div class="ci-raw-actions">
      <div class="ci-raw-actions-left">
        <button class="ci-btn-primary" id="ci-btn-apply">Apply</button>
        <button class="ci-btn-secondary" id="ci-btn-save">Save</button>
        <span class="ci-flash" id="ci-flash-raw" style="margin-left:4px;"></span>
      </div>
      <div class="ci-raw-actions-right">
        <button class="ci-btn-secondary" id="ci-btn-reload">&#x21BA; Restart Client</button>
        <button class="ci-btn-danger" id="ci-btn-clear">Clear</button>
      </div>
    </div>`;

  textareaEl = container.querySelector("#ci-raw-textarea");
  editorStackEl = container.querySelector("#ci-textarea-stack");
  searchBarEl = container.querySelector("#ci-raw-find");
  searchInputEl = container.querySelector("#ci-raw-find-input");
  searchCountEl = container.querySelector("#ci-raw-find-count");
  searchPrevBtn = container.querySelector("#ci-raw-find-prev");
  searchNextBtn = container.querySelector("#ci-raw-find-next");
  searchCloseBtn = container.querySelector("#ci-raw-find-close");
  searchCaseBtn = container.querySelector("#ci-raw-find-case");
  searchRegexBtn = container.querySelector("#ci-raw-find-regex");
  replaceInputEl = container.querySelector("#ci-raw-replace-input");
  replaceBtn = container.querySelector("#ci-raw-replace-one");
  replaceAllBtn = container.querySelector("#ci-raw-replace-all");
  searchHighlightsEl = container.querySelector("#ci-search-highlights");
  searchCaseBtn.classList.toggle("active", searchCaseSensitive);
  searchRegexBtn.classList.toggle("active", searchRegexEnabled);
  acDropdown = container.querySelector("#ci-ac-dropdown");
  lineCountEl = container.querySelector("#ci-line-count");
  tabSizeValEl = container.querySelector("#ci-tabsize-val");
  scrollTopBtn = container.querySelector("#ci-scroll-top");
  scrollBottomBtn = container.querySelector("#ci-scroll-bottom");
  flashEl = container.querySelector("#ci-flash-raw");

  saveBtnEl = container.querySelector("#ci-btn-save");
  applyBtnEl = container.querySelector("#ci-btn-apply");

  textareaEl.addEventListener("input", () => {
    markUnsaved();
    onTextareaInput();
  });
  textareaEl.addEventListener("keydown", onTextareaKeydown);
  textareaEl.addEventListener("blur", () => hideAC());
  textareaEl.addEventListener("scroll", () => {
    updateScrollBtns();
    scheduleSearchRender();
  });
  const ResizeObserverCtor = textareaEl.ownerDocument.defaultView?.ResizeObserver || window.ResizeObserver;
  if (ResizeObserverCtor) {
    rawResizeObserver = new ResizeObserverCtor(() => {
      updateScrollBtns();
      scheduleSearchRender();
    });
    rawResizeObserver.observe(textareaEl);
  }
  container.addEventListener("keydown", onRawPanelKeydown, true);
  searchInputEl.addEventListener("input", () => {
    searchQuery = searchInputEl.value;
    scheduleSearchRefresh(true);
  });
  searchInputEl.addEventListener("keydown", onSearchInputKeydown);
  replaceInputEl.addEventListener("keydown", onReplaceInputKeydown);
  searchPrevBtn.addEventListener("click", () => {
    goToSearchMatch(-1);
    searchInputEl.focus();
  });
  searchNextBtn.addEventListener("click", () => {
    goToSearchMatch(1);
    searchInputEl.focus();
  });
  searchCloseBtn.addEventListener("click", closeSearch);
  searchCaseBtn.addEventListener("click", () => {
    searchCaseSensitive = !searchCaseSensitive;
    searchCaseBtn.classList.toggle("active", searchCaseSensitive);
    scheduleSearchRefresh(true);
    searchInputEl.focus();
  });
  searchRegexBtn.addEventListener("click", () => {
    searchRegexEnabled = !searchRegexEnabled;
    searchRegexBtn.classList.toggle("active", searchRegexEnabled);
    scheduleSearchRefresh(true);
    searchInputEl.focus();
  });
  replaceBtn.addEventListener("click", () => replaceCurrentMatch());
  replaceAllBtn.addEventListener("click", () => replaceAllMatches());

  container.querySelector("#ci-scroll-top").addEventListener("click", () => {
    textareaEl.scrollTop = 0;
    updateScrollBtns();
  });
  container.querySelector("#ci-scroll-bottom").addEventListener("click", () => {
    textareaEl.scrollTop = textareaEl.scrollHeight;
    updateScrollBtns();
  });
  container
    .querySelector("#ci-tabsize-down")
    .addEventListener("click", () => setTabSize(tabSize - 1));
  container
    .querySelector("#ci-tabsize-up")
    .addEventListener("click", () => setTabSize(tabSize + 1));
  container
    .querySelector("#ci-btn-format")
    .addEventListener("click", formatCSS);
  container
    .querySelector("#ci-btn-profiles")
    .addEventListener("click", toggleProfilesPanel);

  loadSavedCSS();
  container.querySelector("#ci-btn-apply").addEventListener("click", () => applyCSS(false));
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
  scheduleSearchRender();
}

function updateScrollBtns() {
  if (!textareaEl || !scrollTopBtn || !scrollBottomBtn) return;
  const atTop = textareaEl.scrollTop <= 2;
  const atBottom =
    textareaEl.scrollTop + textareaEl.clientHeight >=
    textareaEl.scrollHeight - 2;
  scrollTopBtn.style.display = atTop ? "none" : "flex";
  scrollBottomBtn.style.display = atBottom ? "none" : "flex";
}

function insertAtCursor(text, deleteCount = 0) {
  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;
  textareaEl.focus();
  textareaEl.setSelectionRange(start - deleteCount, end);
  if (!textareaEl.ownerDocument.execCommand("insertText", false, text)) {
    const val = textareaEl.value;
    const newCursorPos = start - deleteCount + text.length;
    textareaEl.value =
      val.substring(0, start - deleteCount) + text + val.substring(end);
    textareaEl.selectionStart = textareaEl.selectionEnd = newCursorPos;
  }
}

function onTextareaKeydown(e) {
  e.stopPropagation();
  if (acDropdown?.style.display === "block") {
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
    if (val[start] === "}")
      extra = "\n" + indent.substring(0, Math.max(0, indent.length - 1));

    e.preventDefault();
    insertAtCursor("\n" + indent + extra);
    if (extra)
      textareaEl.setSelectionRange(
        start + indent.length + 1,
        start + indent.length + 1,
      );
  } else if (e.key === "Tab") {
    e.preventDefault();
    insertAtCursor("\t");
  }
}

function onTextareaInput() {
  refreshRawTextMetrics();
  clearTimeout(acDebounce);
  acDebounce = setTimeout(runAC, 100);
}

function onRawPanelKeydown(e) {
  const key = e.key.toLowerCase();
  const findShortcut = (e.ctrlKey || e.metaKey) && !e.altKey && key === "f";

  if (findShortcut) {
    e.preventDefault();
    e.stopPropagation();
    openSearch();
    return;
  }

  if (!searchOpen) return;

  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    closeSearch();
    return;
  }

  if (e.key === "F3") {
    e.preventDefault();
    e.stopPropagation();
    goToSearchMatch(e.shiftKey ? -1 : 1);
  }
}

function onSearchInputKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) replaceCurrentMatch();
    else goToSearchMatch(e.shiftKey ? -1 : 1);
  }
}

function onReplaceInputKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) replaceAllMatches();
    else replaceCurrentMatch();
  }
}

function openSearch() {
  if (!textareaEl || !searchBarEl || !searchInputEl) return;
  const selected = textareaEl.value.substring(
    textareaEl.selectionStart,
    textareaEl.selectionEnd,
  );
  const seed = selected && selected.length <= 256 && !selected.includes("\n")
    ? selected
    : "";

  searchOpen = true;
  searchBarEl.hidden = false;
  if (seed) searchInputEl.value = seed;
  searchQuery = searchInputEl.value;
  scheduleSearchRefresh(true);

  requestAnimationFrame(() => {
    if (!searchInputEl) return;
    searchInputEl.focus();
    searchInputEl.select();
  });
}

function closeSearch() {
  searchOpen = false;
  searchQuery = "";
  searchMatches = [];
  searchMatchEnds = [];
  searchActiveIndex = -1;
  searchHitLimitReached = false;
  searchError = "";
  if (searchBarEl) searchBarEl.hidden = true;
  if (editorStackEl) editorStackEl.classList.remove("ci-textarea-stack--searching");
  if (searchHighlightsEl) searchHighlightsEl.textContent = "";
  if (textareaEl) textareaEl.focus();
  updateSearchCount();
}

function scheduleSearchRefresh(refreshMatches = false) {
  if (refreshMatches) searchNeedsMatchRefresh = true;
  if (searchRaf) return;

  searchRaf = requestAnimationFrame(() => {
    searchRaf = 0;
    if (searchNeedsMatchRefresh) {
      searchNeedsMatchRefresh = false;
      updateSearchMatches();
    } else {
      renderSearchHighlights();
    }
  });
}

function scheduleSearchRender() {
  if (!searchOpen || !searchQuery) return;
  scheduleSearchRefresh(false);
}

function refreshRawTextMetrics() {
  updateLineCount();
  updateScrollBtns();
  if (searchOpen && searchQuery) scheduleSearchRefresh(true);
}

function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function ensureSearchTextCache() {
  const text = textareaEl?.value || "";
  if (text !== searchCachedText) {
    searchCachedText = text;
    searchLineStarts = buildLineStarts(text);
  }
  return text;
}

function updateSearchMatches() {
  if (!textareaEl || !searchInputEl) return;
  searchQuery = searchInputEl.value;
  const text = ensureSearchTextCache();
  searchMatches = [];
  searchMatchEnds = [];
  searchActiveIndex = -1;
  searchHitLimitReached = false;
  searchError = "";

  if (searchOpen && searchQuery) {
    if (searchRegexEnabled) {
      collectRegexMatches(text);
    } else {
      collectLiteralMatches(text);
    }

    if (searchMatches.length) {
      const cursor = textareaEl.selectionStart || 0;
      searchActiveIndex = lowerBound(searchMatches, cursor);
      if (searchActiveIndex >= searchMatches.length) searchActiveIndex = 0;
    }
  }

  updateSearchCount();
  renderSearchHighlights();
}

function collectLiteralMatches(text) {
  const needle = searchCaseSensitive ? searchQuery : searchQuery.toLowerCase();
  const haystack = searchCaseSensitive ? text : text.toLowerCase();
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    searchMatches.push(idx);
    searchMatchEnds.push(idx + needle.length);
    if (searchMatches.length >= SEARCH_MAX_MATCHES) {
      searchHitLimitReached = haystack.indexOf(needle, idx + needle.length) !== -1;
      break;
    }
    idx = haystack.indexOf(needle, idx + Math.max(needle.length, 1));
  }
}

function collectRegexMatches(text) {
  const regex = getSearchRegex(true);
  if (!regex) return;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const matchText = match[0];
    if (!matchText.length) {
      regex.lastIndex = Math.min(text.length, regex.lastIndex + 1);
      continue;
    }

    searchMatches.push(match.index);
    searchMatchEnds.push(match.index + matchText.length);

    if (searchMatches.length >= SEARCH_MAX_MATCHES) {
      const next = regex.exec(text);
      searchHitLimitReached = !!(next && next[0]?.length);
      break;
    }
  }
}

function getSearchRegex(global = true) {
  try {
    return new RegExp(searchQuery, `${global ? "g" : ""}${searchCaseSensitive ? "" : "i"}`);
  } catch (err) {
    searchError = "Invalid regex";
    return null;
  }
}

function updateSearchCount() {
  if (!searchCountEl) return;
  if (searchError) {
    searchCountEl.textContent = searchError;
    searchCountEl.classList.add("ci-raw-find-count--empty");
    return;
  }
  if (!searchOpen || !searchQuery) {
    searchCountEl.textContent = "0/0";
    searchCountEl.classList.remove("ci-raw-find-count--empty");
    return;
  }
  if (!searchMatches.length) {
    searchCountEl.textContent = "No results";
    searchCountEl.classList.add("ci-raw-find-count--empty");
    return;
  }
  const total = searchHitLimitReached ? `${searchMatches.length}+` : searchMatches.length;
  searchCountEl.textContent = `${searchActiveIndex + 1}/${total}`;
  searchCountEl.classList.remove("ci-raw-find-count--empty");
}

function lowerBound(arr, target) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function getTextareaLineHeight(style) {
  const parsed = parseFloat(style.lineHeight);
  if (Number.isFinite(parsed)) return parsed;
  const fontSize = parseFloat(style.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.6 : 17.6;
}

function renderSearchHighlights() {
  if (!textareaEl || !editorStackEl || !searchHighlightsEl) return;
  const hasQuery = searchOpen && searchQuery.length > 0;
  editorStackEl.classList.toggle("ci-textarea-stack--searching", hasQuery);
  if (!hasQuery) {
    searchHighlightsEl.textContent = "";
    return;
  }

  const text = ensureSearchTextCache();
  const style = getComputedStyle(textareaEl);
  const lineHeight = getTextareaLineHeight(style);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const firstLine = Math.max(
    0,
    Math.floor(textareaEl.scrollTop / lineHeight) - SEARCH_VISIBLE_LINE_BUFFER,
  );
  const lastLine = Math.min(
    searchLineStarts.length - 1,
    Math.ceil((textareaEl.scrollTop + textareaEl.clientHeight) / lineHeight) +
      SEARCH_VISIBLE_LINE_BUFFER,
  );
  const startOffset = searchLineStarts[firstLine] || 0;
  const endOffset =
    lastLine + 1 < searchLineStarts.length
      ? searchLineStarts[lastLine + 1]
      : text.length;

  searchHighlightsEl.style.transform =
    `translate(${paddingLeft - textareaEl.scrollLeft}px, ` +
    `${paddingTop + firstLine * lineHeight - textareaEl.scrollTop}px)`;
  searchHighlightsEl.style.lineHeight = style.lineHeight;
  searchHighlightsEl.style.fontSize = style.fontSize;
  searchHighlightsEl.style.fontFamily = style.fontFamily;
  searchHighlightsEl.style.tabSize = style.tabSize || tabSize;

  const visible = text.substring(startOffset, endOffset);
  if (!searchMatches.length) {
    searchHighlightsEl.innerHTML = escHtml(visible || " ");
    return;
  }

  const maxNeedleLen = searchRegexEnabled ? getVisibleRegexLookback(startOffset) : searchQuery.length;
  const firstMatch = Math.max(0, lowerBound(searchMatches, startOffset - maxNeedleLen));
  let cursor = startOffset;
  let html = "";

  for (let i = firstMatch; i < searchMatches.length; i++) {
    const matchStart = searchMatches[i];
    const matchEnd = searchMatchEnds[i];
    if (matchStart >= endOffset) break;
    if (matchEnd <= startOffset) continue;

    const visibleStart = Math.max(matchStart, startOffset);
    const visibleEnd = Math.min(matchEnd, endOffset);
    if (visibleStart > cursor) {
      html += escHtml(text.substring(cursor, visibleStart));
    }

    const cls = i === searchActiveIndex
      ? "ci-search-match ci-search-match--active"
      : "ci-search-match";
    html += `<mark class="${cls}">${escHtml(text.substring(visibleStart, visibleEnd))}</mark>`;
    cursor = visibleEnd;
  }

  if (cursor < endOffset) html += escHtml(text.substring(cursor, endOffset));
  searchHighlightsEl.innerHTML = html || " ";
}

function getVisibleRegexLookback(startOffset) {
  let maxLen = 0;
  const firstNearby = Math.max(0, lowerBound(searchMatches, startOffset) - 200);
  for (let i = firstNearby; i < searchMatches.length && searchMatches[i] < startOffset; i++) {
    maxLen = Math.max(maxLen, searchMatchEnds[i] - searchMatches[i]);
  }
  return maxLen || searchQuery.length;
}

function goToSearchMatch(delta) {
  if (!searchOpen || !searchQuery || !searchMatches.length || !textareaEl) return;
  searchActiveIndex =
    (searchActiveIndex + delta + searchMatches.length) % searchMatches.length;
  selectActiveSearchMatch();
}

function selectActiveSearchMatch() {
  if (!textareaEl || searchActiveIndex < 0 || !searchMatches.length) return;
  const start = searchMatches[searchActiveIndex];
  const end = searchMatchEnds[searchActiveIndex];
  textareaEl.setSelectionRange(start, end);
  scrollActiveSearchMatchIntoView(start);
  updateSearchCount();
  renderSearchHighlights();
}

function scrollActiveSearchMatchIntoView(start) {
  const line = Math.max(0, lowerBound(searchLineStarts, start + 1) - 1);
  const style = getComputedStyle(textareaEl);
  const lineHeight = getTextareaLineHeight(style);
  const targetTop = line * lineHeight;
  const margin = textareaEl.clientHeight * 0.35;
  if (targetTop < textareaEl.scrollTop + lineHeight) {
    textareaEl.scrollTop = Math.max(0, targetTop - margin);
  } else if (targetTop > textareaEl.scrollTop + textareaEl.clientHeight - lineHeight) {
    textareaEl.scrollTop = Math.max(0, targetTop - margin);
  }
}

function replaceCurrentMatch() {
  if (!textareaEl || !searchOpen || !searchQuery || !searchMatches.length) return;
  if (searchActiveIndex < 0) searchActiveIndex = 0;

  const start = searchMatches[searchActiveIndex];
  const end = searchMatchEnds[searchActiveIndex];
  const replacement = getReplacementForRange(start, end);
  if (replacement == null) return;

  const nextCursor = start + replacement.length;
  textareaEl.setRangeText(replacement, start, end, "end");
  textareaEl.setSelectionRange(nextCursor, nextCursor);
  markUnsaved();
  refreshRawTextMetrics();

  requestAnimationFrame(() => {
    if (!textareaEl || !searchMatches.length) return;
    searchActiveIndex = lowerBound(searchMatches, nextCursor);
    if (searchActiveIndex >= searchMatches.length) searchActiveIndex = 0;
    selectActiveSearchMatch();
    replaceInputEl?.focus();
  });
}

function replaceAllMatches() {
  if (!textareaEl || !searchOpen || !searchQuery || !searchMatches.length) return;
  const text = textareaEl.value;
  const replacement = replaceInputEl?.value || "";
  const result = searchRegexEnabled
    ? replaceAllRegex(text, replacement)
    : replaceAllLiteral(text, replacement);
  if (!result || !result.count) return;

  textareaEl.value = result.text;
  textareaEl.setSelectionRange(0, 0);
  markUnsaved();
  refreshRawTextMetrics();
  flash(`Replaced ${result.count}`);
  replaceInputEl?.focus();
}

function replaceAllLiteral(text, replacement) {
  if (searchCaseSensitive) {
    const parts = text.split(searchQuery);
    return {
      text: parts.join(replacement),
      count: parts.length - 1,
    };
  }

  const regex = new RegExp(escapeRegExp(searchQuery), "gi");
  let count = 0;
  return {
    text: text.replace(regex, () => {
      count++;
      return replacement;
    }),
    count,
  };
}

function replaceAllRegex(text, replacement) {
  const regex = getSearchRegex(true);
  if (!regex) {
    updateSearchCount();
    return null;
  }

  let count = 0;
  return {
    text: text.replace(regex, (...args) => {
      const match = args[0];
      if (!match.length) return match;
      const hasNamedGroups = typeof args[args.length - 1] === "object";
      const offset = args[args.length - (hasNamedGroups ? 3 : 2)];
      const captures = args.slice(1, hasNamedGroups ? -3 : -2);
      count++;
      return expandRegexReplacement(replacement, [match, ...captures], offset, text);
    }),
    count,
  };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getReplacementForRange(start, end, sourceText = textareaEl.value) {
  const replacement = replaceInputEl?.value || "";
  if (!searchRegexEnabled) return replacement;

  const match = getRegexMatchAt(start, end, sourceText);
  if (!match) return null;
  return expandRegexReplacement(replacement, match, start, sourceText);
}

function getRegexMatchAt(start, end, text) {
  const regex = getSearchRegex(true);
  if (!regex) {
    updateSearchCount();
    return null;
  }

  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!match[0].length) {
      regex.lastIndex = Math.min(text.length, regex.lastIndex + 1);
      continue;
    }
    if (match.index === start && match.index + match[0].length === end) {
      return match;
    }
    if (match.index > start) break;
  }
  return null;
}

function expandRegexReplacement(template, match, offset, text) {
  return template.replace(/\$(\$|&|`|'|\d{1,2})/g, (token, key) => {
    if (key === "$") return "$";
    if (key === "&") return match[0];
    if (key === "`") return text.substring(0, offset);
    if (key === "'") return text.substring(offset + match[0].length);

    if (key.length === 2) {
      const twoDigitIndex = Number(key);
      if (twoDigitIndex > 0 && twoDigitIndex < match.length) {
        return match[twoDigitIndex] ?? "";
      }

      const oneDigitIndex = Number(key[0]);
      if (oneDigitIndex > 0 && oneDigitIndex < match.length) {
        return `${match[oneDigitIndex] ?? ""}${key[1]}`;
      }
    } else {
      const captureIndex = Number(key);
      if (captureIndex > 0 && captureIndex < match.length) {
        return match[captureIndex] ?? "";
      }
    }
    return token;
  });
}

function runAC() {
  const pos = textareaEl.selectionStart;
  const text = textareaEl.value;
  const context = getACContext(text, pos);
  if (!context) {
    hideAC();
    return;
  }

  const candidates =
    context.type === "prop"
      ? CSS_PROPS.filter(
          (p) => context.query && p.startsWith(context.query),
        ).slice(0, 15)
      : (FALLBACK_VALUES[context.prop] || [])
          .filter((v) => v.startsWith(context.query))
          .slice(0, 15);

  if (
    !candidates.length ||
    (candidates.length === 1 && candidates[0] === context.query)
  ) {
    hideAC();
    return;
  }
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
    return {
      type: "prop",
      query: q,
      start: lineStart + lineText.indexOf(q),
      end: pos,
    };
  } else {
    const prop = lineText.substring(0, colon).trim();
    const q = lineText.substring(colon + 1).trim();
    if (q.includes(";")) return null;
    return {
      type: "val",
      prop,
      query: q,
      start: lineStart + colon + 1 + lineText.substring(colon + 1).indexOf(q),
      end: pos,
    };
  }
}

function showAC(items, ctx) {
  acDropdown.innerHTML = "";
  items.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "ci-ac-item" + (i === 0 ? " active" : "");
    div.dataset.val = item;
    div.innerHTML = `<span>${item}</span><small>${ctx.type}</small>`;
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      acConfirmItem(item, ctx);
    });
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

function hideAC() {
  acDropdown.style.display = "none";
  _acContext = null;
}

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
  let serialized = serializeNodesToCss(nodes);
  textareaEl.value = beautifyCSS(serialized);
  markUnsaved();
  refreshRawTextMetrics();
  flash("Formatted");
}

function updateLineCount() {
  const val = textareaEl.value;
  let lines = val ? 1 : 0;
  for (let i = 0; i < val.length; i++) {
    if (val.charCodeAt(i) === 10) lines++;
  }
  lineCountEl.textContent = `${lines} line${lines !== 1 ? "s" : ""}`;
}

function flash(msg, color = "#4caf82") {
  flashEl.textContent = msg;
  flashEl.style.color = color;
  flashEl.classList.add("show");
  setTimeout(() => flashEl.classList.remove("show"), 2000);
}

function applyCSS(fromIde = false) {
  const css = textareaEl.value.trim();
  applyCSSToAllRoots(resolveAssetUrls(css));

  _hasUnappliedEdits = false;
  updateSaveStateUI();

  // Only push to the IDE if this is a manual client-side Apply
  if (!fromIde && ideSocket && ideSocket.readyState === WebSocket.OPEN) {
    console.log("[Snooze] Manual Apply: Sending update to IDE...");
    ideSocket.send(
      JSON.stringify({
        action: "client-update",
        css: css,
      }),
    );
  }
}

async function saveCSS() {
  const active = _profilesData?.profiles.find(
    (p) => p.id === _profilesData.activeId,
  );
  if (active) active.css = textareaEl.value;
  await saveProfiles(_profilesData);
  
  _hasUnsavedEdits = false;
  updateSaveStateUI();
}

async function loadSavedCSS() {
  const tab = await Storage.get("Snooze-CSS-tabsize", 2);
  setTabSize(parseInt(tab));
  _profilesData = await getProfiles();
  const active = _profilesData.profiles.find(
    (p) => p.id === _profilesData.activeId,
  );
  if (active) {
    textareaEl.value = active.css;
    _hasUnsavedEdits = false;
    _hasUnappliedEdits = false;
    updateSaveStateUI();
    refreshRawTextMetrics();
  }
}

async function restartClient() {
  await fetch("/riotclient/kill-and-restart-ux", { method: "POST" });
}

function clearCSS() {
  textareaEl.value = "";
  refreshRawTextMetrics();
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
    // Create the element in the same document as the modal (popup or main)
    const ownerDoc = getModalDocument();
    _profilePanelEl = ownerDoc.createElement("div");
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
  // Capture the current scroll position before we wipe the UI
  const oldList = _profilePanelEl.querySelector(".ci-pp-list");
  const savedScrollTop = oldList ? oldList.scrollTop : 0;

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
  const settings = getSettings();

  _profilesData.profiles.forEach((p) => {
    const isActive = p.id === _profilesData.activeId;
    const row = document.createElement("div");
    row.className = "ci-pp-row" + (isActive ? " ci-pp-row--active" : "");

    let actionButton = "";
    if (!isActive) {
      actionButton = `<button class="ci-pp-btn ci-pp-btn--activate">Activate</button>`;
    } else if (settings.bridgeEnabled) {
      actionButton = `<button class="ci-pp-btn ci-pp-btn--ide" title="Live Edit in IDE">IDE</button>`;
    }

    row.innerHTML = `
      <div class="ci-pp-row-main">
        <span class="ci-pp-indicator">${isActive ? "&#x25CF;" : ""}</span>
        <input class="ci-pp-name" value="${escHtml(p.name)}" spellcheck="false">
        <span class="ci-pp-meta">${p.css ? p.css.split("\n").length : 0}L</span>
      </div>
      <div class="ci-pp-row-actions">
        ${actionButton}
        <button class="ci-pp-btn ci-pp-btn--export" title="Export to .css">Export</button>
        <button class="ci-pp-btn ci-pp-btn--delete" title="Delete Profile">✕</button>
      </div>
    `;

    const nameInput = row.querySelector(".ci-pp-name");
    nameInput.onchange = (e) => {
      p.name = e.target.value;
      saveProfiles(_profilesData);
    };

    if (isActive) {
      const ideBtn = row.querySelector(".ci-pp-btn--ide");
      if (ideBtn) {
        if (ideSocket && ideSocket.readyState === WebSocket.OPEN) {
          ideBtn.style.color = "#4caf82";
          ideBtn.style.borderColor = "#4caf82";
          ideBtn.textContent = "Connected";
        }

        ideBtn.onclick = () => {
          if (ideSocket) {
            ideSocket.close();
            ideSocket = null;
            renderProfilesList();
            return;
          }

          ideBtn.textContent = "Connecting...";
          const port = getSettings().bridgePort || 8765;
          ideSocket = new WebSocket(`ws://127.0.0.1:${port}`);

          ideSocket.onopen = () => {
            console.log("[Snooze] IDE Bridge connected.");
            renderProfilesList();
            ideSocket.send(
              JSON.stringify({ action: "init", css: textareaEl.value }),
            );
          };

          ideSocket.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.action === "update") {
                console.log("[Snooze] Received update from IDE.");
                textareaEl.value = data.css;
                p.css = data.css;
                refreshRawTextMetrics();
                applyCSS(true); // Flag that this came from the IDE, prevents echo loop
                saveProfiles(_profilesData);

                const meta = row.querySelector(".ci-pp-meta");
                if (meta) {
                  meta.textContent = `${data.css.split("\n").length}L`;
                  meta.style.color = "#4caf82";
                  setTimeout(() => (meta.style.color = ""), 1000);
                }
              }
            } catch (e) {
              console.error(e);
            }
          };

          ideSocket.onclose = () => {
            ideSocket = null;
            if (_profilePanelEl && _profilePanelEl.style.display === "flex") {
              renderProfilesList();
            }
          };

          ideSocket.onerror = () => {
            ideSocket = null;
            flash("IDE server not found", "#ff4a4a");
            if (_profilePanelEl && _profilePanelEl.style.display === "flex") {
              renderProfilesList();
            }
          };
        };
      }
    } else {
      row.querySelector(".ci-pp-btn--activate").onclick = async () => {
        if (ideSocket) {
          ideSocket.close();
          ideSocket = null;
        }
        _profilesData.activeId = p.id;
        textareaEl.value = p.css || "";
        _hasUnsavedEdits = false;
        _hasUnappliedEdits = false;
        updateSaveStateUI();
        await saveProfiles(_profilesData);
        refreshRawTextMetrics();
        applyCSS(false); // Manual activation counts as a local apply
        renderProfilesList();
      };
    }

    row.querySelector(".ci-pp-btn--export").onclick = () => exportProfile(p);

    row.querySelector(".ci-pp-btn--delete").onclick = () => {
      if (_profilesData.profiles.length > 1) {
        customConfirm(_profilePanelEl, `Delete "${p.name}"?`, async () => {
          _profilesData.profiles = _profilesData.profiles.filter(
            (x) => x.id !== p.id,
          );
          if (isActive) {
            if (ideSocket) ideSocket.close();
            _profilesData.activeId = _profilesData.profiles[0].id;
            textareaEl.value = _profilesData.profiles[0].css;
            refreshRawTextMetrics();
            applyCSS();
          }
          await saveProfiles(_profilesData);
          renderProfilesList();
        });
      }
    };

    list.appendChild(row);
  });

  // Restore the scroll position on the new list element
  if (list) {
    list.scrollTop = savedScrollTop;
  }
}

export function scrollRawToBottom() {
  if (textareaEl) {
    textareaEl.scrollTop = textareaEl.scrollHeight;
    updateScrollBtns();
    scheduleSearchRender();
  }
}
export function appendToRaw(snippet) {
  if (textareaEl) {
    textareaEl.value +=
      (textareaEl.value && !textareaEl.value.endsWith("\n") ? "\n" : "") +
      snippet +
      "\n";
    markUnsaved();
    refreshRawTextMetrics();
  }
}
export function cleanupRawTab() {
  if (rawResizeObserver) {
    rawResizeObserver.disconnect();
    rawResizeObserver = null;
  }

  if (searchRaf) {
    cancelAnimationFrame(searchRaf);
    searchRaf = 0;
  }
  textareaEl = null;
  acDropdown = null;
  lineCountEl = null;
  tabSizeValEl = null;
  scrollTopBtn = null;
  scrollBottomBtn = null;
  flashEl = null;
  editorStackEl = null;
  searchBarEl = null;
  searchInputEl = null;
  searchCountEl = null;
  searchPrevBtn = null;
  searchNextBtn = null;
  searchCloseBtn = null;
  searchCaseBtn = null;
  searchRegexBtn = null;
  replaceInputEl = null;
  replaceBtn = null;
  replaceAllBtn = null;
  searchHighlightsEl = null;
  rawResizeObserver = null;
  saveBtnEl = null;
  applyBtnEl = null;

  _profilePanelEl = null;
  _profilePanelOpen = false; // Also reset the state flag
  searchOpen = false;
  searchQuery = "";
  searchMatches = [];
  searchMatchEnds = [];
  searchActiveIndex = -1;
  searchHitLimitReached = false;
  searchError = "";
  searchLineStarts = [0];
  searchCachedText = "";
  searchNeedsMatchRefresh = false;
}

export function syncBridgeState() {
  const settings = getSettings();

  // If setting is OFF, kill the WS connection
  if (!settings.bridgeEnabled && ideSocket) {
    console.log("[Snooze-CSS] IDE Bridge disabled: Closing connection.");
    ideSocket.close();
    ideSocket = null;
  }

  // If the profile list is currently visible, re-render it to ensure the button
  // appears/disappears the moment the toggle is flipped
  if (_profilePanelEl && _profilePanelEl.style.display === "flex") {
    renderProfilesList();
  }
}
