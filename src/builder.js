import { CATALOG } from "./catalog.js";
import { walkDOM } from "./analyzer.js";
import { setCssProperty, setCssBatch, sendToRaw, replaceOrAppendBlock, appendToRaw } from "./raw.js";
import {
  setRefreshCallback,
  getSettings,
  saveSettings,
  applyWindowEffect,
} from "./settings.js";
import { rgbToHex, escHtml, flashMessage, buildStrategicSelector } from "./utils.js";
import { getBackdrop } from "./modal.js";
import { getShadowRoots } from "./shadow-manager.js";
import { extractAndNavigate, collectFromNode, buildCompactAssetRow } from "./assets.js";

// SESSION STATE
const _collapseState = new Map();
let _scrollPos = 0;
let _inputs = [];
let _activeInputs = new Set(); // Currently visible on screen
let _bodyEl = null;

// Search & Optimization State
let _activeTags = []; // { id, type, value, label }
let _screenOnly = false;
let _allUniqueProps = [];
let _allUniqueScreens = [];
let _allUniqueElements = [];
let _deepScanCache = null;
let _searchRenderToken = 0; // Cancels old renders if typing fast
let _localPuuid = null;
let _localSummonerId = null;

// Fetch local identity info for accurate targeting (hovercards, lobby, profile)
async function fetchLocalIdentity() {
  try {
    const r = await fetch("/lol-summoner/v1/current-summoner");
    const data = await r.json();
    if (data && data.puuid) {
      _localPuuid = data.puuid;
      _localSummonerId = data.summonerId || data.id;
    }
  } catch (e) {}
}
fetchLocalIdentity();

// Visible row observer
const _rowObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const regs = entry.target._regs;
      if (!regs || regs.length === 0) return;
      if (entry.isIntersecting) {
        regs.forEach((reg) => {
          _activeInputs.add(reg);
          try {
            populateInput(reg);
          } catch {}
        });
      } else {
        regs.forEach((reg) => _activeInputs.delete(reg));
      }
    });
  },
  { threshold: 0.05 },
);

export function buildBuilderTab(container) {
  _inputs = [];
  container.innerHTML = "";

  // Pre-calculate unique props and screens for suggestions
  const propsSet = new Set();
  const screenSet = new Set();
  const elementSet = new Set();
  CATALOG.forEach((g) => {
    if (g.generic || !g.label) return;
    screenSet.add(g.label);
    g.elements.forEach((el) => {
      if (el.label) elementSet.add(el.label);
      (el.props || []).forEach((p) => {
        const name = typeof p === "object" ? p.name : p;
        if (name) propsSet.add(name);
      });
    });
  });
  _allUniqueProps = Array.from(propsSet).sort();
  _allUniqueProps.push("child-img-replace");
  _allUniqueScreens = Array.from(screenSet).sort();
  _allUniqueElements = Array.from(elementSet).sort();

  const topBar = document.createElement("div");
  topBar.style.cssText =
    "display:flex;gap:6px;align-items:center;margin-bottom:6px;";

  const searchWrap = document.createElement("div");
  searchWrap.className = "ci-search-wrap";

  const searchInput = document.createElement("input");
  searchInput.className = "ci-search";
  searchInput.id = "ci-search";
  searchInput.type = "text";
  searchInput.placeholder = "Search elements, props or screens…";
  searchInput.autocomplete = "off";
  searchWrap.appendChild(searchInput);

  // Manual Search on Enter
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      updateSearch();
      suggestionBox.style.display = "none";
    }
  });

  // Live Suggestions
  searchInput.addEventListener("input", () => {
    showSuggestions(searchInput.value);
  });

  const filterBtn = document.createElement("button");
  filterBtn.className = "ci-filter-btn";
  filterBtn.innerHTML = "⚙️";
  filterBtn.title = "Show filter suggestions";
  filterBtn.addEventListener("click", () => {
    showSuggestions(searchInput.value || "", true);
  });
  searchWrap.appendChild(filterBtn);

  const suggestionBox = document.createElement("div");
  suggestionBox.className = "ci-suggestion-box";
  searchWrap.appendChild(suggestionBox);
  topBar.appendChild(searchWrap);

  const searchBtn = document.createElement("button");
  searchBtn.className = "ci-search-btn";
  searchBtn.innerHTML = "Search";
  searchBtn.addEventListener("click", () => {
    updateSearch();
    suggestionBox.style.display = "none";
  });
  topBar.appendChild(searchBtn);

  const refreshBtn = makeIconBtn("↻", "Refresh live values from DOM", () =>
    refreshValues("manual"),
  );
  refreshBtn.style.width = "36px";
  refreshBtn.style.height = "36px";
  topBar.appendChild(refreshBtn);

  container.appendChild(topBar);

  const tagContainer = document.createElement("div");
  tagContainer.className = "ci-tag-container";
  container.appendChild(tagContainer);

  const groupContainer = document.createElement("div");
  groupContainer.id = "ci-group-container";
  container.appendChild(groupContainer);

  function renderCatalog() {
    groupContainer.innerHTML = "";
    CATALOG.forEach((group) => groupContainer.appendChild(buildGroup(group)));
  }

  renderCatalog();

  requestAnimationFrame(() => {
    _bodyEl = container.closest(".ci-body");
    if (_bodyEl) {
      _bodyEl.scrollTop = _scrollPos;
      if (!_bodyEl._scrollListenerAttached) {
        _bodyEl.addEventListener(
          "scroll",
          () => {
            if (!container.classList.contains("ci-panel-hidden")) {
              _scrollPos = _bodyEl.scrollTop;
            }
            updateBuilderScrollBtns();
          },
          { passive: true },
        );
        _bodyEl._scrollListenerAttached = true;
      }

      // Scroll buttons
      const scrollWrap = document.createElement("div");
      scrollWrap.className = "ci-scroll-btns ci-scroll-btns--sticky";

      const scrollTopBtn = document.createElement("button");
      scrollTopBtn.className = "ci-scroll-btn";
      scrollTopBtn.title = "Scroll to top";
      scrollTopBtn.innerHTML = "&#x2191;";
      scrollTopBtn.addEventListener("click", () => {
        _bodyEl.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(updateBuilderScrollBtns, 300);
      });

      const scrollBottomBtn = document.createElement("button");
      scrollBottomBtn.className = "ci-scroll-btn";
      scrollBottomBtn.title = "Scroll to bottom";
      scrollBottomBtn.innerHTML = "&#x2193;";
      scrollBottomBtn.addEventListener("click", () => {
        _bodyEl.scrollTo({ top: _bodyEl.scrollHeight, behavior: "smooth" });
        setTimeout(updateBuilderScrollBtns, 300);
      });

      scrollWrap.appendChild(scrollTopBtn);
      scrollWrap.appendChild(scrollBottomBtn);
      container.appendChild(scrollWrap);

      function updateBuilderScrollBtns() {
        const atTop = _bodyEl.scrollTop <= 2;
        const atBottom =
          _bodyEl.scrollTop + _bodyEl.clientHeight >= _bodyEl.scrollHeight - 2;
        scrollTopBtn.style.display = atTop ? "none" : "flex";
        scrollBottomBtn.style.display = atBottom ? "none" : "flex";
      }

      updateBuilderScrollBtns();
    }
  });

  function renderTags() {
    tagContainer.innerHTML = "";

    const toggleField = document.createElement("label");
    toggleField.className = "ci-switch-label";
    toggleField.innerHTML = `
      <div class="ci-switch${_screenOnly ? " active" : ""}"></div>
      <span>Screen Only</span>
    `;
    toggleField.addEventListener("click", (e) => {
      e.preventDefault();
      _screenOnly = !_screenOnly;
      _deepScanCache = null; // ALWAYS invalidate cache on toggle to catch fresh state
      renderTags();
      updateSearch();
    });
    tagContainer.appendChild(toggleField);

    _activeTags.forEach((tag) => {
      const el = document.createElement("div");
      el.className = "ci-tag";
      el.innerHTML = `
        <span class="ci-tag-plus">+</span>
        <span style="flex:1;">${tag.type === "prop" ? "" : tag.type === "screen" ? "" : ""} ${tag.label}</span>
        <span class="ci-tag-remove" data-id="${tag.id}">×</span>
      `;
      el.querySelector(".ci-tag-remove").addEventListener("click", (e) => {
        e.stopPropagation();
        _activeTags = _activeTags.filter((t) => t.id !== tag.id);
        renderTags();
        updateSearch();
      });
      tagContainer.appendChild(el);
    });
  }

  function updateSearch(query) {
    const q = (query !== undefined ? query : searchInput.value)
      .toLowerCase()
      .trim();
    if (!q && _activeTags.length === 0) {
      renderCatalog();
      return;
    }

    // Cancel stale renders
    _searchRenderToken++;
    const currentToken = _searchRenderToken;

    groupContainer.innerHTML = "";

    const resultsGroup = document.createElement("div");
    resultsGroup.className = "ci-group";
    resultsGroup.innerHTML = `
      <div class="ci-group-header" style="background:#0a1628;border-left:2px solid #c8aa6e;cursor:default;">
        <span style="font-size:11px;font-weight:600;color:#c8aa6e;flex:1;">Found Elements</span>
        <span id="search-count" style="font-size:9px;color:#2a3a4a;background:rgba(0,0,0,0.3);border:1px solid #1a2535;padding:1px 6px;border-radius:8px;">0</span>
      </div>
      <div class="ci-group-body" style="display:block;background:#050c18;padding-bottom:12px;"></div>
    `;
    groupContainer.appendChild(resultsGroup);

    const searchCount = resultsGroup.querySelector("#search-count");
    const searchBody = resultsGroup.querySelector(".ci-group-body");
    let totalMatch = 0;

    const propTags = _activeTags
      .filter((t) => t.type === "prop")
      .map((t) => t.value.toLowerCase());
    const elementTags = _activeTags
      .filter((t) => t.type === "element")
      .map((t) => t.value.toLowerCase());
    const inclusiveTags = _activeTags
      .filter((t) => t.type === "all")
      .map((t) => t.value.toLowerCase());
    const screenTags = _activeTags
      .filter((t) => t.type === "screen")
      .map((t) => t.value.toLowerCase());

    if (q) inclusiveTags.push(q);

    if (_screenOnly) {
      // DEEP SCAN MODE

      // Fetch/Rebuild Cache
      if (!_deepScanCache) {
        const viewportSelectors = [
          "rcp-fe-viewport-main",
          "rcp-fe-viewport-overlay",
          "rcp-fe-viewport-sidebar",
          "rcp-fe-viewport-persistent",
          "rcp-fe-lol-event-hub-application",
          "lol-uikit-layer-manager-wrapper",
        ];
        const contentRoots = [];
        const sRoots = getShadowRoots();
        viewportSelectors.forEach((sel) => {
          let found =
            document.querySelector(sel) ||
            document.querySelector("#" + sel) ||
            document.querySelector("." + sel);
          if (found) {
            contentRoots.push(found);
            return;
          }
          sRoots.forEach((sr) => {
            if (found) return;
            try {
              found =
                sr.shadowRoot.querySelector(sel) ||
                sr.shadowRoot.querySelector("#" + sel) ||
                sr.shadowRoot.querySelector("." + sel);
              if (found) contentRoots.push(found);
            } catch {}
          });
        });
        const roots = contentRoots.length > 0 ? contentRoots : [document.body];
        // Only manually add shadow roots that aren't already descendants of our existing roots
        const extraShroots = sRoots
          .map((r) => r.shadowRoot)
          .filter((sr) => {
            if (!sr) return false;
            return !roots.some((r) => r.contains(sr.host));
          });
        roots.push(...extraShroots);

        const { elements } = walkDOM(roots, 40, true, true);
        // Deduplicate elements by actual DOM node to prevent repetitive results
        const unique = [];
        const seen = new Set();
        elements.forEach((e) => {
          const node = e.domNode || e.node;
          if (node && !seen.has(node)) {
            seen.add(node);
            unique.push(e);
          }
        });
        _deepScanCache = unique;
      }

      const pseudoPropTags = propTags.filter(
        (pt) => pt === "child-img-replace",
      );
      const realPropTags = propTags.filter((pt) => pt !== "child-img-replace");

      // Strict Filter
      const matchedEls = _deepScanCache.filter((e) => {
        const selector = (e.selector || "").toLowerCase();
        const styles = e.styles || {};
        const elProps = Object.keys(styles).map((p) => p.toLowerCase());
        const domNode = e.domNode || e.node;

        if (
          elementTags.length > 0 &&
          !elementTags.every((t) => selector.includes(t))
        )
          return false;

        // For real prop tags: first check cached styles, then fall back to live computed styles
        // (cache may have been built before a filter/transform was applied, or element was in a
        // shadow root not fully walked — live check is the source of truth)
        if (realPropTags.length > 0) {
          const missingFromCache = realPropTags.filter(
            (pt) => !elProps.some((p) => p.includes(pt)),
          );
          if (missingFromCache.length > 0) {
            // Live-check only the missing ones
            if (!domNode) return false;
            try {
              const cs = window.getComputedStyle(domNode);
              const allMissed = missingFromCache.some((pt) => {
                const live = cs.getPropertyValue(pt)?.trim();
                return !live || live === "none" || live === "0" || live === "";
              });
              if (allMissed) return false;
            } catch {
              return false;
            }
          }
        }

        if (pseudoPropTags.length > 0 && !e.hasImgChild) return false;
        if (
          inclusiveTags.length > 0 &&
          !inclusiveTags.every(
            (t) => selector.includes(t) || elProps.some((p) => p.includes(t)),
          )
        )
          return false;

        return true;
      });

      // 3. Selector-Based Grouping (Instance Badging)
      const grouped = new Map();
      matchedEls.forEach((e) => {
        const sel = e.selector || "unknown";
        if (grouped.has(sel)) {
          grouped.get(sel).count++;
        } else {
          grouped.set(sel, { ...e, count: 1 });
        }
      });

      const uniqueMatched = Array.from(grouped.values());
      totalMatch = uniqueMatched.length;
      searchCount.textContent = totalMatch;

      // 4. Asynchronous Rendering
      searchBody.innerHTML = "";
      const renderList = uniqueMatched.slice(0, 150); // Cap at 150 to prevent freezing
      let i = 0;
      const chunk = () => {
        if (currentToken !== _searchRenderToken) return; // Cancel if user typed another letter
        const limit = Math.min(i + 20, renderList.length);
        for (; i < limit; i++) {
          const e = renderList[i];
          const intent = [...propTags, ...inclusiveTags, ...elementTags];
          const resolvedNode = e.domNode || e.node;
          const mockEl = {
            label: e.selector,
            cls: e.selector,
            props: getSmartProperties(resolvedNode, intent),
            _discovered: true,
            _domNode: resolvedNode,
            _count: e.count,
          };
          searchBody.appendChild(buildElementRow(mockEl));
        }
        if (i < renderList.length) requestAnimationFrame(chunk);
      };
      chunk();
    } else {
      // CATALOG SEARCH
      let renderQueue = [];

      CATALOG.forEach((group) => {
        if (group.generic) return;
        if (
          screenTags.length > 0 &&
          !screenTags.some((t) => (group.label || "").toLowerCase().includes(t))
        )
          return;

        const gMatch = group.elements.filter((el) => {
          const label = (el.label || "").toLowerCase();
          const cls = (el.cls || "").toLowerCase();
          const props = (el.props || []).map((p) =>
            (typeof p === "object"
              ? p.name || p.type || ""
              : p || ""
            ).toLowerCase(),
          );

          if (
            elementTags.length > 0 &&
            !elementTags.every((t) => label.includes(t) || cls.includes(t))
          )
            return false;

          if (propTags.length > 0) {
            const matchesAllProps = propTags.every((t) => {
              if (t === "child-img-replace")
                return props.some(
                  (p) => p.includes("img-replace") || p.includes("child-img"),
                );
              return props.some((p) => p.includes(t));
            });
            if (!matchesAllProps) return false;
          }

          if (
            inclusiveTags.length > 0 &&
            !inclusiveTags.every(
              (t) =>
                label.includes(t) ||
                cls.includes(t) ||
                props.some((p) => p.includes(t)),
            )
          )
            return false;

          return true;
        });

        if (gMatch.length > 0) {
          totalMatch += gMatch.length;
          renderQueue.push(...gMatch);
        }
      });

      searchCount.textContent = totalMatch;

      // 3. Asynchronous Rendering
      let i = 0;
      const chunk = () => {
        if (currentToken !== _searchRenderToken) return;
        const limit = Math.min(i + 20, renderQueue.length);
        for (; i < limit; i++) {
          searchBody.appendChild(buildElementRow(renderQueue[i]));
        }
        if (i < renderQueue.length) requestAnimationFrame(chunk);
      };
      chunk();
    }
  }

  function showSuggestions(q, isManual = false) {
    suggestionBox.innerHTML = "";
    const lowerQ = q.toLowerCase();

    const addHeader = (text) => {
      const h = document.createElement("div");
      h.className = "ci-suggestion-header";
      h.textContent = text;
      suggestionBox.appendChild(h);
    };

    const matches = [];

    // General Filters
    const addPowerChip = (label, type, value, id) => {
      matches.push({ type, value, label, id, cat: "️ General Filters" });
    };

    if (!isManual) {
      addPowerChip(`Inclusive Match: "${q}"`, "all", q, "all-" + q);
      addPowerChip(
        `Any Property matching: "${q}"`,
        "prop",
        q,
        "all-props-" + q,
      );
    }

    // Screens
    _allUniqueScreens.forEach((s) => {
      if (s && (isManual || s.toLowerCase().includes(lowerQ))) {
        matches.push({
          type: "screen",
          value: s,
          label: s,
          id: "screen-" + s,
          cat: "Screens",
        });
      }
    });

    // Elements
    _allUniqueElements.forEach((e) => {
      if (e && (isManual || e.toLowerCase().includes(lowerQ))) {
        matches.push({
          type: "element",
          value: e,
          label: e,
          id: "el-" + e,
          cat: "Elements",
        });
      }
    });

    // Properties
    let propCount = 0;
    _allUniqueProps.forEach((p) => {
      if (propCount >= 40) return;
      if (p && (isManual || p.toLowerCase().includes(lowerQ))) {
        matches.push({
          type: "prop",
          value: p,
          label: p,
          id: "prop-" + p,
          cat: "Properties",
        });
        propCount++;
      }
    });

    if (matches.length > 0) {
      let curCat = "";
      matches.forEach((m) => {
        if (m.cat !== curCat) {
          curCat = m.cat;
          addHeader(curCat);
        }
        const item = document.createElement("div");
        item.className = "ci-suggestion-item";
        item.innerHTML = `
          <div class="ci-tag" style="border-style:dashed;flex:1;margin-right:10px;pointer-events:none;">
            <span class="ci-tag-plus">+</span>
            <span>${m.label}</span>
          </div>
          <span class="ci-suggestion-type" style="pointer-events:none;">${m.type.toUpperCase()}</span>
        `;
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!_activeTags.some((t) => t.id === m.id)) {
            _activeTags.push(m);
            renderTags();
            requestAnimationFrame(() => {
              updateSearch();
            });
          }
          searchInput.value = "";
          suggestionBox.style.display = "none";
        });
        suggestionBox.appendChild(item);
      });
      suggestionBox.style.display = "block";
    } else {
      suggestionBox.style.display = "none";
    }
  }

  // UI event listeners
  container.addEventListener("mousedown", (e) => {
    if (!searchWrap.contains(e.target)) {
      suggestionBox.style.display = "none";
    }
  });

  renderTags();
  if (_activeTags.length > 0 || searchInput.value) {
    updateSearch();
  }

  setRefreshCallback(refreshValues);
  refreshValues("init");

  // Initial group sorting
  container.querySelectorAll(".ci-group-body").forEach((body) => {
    if (body.parentElement.dataset.generic !== "true") {
      sortGroupRows(body);
    }
  });
}

export function refreshValues(source) {
  // Invalidate cache if user manually clicks refresh button
  if (source === "manual") {
    _deepScanCache = null;
  }

  _activeInputs.forEach((reg) => {
    try {
      populateInput(reg);
    } catch {}
  });

  if (_bodyEl) {
    const bodies = _bodyEl.querySelectorAll(".ci-group-body");
    bodies.forEach((body) => {
      if (
        body.parentElement.dataset.generic !== "true" &&
        body.style.display !== "none"
      ) {
        sortGroupRows(body);
      }
    });
  }
}

export function restoreScrollPos() {
  if (_bodyEl) {
    _bodyEl.scrollTop = _scrollPos;
  }
}

// Sort elements by DOM presence (active elements first)
function sortGroupRows(body) {
  const rows = [...body.querySelectorAll(".ci-element-row")];
  if (rows.length === 0) return;

  rows.sort((a, b) => {
    const aMissing =
      a.querySelector(".ci-not-in-dom")?.style.display !== "none";
    const bMissing =
      b.querySelector(".ci-not-in-dom")?.style.display !== "none";
    return (aMissing ? 1 : 0) - (bMissing ? 1 : 0);
  });

  // Re-append nodes in new order
  rows.forEach((row) => body.appendChild(row));
}

function register(reg) {
  _inputs.push(reg);
}

// VALUE READING

// Piercing selector travels through Shadow DOM and Iframes
function piercingQuerySelector(selector) {
  // Guard against non-string or numeric-like selectors (e.g. "0") which would crash document.querySelector
  if (typeof selector !== "string" || !selector || /^\d+$/.test(selector))
    return null;
  return _querySelectorInDocument(document, selector);
}

function _querySelectorInDocument(doc, selector, visitedDocs = new Set()) {
  if (!doc || !selector) return null;
  if (visitedDocs.has(doc)) return null;
  visitedDocs.add(doc);

  // Document search
  try {
    const el = doc.querySelector(selector);
    if (el) return el;
  } catch {
    // invalid selector or no access
  }

  // Shadow Roots (tracked)
  try {
    const roots = getShadowRoots();
    for (const { shadowRoot, host } of roots) {
      if (!shadowRoot || host.id === "snooze-css-host") continue;
      try {
        const inner = shadowRoot.querySelector(selector);
        if (inner) return inner;
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // Shadow Roots (manual)
  try {
    const candidates = doc.querySelectorAll("*:not(script):not(style)");
    for (const node of candidates) {
      if (node.shadowRoot) {
        try {
          const inner = node.shadowRoot.querySelector(selector);
          if (inner) return inner;
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  // Nested iframes
  try {
    const iframes = doc.querySelectorAll("iframe");
    for (const iframe of iframes) {
      try {
        if (!iframe.contentDocument) continue;
        const fromFrame = _querySelectorInDocument(
          iframe.contentDocument,
          selector,
          visitedDocs,
        );
        if (fromFrame) return fromFrame;
      } catch {
        // cross-origin iframe, cannot access
      }
    }
  } catch { /* ignore */ }

  return null;
}

function getLiveValue(cls, prop) {
  const el = piercingQuerySelector(cls);
  return el ? getLiveValueFromNode(el, prop) : null;
}

// Live value readers
function getLiveValueFromNode(el, prop) {
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
    default: {
      // For any prop not explicitly handled, read it directly
      const raw = cs.getPropertyValue(prop)?.trim();
      return raw &&
        raw !== "none" &&
        raw !== "normal" &&
        raw !== "auto" &&
        raw !== "0px" &&
        raw !== ""
        ? raw
        : "";
    }
  }
}

function isInDOM(cls) {
  return !!piercingQuerySelector(cls);
}

function populateInput(reg) {
  const { cls, prop, inputEl, notBadge, domNode } = reg;
  // Resolve element
  const el = domNode || piercingQuerySelector(cls);
  const inDOM = !!el;
  if (notBadge) notBadge.style.display = inDOM ? "none" : "inline";
  if (!inDOM || !inputEl) return;
  const val = getLiveValueFromNode(el, prop);
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

  wrap.appendChild(body);

  if (group.generic) {
    buildGenericTools(body);
  } else if (savedOpen) {
    // Instant build
    buildGroupElements(group, body);
  }

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

    // Lazy building
    if (open && !group.generic && body.children.length === 0) {
      buildGroupElements(group, body);
    }

    // Refresh active values in this group
    if (open) {
      // Observer sync
      setTimeout(() => refreshValues("expand"), 50);
    }
  });

  return wrap;
}

function buildGroupElements(group, body) {
  const elements = [...group.elements];
  const total = elements.length;

  const processChunk = () => {
    // Batch processing
    const chunk = elements.splice(0, 30);
    chunk.forEach((el) => body.appendChild(buildElementRow(el)));

    if (elements.length > 0) {
      requestAnimationFrame(processChunk);
    } else {
      // Post-batch cleanup
      if (body.parentElement.dataset.generic !== "true") {
        sortGroupRows(body);
      }

      // Scroll restoration
      restoreScrollPos();
    }
  };

  processChunk();
}

// GENERIC TOOLS

// File picker helper
function attachFilePickerToInput(inputElement) {
  if (!inputElement) return;

  // Hidden file input
  const hiddenFileInput = document.createElement("input");
  hiddenFileInput.type = "file";
  hiddenFileInput.accept =
    "image/*,.webp,.jpg,.jpeg,.png,.gif,.avif,.svg,.mp4,.webm";
  hiddenFileInput.style.display = "none";
  document.body.appendChild(hiddenFileInput);

  hiddenFileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      document.body.removeChild(hiddenFileInput);
      return;
    }

    const filename = file.name;

    // Set relative path
    const relPath = `./assets/${filename}`;
    inputElement.value = relPath;

    // Resource validation
    try {
      const testUrl = new URL(relPath, import.meta.url).href;
      const testFetch = await fetch(testUrl, { method: "HEAD" });
      if (testFetch.ok) {
        console.log(`Asset resolved: ${relPath}`);
      } else if (testFetch.status === 404) {
        alert(`⚠ Not found: ${relPath}\nMake sure file is in assets/!`);
      }
    } catch (err) {
      console.warn("[Snooze-CSS] Asset validation:", err);
    }

    document.body.removeChild(hiddenFileInput);
  });

  hiddenFileInput.click();
}

function buildSubGroup(title, contentBuilders) {
  const wrap = document.createElement("div");
  wrap.className = "ci-group ci-sub-group";
  wrap.style.margin = "4px";
  wrap.style.border = "1px solid #1a2535";

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;user-select:none;background:#060e1a;";

  const icon = document.createElement("span");
  icon.style.cssText = `font-size:9px;color:#785a28;flex-shrink:0;display:inline-block;transition:transform 0.2s;transform:rotate(0deg)`;
  icon.textContent = "▸";

  const labelEl = document.createElement("span");
  labelEl.style.cssText = `font-size:11px;font-weight:600;color:#7a8a9a`;
  labelEl.textContent = title;

  header.appendChild(icon);
  header.appendChild(labelEl);
  wrap.appendChild(header);

  const subBody = document.createElement("div");
  subBody.style.cssText =
    "display:none;background:#050c18;border-top:1px solid #1a2535;";
  contentBuilders.forEach((builder) => {
    if (builder) subBody.appendChild(builder());
  });
  wrap.appendChild(subBody);

  header.addEventListener("click", () => {
    const open = subBody.style.display === "none";
    subBody.style.display = open ? "block" : "none";
    icon.style.transform = open ? "rotate(90deg)" : "rotate(0deg)";
    labelEl.style.color = open ? "#c8aa6e" : "#7a8a9a";
  });

  return wrap;
}

function composeEffectColor(base, alpha) {
  const safeBase = /^#[0-9a-f]{6}$/i.test(base) ? base : "#ff0000";
  const safeAlpha = /^[0-9a-f]{2}$/i.test(alpha) ? alpha.toUpperCase() : "10";
  return `${safeBase}${safeAlpha}`;
}

function hexToRgbaString(hex, opacity) {
  const safeHex = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000";
  const safeOpacity = Number.isFinite(parseFloat(opacity))
    ? Math.max(0, Math.min(1, parseFloat(opacity)))
    : 0.45;
  const r = parseInt(safeHex.slice(1, 3), 16);
  const g = parseInt(safeHex.slice(3, 5), 16);
  const b = parseInt(safeHex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
}

function getWindowEffectHint(name) {
  const hints = {
    transparent: "Transparent window background with tint color.",
    blurbehind: "Glossy aero-style blur. Default for this theme.",
    acrylic: "Textured translucent blur. Best on newer Windows.",
    unified: "Windows 11 style acrylic/blur hybrid.",
    mica: "Wallpaper-reactive material. Supports optional material.",
    vibrancy: "macOS-style vibrancy. Material options available.",
  };
  return hints[name] || "";
}

function buildGenericTools(body) {
  body.appendChild(buildSubGroup("Omni Inspector", [buildOmniRow]));
  body.appendChild(buildSubGroup("Hide Any Element", [buildHideRow]));
  body.appendChild(
    buildSubGroup("Backgrounds & Transparency", [
      buildBackgroundCustomizationRow,
      buildGlobalDimRow,
    ]),
  );
  body.appendChild(buildSubGroup("Navbar", [buildNavbarRow, buildNavbarPlayButtonRow]));
  body.appendChild(
    buildSubGroup("Home / Activity Center", [buildActivityCenterRow]),
  );
  body.appendChild(buildSubGroup("Social / Chat", [buildSocialRow]));
  body.appendChild(buildSubGroup("Player Identity", [buildPlayerIdentityRow]));
  body.appendChild(buildSubGroup("Champion Select", [buildChampSelectRow]));
  body.appendChild(
    buildSubGroup("Player Hover Card", [buildPlayerHoverCardRow]),
  );
  body.appendChild(buildSubGroup("Fonts", [buildFontRow]));
  body.appendChild(buildSubGroup("Scrollbar Style", [buildScrollbarRow]));
  body.appendChild(buildSubGroup("Other Enhancements", [buildOthersRow]));
}

function buildGlobalDimRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.padding = "16px 14px";

  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:13px; margin-bottom: 6px;">Dim & Readability</div>
    <div class="ci-generic-desc" style="margin-bottom: 10px;">Controls visibility and text contrast for transparent/replaced backgrounds. The two modes work independently — use both if needed.</div>

    <!-- MODE 1: Replace BG dim (via CSS var) -->
    <div style="margin-bottom:14px;border:1px solid rgba(200,170,110,0.25);padding:10px;background:rgba(0,0,0,0.15);">
      <div style="font-size:11px;font-weight:bold;color:#c8aa6e;margin-bottom:6px;">1. Replace BG Dim <span style="font-size:9px;font-weight:normal;color:#4a6070;">(for &quot;Apply Custom Background&quot; above)</span></div>
      <div style="font-size:9px;color:#3a5060;margin-bottom:8px;">Sets CSS variables consumed by the ::before overlay layer on replaced backgrounds. Has no effect if you only removed backgrounds.</div>

      <div class="ci-inline-row">
        <div class="ci-field"><div class="ci-label">Overlay Color</div>
          <div class="ci-color-pair">
            <input class="ci-color-input" id="dim-picker" type="color" value="#000000">
            <input class="ci-input" id="dim-text" type="text" value="#000000" style="width:70px;">
          </div>
        </div>
        <div class="ci-field"><div class="ci-label">Overlay Opacity</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="range" id="dim-overlay-slider" class="ci-slider" min="0" max="0.95" step="0.05" value="0.45" style="width:60px;">
            <input class="ci-input" id="dim-overlay-text" type="text" value="0.45" style="width:45px;">
          </div>
        </div>
      </div>
      <div class="ci-inline-row" style="margin-bottom:4px;">
        <div class="ci-field"><div class="ci-label">Background Blur (px)</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="range" id="dim-blur-slider" class="ci-slider" min="0" max="30" step="1" value="0" style="width:60px;">
            <input class="ci-input" id="dim-blur-text" type="text" value="0" style="width:45px;">
          </div>
        </div>
      </div>
      <button class="ci-btn-primary" id="dim-apply-btn" style="width:100%;font-size:11px;margin-top:8px;">Apply Replace-BG Dim</button>
    </div>

    <!-- MODE 2: Transparent theme readability overlay -->
    <div style="margin-bottom:14px;border:1px solid rgba(100,150,200,0.25);padding:10px;background:rgba(0,0,0,0.15);">
      <div style="font-size:11px;font-weight:bold;color:#a0b4c8;margin-bottom:6px;">2. Transparent Theme Dim <span style="font-size:9px;font-weight:normal;color:#4a6070;">(for &quot;Remove / Transparent&quot; above)</span></div>
      <div style="font-size:9px;color:#3a5060;margin-bottom:8px;">Adds a semi-transparent overlay directly on the viewport so the OS wallpaper/window behind the client is dimmed. Fixes readability when no background image is set.</div>

      <div class="ci-inline-row">
        <div class="ci-field"><div class="ci-label">Overlay Color</div>
          <div class="ci-color-pair">
            <input class="ci-color-input" id="tdim-picker" type="color" value="#000000">
            <input class="ci-input" id="tdim-text" type="text" value="#000000" style="width:70px;">
          </div>
        </div>
        <div class="ci-field"><div class="ci-label">Overlay Opacity</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="range" id="tdim-slider" class="ci-slider" min="0" max="0.85" step="0.05" value="0.35" style="width:60px;">
            <input class="ci-input" id="tdim-opacity-text" type="text" value="0.35" style="width:45px;">
          </div>
        </div>
      </div>
      <button class="ci-btn-primary" id="tdim-apply-btn" style="width:100%;font-size:11px;margin-top:8px;border-color:rgba(100,150,200,0.6);background:linear-gradient(180deg,#2a4a6a,#1a3050);">Apply Transparent Dim</button>
    </div>

    <!-- TEXT READABILITY -->
    <div style="border:1px solid rgba(150,200,100,0.2);padding:10px;background:rgba(0,0,0,0.15);">
      <div style="font-size:11px;font-weight:bold;color:#8ab870;margin-bottom:6px;">3. Text Readability Helpers</div>
      <div style="font-size:9px;color:#3a5060;margin-bottom:8px;">Works regardless of whether you replaced or removed backgrounds. Adds shadows and fallback colors to critical UI text.</div>

      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="read-text-shadow" checked style="accent-color:#c8aa6e;cursor:pointer;">
          <span style="font-size:11px;color:#a0b4c8;">Text shadow on headers & names</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="read-nav-contrast" checked style="accent-color:#c8aa6e;cursor:pointer;">
          <span style="font-size:11px;color:#a0b4c8;">Boost nav item & currency contrast</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="read-panel-tint" style="accent-color:#c8aa6e;cursor:pointer;">
          <span style="font-size:11px;color:#a0b4c8;">Semi-transparent tint behind UI panels</span>
        </label>
        <div class="ci-inline-row" style="margin-top:4px;">
          <div class="ci-field"><div class="ci-label">Panel tint color</div>
            <div class="ci-color-pair">
              <input class="ci-color-input" id="read-panel-picker" type="color" value="#000000">
              <input class="ci-input" id="read-panel-text" type="text" value="#000000" style="width:70px;">
            </div>
          </div>
          <div class="ci-field"><div class="ci-label">Panel tint opacity</div>
            <div style="display:flex;align-items:center;gap:6px;">
              <input type="range" id="read-panel-slider" class="ci-slider" min="0" max="0.8" step="0.05" value="0.3" style="width:60px;">
              <input class="ci-input" id="read-panel-opacity" type="text" value="0.3" style="width:45px;">
            </div>
          </div>
        </div>
      </div>
      <button class="ci-btn-primary" id="read-apply-btn" style="width:100%;font-size:11px;background:linear-gradient(180deg,#3a5a2a,#253a18);border-color:rgba(150,200,100,0.5);">Apply Readability CSS</button>
    </div>

    <div style="text-align:center;margin-top:8px;"><span class="ci-flash" id="dim-flash"></span></div>
  `;

  // Replace BG dim (mode 1)
  const picker = row.querySelector("#dim-picker");
  const text = row.querySelector("#dim-text");
  const overlaySlider = row.querySelector("#dim-overlay-slider");
  const overlayText = row.querySelector("#dim-overlay-text");
  const blurSlider = row.querySelector("#dim-blur-slider");
  const blurText = row.querySelector("#dim-blur-text");

  picker.addEventListener("input", () => (text.value = picker.value));
  text.addEventListener("input", () => { if (/^#[0-9a-f]{6}$/i.test(text.value)) picker.value = text.value; });
  overlaySlider.addEventListener("input", () => (overlayText.value = overlaySlider.value));
  overlayText.addEventListener("input", () => { const v = parseFloat(overlayText.value); if (!Number.isNaN(v)) overlaySlider.value = v; });
  blurSlider.addEventListener("input", () => (blurText.value = blurSlider.value));
  blurText.addEventListener("input", () => { const v = parseInt(blurText.value); if (!Number.isNaN(v)) blurSlider.value = v; });

  row.querySelector("#dim-apply-btn").addEventListener("click", () => {
    const color = text.value.trim() || "#000000";
    const overlayOp = overlayText.value.trim() || "0.45";
    const blurPx = blurText.value.trim() || "0";
    const overlay = hexToRgbaString(color, overlayOp);

    const START_MARKER = "/* === GLOBAL DIM CONTROLLER === */";
    const END_MARKER = "/* === END GLOBAL DIM CONTROLLER === */";
    const lines = [
      START_MARKER,
      `:root {`,
      `  --sc-dim-color: ${color};`,
      `  --sc-dim-overlay: ${overlay};`,
      `  --sc-bg-blur: ${blurPx}px;`,
      `}`,
      END_MARKER,
    ];
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(row.querySelector("#dim-flash"), "Replace BG Dim Applied!", "#4caf82");
  });

  // Transparent theme dim (mode 2)
  const tdimPicker = row.querySelector("#tdim-picker");
  const tdimText = row.querySelector("#tdim-text");
  const tdimSlider = row.querySelector("#tdim-slider");
  const tdimOpText = row.querySelector("#tdim-opacity-text");

  tdimPicker.addEventListener("input", () => (tdimText.value = tdimPicker.value));
  tdimText.addEventListener("input", () => { if (/^#[0-9a-f]{6}$/i.test(tdimText.value)) tdimPicker.value = tdimText.value; });
  tdimSlider.addEventListener("input", () => (tdimOpText.value = tdimSlider.value));
  tdimOpText.addEventListener("input", () => { const v = parseFloat(tdimOpText.value); if (!Number.isNaN(v)) tdimSlider.value = v; });

  row.querySelector("#tdim-apply-btn").addEventListener("click", () => {
    const color = tdimText.value.trim() || "#000000";
    const opacity = tdimOpText.value.trim() || "0.35";
    const rgba = hexToRgbaString(color, opacity);

    const START_MARKER = "/* === TRANSPARENT THEME DIM === */";
    const END_MARKER = "/* === END TRANSPARENT THEME DIM === */";
    const lines = [
      START_MARKER,
      `/* Dim overlay for transparent theme — sits behind all UI, above OS window */`,
      `#rcp-fe-viewport-root {`,
      `  position: relative !important;`,
      `  isolation: isolate !important;`,
      `}`,
      `#rcp-fe-viewport-root::before {`,
      `  content: '' !important;`,
      `  position: absolute !important;`,
      `  inset: 0 !important;`,
      `  background: ${rgba} !important;`,
      `  z-index: -1 !important;`,
      `  pointer-events: none !important;`,
      `}`,
      END_MARKER,
    ];
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(row.querySelector("#dim-flash"), "Transparent Dim Applied!", "#4caf82");
  });

  // Text readability (mode 3)
  const panelPicker = row.querySelector("#read-panel-picker");
  const panelText = row.querySelector("#read-panel-text");
  const panelSlider = row.querySelector("#read-panel-slider");
  const panelOpacity = row.querySelector("#read-panel-opacity");

  panelPicker.addEventListener("input", () => (panelText.value = panelPicker.value));
  panelText.addEventListener("input", () => { if (/^#[0-9a-f]{6}$/i.test(panelText.value)) panelPicker.value = panelText.value; });
  panelSlider.addEventListener("input", () => (panelOpacity.value = panelSlider.value));
  panelOpacity.addEventListener("input", () => { const v = parseFloat(panelOpacity.value); if (!Number.isNaN(v)) panelSlider.value = v; });

  row.querySelector("#read-apply-btn").addEventListener("click", () => {
    const doTextShadow = row.querySelector("#read-text-shadow").checked;
    const doNavContrast = row.querySelector("#read-nav-contrast").checked;
    const doPanelTint = row.querySelector("#read-panel-tint").checked;
    const pColor = panelText.value.trim() || "#000000";
    const pOp = panelOpacity.value.trim() || "0.3";
    const pRgba = hexToRgbaString(pColor, pOp);

    const START_MARKER = "/* === TEXT READABILITY === */";
    const END_MARKER = "/* === END TEXT READABILITY === */";
    const lines = [START_MARKER];

    if (doTextShadow) {
      lines.push(
        `/* Text shadow on readability-critical elements */`,
        `.player-name, .section-text, .activity-center__header_title,`,
        `.parties-game-type-card-name, .champion-name, .style-profile-summoner-name,`,
        `.champion-title, .lobby-header-content, .challenge-banner-title-container,`,
        `.player-name-component, .lol-regalia-rank-division-text, .level-text,`,
        `.category-name, .heading, .tournament-name {`,
        `  text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 2px 12px rgba(0,0,0,0.7) !important;`,
        `}`,
      );
    }

    if (doNavContrast) {
      lines.push(
        `/* Nav items & currency — boost visibility on transparent backgrounds */`,
        `.section-text, .navigation-bar .section { color: #f0e6d3 !important; }`,
        `.currency-be-text, .currency-rp-top-up { text-shadow: 0 1px 4px rgba(0,0,0,0.8) !important; }`,
        `.menu-item-icon { filter: drop-shadow(0 1px 3px rgba(0,0,0,0.8)) !important; }`,
      );
    }

    if (doPanelTint) {
      lines.push(
        `/* Semi-transparent tint behind key UI panels for legibility */`,
        `.v2-lobby-root-component, .v2-footer-component, .v2-header-component,`,
        `.party-members-container, .invite-info-panel-container,`,
        `.lol-social-identity, .alpha-version-panel,`,
        `.parties-game-select-wrapper {`,
        `  background-color: ${pRgba} !important;`,
        `  backdrop-filter: blur(4px) !important;`,
        `}`,
      );
    }

    if (lines.length === 1) lines.push("/* No options selected */");
    lines.push(END_MARKER);
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(row.querySelector("#dim-flash"), "Readability Applied!", "#4caf82");
  });

  return row;
}

function buildNavbarRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.padding = "16px 14px";

  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:13px; margin-bottom: 6px;">Transparent Navbar</div>
    <div class="ci-generic-desc" style="margin-bottom: 12px;">Align the navbar cleanup with your transparent theme instead of the older minimal sweep.</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="nav-backdrop" checked style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Transparent navbar backdrop</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="nav-top-border" checked style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Keep top border tweak for navigation screen</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="nav-root-border" checked style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Remove navigation root bottom border</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="nav-hide-dividers" checked style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Hide right vertical rule and ambient background</span>
      </label>
    </div>
    <button class="ci-btn-primary" id="nav-apply-btn" style="width:100%;font-size:11px;margin-top:12px;">Update Navbar CSS</button>
    <div style="text-align:center; margin-top:6px;"><span class="ci-flash" id="nav-flash"></span></div>
  `;

  row.querySelector("#nav-apply-btn").addEventListener("click", () => {
    const START_MARKER = "/* === NAVBAR === */";
    const END_MARKER = "/* === END NAVBAR === */";
    const lines = [START_MARKER];
    if (row.querySelector("#nav-backdrop").checked) {
      lines.push(`.navbar_backdrop {`);
      lines.push(`  backdrop-filter: none !important;`);
      lines.push(`  background: transparent !important;`);
      lines.push(`}`);
    }
    if (row.querySelector("#nav-top-border").checked) {
      lines.push(`div[data-screen-name="rcp-fe-lol-navigation-screen"] {`);
      lines.push(`  border-top-width: 1px;`);
      lines.push(`}`);
    }
    if (row.querySelector("#nav-root-border").checked) {
      lines.push(`.navigation-root-component {`);
      lines.push(`  border-bottom: none !important;`);
      lines.push(`}`);
    }
    if (row.querySelector("#nav-hide-dividers").checked) {
      lines.push(`.right-nav-vertical-rule, #background-ambient {`);
      lines.push(`  display: none !important;`);
      lines.push(`}`);
    }
    if (lines.length === 1) lines.push(`/* No options selected */`);
    lines.push(END_MARKER);
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(row.querySelector("#nav-flash"), "Navbar CSS Updated!", "#4caf82");
  });

  return row;
}

function buildNavbarPlayButtonRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.padding = "16px 14px";

  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:13px; margin-bottom: 6px;">Navbar Play Button</div>
    <div class="ci-generic-desc" style="margin-bottom: 12px;">Customize the play button glass card and its navbar placement. Moving it can require offsetting the left nav.</div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Left</div><input class="ci-input" id="pb-left" type="text" value="30vw"></div>
      <div class="ci-field"><div class="ci-label">Top</div><input class="ci-input" id="pb-top" type="text" value="12px"></div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Width</div><input class="ci-input" id="pb-width" type="text" value="180px"></div>
      <div class="ci-field"><div class="ci-label">Height</div><input class="ci-input" id="pb-height" type="text" value="34px"></div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Label</div><input class="ci-input" id="pb-label" type="text" value="Play"></div>
      <div class="ci-field"><div class="ci-label">Letter spacing</div><input class="ci-input" id="pb-spacing" type="text" value="5px"></div>
    </div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Hover spacing</div><input class="ci-input" id="pb-hover-spacing" type="text" value="7px"></div>
      <div class="ci-field"><div class="ci-label">Blur</div><input class="ci-input" id="pb-blur" type="text" value="15px"></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="pb-hide-promo" checked style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Hide deep links promo</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="pb-nav-offset" checked style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Apply linked left-nav offset</span>
      </label>
    </div>
    <div class="ci-inline-row" style="margin-top:8px;">
      <div class="ci-field"><div class="ci-label">Nav offset</div><input class="ci-input" id="pb-nav-offset-value" type="text" value="-200px"></div>
      <div class="ci-field">
        <div class="ci-label">Text color</div>
        <div class="ci-color-pair">
          <input class="ci-color-input" id="pb-text-color-picker" type="color" value="#ffffff">
          <input class="ci-input" id="pb-text-color" type="text" value="#ffffff" style="width:70px;">
        </div>
      </div>
    </div>
    <button class="ci-btn-primary" id="pb-apply-btn" style="width:100%;font-size:11px;margin-top:12px;">Update Play Button CSS</button>
    <div style="text-align:center; margin-top:6px;"><span class="ci-flash" id="pb-flash"></span></div>
  `;

  const pbTextPicker = row.querySelector("#pb-text-color-picker");
  const pbTextInput = row.querySelector("#pb-text-color");
  pbTextPicker.addEventListener("input", () => {
    pbTextInput.value = pbTextPicker.value;
  });
  pbTextInput.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(pbTextInput.value)) {
      pbTextPicker.value = pbTextInput.value;
    }
  });

  row.querySelector("#pb-apply-btn").addEventListener("click", () => {
    const left = row.querySelector("#pb-left").value.trim() || "30vw";
    const top = row.querySelector("#pb-top").value.trim() || "12px";
    const width = row.querySelector("#pb-width").value.trim() || "180px";
    const height = row.querySelector("#pb-height").value.trim() || "34px";
    const label = row.querySelector("#pb-label").value.trim() || "Play";
    const spacing = row.querySelector("#pb-spacing").value.trim() || "5px";
    const hoverSpacing = row.querySelector("#pb-hover-spacing").value.trim() || "7px";
    const blur = row.querySelector("#pb-blur").value.trim() || "15px";
    const navOffset = row.querySelector("#pb-nav-offset-value").value.trim() || "-200px";
    const textColor = row.querySelector("#pb-text-color").value.trim() || "#ffffff";

    const START_MARKER = "/* === NAVBAR PLAY BUTTON === */";
    const END_MARKER = "/* === END NAVBAR PLAY BUTTON === */";
    const lines = [
      START_MARKER,
      `.basic-button {`,
      `  left: ${left} !important;`,
      `  top: ${top} !important;`,
      `}`,
      ``,
      `.play-button-frame,`,
      `lol-uikit-video-state-machine {`,
      `  display: none !important;`,
      `}`,
      ``,
      `.play-button-container {`,
      `  background: rgba(255, 255, 255, 0.05) !important;`,
      `  backdrop-filter: blur(${blur}) brightness(1.2) !important;`,
      `  border-radius: 2px !important;`,
      `  border: 1px solid rgba(255, 255, 255, 0.2) !important;`,
      `  width: ${width} !important;`,
      `  height: ${height} !important;`,
      `  transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1) !important;`,
      `  cursor: pointer;`,
      `  overflow: hidden !important;`,
      `  box-shadow: 0 0 0 rgba(255, 255, 255, 0) !important;`,
      `}`,
      `.play-button-container:hover {`,
      `  background: rgba(255, 255, 255, 0.1) !important;`,
      `  border-color: rgba(255, 255, 255, 0.8) !important;`,
      `  box-shadow: 0 0 20px rgba(255, 255, 255, 0.1) !important;`,
      `  transform: translateY(-1px) !important;`,
      `}`,
      `.play-button-container::after {`,
      `  content: "";`,
      `  position: absolute;`,
      `  top: 0;`,
      `  left: -150%;`,
      `  width: 100%;`,
      `  height: 100%;`,
      `  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);`,
      `  transition: 0.8s;`,
      `}`,
      `.play-button-container:hover::after {`,
      `  left: 150%;`,
      `}`,
      `.play-button-content {`,
      `  left: 0 !important;`,
      `  width: 100% !important;`,
      `  display: flex !important;`,
      `  justify-content: center !important;`,
      `  align-items: center !important;`,
      `}`,
      `.play-button-text {`,
      `  visibility: hidden !important;`,
      `}`,
      `.play-button-text:after {`,
      `  content: '${label.replace(/'/g, "\\'")}';`,
      `  visibility: visible !important;`,
      `  display: block !important;`,
      `  position: absolute;`,
      `  width: 100%;`,
      `  left: 0;`,
      `  text-align: center;`,
      `  font-family: 'Nova Cut', sans-serif !important;`,
      `  font-size: 14px !important;`,
      `  font-weight: 300 !important;`,
      `  letter-spacing: ${spacing} !important;`,
      `  text-indent: ${spacing} !important;`,
      `  color: ${textColor} !important;`,
      `  transition: all 0.3s ease !important;`,
      `  text-shadow: 0 0 8px rgba(255, 255, 255, 0.2) !important;`,
      `}`,
      `.play-button-container:hover .play-button-text:after {`,
      `  color: #ffffff !important;`,
      `  letter-spacing: ${hoverSpacing} !important;`,
      `  text-indent: ${hoverSpacing} !important;`,
      `  text-shadow: 0 0 12px rgba(255, 255, 255, 0.6) !important;`,
      `}`,
      `.play-button-container:active {`,
      `  transform: scale(0.96) !important;`,
      `  filter: brightness(0.8) !important;`,
      `}`,
      `#rcp-fe-viewport-root > .rcp-fe-viewport-overlay > .screen-root[style*="visibility: hidden;"] ~ .play-button-text:after,`,
      `.play-button-component[style*="visibility: hidden;"] ~ .play-button-text:after,`,
      `.play-button-component[style*="visibility: hidden;"] + .play-button-text:after,`,
      `.play-button-component[style*="visibility: hidden;"] .play-button-text:after,`,
      `.screen-root[style*="visibility: hidden;"] .play-button-text:after,`,
      `.screen-root[style*="visibility: hidden;"] ~ .play-button-text:after,`,
      `.screen-root[style*="visibility: hidden;"] + .play-button-text:after {`,
      `  visibility: hidden !important;`,
      `}`,
      `.champion-select-main-container:not(:hidden) ~ .play-button-text:after {`,
      `  display: none !important;`,
      `  visibility: hidden !important;`,
      `}`,
      `.champion-select-main-container:visible .play-button-text:after {`,
      `  display: none !important;`,
      `}`,
    ];
    if (row.querySelector("#pb-hide-promo").checked) {
      lines.push(`.deep-links-promo {`);
      lines.push(`  display: none !important;`);
      lines.push(`}`);
    }
    lines.push(END_MARKER);
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);

    const offsetStart = "/* === NAVBAR PLAY BUTTON OFFSET === */";
    const offsetEnd = "/* === END NAVBAR PLAY BUTTON OFFSET === */";
    const offsetLines = [offsetStart];
    if (row.querySelector("#pb-nav-offset").checked) {
      offsetLines.push(`.left-nav-menu {`);
      offsetLines.push(`  position: relative !important;`);
      offsetLines.push(`  margin-left: ${navOffset} !important;`);
      offsetLines.push(`}`);
    } else {
      offsetLines.push(`/* Offset disabled */`);
    }
    offsetLines.push(offsetEnd);
    replaceOrAppendBlock(offsetLines.join("\n"), offsetStart, offsetEnd);

    flashMessage(row.querySelector("#pb-flash"), "Play Button CSS Updated!", "#4caf82");
  });

  return row;
}

function buildOthersRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.padding = "16px 14px";

  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:13px; margin-bottom: 6px;">Other Enhancements</div>
    <div class="ci-generic-desc" style="margin-bottom: 12px;">Builder version of the pasted theme refinements for settings, dropdowns, loot, event pass, and startup screens.</div>
    
    <div style="display:flex;flex-direction:column;gap:8px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="oth-settings" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Modernize Settings Dialog (Glass effect & clean borders)</span>
      </label>
      
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="oth-dropdowns" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Modernize Dropdowns & Inputs (Clean borders)</span>
      </label>
      
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="oth-loot" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Clean Loot & Inventory (Remove borders, add hover pop)</span>
      </label>

      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="oth-eventpass" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Clean Event Pass Page (Remove shroud & float background)</span>
      </label>

      <div style="margin-top: 8px; font-size:11px; font-weight:bold; color:#c8aa6e; margin-bottom: 4px;">Startup Screen / Loading</div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="oth-startup-hide-bg" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Hide Default Startup Background</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="oth-startup-hide-icon" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Hide Default League Startup Icon</span>
      </label>
      
      <div class="ci-inline-row" style="margin-top: 6px; margin-bottom: 10px;">
        <div class="ci-field" style="grid-column: span 2;">
          <div class="ci-label">Custom Startup Background Image</div>
          <div style="display:flex;gap:4px;">
            <input class="ci-input" id="oth-startup-bg-url" type="text" placeholder="./assets/startup.jpg" style="font-size:12px; padding:8px 10px;flex:1;">
            <button class="ci-btn-prop" id="oth-startup-bg-browse" title="Browse files">+</button>
          </div>
        </div>
      </div>
      <div class="ci-inline-row" style="margin-bottom: 10px;">
        <div class="ci-field" style="grid-column: span 2;">
          <div class="ci-label">Custom Startup Icon</div>
          <div style="display:flex;gap:4px;">
            <input class="ci-input" id="oth-startup-icon-url" type="text" placeholder="./assets/icon.png" style="font-size:12px; padding:8px 10px;flex:1;">
            <button class="ci-btn-prop" id="oth-startup-icon-browse" title="Browse files">+</button>
          </div>
        </div>
      </div>
    </div>
    
    <button class="ci-btn-primary" id="oth-apply-btn" style="width:100%;font-size:11px;margin-top:12px;">Update Enhancements CSS</button>
    <div style="text-align:center; margin-top:6px;">
        <span class="ci-flash" id="oth-flash"></span>
    </div>
  `;

  row.querySelector("#oth-startup-bg-browse").addEventListener("click", () => {
    attachFilePickerToInput(row.querySelector("#oth-startup-bg-url"));
  });
  row
    .querySelector("#oth-startup-icon-browse")
    .addEventListener("click", () => {
      attachFilePickerToInput(row.querySelector("#oth-startup-icon-url"));
    });

  row.querySelector("#oth-apply-btn").addEventListener("click", () => {
    const doSettings = row.querySelector("#oth-settings").checked;
    const doDropdowns = row.querySelector("#oth-dropdowns").checked;
    const doLoot = row.querySelector("#oth-loot").checked;
    const doEventPass = row.querySelector("#oth-eventpass").checked;
    const doHideBg = row.querySelector("#oth-startup-hide-bg").checked;
    const doHideIcon = row.querySelector("#oth-startup-hide-icon").checked;
    const bgUrl = row.querySelector("#oth-startup-bg-url").value.trim();
    const iconUrl = row.querySelector("#oth-startup-icon-url").value.trim();

    const START_MARKER = "/* === OTHER ENHANCEMENTS === */";
    const END_MARKER = "/* === END OTHER ENHANCEMENTS === */";
    const lines = [START_MARKER];

    if (doSettings) {
      lines.push(
        `
/* Target the main settings dialog */
lol-uikit-dialog-frame.lol-settings-container,
.lol-uikit-dialog-frame.default.bottom.bordered {
    background-color: rgba(10, 15, 20, 0.5) !important;
    backdrop-filter: blur(16px) !important;
    border-radius: 12px !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-image: none !important; /* Removes gold borders */
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5) !important;
}

/* Clean up the settings header/footer bars */
.lol-settings-title-bar,
.lol-settings-footer {
    border-bottom: none !important;
    border-top: none !important;
    background: transparent !important;
}
      `.trim(),
      );
    }

    if (doDropdowns) {
      lines.push(
        `
/* Modernize text inputs (Search boxes) */
.ember-text-field, 
lol-uikit-flat-input input,
.search-box .player-name-input__split-inputs-wrapper {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 6px !important;
    box-shadow: none !important;
    color: #fff !important;
}

/* Modernize Dropdown Menus */
lol-uikit-framed-dropdown dt.ui-dropdown-current,
.ui-dropdown dt.ui-dropdown-current, .ui-dropdown-option {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-image: none !important; /* Kills the hextech gradient */
    border-radius: 6px !important;
}

/* Dropdown hover state */
lol-uikit-framed-dropdown dt.ui-dropdown-current:hover {
    background-color: rgba(255, 255, 255, 0.05) !important;
}
/* Hide default gold borders and breaks */
.vertical-separator {
    display: none !important;
    background-image: none !important;
}

/* Pop out effect on hover */
.parties-game-type-upper-half:hover {
    transform: translateY(-1px) !important;
}
      `.trim(),
      );
    }

    if (doLoot) {
      lines.push(
        `
/* LOOT TAB: Remove borders from Loot and Skins */
.inventory-card-bg, 
img.border.border-normal, 
img.border.border-hover {
    display: none !important;
}

/* Make the item images clean */
.loot-item-visual-container, 
.inventory-item-thumbnail {
    border-radius: 8px !important;
    overflow: hidden !important;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5) !important;
    transition: transform 0.2s ease !important;
}

/* Hover pop effect */
.loot-item:hover,
.inventory-card-wrapper:hover .inventory-item-thumbnail {
    transform: scale(1.05) !important;
}

/* Clean up Loot Quantities text */
.quantity-text-container {
    background: rgba(0, 0, 0, 0.50) !important;
    border: none !important;
    border-radius: 8px !important;
    color: white !important;
}
.quantity-background { display: none !important; }
      `.trim(),
      );
    }

    if (doEventPass) {
      lines.push(
        `
/* Clean Event Pass Page */
.season-pass-background-shroud {
	display: none !important;
}

.season-pass-background-extended {
	position: absolute !important;
	top: 45% !important;
	left: 50% !important;
	transform: translate(-50%, -50%) !important;
	max-width: 50vw !important;
	max-height: 60vh !important;
	border-radius: 20px !important;
	box-shadow: 0 40px 120px rgba(0, 0, 0, 0.7),
    0 0 60px rgba(0, 0, 0, 0.4) !important;
	-webkit-mask-image: radial-gradient(circle at center,
    rgba(0,0,0,1) 75%,
    rgba(0,0,0,0.85) 85%,
    rgba(0,0,0,0) 100%) !important;
	filter: contrast(1.05) saturate(1.05) !important;
}

.season-pass-background-extended::after {
	content: "" !important;
	position: absolute !important;
	inset: -2px !important;
	border-radius: 22px !important;
	background: radial-gradient(circle at center,
    rgba(255,255,255,0.08),
    transparent 70%) !important;
	pointer-events: none !important;
}

.season-pass-header-background {
	display: none !important;
}
      `.trim(),
      );
    }

    if (doHideBg) {
      lines.push(
        `
.lol-loading-screen-container.lol-loading-screen-default-state.lol-loading-screen-gameflow-state {
    background-image: none !important;
}
      `.trim(),
      );
    } else if (bgUrl) {
      lines.push(
        `
.lol-loading-screen-container.lol-loading-screen-default-state.lol-loading-screen-gameflow-state {
    background-image: url('${bgUrl}') !important;
    background-size: cover !important;
    background-position: center !important;
}
      `.trim(),
      );
    }

    if (doHideIcon) {
      lines.push(
        `
.lol-loading-screen-container .lol-loading-screen-lol-icon {
    display: none !important;
}
      `.trim(),
      );
    } else if (iconUrl) {
      lines.push(
        `
.lol-loading-screen-container .lol-loading-screen-lol-icon {
    background-image: url('${iconUrl}') !important;
    background-size: contain !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
}
      `.trim(),
      );
    }

    if (lines.length === 1) {
      lines.push("/* No options selected */");
    }

    lines.push(END_MARKER);
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(
      row.querySelector("#oth-flash"),
      "Enhancements Updated!",
      "#4caf82",
    );
  });

  return row;
}
function buildCleanNavbarRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.padding = "16px 14px";

  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:13px; margin-bottom: 6px;">Clean Navbar</div>
    <div class="ci-generic-desc" style="margin-bottom: 12px;">Removes borders, blur, dividers, and background from the top navigation bar.</div>
    <button class="ci-btn-primary" id="cn-apply-btn" style="width:100%;font-size:11px;margin-top:12px;">Update Navbar CSS</button>
    <div style="text-align:center; margin-top:6px;">
        <span class="ci-flash" id="cn-flash"></span>
    </div>
  `;

  row.querySelector("#cn-apply-btn").addEventListener("click", () => {
    const START_MARKER =
      "/* =========================================== */\n/* MINIMAL SWEEP                               */\n/* =========================================== */";
    const END_MARKER =
      "/* =========================================== */\n/* END OF MINIMAL SWEEP                        */\n/* =========================================== */";
    const lines = [
      START_MARKER,
      `.navbar-blur,`,
      `.play-button-frame,`,
      `.navigation-root-component,`,
      `.lobby-header-overlay {`,
      `background: transparent !important;`,
      `border: none !important;`,
      `backdrop-filter: none !important;`,
      `}`,
      `.right-nav-vertical-rule,`,
      `.lobby-header-overlay,`,
      `#background-ambient {`,
      `  display: none !important;`,
      `}`,
      END_MARKER,
    ];

    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(
      row.querySelector("#cn-flash"),
      "Navbar CSS Updated!",
      "#4caf82",
    );
  });

  return row;
}

function buildBackgroundCustomizationRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.background = "rgba(200, 170, 110, 0.05)";
  row.style.padding = "16px 14px";

  const currentSettings = getSettings();
  const initEffect = currentSettings.windowEffect || {
    enabled: currentSettings.blurEnabled === true,
    name: "blurbehind",
    colorBase: "#ff0000",
    alpha: "10",
    color: currentSettings.blurColor || "#ff000010",
    material: "none",
  };

  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:13px; margin-bottom: 6px;">Background Editor</div>
    <div class="ci-generic-desc" style="margin-bottom: 12px;">Replace backgrounds with custom images or strip them away entirely. Options apply dynamically to chosen screens.</div>

    <!-- REPLACE SECTION -->
    <div style="margin-bottom: 16px; border: 1px solid rgba(200,170,110,0.3); padding: 10px; background: rgba(0,0,0,0.2);">
      <div style="font-size:11px; font-weight:bold; color:#c8aa6e; margin-bottom: 8px;">1. Replace Backgrounds</div>
      
      <div class="ci-inline-row" style="margin-bottom: 10px;">
        <div class="ci-field" style="grid-column: span 2;">
          <div class="ci-label">Background Image URL</div>
          <div style="display:flex;gap:4px;">
            <input class="ci-input" id="bc-bg-url" type="text" placeholder="./assets/maki.jpg" style="font-size:12px; padding:8px 10px;flex:1;">
            <button class="ci-btn-prop" id="bc-bg-browse" title="Browse files">+</button>
          </div>
        </div>
      </div>
      
      <div style="font-size:9px;color:#3a5060;margin-bottom:10px;">Use the dedicated Global Dim Controller section for theme-wide darkening. This background tool now focuses on image replacement only.</div>

      <div class="ci-label" style="margin-bottom:4px;">Screens to Replace:</div>
      <div id="bc-replace-screens" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;"></div>
      
      <button class="ci-btn-primary" id="bc-replace-btn" style="width:100%;font-size:11px;">Apply Custom Background</button>
    </div>

    <!-- REMOVE SECTION -->
    <div style="margin-bottom: 16px; border: 1px solid rgba(100,150,200,0.3); padding: 10px; background: rgba(0,0,0,0.2);">
      <div style="font-size:11px; font-weight:bold; color:#a0b4c8; margin-bottom: 8px;">2. Remove / Transparent Backgrounds</div>
      
      <div class="ci-label" style="margin-bottom:4px;">Screens to Make Transparent:</div>
      <div id="bc-remove-screens" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;"></div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;">
        <input type="checkbox" id="bc-reconnect" checked style="accent-color:#80a0c0;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Also keep game progress / reconnect states transparent</span>
      </label>

      <button class="ci-btn-secondary" id="bc-remove-btn" style="width:100%;font-size:11px;">Apply Transparency</button>
    </div>

    <!-- WINDOW EFFECT SECTION -->
    <div style="margin-bottom: 16px; border: 1px solid rgba(100,200,150,0.3); padding: 10px; background: rgba(0,0,0,0.2);">
      <div style="font-size:11px; font-weight:bold; color:#80c8a0; margin-bottom: 4px;">3. Live Window Effect</div>
      <div id="bc-effect-hint" style="font-size:9px;color:#3a5060;margin-bottom:10px;">${getWindowEffectHint(initEffect.name)}</div>

      <div class="ci-inline-row" style="margin-bottom: 10px;">
        <div class="ci-field">
          <div class="ci-label">Effect</div>
          <select class="ci-select" id="bc-effect-name">
            <option value="blurbehind"${initEffect.name === "blurbehind" ? " selected" : ""}>Blurbehind (Default)</option>
            <option value="transparent"${initEffect.name === "transparent" ? " selected" : ""}>Transparent</option>
            <option value="acrylic"${initEffect.name === "acrylic" ? " selected" : ""}>Acrylic</option>
            <option value="unified"${initEffect.name === "unified" ? " selected" : ""}>Unified</option>
            <option value="mica"${initEffect.name === "mica" ? " selected" : ""}>Mica</option>
            <option value="vibrancy"${initEffect.name === "vibrancy" ? " selected" : ""}>Vibrancy</option>
          </select>
        </div>
        
        <div class="ci-field" style="display:flex;flex-direction:column;justify-content:center;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="bc-effect-enabled" ${initEffect.enabled ? "checked" : ""} style="accent-color:#c8aa6e;cursor:pointer;">
            <span style="font-size:11px;color:#a0b4c8;">Enable Live Window Effect</span>
          </label>
        </div>
      </div>

      <div class="ci-inline-row" style="margin-bottom: 10px;">
        <div class="ci-field">
          <div class="ci-label">Tint Base Color</div>
          <div class="ci-color-pair">
            <input class="ci-color-input" id="bc-effect-base-picker" type="color" value="${initEffect.colorBase || "#ff0000"}">
            <input class="ci-input" id="bc-effect-base-text" type="text" value="${initEffect.colorBase || "#ff0000"}" style="width:70px;">
          </div>
        </div>
        <div class="ci-field">
          <div class="ci-label">Intensity</div>
          <select class="ci-select" id="bc-effect-alpha">
            <option value="10"${initEffect.alpha === "10" ? " selected" : ""}>Soft Default (10)</option>
            <option value="00"${initEffect.alpha === "00" ? " selected" : ""}>None (00)</option>
            <option value="20"${initEffect.alpha === "20" ? " selected" : ""}>Light (20)</option>
            <option value="80"${initEffect.alpha === "80" ? " selected" : ""}>Medium (80)</option>
            <option value="CC"${initEffect.alpha === "CC" ? " selected" : ""}>Strong (CC)</option>
            <option value="FF"${initEffect.alpha === "FF" ? " selected" : ""}>Heavy (FF)</option>
          </select>
        </div>
      </div>
      <div class="ci-inline-row" style="margin-bottom: 10px;">
        <div class="ci-field">
          <div class="ci-label">Material</div>
          <select class="ci-select" id="bc-effect-material">
            <option value="none"${(initEffect.material || "none") === "none" ? " selected" : ""}>None</option>
            <option value="mica"${initEffect.material === "mica" ? " selected" : ""}>Mica</option>
            <option value="acrylic"${initEffect.material === "acrylic" ? " selected" : ""}>Acrylic</option>
            <option value="tabbed"${initEffect.material === "tabbed" ? " selected" : ""}>Tabbed</option>
            <option value="HudWindow"${initEffect.material === "HudWindow" ? " selected" : ""}>HudWindow</option>
            <option value="Popover"${initEffect.material === "Popover" ? " selected" : ""}>Popover</option>
            <option value="HeaderView"${initEffect.material === "HeaderView" ? " selected" : ""}>HeaderView</option>
          </select>
        </div>
        <div class="ci-field">
          <div class="ci-label">Computed Tint</div>
          <input type="text" id="bc-effect-color" class="ci-input" value="${initEffect.color}" readonly>
        </div>
      </div>

      <button class="ci-btn-secondary" id="bc-effect-apply-btn" style="width:100%;font-size:11px;border-color:rgba(100,200,150,0.5);color:#80c8a0;">Apply Window Effect</button>
    </div>

    <div style="text-align:center; margin-top:6px;">
        <span class="ci-flash" id="bc-flash"></span>
    </div>
  `;

  row.querySelector("#bc-bg-browse").addEventListener("click", () => {
    attachFilePickerToInput(row.querySelector("#bc-bg-url"));
  });

  const replaceScreens = [
    { id: "all", label: "ALL (Global)", excl: true },
    { id: "home", label: "Home / Parties" },
    { id: "lobby", label: "Lobby" },
    { id: "profile", label: "Profile" },
    { id: "collection", label: "Collection" },
    { id: "loot", label: "Loot" },
    { id: "store", label: "Store" },
    { id: "champselect", label: "Champ Select" },
    { id: "yourshop", label: "Your Shop" },
    { id: "postgame", label: "Postgame" },
    { id: "loading", label: "Loading / Startup" },
    { id: "reconnect", label: "Reconnect / In Progress" },
  ];
  const removeScreens = [
    { id: "all", label: "ALL (Global)", excl: true },
    { id: "lobby", label: "Lobby" },
    { id: "profile", label: "Profile" },
    { id: "collection", label: "Collection" },
    { id: "loot", label: "Loot" },
    { id: "store", label: "Store" },
    { id: "matchhistory", label: "Match History" },
    { id: "champselect", label: "Champ Select" },
    { id: "home", label: "Home / Parties" },
    { id: "social", label: "Social Sidebar" },
    { id: "yourshop", label: "Your Shop" },
    { id: "clash", label: "Clash" },
    { id: "eventshop", label: "Event Shop" },
    { id: "postgame", label: "Postgame" },
    { id: "tft", label: "TFT" },
    { id: "loading", label: "Loading / Startup" },
    { id: "reconnect", label: "Reconnect / In Progress" },
  ];
  // Selector map used for both replace (::before host) and remove (transparency targets)
  // Each entry lists the specific containers to target per screen.
  const scopeMap = {
    home: ".parties-view, .parties-background, .parties-content, .parties-lower-section",
    lobby: ".lobby-header-overlay, .v2-lobby-root-component",
    profile: ".style-profile-background-image, .style-profile-masked-image",
    collection: ".collections-application",
    loot: ".loot-backdrop, .loot-content-wrapper",
    store: ".store-backdrop, .__rcp-fe-lol-store",
    matchhistory: ".match-details-root",
    champselect: ".champion-select",
    social: ".lol-social-sidebar, .rcp-fe-viewport-sidebar",
    yourshop: ".yourshop-root, .personalized-offers-root",
    clash: ".clash-root-background, .clash-root-background-landing, .clash-social-persistent",
    eventshop:
      ".rcp-fe-lol-event-shop-application, .event-shop-index, .event-shop-page-header, .event-shop-progression, .event-shop-progression-info",
    postgame: ".postgame-header-section, .postgame-champion-background-wrapper",
    tft: ".rcp-fe-lol-tft-application-background",
    loading: ".lol-loading-screen-container",
    reconnect:
      ".rcp-fe-lol-game-in-progress, .rcp-fe-lol-pre-end-of-game, .rcp-fe-lol-reconnect, .rcp-fe-lol-waiting-for-stats, .reconnect-container",
  };

  // Checkbox builder — non-ALL items are permanently disabled/struck-through
  // since per-screen targeting is fragile and ALL is the reliable path
  function buildChecks(containerId, prefix, screenDefs) {
    const container = row.querySelector("#" + containerId);

    // ALL checkbox
    const allDef = screenDefs[0];
    const allLbl = document.createElement("label");
    allLbl.style.cssText = "display:flex;align-items:center;gap:4px;font-size:10px;cursor:pointer;color:#c8aa6e;font-weight:bold;margin-bottom:4px;";
    const allChk = document.createElement("input");
    allChk.type = "checkbox";
    allChk.id = prefix + allDef.id;
    allChk.checked = true;
    allChk.style.accentColor = prefix === "rep-" ? "#c8aa6e" : "#80a0c0";
    allLbl.appendChild(allChk);
    allLbl.appendChild(document.createTextNode(allDef.label));
    container.appendChild(allLbl);

    // Note explaining why others are disabled
    const note = document.createElement("div");
    note.style.cssText = "font-size:9px;color:#3a5060;margin-bottom:6px;padding:3px 6px;border-left:2px solid #1a2535;";
    note.textContent = "Per-screen targeting has limited reliability — use ALL for consistent results.";
    container.appendChild(note);

    // Remaining items — always disabled with strikethrough
    const restWrap = document.createElement("div");
    restWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:4px 10px;opacity:0.32;pointer-events:none;";
    screenDefs.slice(1).forEach((sc) => {
      const lbl = document.createElement("label");
      lbl.style.cssText = "display:flex;align-items:center;gap:3px;font-size:10px;color:#4a6070;text-decoration:line-through;cursor:not-allowed;";
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.id = prefix + sc.id;
      chk.disabled = true;
      lbl.appendChild(chk);
      lbl.appendChild(document.createTextNode(sc.label));
      restWrap.appendChild(lbl);
    });
    container.appendChild(restWrap);
  }

  buildChecks("bc-replace-screens", "rep-", replaceScreens);
  buildChecks("bc-remove-screens", "rem-", removeScreens);

  const effName = row.querySelector("#bc-effect-name");
  const effEnabled = row.querySelector("#bc-effect-enabled");
  const effBasePicker = row.querySelector("#bc-effect-base-picker");
  const effBaseText = row.querySelector("#bc-effect-base-text");
  const effAlpha = row.querySelector("#bc-effect-alpha");
  const effColor = row.querySelector("#bc-effect-color");
  const effMaterial = row.querySelector("#bc-effect-material");
  const effHint = row.querySelector("#bc-effect-hint");
  const syncEffectColor = () => {
    const base = effBaseText.value.trim() || effBasePicker.value || "#ff0000";
    if (/^#[0-9a-f]{6}$/i.test(base)) effBasePicker.value = base;
    effColor.value = composeEffectColor(base, effAlpha.value);
    effHint.textContent = getWindowEffectHint(effName.value);
  };
  effBasePicker.addEventListener("input", () => {
    effBaseText.value = effBasePicker.value;
    syncEffectColor();
  });
  effBaseText.addEventListener("input", syncEffectColor);
  effAlpha.addEventListener("change", syncEffectColor);
  effName.addEventListener("change", syncEffectColor);
  syncEffectColor();

  row.querySelector("#bc-effect-apply-btn").addEventListener("click", async () => {
    const s = getSettings();
    s.windowEffect = {
      enabled: effEnabled.checked,
      name: effName.value,
      colorBase: effBaseText.value.trim() || effBasePicker.value || "#ff0000",
      alpha: effAlpha.value,
      color: effColor.value,
      material: effMaterial.value,
    };
    s.blurEnabled = s.windowEffect.enabled && s.windowEffect.name === "blurbehind";
    s.blurColor = s.windowEffect.color;
    await saveSettings();
    applyWindowEffect(s.windowEffect);
    flashMessage(row.querySelector("#bc-flash"), "Window Effect Updated!", "#4caf82");
  });

  // Action: Replace
  row.querySelector("#bc-replace-btn").addEventListener("click", () => {
    const bgUrl = row.querySelector("#bc-bg-url").value.trim();
    if (!bgUrl) {
      flashMessage(row.querySelector("#bc-flash"), "Enter Image URL", "#c84b4b");
      return;
    }

    const isAll = row.querySelector("#rep-all").checked;
    const selectedReplaceIds = isAll
      ? replaceScreens.slice(1).map((s) => s.id)
      : replaceScreens
          .slice(1)
          .filter((s) => row.querySelector("#rep-" + s.id).checked)
          .map((s) => s.id);

    if (!isAll && selectedReplaceIds.length === 0) {
      flashMessage(row.querySelector("#bc-flash"), "Select a screen", "#c84b4b");
      return;
    }

    const START_MARKER = "/* === BC: BACKGROUND REPLACEMENT === */";
    const END_MARKER = "/* === END BC: BACKGROUND REPLACEMENT === */";
    const lines = [START_MARKER];
    lines.push(`:root { --bc-custom-bg: url('${bgUrl}'); }`);
    lines.push(`body { overflow: hidden !important; }`);

    const hideList = [
      ".store-loading", ".loot-to-store-button", ".clash-root-action-timeline-background-gradient",
      ".clash-aram-intro-modal", ".event-shop-xp-vertical-divider", ".event-shop-page-header-vertical-divider",
      ".tft-home-footer-bg", ".tft-hub-footer-bg", ".lol-loading-screen-spinner",
      ".lol-loading-screen-status-container", ".summoner-level-ring", ".rcp-fe-lol-home-loading-spinner",
      ".style-profile-loading-spinner", ".spinner", ".parties-background img",
      ".postgame-background-image img", ".style-profile-background-image img", ".style-profile-masked-image img",
      ".background-edge-backlight", "#background-ambient", ".lobby-intro-animation-container",
      ".activity-center__background-component__blend", ".challenges-collection-component .background",
      ".leagues-root-component .ranked-intro-background", 'img[src*="map-south.png"]', 'img[src*="map-north.png"]',
      'img[src*="champ-select-planning-intro.jpg"]', 'img[src*="gameflow-background.jpg"]',
      'img[src*="ready-check-background.png"]', ".parties-background-mask", ".loot-backdrop.background-static",
      ".clash-root-background-landing", ".activity-center__tabs_footer_divider", ".loading-tab:after"
    ];

    if (isAll) {
      // ALL mode: apply ::before to the broad viewport roots correctly
      const allTargets = [
        "#rcp-fe-viewport-root", 
        ".champion-select", 
        ".lol-loading-screen-container",
        ".rcp-fe-lol-game-in-progress", 
        ".rcp-fe-lol-pre-end-of-game", 
        ".rcp-fe-lol-reconnect", 
        ".rcp-fe-lol-waiting-for-stats", 
        ".reconnect-container"
      ];
      
      const selectors = allTargets.join(",\n");
      const beforeSelectors = allTargets.map(sel => sel + "::before").join(",\n");

      lines.push(`${selectors} {`);
      lines.push(`  position: relative !important;`);
      lines.push(`  isolation: isolate !important;`);
      lines.push(`  overflow: hidden !important;`); // Vital to contain the blurred/expanded inset
      lines.push(`}`);
      
      lines.push(`${beforeSelectors} {`);
      lines.push(`  content: '' !important;`);
      lines.push(`  background-image: linear-gradient(var(--sc-dim-overlay, rgba(0, 0, 0, 0.45)), var(--sc-dim-overlay, rgba(0, 0, 0, 0.45))), var(--bc-custom-bg) !important;`);
      lines.push(`  background-size: cover !important;`);
      lines.push(`  background-position: center center !important;`);
      lines.push(`  background-repeat: no-repeat !important;`);
      lines.push(`  position: absolute !important;`);
      lines.push(`  inset: calc(var(--sc-bg-blur, 0px) * -2) !important;`); 
      lines.push(`  z-index: -1 !important;`);
      lines.push(`  opacity: 1 !important;`);
      lines.push(`  visibility: visible !important;`);
      lines.push(`  pointer-events: none !important;`);
      lines.push(`  filter: blur(var(--sc-bg-blur, 0px)) !important;`);
      lines.push(`}`);
      lines.push(``);
      
      // Also clear native backgrounds so they don't show through
      const allTransparent = [
        "body", "html", ".parties-view", ".parties-background", ".parties-background-mask",
        ".parties-content", ".parties-lower-section", ".lol-social-sidebar", ".rcp-fe-viewport-sidebar",
        ".store-backdrop", ".__rcp-fe-lol-store", ".loot-backdrop", ".loot-backdrop.background-static", ".loot-loading-screen",
        ".collections-application", ".collections-routes", ".yourshop-root", ".personalized-offers-root",
        ".clash-root-background", ".clash-root-background-landing", ".clash-social-persistent",
        ".champ-select-bg-darken", ".stats-backdrop", ".match-details-root", ".cdp-backdrop-component",
        ".rcp-fe-lol-event-shop-application", ".event-shop-index", ".event-shop-page-header", ".event-shop-progression", ".event-shop-progression-info",
        ".postgame-header-section", ".postgame-champion-background-wrapper", ".rcp-fe-lol-tft-application-background",
        ".lobby-header-overlay", ".navbar-blur", ".navbar_backdrop"
      ];
      lines.push(`${allTransparent.join(",\n")} {`);
      lines.push(`  background: transparent !important;`);
      lines.push(`  background-image: none !important;`);
      lines.push(`  filter: none !important;`);
      lines.push(`}`);
      lines.push(``);
      lines.push(`.bg-current .lol-uikit-background-switcher-image {display:none !important;}`);
      lines.push(`.store-backdrop { background-image: none; }`);
      lines.push(`.lol-uikit-background-switcher-image.fade {display:none !important;}`);
      lines.push(``);
      lines.push(`${hideList.join(",\n")} {`);
      lines.push(`  display: none !important;`);
      lines.push(`}`);
      lines.push(``);
      lines.push(`.clash-arurf-intro-modal {`);
      lines.push(`  display: none !important; opacity: 1 !important; transform: scale(1) !important; border-radius: 0px !important;`);
      lines.push(`  background-color: #15171e !important;`);
      lines.push(`  background-size: cover !important; background-position: center !important; background-repeat: repeat !important;`);
      lines.push(`  font-family: Times New Roman !important; width: 828px !important; height: 508px !important;`);
      lines.push(`}`);
    } else {
      // Per-screen mode
      selectedReplaceIds.forEach((id) => {
        const sel = scopeMap[id];
        if (!sel) return;
        const parts = sel.split(",").map((s) => s.trim()).filter(Boolean);
        parts.forEach((part) => {
          lines.push(`${part} {`);
          lines.push(`  position: relative !important;`);
          lines.push(`  isolation: isolate !important;`);
          lines.push(`  overflow: hidden !important;`);
          lines.push(`}`);
          lines.push(`${part}::before {`);
          lines.push(`  content: '' !important;`);
          lines.push(`  background-image: linear-gradient(var(--sc-dim-overlay, rgba(0, 0, 0, 0.45)), var(--sc-dim-overlay, rgba(0, 0, 0, 0.45))), var(--bc-custom-bg) !important;`);
          lines.push(`  background-size: cover !important;`);
          lines.push(`  background-position: center center !important;`);
          lines.push(`  background-repeat: no-repeat !important;`);
          lines.push(`  position: absolute !important;`);
          lines.push(`  inset: calc(var(--sc-bg-blur, 0px) * -2) !important;`);
          lines.push(`  z-index: -1 !important;`);
          lines.push(`  opacity: 1 !important;`);
          lines.push(`  visibility: visible !important;`);
          lines.push(`  pointer-events: none !important;`);
          lines.push(`  filter: blur(var(--sc-bg-blur, 0px)) !important;`);
          lines.push(`}`);
        });
        
        if (id === "profile") {
          lines.push(`.style-profile-background-image, .style-profile-masked-image { background: transparent !important; }`);
          lines.push(`.style-profile-background-image img, .style-profile-masked-image img { display: none !important; }`);
        }
        if (id === "loot") {
          lines.push(`.loot-content-wrapper .loot-backdrop, .loot-backdrop { background-image: none !important; }`);
        }
        if (id === "store") {
          lines.push(`.store-backdrop { background-image: none !important; }`);
          lines.push(`.bg-current .lol-uikit-background-switcher-image { display: none !important; }`);
        }
        if (id === "home") {
          lines.push(`.bg-current .lol-uikit-background-switcher-image { display: none !important; }`);
          lines.push(`.lol-uikit-background-switcher-image.fade { display: none !important; }`);
          lines.push(`.parties-background img { display: none !important; }`);
        }
        if (id === "champselect") {
          lines.push(`img[src*="map-south.png"], img[src*="map-north.png"], img[src*="champ-select-planning-intro.jpg"], img[src*="gameflow-background.jpg"], img[src*="ready-check-background.png"] { display: none !important; }`);
          lines.push(`.champ-select-bg-darken { background: transparent !important; }`);
        }
        if (id === "postgame") {
          lines.push(`.postgame-background-image img { display: none !important; }`);
        }
      });
    }

    lines.push(`.rcp-fe-viewport-sidebar, .lol-social-sidebar { background: transparent !important; }`);
    lines.push(`.navbar_backdrop, .navbar-blur { background: transparent !important; backdrop-filter: none !important; }`);

    lines.push(END_MARKER);
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(row.querySelector("#bc-flash"), "Background set!", "#4caf82");
  });
  
  // Action: Remove
  row.querySelector("#bc-remove-btn").addEventListener("click", () => {
    const isAll = row.querySelector("#rem-all").checked;

    const transScreens = isAll
      ? [
          "body",
          "html",
          ".parties-view",
          ".activity-center__tabs_section-divider",
          ".lol-loading-screen-container",
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
          ".lobby-header-overlay",
          ".navbar-blur",
          ".loading-content",
          ".bottom-gradient",
          ".smoke-background-container",
          ".navbar_backdrop",
        ]
      : removeScreens
          .slice(1)
          .filter((s) => row.querySelector("#rem-" + s.id).checked)
          .flatMap((s) => (scopeMap[s.id] ? scopeMap[s.id].split(",").map((x) => x.trim()) : ["." + s.id]));
 
    if (transScreens.length === 0) return;
 
    const START_MARKER = "/* === TRANSPARENT THEME FOUNDATIONS === */";
    const END_MARKER = "/* === END TRANSPARENT THEME FOUNDATIONS === */";
    const lines = [START_MARKER];
 
    lines.push(`${transScreens.join(",\n")} {`);
    lines.push(`  background: transparent !important;`);
    lines.push(`  background-image: none !important;`);
    lines.push(`  filter: none !important;`);
    lines.push(`}`);
 
    if (isAll) {
      const hideList = [
        ".store-loading",
        ".activity-center__tabs_section-divider",
        ".loot-to-store-button",
        ".clash-root-action-timeline-background-gradient",
        ".clash-aram-intro-modal",
        ".event-shop-xp-vertical-divider",
        ".event-shop-page-header-vertical-divider",
        ".tft-home-footer-bg",
        ".tft-hub-footer-bg",
        ".lol-loading-screen-spinner",
        ".lol-loading-screen-status-container",
        ".summoner-level-ring",
        ".rcp-fe-lol-home-loading-spinner",
        ".style-profile-loading-spinner",
        ".spinner",
        ".bg-current img",
        ".parties-background img",
        ".postgame-background-image img",
        ".style-profile-background-image img",
        ".style-profile-masked-image img",
        ".background-edge-backlight",
        "#background-ambient",
        ".lobby-intro-animation-container",
        ".activity-center__background-component__blend",
        ".challenges-collection-component .background",
        ".leagues-root-component .ranked-intro-background",
        'img[src*="map-south.png"]',
        'img[src*="map-north.png"]',
        'img[src*="champ-select-planning-intro.jpg"]',
        'img[src*="gameflow-background.jpg"]',
        'img[src*="ready-check-background.png"]',
        ".parties-background-mask",
        ".loot-backdrop.background-static",
        ".clash-root-background-landing",
        ".activity-center__tabs_footer_divider",
        ".loading-tab:after",
      ];
      lines.push(``);
      lines.push(
        `/* Hide generic loading spinners and explicit background graphics */`,
      );
      lines.push(`${hideList.join(",\n")} {`);
      lines.push(`  display: none !important;`);
      lines.push(`}`);
      lines.push(``);
      lines.push(
        `.bg-current .lol-uikit-background-switcher-image {display:none !important;}`,
      );
      lines.push(``);
      lines.push(`.store-backdrop { background-image: none; }`);
      lines.push(``);
      lines.push(
        `.lol-uikit-background-switcher-image.fade {display:none !important;}`,
      );
      lines.push(``);
      lines.push(`.parties-status-card-bg-container { display: none !important; }`);
      lines.push(
        `.parties-status-card, .parties-invite-info-panel, .v2-parties-invite-info-panel { background-color: transparent !important; }`,
      );
      lines.push(``);
      lines.push(`.clash-arurf-intro-modal {`);
      lines.push(
        `  display: none !important; opacity: 1 !important; transform: scale(1) !important; border-radius: 0px !important;`,
      );
      lines.push(`}`);
    }
 
    if (row.querySelector("#bc-reconnect").checked) {
      lines.push(``);
      lines.push(`.rcp-fe-lol-game-in-progress, .reconnect-container, .rcp-fe-lol-reconnect {`);
      lines.push(`  background-image: none !important;`);
      lines.push(`  background-color: transparent !important;`);
      lines.push(`}`);
    }
 
    lines.push(END_MARKER);
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(
      row.querySelector("#bc-flash"),
      "Transparency applied!",
      "#4caf82",
    );
  });
 
  return row;
}

function buildActivityCenterRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.padding = "16px 14px";

  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:13px; margin-bottom: 6px;">Home / Activity Center</div>
    <div class="ci-generic-desc" style="margin-bottom: 12px;">Use the pasted theme behavior by default: transparent activity surfaces, hidden background art, and hover-to-reveal tabs, with full-hide only as an optional extra.</div>
    
    <div style="display:flex;flex-direction:column;gap:8px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="ac-nuke-all" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Completely Hide Activity Center</span>
      </label>
      
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="ac-nuke-bg" checked style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Remove Background Images Only</span>
      </label>
      
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="ac-nuke-inner" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Remove Inner Content (Keep Left Panel)</span>
      </label>

      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="ac-hover-left" checked style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Hover-to-Reveal Left Panel</span>
      </label>
    </div>
    
    <button class="ci-btn-primary" id="ac-apply-btn" style="width:100%;font-size:11px;margin-top:12px;">Update Activity Center CSS</button>
    <div style="text-align:center; margin-top:6px;">
        <span class="ci-flash" id="ac-flash"></span>
    </div>
  `;

  row.querySelector("#ac-apply-btn").addEventListener("click", () => {
    const doAll = row.querySelector("#ac-nuke-all").checked;
    const doBg = row.querySelector("#ac-nuke-bg").checked;
    const doInner = row.querySelector("#ac-nuke-inner").checked;
    const doHover = row.querySelector("#ac-hover-left").checked;

    const START_MARKER = "/* === HOME / ACTIVITY CENTER MODS === */";
    const END_MARKER = "/* === END HOME MODS === */";
    const lines = [START_MARKER];

    if (doAll) {
      lines.push(
        `.activity-center-application, .activity-center { display: none !important; }`,
      );
    } else {
      if (doBg) {
        lines.push(
          `.activity-center-skin-activity__background-image, .activity-center__background-component { display: none !important; }`,
        );
      }
      if (doInner) {
        lines.push(`.activity-center__contents { display: none !important; }`);
      }
      if (doBg || doInner) {
        lines.push(
          `.activity-center-application, #activity-center, #activity-center .activity-center__template, .activity-center-skin-activity__background-shroud { background: transparent !important; }`,
        );
      }
      if (doHover) {
        lines.push(
          `.activity-center__tabs_container { opacity: 0 !important; transition: opacity 0.3s ease !important; }`,
        );
        lines.push(
          `.activity-center__tabs_container:hover { opacity: 1 !important; }`,
        );
      }
    }

    if (lines.length === 1) {
      lines.push(`/* No options selected */`);
    }

    lines.push(END_MARKER);
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(
      row.querySelector("#ac-flash"),
      "Activity Center CSS Updated!",
      "#4caf82",
    );
  });

  return row;
}

function buildSocialRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.padding = "16px 14px";

  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:13px; margin-bottom: 6px;">Social / Chat</div>
    <div class="ci-generic-desc" style="margin-bottom: 12px;">Align the right-side social panel with the pasted transparent theme, including chat glass styling and party-card cleanup.</div>
    
    <div style="display:flex;flex-direction:column;gap:8px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="soc-trans" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Make Sidebar Transparent</span>
      </label>

      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="soc-hover-roster" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Hover-to-Reveal Friends List</span>
      </label>

      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="soc-hover-bottom" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Hover-to-Reveal Bottom Panel (Missions/Bug Report/etc)</span>
      </label>
    </div>

    <div style="font-size:11px; font-weight:bold; color:#a0b4c8; margin-top: 12px; margin-bottom: 8px;">Hide Specific Elements:</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="checkbox" id="soc-hide-bug" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:10px;color:#a0b4c8;">Bug Report Button</span>
      </label>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="checkbox" id="soc-hide-ver" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:10px;color:#a0b4c8;">Version Number</span>
      </label>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="checkbox" id="soc-hide-voice" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:10px;color:#a0b4c8;">Voice Button</span>
      </label>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="checkbox" id="soc-hide-mission" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:10px;color:#a0b4c8;">Mission Button</span>
      </label>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="checkbox" id="soc-hide-chat" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:10px;color:#a0b4c8;">Chat Button</span>
      </label>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="checkbox" id="soc-hide-arrows" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:10px;color:#a0b4c8;">Social Arrows</span>
      </label>
    </div>

    <div style="font-size:11px; font-weight:bold; color:#a0b4c8; margin-top: 12px; margin-bottom: 8px;">Chat Window Styling:</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="soc-chat-glass" checked style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Apply frosted chat card styling</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="soc-party-clear" checked style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Transparent party status cards and invite panels</span>
      </label>
    </div>
    
    <button class="ci-btn-primary" id="soc-apply-btn" style="width:100%;font-size:11px;">Update Social CSS</button>
    <div style="text-align:center; margin-top:6px;">
        <span class="ci-flash" id="soc-flash"></span>
    </div>
  `;

  row.querySelector("#soc-apply-btn").addEventListener("click", () => {
    const doTrans = row.querySelector("#soc-trans").checked;
    const doHoverRoster = row.querySelector("#soc-hover-roster").checked;
    const doHoverBottom = row.querySelector("#soc-hover-bottom").checked;

    const hideBug = row.querySelector("#soc-hide-bug").checked;
    const hideVer = row.querySelector("#soc-hide-ver").checked;
    const hideVoice = row.querySelector("#soc-hide-voice").checked;
    const hideMission = row.querySelector("#soc-hide-mission").checked;
    const hideChat = row.querySelector("#soc-hide-chat").checked;
    const hideArrows = row.querySelector("#soc-hide-arrows").checked;

    const doChatGlass = row.querySelector("#soc-chat-glass").checked;
    const doPartyClear = row.querySelector("#soc-party-clear").checked;

    const START_MARKER = "/* === SOCIAL PANEL MODS === */";
    const END_MARKER = "/* === END SOCIAL MODS === */";
    const lines = [START_MARKER];

    if (doTrans) {
      lines.push(
        `.rcp-fe-viewport-sidebar { background: transparent !important; }`,
      );
      lines.push(`.lol-social-sidebar { background: transparent !important; }`);
    }
    if (doHoverRoster) {
      lines.push(
        `.lol-social-lower-pane-container { opacity: 0 !important; transition: opacity 0.2s ease !important; }`,
      );
      lines.push(
        `.lol-social-lower-pane-container:hover, .lol-social-sidebar:hover .lol-social-lower-pane-container { opacity: 1 !important; transition: opacity 0.2s ease !important; }`,
      );
    }
    if (doHoverBottom) {
      lines.push(
        `.alpha-version-panel { opacity: 0 !important; transition: opacity 0.2s ease !important; pointer-events: none; }`,
      );
      lines.push(
        `.alpha-version-panel:hover, .lol-social-sidebar:hover .alpha-version-panel { opacity: 1 !important; pointer-events: auto; }`,
      );
    }
    if (doChatGlass) {
      lines.push(`lol-social-chat-window { margin-right: 5px !important; }`);
      lines.push(`lol-social-chat-window #chat-window-wrapper {`);
      lines.push(`  background-color: rgba(10, 10, 15, 0.45) !important;`);
      lines.push(`  backdrop-filter: blur(12px) !important;`);
      lines.push(`  border-top-left-radius: 8px !important;`);
      lines.push(`  border-top-right-radius: 8px !important;`);
      lines.push(`  border: 1px solid rgba(255,255,255,0.05) !important;`);
      lines.push(`  border-bottom: none !important;`);
      lines.push(`}`);
      lines.push(
        `lol-social-chat-window .chat-header { background: transparent !important; }`,
      );
      lines.push(
        `lol-social-chat-window .chat-area { background: transparent !important; }`,
      );
      lines.push(
        `lol-social-chat-window .conversation:hover, lol-social-chat-window .create-panel-search-match:hover { background: rgba(255,255,255,0.05) !important; }`,
      );
    }
    if (doPartyClear) {
      lines.push(`.parties-status-card-bg-container { display: none !important; }`);
      lines.push(`.parties-status-card { background-color: transparent !important; }`);
      lines.push(
        `.parties-invite-info-panel, .v2-parties-invite-info-panel { background-color: transparent !important; }`,
      );
    }

    const hiddenButtons = [];
    if (hideBug) hiddenButtons.push(".bug-report-button");
    if (hideVer) hiddenButtons.push(".lol-social-version-bar");
    if (hideVoice) hiddenButtons.push("lol-parties-comm-button");
    if (hideMission) hiddenButtons.push(".mission-button-component");
    if (hideChat) hiddenButtons.push(".chat-toggle-button");
    if (hideArrows) hiddenButtons.push(".arrow-container");

    if (hiddenButtons.length > 0) {
      lines.push(`${hiddenButtons.join(", ")} { display: none !important; }`);
    }

    if (lines.length === 1) {
      lines.push(`/* No options selected */`);
    }

    lines.push(END_MARKER);
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(
      row.querySelector("#soc-flash"),
      "Social CSS Updated!",
      "#4caf82",
    );
  });

  return row;
}

function buildPlayerIdentityRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.padding = "16px 14px";

  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:13px; margin-bottom: 6px;">Player Identity</div>
    <div class="ci-generic-desc" style="margin-bottom: 12px;">Customize banners, player name styles, and borders.</div>
    
    <div style="display:flex;flex-direction:column;gap:8px;">

      <div style="font-size:11px; font-weight:bold; color:#c8aa6e; margin-bottom:2px;">Your Identity <span style="font-size:9px; color:#5b5a56; font-weight:normal;">(Server-Side)</span></div>
      <div style="font-size:10px; color:#5b5a56; margin-bottom:4px;">Account-level changes visible to everyone.</div>
      <div style="display:flex; gap:6px; margin-bottom:2px;">
        <button class="ci-btn-prop" id="pi-srv-remove-banner" style="flex:1; font-size:10px; padding:6px 8px;">Remove My Banner</button>
        <button class="ci-btn-prop" id="pi-srv-remove-border" style="flex:1; font-size:10px; padding:6px 8px;">Remove My Border</button>
      </div>
      <div style="font-size:9px; color:#5b5a56; line-height:1.4;">
        Banner removal also resets equipped challenges and title.<br>
        Border removal sets crest to prestige with blank banner.
      </div>
      <div style="text-align:center;"><span class="ci-flash" id="pi-srv-flash"></span></div>

      <div style="height:1px; background: linear-gradient(90deg, transparent, #463720, transparent); margin:8px 0;"></div>

      <div style="font-size:11px; font-weight:bold; color:#c8aa6e; margin-bottom:2px;">Your Identity <span style="font-size:9px; color:#5b5a56; font-weight:normal;">(Client-Side CSS)</span></div>
      <div style="font-size:10px; color:#5b5a56; margin-bottom:4px;">Replace your banner or border locally (profile &amp; lobby).</div>
      <div class="ci-inline-row">
        <div class="ci-field" style="grid-column: span 2;">
          <div class="ci-label">Custom Banner URL</div>
          <div style="display:flex;gap:4px;">
            <input class="ci-input" id="pi-my-banner-url" type="text" placeholder="./assets/my-banner.png" style="font-size:12px; padding:8px 10px;flex:1;">
            <button class="ci-btn-prop" id="pi-my-banner-browse" title="Browse files">+</button>
          </div>
        </div>
      </div>
      <div class="ci-inline-row" style="margin-top:4px;">
        <div class="ci-field" style="grid-column: span 2;">
          <div class="ci-label">Custom Border URL</div>
          <div style="display:flex;gap:4px;">
            <input class="ci-input" id="pi-my-border-url" type="text" placeholder="./assets/my-border.png" style="font-size:12px; padding:8px 10px;flex:1;">
            <button class="ci-btn-prop" id="pi-my-border-browse" title="Browse files">+</button>
          </div>
        </div>
      </div>
      <div class="ci-inline-row" style="margin-top:4px;">
        <div class="ci-field" style="grid-column: span 2;">
          <div class="ci-label">Custom Crystal URL</div>
          <div style="display:flex;gap:4px;">
            <input class="ci-input" id="pi-my-crystal-url" type="text" placeholder="./assets/my-crystal.png" style="font-size:12px; padding:8px 10px;flex:1;">
            <button class="ci-btn-prop" id="pi-my-crystal-browse" title="Browse files">+</button>
          </div>
        </div>
      </div>

      <div style="font-size:11px; font-weight:bold; color:#c8aa6e; margin-top:8px; margin-bottom:4px;">My Player Name Style</div>
      <div class="ci-inline-row" style="margin-bottom: 6px;">
        <div class="ci-field">
          <div class="ci-label">Text Color</div>
          <div class="ci-color-pair">
            <input class="ci-color-input" id="pi-my-name-color-picker" type="color" value="">
            <input class="ci-input" id="pi-my-name-color" type="text" value="" style="width:70px;">
          </div>
        </div>
        <div class="ci-field">
          <div class="ci-label">Glow Color</div>
          <div class="ci-color-pair">
            <input class="ci-color-input" id="pi-my-name-glow-color-picker" type="color" value="">
            <input class="ci-input" id="pi-my-name-glow-color" type="text" value="" style="width:70px;">
          </div>
        </div>
      </div>
      <div class="ci-inline-row" style="margin-bottom: 10px;">
        <div class="ci-field">
          <div class="ci-label">Glow Intensity</div>
          <select class="ci-select" id="pi-my-name-glow-intensity">
            <option value="none">None</option>
            <option value="subtle">Subtle</option>
            <option value="normal">Normal</option>
            <option value="strong">Strong</option>
            <option value="intense">Intense</option>
          </select>
        </div>
      </div>

      <div style="font-size:11px; font-weight:bold; color:#c8aa6e; margin-top:8px; margin-bottom:4px;">My Title / Challenge Banner Style</div>
      <div class="ci-inline-row" style="margin-bottom: 6px;">
        <div class="ci-field">
          <div class="ci-label">Text Color</div>
          <div class="ci-color-pair">
            <input class="ci-color-input" id="pi-my-title-color-picker" type="color" value="">
            <input class="ci-input" id="pi-my-title-color" type="text" value="" style="width:70px;">
          </div>
        </div>
        <div class="ci-field">
          <div class="ci-label">Glow Color</div>
          <div class="ci-color-pair">
            <input class="ci-color-input" id="pi-my-title-glow-color-picker" type="color" value="">
            <input class="ci-input" id="pi-my-title-glow-color" type="text" value="" style="width:70px;">
          </div>
        </div>
      </div>
      <div class="ci-inline-row">
        <div class="ci-field">
          <div class="ci-label">Glow Intensity</div>
          <select class="ci-select" id="pi-my-title-glow-intensity">
            <option value="none" selected>None</option>
            <option value="subtle">Subtle</option>
            <option value="normal">Normal</option>
            <option value="strong">Strong</option>
            <option value="intense">Intense</option>
          </select>
        </div>
      </div>

      <div style="height:1px; background: linear-gradient(90deg, transparent, #463720, transparent); margin:8px 0;"></div>

      <div style="font-size:11px; font-weight:bold; color:#c8aa6e; margin-bottom:2px;">All Players <span style="font-size:9px; color:#5b5a56; font-weight:normal;">(Client-Side CSS)</span></div>
      <div style="font-size:10px; color:#5b5a56; margin-bottom:4px;">Visual overrides applied locally — affects how all players appear to you.</div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="pi-hide-banners" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Hide All Banners</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="pi-hide-border" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Hide All Level Borders</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="pi-hide-crystals" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Hide All Crystals</span>
      </label>

      <div style="font-size:11px; font-weight:bold; color:#c8aa6e; margin-top:8px; margin-bottom:4px;">Player Name Style</div>
      <div class="ci-inline-row" style="margin-bottom: 6px;">
        <div class="ci-field">
          <div class="ci-label">Text Color</div>
          <div class="ci-color-pair">
            <input class="ci-color-input" id="pi-name-color-picker" type="color" value="">
            <input class="ci-input" id="pi-name-color" type="text" value="" style="width:70px;">
          </div>
        </div>
        <div class="ci-field">
          <div class="ci-label">Glow Color</div>
          <div class="ci-color-pair">
            <input class="ci-color-input" id="pi-name-glow-color-picker" type="color" value="">
            <input class="ci-input" id="pi-name-glow-color" type="text" value="" style="width:70px;">
          </div>
        </div>
      </div>
      <div class="ci-inline-row" style="margin-bottom: 10px;">
        <div class="ci-field">
          <div class="ci-label">Glow Intensity</div>
          <select class="ci-select" id="pi-name-glow-intensity">
            <option value="none">None</option>
            <option value="subtle">Subtle</option>
            <option value="normal">Normal</option>
            <option value="strong">Strong</option>
            <option value="intense">Intense</option>
          </select>
        </div>
      </div>

      <div style="font-size:11px; font-weight:bold; color:#c8aa6e; margin-top:8px; margin-bottom:4px;">Title / Challenge Banner Style</div>
      <div class="ci-inline-row" style="margin-bottom: 6px;">
        <div class="ci-field">
          <div class="ci-label">Text Color</div>
          <div class="ci-color-pair">
            <input class="ci-color-input" id="pi-title-color-picker" type="color" value="">
            <input class="ci-input" id="pi-title-color" type="text" value="" style="width:70px;">
          </div>
        </div>
        <div class="ci-field">
          <div class="ci-label">Glow Color</div>
          <div class="ci-color-pair">
            <input class="ci-color-input" id="pi-title-glow-color-picker" type="color" value="">
            <input class="ci-input" id="pi-title-glow-color" type="text" value="" style="width:70px;">
          </div>
        </div>
      </div>
      <div class="ci-inline-row" style="margin-bottom: 10px;">
        <div class="ci-field">
          <div class="ci-label">Glow Intensity</div>
          <select class="ci-select" id="pi-title-glow-intensity">
            <option value="none" selected>None</option>
            <option value="subtle">Subtle</option>
            <option value="normal">Normal</option>
            <option value="strong">Strong</option>
            <option value="intense">Intense</option>
          </select>
        </div>
      </div>

      <div style="font-size:11px; font-weight:bold; color:#c8aa6e; margin-top:8px; margin-bottom:4px;">Customize All Avatar Borders</div>
      <div class="ci-inline-row">
        <div class="ci-field" style="grid-column: span 2;">
          <div class="ci-label">Custom Border Image URL (All Players)</div>
          <div style="display:flex;gap:4px;">
            <input class="ci-input" id="pi-border-url" type="text" placeholder="./assets/border.png" style="font-size:12px; padding:8px 10px;flex:1;">
            <button class="ci-btn-prop" id="pi-border-browse" title="Browse files">+</button>
          </div>
        </div>
      </div>
    </div>
    
    <button class="ci-btn-primary" id="pi-apply-btn" style="width:100%;font-size:11px;margin-top:12px;">Update Player Identity CSS</button>
    <div style="text-align:center; margin-top:6px;">
        <span class="ci-flash" id="pi-flash"></span>
    </div>
  `;

  // Sync color pickers
  const syncColor = (pickerId, textId) => {
    const picker = row.querySelector(pickerId);
    const text = row.querySelector(textId);
    picker.addEventListener("input", () => (text.value = picker.value));
    text.addEventListener("input", () => {
      if (/^#[0-9a-f]{6}$/i.test(text.value)) picker.value = text.value;
    });
  };

  syncColor("#pi-name-color-picker", "#pi-name-color");
  syncColor("#pi-name-glow-color-picker", "#pi-name-glow-color");
  syncColor("#pi-title-color-picker", "#pi-title-color");
  syncColor("#pi-title-glow-color-picker", "#pi-title-glow-color");

  syncColor("#pi-my-name-color-picker", "#pi-my-name-color");
  syncColor("#pi-my-name-glow-color-picker", "#pi-my-name-glow-color");
  syncColor("#pi-my-title-color-picker", "#pi-my-title-color");
  syncColor("#pi-my-title-glow-color-picker", "#pi-my-title-glow-color");

  // File picker buttons
  row.querySelector("#pi-border-browse").addEventListener("click", () => {
    attachFilePickerToInput(row.querySelector("#pi-border-url"));
  });
  row.querySelector("#pi-my-banner-browse").addEventListener("click", () => {
    attachFilePickerToInput(row.querySelector("#pi-my-banner-url"));
  });
  row.querySelector("#pi-my-border-browse").addEventListener("click", () => {
    attachFilePickerToInput(row.querySelector("#pi-my-border-url"));
  });
  row.querySelector("#pi-my-crystal-browse").addEventListener("click", () => {
    attachFilePickerToInput(row.querySelector("#pi-my-crystal-url"));
  });

  // Server-side buttons
  row.querySelector("#pi-srv-remove-banner").addEventListener("click", () => {
    const flash = row.querySelector("#pi-srv-flash");
    fetch("/lol-challenges/v1/update-player-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", "accept": "application/json" },
      body: JSON.stringify({ bannerAccent: "2" }),
    }).then((r) => {
      if (r.ok) {
        flashMessage(flash, "Banner removed!", "#4caf82");
      } else {
        flashMessage(flash, `Banner removal failed (${r.status})`, "#e49429");
      }
    }).catch(() => {
      flashMessage(flash, "Banner removal failed (network error)", "#e49429");
    });
  });

  row.querySelector("#pi-srv-remove-border").addEventListener("click", () => {
    const flash = row.querySelector("#pi-srv-flash");
    fetch("/lol-regalia/v2/current-summoner/regalia", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "accept": "application/json" },
      body: JSON.stringify({ preferredCrestType: "prestige", preferredBannerType: "blank" }),
    }).then((r) => {
      if (r.ok) {
        flashMessage(flash, "Border removed!", "#4caf82");
      } else {
        flashMessage(flash, `Border removal failed (${r.status})`, "#e49429");
      }
    }).catch(() => {
      flashMessage(flash, "Border removal failed (network error)", "#e49429");
    });
  });

  // Apply button
  row.querySelector("#pi-apply-btn").addEventListener("click", () => {
    const myBannerUrl = row.querySelector("#pi-my-banner-url").value.trim();
    const myBorderUrl = row.querySelector("#pi-my-border-url").value.trim();
    const myCrystalUrl = row.querySelector("#pi-my-crystal-url").value.trim();
    const hideBanners = row.querySelector("#pi-hide-banners").checked;
    const hideBorder = row.querySelector("#pi-hide-border").checked;
    const hideCrystals = row.querySelector("#pi-hide-crystals").checked;


    const myNameColor = row.querySelector("#pi-my-name-color").value.trim();
    const myNameGlowColor = row.querySelector("#pi-my-name-glow-color").value.trim();
    const myNameGlowIntensity = row.querySelector("#pi-my-name-glow-intensity").value;


    const myTitleColor = row.querySelector("#pi-my-title-color").value.trim();
    const myTitleGlowColor = row.querySelector("#pi-my-title-glow-color").value.trim();
    const myTitleGlowIntensity = row.querySelector("#pi-my-title-glow-intensity").value;

    const nameColor = row.querySelector("#pi-name-color").value.trim();
    const nameGlowColor = row.querySelector("#pi-name-glow-color").value.trim();
    const nameGlowIntensity = row.querySelector(
      "#pi-name-glow-intensity",
    ).value;

    const titleColor = row.querySelector("#pi-title-color").value.trim();
    const titleGlowColor = row
      .querySelector("#pi-title-glow-color")
      .value.trim();
    const titleGlowIntensity = row.querySelector(
      "#pi-title-glow-intensity",
    ).value;

    const borderUrl = row.querySelector("#pi-border-url").value.trim();

    const START_MARKER = "/* === PLAYER IDENTITY === */";
    const END_MARKER = "/* === END PLAYER IDENTITY === */";
    const lines = [START_MARKER];

    // Generate glow shadow
    const getGlowString = (color, intensity) => {
      if (intensity === "none" || !color) return "";
      if (intensity === "subtle") return `0 0 4px ${color}`;
      if (intensity === "normal") return `0 0 8px ${color}`;
      if (intensity === "strong") return `0 0 10px ${color}, 0 0 4px ${color}`;
      if (intensity === "intense")
        return `0 0 15px ${color}, 0 0 8px ${color}, 0 0 4px ${color}`;
      return "";
    };

    // Your Identity (scoped via :host-context)
    if (myBannerUrl) {
      lines.push("/* Personal Banner */");
      lines.push(`:host-context(.local-player) .regalia-banner-asset-static img,`);
      lines.push(`:host-context(lol-regalia-profile-v2-element[is-searched="false"]) .regalia-banner-asset-static img {`);
      lines.push(`  content: url('${myBannerUrl}') !important;`);
      lines.push(`  object-fit: cover !important;`);
      lines.push(`  object-position: center top !important;`);
      lines.push(`}`);
    }

    if (myBorderUrl) {
      lines.push("/* Personal Border */");
      lines.push(`:host-context(.local-player) .theme-ring-border,`);
      lines.push(`:host-context(lol-regalia-profile-v2-element[is-searched="false"]) .theme-ring-border,`);
      lines.push(`:host-context(.local-player) lol-uikit-ranked-ring-v2,`);
      lines.push(`:host-context(lol-regalia-profile-v2-element[is-searched="false"]) lol-uikit-ranked-ring-v2,`);
      lines.push(`:host-context(.local-player) lol-uikit-ranked-ring,`);
      lines.push(`:host-context(lol-regalia-profile-v2-element[is-searched="false"]) lol-uikit-ranked-ring,`);
      lines.push(`:host-context(.local-player) lol-regalia-ranked-ring,`);
      lines.push(`:host-context(lol-regalia-profile-v2-element[is-searched="false"]) lol-regalia-ranked-ring,`);
      lines.push(`:host-context(.local-player) .lol-regalia-ranked-border-container,`);
      lines.push(`:host-context(lol-regalia-profile-v2-element[is-searched="false"]) .lol-regalia-ranked-border-container {`);
      lines.push(`  display: none !important;`);
      lines.push(`}`);

      lines.push(`:host-context(.local-player) uikit-state-machine.regalia-crest-state-machine::after,`);
      lines.push(`:host-context(lol-regalia-profile-v2-element[is-searched="false"]) uikit-state-machine.regalia-crest-state-machine::after {`);
      lines.push(`  content: '';`);
      lines.push(`  position: absolute;`);
      lines.push(`  top: -50%;`);
      lines.push(`  left: -50%;`);
      lines.push(`  width: 200%;`);
      lines.push(`  height: 200%;`);
      lines.push(`  background-image: url('${myBorderUrl}') !important;`);
      lines.push(`  background-size: contain !important;`);
      lines.push(`  background-repeat: no-repeat !important;`);
      lines.push(`  background-position: center !important;`);
      lines.push(`  pointer-events: none;`);
      lines.push(`  z-index: 10;`);
      lines.push(`}`);
    }

    if (myCrystalUrl) {
      lines.push("/* Personal Crystal */");
      lines.push(`:host-context(.local-player) .challenges-crystal-container,`);
      lines.push(`:host-context(lol-regalia-profile-v2-element[is-searched="false"]) .challenges-crystal-container {`);
      lines.push(`  content: url('${myCrystalUrl}') !important;`);
      lines.push(`  display: flex !important;`);
      lines.push(`  object-fit: contain !important;`);
      lines.push(`}`);
    }

    const myNameShadow = getGlowString(myNameGlowColor, myNameGlowIntensity);
    if (myNameColor || myNameShadow) {
      lines.push("/* Personal Name Style */");
      let selBase = [
        `.local-player .player-name-component`,
        `lol-regalia-profile-v2-element[is-searched="false"] .player-name-component`,
        `.name .player-name-component`
      ];
      if (_localPuuid) selBase.push(`.hover-card:has(lol-regalia-hovercard-v2-element[puuid="${_localPuuid}" i]) .hover-card-name`);
      if (_localSummonerId) selBase.push(`.hover-card:has(lol-regalia-hovercard-v2-element[summoner-id="${_localSummonerId}"]) .hover-card-name`);
      
      lines.push(selBase.join(",\n") + " {");
      if (myNameColor) lines.push(`  color: ${myNameColor} !important;`);
      if (myNameShadow) lines.push(`  text-shadow: ${myNameShadow} !important;`);
      lines.push(`  font-weight: bold !important;`);
      lines.push(`}`);
    }

    const myTitleShadow = getGlowString(myTitleGlowColor, myTitleGlowIntensity);
    if (myTitleColor || myTitleShadow) {
      lines.push("/* Personal Title Style */");
      let selTitleBase = [
        `.local-player .challenge-banner-title-container`,
        `.style-profile-summoner-info-component:has(lol-regalia-profile-v2-element[is-searched="false"]) .challenge-banner-title-container`
      ];
      if (_localPuuid) selTitleBase.push(`.hover-card:has(lol-regalia-hovercard-v2-element[puuid="${_localPuuid}" i]) .hover-card-title`);
      if (_localSummonerId) selTitleBase.push(`.hover-card:has(lol-regalia-hovercard-v2-element[summoner-id="${_localSummonerId}"]) .hover-card-title`);
      
      lines.push(selTitleBase.join(",\n") + " {");
      if (myTitleColor) lines.push(`  color: ${myTitleColor} !important;`);
      if (myTitleShadow) lines.push(`  text-shadow: ${myTitleShadow} !important;`);
      lines.push(`}`);
    }

    // All Players
    if (hideBanners) {
      lines.push(
        ".regalia-banner-state-machine, .regalia-parties-v2-root .regalia-parties-v2-banner-backdrop, .placeholder-invited-container, .regalia-banner-asset-static-image { display: none !important; }",
      );
    }

    const nameShadow = getGlowString(nameGlowColor, nameGlowIntensity);
    if (nameColor || nameShadow) {
      lines.push(".player-name-component, .hover-card-name {");
      if (nameColor) lines.push(`  color: ${nameColor} !important;`);
      if (nameShadow) lines.push(`  text-shadow: ${nameShadow} !important;`);
      lines.push("}");
    }

    const titleShadow = getGlowString(titleGlowColor, titleGlowIntensity);
    if (titleColor || titleShadow) {
      lines.push(".challenge-banner-title-container, .hover-card-title {");
      if (titleColor) lines.push(`  color: ${titleColor} !important;`);
      if (titleShadow) lines.push(`  text-shadow: ${titleShadow} !important;`);
      lines.push("}");
    }

    if (hideBorder) {
      lines.push(".theme-ring-border, lol-uikit-ranked-ring-v2, lol-uikit-ranked-ring, lol-regalia-ranked-ring, .lol-regalia-ranked-border-container { display: none !important; }");
    } else if (borderUrl) {
      lines.push(".theme-ring-border, lol-uikit-ranked-ring-v2, lol-uikit-ranked-ring, lol-regalia-ranked-ring, .lol-regalia-ranked-border-container {");
      lines.push(`  display: none !important;`);
      lines.push("}");
      lines.push("uikit-state-machine.regalia-crest-state-machine::after {");
      lines.push(`  content: '';`);
      lines.push(`  position: absolute;`);
      lines.push(`  top: -50%;`);
      lines.push(`  left: -50%;`);
      lines.push(`  width: 200%;`);
      lines.push(`  height: 200%;`);
      lines.push(`  background-image: url('${borderUrl}') !important;`);
      lines.push("  background-size: contain !important;");
      lines.push("  background-repeat: no-repeat !important;");
      lines.push("  background-position: center !important;");
      lines.push("  pointer-events: none;");
      lines.push("  z-index: 10;");
      lines.push("}");
    }

    if (hideCrystals) {
      lines.push(".challenges-crystal-container { display: none !important; }");
    }

    if (lines.length === 1) lines.push("/* No options selected */");

    lines.push(END_MARKER);
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(
      row.querySelector("#pi-flash"),
      "Player Identity Updated!",
      "#4caf82",
    );
  });

  return row;
}

function buildPlayerHoverCardRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.padding = "16px 14px";

  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:13px; margin-bottom: 6px;">Player Hover Card</div>
    <div class="ci-generic-desc" style="margin-bottom: 12px;">Customize the appearance of the player hover card (profile tooltip).</div>
    
    <div style="display:flex;flex-direction:column;gap:8px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="phc-glass" style="accent-color:#c8aa6e;cursor:pointer;">
        <span style="font-size:11px;color:#a0b4c8;">Apply Full Glass Hover Card Style</span>
      </label>
    </div>

    <button class="ci-btn-primary" id="phc-apply-btn" style="width:100%;font-size:11px;margin-top:12px;">Update Hover Card CSS</button>
    <div style="text-align:center; margin-top:6px;">
        <span class="ci-flash" id="phc-flash"></span>
    </div>
  `;

  row.querySelector("#phc-apply-btn").addEventListener("click", () => {
    const applyGlass = row.querySelector("#phc-glass").checked;

    const START_MARKER = "/* === PLAYER HOVER CARD === */";
    const END_MARKER = "/* === END PLAYER HOVER CARD === */";
    const lines = [START_MARKER];

    if (applyGlass) {
      lines.push(
        `
.hover-card {
  padding-right: 10px;
}

/* Hide the old SVG border */
#border-container {
  display: none !important;
}

.hover-card-container {
  position: relative;
  border-radius: 16px;
  background: rgba(20, 20, 28, 0.35) !important;
  backdrop-filter: blur(18px) saturate(140%) !important;
  -webkit-backdrop-filter: blur(18px) saturate(140%) !important;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6), inset 0 1px 2px rgba(255, 255, 255, 0.1) !important;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.3s ease !important;
}

.hover-card-container:hover {
  transform: translateY(-4px) scale(1.01) !important;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7), 0 0 20px rgba(122, 162, 255, 0.4) !important;
}

.hover-card-container::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 16px;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 30%, transparent 60%) !important;
  pointer-events: none;
  z-index: 5;
}

#hover-card-backdrop {
  filter: brightness(0.45) saturate(1.1) !important;
  transform: scale(1.02) !important;
  transition: filter 0.2s ease !important;
}

.hover-card:hover #hover-card-backdrop {
  filter: brightness(0.55) saturate(1.15) !important;
}

.hover-card-name {
  color: #ffffff !important;
  font-weight: 600 !important;
  font-size: 18px !important;
  text-shadow: 0 2px 8px rgba(0,0,0,0.6) !important;
}

.hover-card-game-tag {
  color: rgba(255, 255, 255, 0.7) !important;
}

.hover-card-title {
  color: #7aa2ff !important;
}

.hover-card-info-container {
  background: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(10,12,18,0.7) 60%) !important;
}

.hover-card-footer {
  background: rgba(255, 255, 255, 0.05) !important;
  backdrop-filter: blur(10px) !important;
  border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.hover-card-mastery-score,
.hover-card-rank-image,
.hover-card-crystal-image {
  filter: drop-shadow(0 0 6px rgba(122, 162, 255, 0.6)) !important;
}

.open-party-occupancy {
  color: #4cffc6 !important;
  text-shadow: 0 0 6px rgba(76,255,198,0.6) !important;
}

.open-party-string {
  color: #7aa2ff !important;
}
`.trim(),
      );
    } else {
      lines.push("/* No options selected */");
    }

    lines.push(END_MARKER);
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(
      row.querySelector("#phc-flash"),
      "Hover Card CSS Updated!",
      "#4caf82",
    );
  });

  return row;
}

function buildChampSelectRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.padding = "16px 14px";

  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:13px; margin-bottom: 6px;">Champion Select</div>
    <div class="ci-generic-desc" style="margin-bottom: 12px;">Controls for the Champion Select phase.</div>
    
    <div style="display:flex;flex-direction:column;gap:8px;">
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
        <input type="checkbox" id="cs-glass-art" style="accent-color:#c8aa6e;cursor:pointer;margin-top:2px;">
        <div style="display:flex;flex-direction:column;">
            <span style="font-size:11px;color:#a0b4c8;font-weight:600;">Glass Card Splash Art</span>
        </div>
      </label>
    </div>
    
    <button class="ci-btn-primary" id="cs-apply-btn" style="width:100%;font-size:11px;margin-top:12px;">Update Champ Select CSS</button>
    <div style="text-align:center; margin-top:6px;">
        <span class="ci-flash" id="cs-flash"></span>
    </div>
  `;

  row.querySelector("#cs-apply-btn").addEventListener("click", () => {
    const doGlassArt = row.querySelector("#cs-glass-art").checked;

    const START_MARKER = "/* === CHAMP SELECT MODS === */";
    const END_MARKER = "/* === END CHAMP SELECT MODS === */";
    const lines = [START_MARKER];

    if (doGlassArt) {
      lines.push(
        `img.champion-background-image, div.skin-selection-thumbnail img, div.portrait-icon img {`,
      );
      lines.push(
        `  opacity: 1 !important; display: block !important; visibility: visible !important;`,
      );
      lines.push(`}`);
      lines.push(``);
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
      lines.push(`  backdrop-filter: blur(12px) saturate(110%) !important;`);
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
      lines.push(`.champion-select, .champion-select .champ-select-bg {`);
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
      lines.push(
        `img[src*="map-south.png"], img[src*="map-north.png"], img[src*="champ-select-planning-intro.jpg"], img[src*="gameflow-background.jpg"], img[src*="ready-check-background.png"] { display: none !important;}`,
      );
    } else {
      lines.push(`/* No options selected */`);
    }

    lines.push(END_MARKER);
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
    flashMessage(
      row.querySelector("#cs-flash"),
      "Champ Select CSS Updated!",
      "#4caf82",
    );
  });

  return row;
}

function buildOmniRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.style.borderBottom = "2px solid #785a28";
  row.innerHTML = `
    <div class="ci-generic-title" style="color:#f0e6d3; font-size:12px;">Omni Inspector</div>
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
        <button id="omni-extract-btn" class="ci-btn-secondary" style="font-size:10px;padding:5px 12px;">🖼 Extract Assets</button>
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
  const extractBtn = row.querySelector("#omni-extract-btn");
  const addAllFlash = row.querySelector("#omni-add-all-flash");

  let _inspInputs = [];

  // Omni Inspector runner
  const runInspect = () => {
    const sel = selInput.value.trim();
    if (!sel) return;
    const el = piercingQuerySelector(sel);
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
      const { wrap, reg } = buildPropControl(sel, prop, notBadge);
      if (reg) {
        reg.isOmni = true;
        reg.domNode = el; // pass the found node directly
        _inspInputs.push(reg);
      }
      controlsWrap.appendChild(wrap);
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

    const batch = {};
    _inspInputs.forEach((reg) => {
      let val = reg.inputEl?.value?.trim();
      if (!val || val === "" || val === "auto" || val === "normal") return;
      const finalProp = reg.prop === "scale" ? "transform" : reg.prop;

      if (
        (finalProp === "background-image" || finalProp === "content") &&
        val !== "none" &&
        val !== "inherit" &&
        val !== "initial" &&
        val !== "unset" &&
        !val.startsWith("url(") &&
        !val.startsWith("linear-gradient(") &&
        !val.startsWith("radial-gradient(")
      ) {
        val = `url('${val}')`;
      }
      batch[finalProp] = val;
    });

    if (Object.keys(batch).length === 0) return;

    setCssBatch(sel, batch);

    flashMessage(addAllFlash);
    sendToRaw();
  });

  extractBtn.addEventListener("click", () => {
    const sel = selInput.value.trim();
    if (sel) extractAndNavigate(sel);
  });

  return row;
}

// HOVER-TO-REVEAL
function buildHoverRevealRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";

  row.innerHTML = `
    <div class="ci-generic-title">Hover-to-Reveal</div>
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
      const hoverSel = item.hover || hideSel + ":hover";
      lines.push(
        `${hideSel} {\n  opacity: 0 !important;\n  transition: ${speed} !important;\n}`,
      );
      lines.push(
        `${hoverSel} {\n  opacity: 1 !important;\n  transition: ${speed} !important;\n}`,
      );
    });

    if (!lines.length) return;

    const START_MARKER =
      "/* =========================================== */\n/* HOVER-TO-REVEAL                             */\n/* =========================================== */";
    const END_MARKER =
      "/* =========================================== */\n/* END OF HOVER-TO-REVEAL                      */\n/* =========================================== */";
    lines.unshift(START_MARKER);
    lines.push(``);
    lines.push(END_MARKER);

    flashMessage(row.querySelector("#ci-flash-htr"));
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
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
    <div class="ci-generic-title">Minimal / Clean Mode</div>
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
          .map(([p, v]) => `${p}: ${v} !important;`)
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

    const START_MARKER =
      "/* =========================================== */\n/* MINIMAL SWEEP                               */\n/* =========================================== */";
    const END_MARKER =
      "/* =========================================== */\n/* END OF MINIMAL SWEEP                        */\n/* =========================================== */";
    lines.unshift(START_MARKER);
    lines.push(``);
    lines.push(END_MARKER);

    flashMessage(row.querySelector("#ci-flash-min"));
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
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
    <div class="ci-generic-title">CSS Variable Palette</div>
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
      if (val) lines.push(`${v.name}: ${val};`);
    });
    const customName = row.querySelector("#var-custom-name").value.trim();
    const customVal = row.querySelector("#var-custom-val").value.trim();
    if (customName && customVal) lines.push(`${customName}: ${customVal};`);

    if (!lines.length) return;

    const START_MARKER =
      "/* =========================================== */\n/* CSS VARIABLE PALETTE                        */\n/* =========================================== */";
    const END_MARKER =
      "/* =========================================== */\n/* END OF CSS VARIABLE PALETTE                 */\n/* =========================================== */";
    const payload = [
      START_MARKER,
      `:root {\n${lines.join("\n")}\n}`,
      END_MARKER,
    ].join("\n");

    flashMessage(row.querySelector("#ci-flash-cssvar"));
    replaceOrAppendBlock(payload, START_MARKER, END_MARKER);
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
    <div class="ci-generic-title">Global Hue-Rotate</div>
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

    const START_MARKER =
      "/* =========================================== */\n/* GLOBAL HUE ROTATE                           */\n/* =========================================== */";
    const END_MARKER =
      "/* =========================================== */\n/* END OF GLOBAL HUE ROTATE                    */\n/* =========================================== */";
    lines.unshift(START_MARKER);
    lines.push(``);
    lines.push(END_MARKER);

    flashMessage(row.querySelector("#ci-flash-hue"));
    replaceOrAppendBlock(lines.join("\n"), START_MARKER, END_MARKER);
  });

  return row;
}

// GRADIENT BACKGROUND
function buildGradientBgRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.innerHTML = `
    <div class="ci-generic-title">Gradient Background</div>
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

    const START_MARKER =
      "/* =========================================== */\n/* SCREEN TINT OVERLAY                         */\n/* =========================================== */";
    const END_MARKER =
      "/* =========================================== */\n/* END OF SCREEN TINT OVERLAY                  */\n/* =========================================== */";
    lines.unshift(START_MARKER);
    lines.push(``);
    lines.push(END_MARKER);

    flashMessage(row.querySelector("#ci-flash-tint"));
    replaceOrAppendBlock(lines.join("\n\n"), START_MARKER, END_MARKER);
  });

  return row;
}

// ROOT VIEWPORT OVERLAY (::before on #rcp-fe-viewport-root)
function buildRootOverlayRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";
  row.innerHTML = `
    <div class="ci-generic-title">Root Viewport Overlay</div>
    <div class="ci-generic-desc">Legacy advanced overlay tool. The transparent theme now prefers the dedicated Global Dim Controller, but this remains available for targeted viewport-level layering.</div>
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

    const rootProps = iso === "yes" ? "isolation: isolate;\n" : "";
    const css =
      "#rcp-fe-viewport-root {\n" +
      rootProps +
      "}\n\n#rcp-fe-viewport-root::before {\n  content: '';\n  position: absolute;\n  inset: 0;\n  background:" +
      color +
      ";\n  opacity:" +
      opacity +
      ";\n  pointer-events: none;\n  z-index:" +
      z +
      ";\n}";

    const START_MARKER =
      "/* =========================================== */\n/* ROOT VIEWPORT OVERLAY                       */\n/* =========================================== */";
    const END_MARKER =
      "/* =========================================== */\n/* END OF ROOT VIEWPORT OVERLAY                */\n/* =========================================== */";
    const payload = [START_MARKER, css, END_MARKER].join("\n\n");

    flashMessage(row.querySelector("#ci-flash-rovl"));
    replaceOrAppendBlock(payload, START_MARKER, END_MARKER);
  });
  return row;
}

// GLASS PANEL (targeted backdrop-filter)
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
    {
      id: "gp-lootstore",
      sel: ".loot-application-container, .collections-application, .__rcp-fe-lol-store",
      label: "Loot / Collections / Store",
    },
    { id: "gp-custom", sel: "", label: "Custom…" },
  ];

  row.innerHTML = `
    <div class="ci-generic-title">Glass Panel (backdrop-filter)</div>
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

    const bfVal = bright ? blur + "" + bright : blur;

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
        "backdrop-filter: blur(" +
        blur +
        ")" +
        (bright ? "" + bright : "") +
        "!important;";
      if (bg) props += "\n  background:" + bg + "!important;";
      if (radius) props += "\n  border-radius:" + radius + "!important;";
      return sel + "{\n" + props + "\n}";
    });

    const START_MARKER =
      "/* =========================================== */\n/* FROSTED GLASS PANELS                        */\n/* =========================================== */";
    const END_MARKER =
      "/* =========================================== */\n/* END OF FROSTED GLASS PANELS                 */\n/* =========================================== */";
    lines.unshift(START_MARKER);
    lines.push(END_MARKER);

    flashMessage(row.querySelector("#ci-flash-gp"));
    replaceOrAppendBlock(lines.join("\n\n"), START_MARKER, END_MARKER);
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
    <div class="ci-generic-title">Mask / Fade Edge</div>
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
        props += "-webkit-mask:" + pattern + ";\n";
      if (target === "both" || target === "standard")
        props += "mask:" + pattern + ";\n";
      return sel + "{\n" + props + "}";
    });

    const START_MARKER =
      "/* =========================================== */\n/* MASK FADE EDGES                             */\n/* =========================================== */";
    const END_MARKER =
      "/* =========================================== */\n/* END OF MASK FADE EDGES                      */\n/* =========================================== */";
    lines.unshift(START_MARKER);
    lines.push(END_MARKER);

    flashMessage(row.querySelector("#ci-flash-mf"));
    replaceOrAppendBlock(lines.join("\n\n"), START_MARKER, END_MARKER);
  });

  return row;
}

// LOCAL ASSET HELPER
function buildLocalAssetRow() {
  const row = document.createElement("div");
  row.className = "ci-generic-row";

  row.innerHTML = `
    <div class="ci-generic-title">📁 Local Asset Path</div>
    <div class="ci-generic-desc">Reference images from your plugin's <code style="color:#c8aa6e;font-size:9px;">assets/</code> folder. Drop files into <code style="color:#c8aa6e;font-size:9px;">/plugins/snooze-css/assets/</code> — Pengu serves them as static files.</div>
    <div class="ci-inline-row">
      <div class="ci-field"><div class="ci-label">Filename</div>
        <div style="display:flex;gap:4px;">
          <input class="ci-input" id="asset-file" type="text" placeholder="background.jpg" style="flex:1;">
          <button class="ci-btn-prop" id="asset-browse-btn" title="Browse files">+</button>
        </div>
      </div>
    </div>
    <div style="margin:6px 0 8px;">
      <div class="ci-label" style="margin-bottom:3px;">Generated path</div>
      <code id="asset-preview" style="font-size:10px;color:#c8aa6e;font-family:'Fira Code',monospace;background:rgba(0,0,0,0.3);padding:4px 8px;display:block;">./assets/background.jpg</code>
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
    <div class="ci-flash" id="ci-flash-asset-status" style="margin-top:6px;font-size:10px;"></div>
  `;

  const fileInput = row.querySelector("#asset-file");
  const preview = row.querySelector("#asset-preview");
  const browseBtn = row.querySelector("#asset-browse-btn");
  const statusEl = row.querySelector("#ci-flash-asset-status");

  // Create hidden file input
  const hiddenFileInput = document.createElement("input");
  hiddenFileInput.type = "file";
  hiddenFileInput.accept =
    "image/*,.webp,.jpg,.jpeg,.png,.gif,.avif,.svg,.mp4,.webm";
  hiddenFileInput.style.display = "none";
  row.appendChild(hiddenFileInput);

  const updatePreview = () => {
    const file = fileInput.value.trim() || "image.jpg";
    preview.textContent = `./assets/${file}`;
  };

  // Status flash helper
  const flashStatus = (msg, type = "info") => {
    const colors = {
      info: "#a0b4c8",
      success: "#4caf82",
      error: "#d97777",
    };
    statusEl.textContent = msg;
    statusEl.style.color = colors[type];
    setTimeout(() => (statusEl.textContent = ""), 5000);
  };

  fileInput.addEventListener("input", updatePreview);

  // File picker handler
  browseBtn.addEventListener("click", () => {
    hiddenFileInput.click();
  });

  hiddenFileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const filename = file.name;

    // Set the form field
    fileInput.value = filename;
    updatePreview();

    const relPath = `./assets/${filename}`;

    const testUrl = new URL(relPath, import.meta.url).href;
    try {
      const testFetch = await fetch(testUrl, { method: "HEAD" });
      if (testFetch.ok) {
        flashStatus(`Asset found at ${relPath}`, "success");
      } else if (testFetch.status === 404) {
        flashStatus(
          `⚠ Asset not found at ${relPath} — Make sure file exists in assets folder!`,
          "error",
        );
      } else {
        flashStatus(`Selected: ${filename}`, "success");
      }
    } catch (err) {
      flashStatus(`⚠ Please ensure ${filename} is in ./assets/`, "info");
    }

    hiddenFileInput.value = "";
  });

  row.querySelector(".ci-picker-btn").addEventListener("click", () => {
    startElementPicker((sel) => (row.querySelector("#asset-sel").value = sel));
  });

  row.querySelector('[data-action="asset"]').addEventListener("click", () => {
    const path = preview.textContent;
    const use = row.querySelector("#asset-use").value;
    const sel = row.querySelector("#asset-sel").value.trim();

    let cssToAppend = null;
    if (use === "copy") {
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
        <div style="display:flex;gap:4px;">
          <input class="ci-input" id="ci-bg-url" type="text" placeholder="https://... or file:///..." style="flex:1;">
          <button class="ci-btn-prop" id="ci-bg-browse" title="Browse files">+</button>
        </div>
      </div>
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
  row.querySelector("#ci-bg-browse").addEventListener("click", () => {
    attachFilePickerToInput(row.querySelector("#ci-bg-url"));
  });
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
        <div style="display:flex;gap:4px;">
          <input class="ci-input" id="ci-img-url" type="text" placeholder="https://... or file:///..." style="flex:1;">
          <button class="ci-btn-prop" id="ci-img-browse" title="Browse files">+</button>
        </div>
      </div>
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
  row.querySelector("#ci-img-browse").addEventListener("click", () => {
    attachFilePickerToInput(row.querySelector("#ci-img-url"));
  });
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
    <div class="ci-generic-title">Font Override</div>
    <div class="ci-generic-desc">Replace the client font globally or target specific elements. You can mix and match by adding multiple rules. Find fonts at <a style="color:#785a28;" href="https://fonts.google.com" target="_blank">fonts.google.com</a></div>
    
    <div class="ci-field" style="margin-bottom:8px;">
      <div class="ci-label">1. Google Fonts @import URL (Optional)</div>
      <input class="ci-input" id="ci-font-url" type="text" placeholder="https://fonts.googleapis.com/css2?family=Orbitron&display=swap" style="width:100%;">
      <div style="font-size:9px;color:#3a5060;margin-top:3px;padding:4px 6px;background:rgba(0,0,0,0.2);border:1px solid #1a2535;">
        💡 Tip: In Google Fonts, select your styles, click "Get embed code", and copy the @import link.
      </div>
    </div>

    <div class="ci-inline-row">
      <div class="ci-field">
        <div class="ci-label">2. Font Family Name</div>
        <input class="ci-input" id="ci-font-name" type="text" placeholder="Auto-detected or type manually">
      </div>
      <div class="ci-field">
        <div class="ci-label">3. Apply To</div>
        <select class="ci-select" id="ci-font-scope">
          <option value="both">Global (All Text)</option>
          <option value="display">Headers & Titles Only</option>
          <option value="body">Body Text Only</option>
          <option value="custom">Custom Element...</option>
        </select>
      </div>
    </div>

    <div class="ci-inline-row" id="ci-font-custom-wrap" style="display:none; margin-top:8px;">
      <div class="ci-field" style="grid-column: span 2;">
        <div class="ci-label">Custom Selector</div>
        <div style="display:flex;gap:4px;">
          <input class="ci-input" id="ci-font-custom-sel" type="text" placeholder=".player-name">
          <button class="ci-btn-prop ci-picker-btn" title="Pick element">🎯</button>
        </div>
      </div>
    </div>

    <div style="display:flex; align-items:center;">
      <button class="ci-btn-add" data-action="font" style="margin-top:8px;">→ Add to CSS</button>
      <button class="ci-btn-danger" id="ci-font-reset" style="margin-top:8px; margin-left:8px; padding:5px 10px; font-size:10px; letter-spacing:0.08em; text-transform:uppercase;">Reset Fonts</button>
      <span class="ci-flash" id="ci-flash-font">Added ✓</span>
    </div>
  `;

  // Toggle custom input
  row.querySelector("#ci-font-scope").addEventListener("change", (e) => {
    row.querySelector("#ci-font-custom-wrap").style.display =
      e.target.value === "custom" ? "block" : "none";
  });

  // Picker
  row.querySelector(".ci-picker-btn").addEventListener("click", () => {
    startElementPicker(
      (sel) => (row.querySelector("#ci-font-custom-sel").value = sel),
    );
  });

  let lastDetectedFontName = "";

  // Auto-detect on paste/input
  row.querySelector("#ci-font-url").addEventListener("input", (e) => {
    const url = e.target.value;
    const nameField = row.querySelector("#ci-font-name");
    let cleanUrl = url;
    const urlMatch = cleanUrl.match(/(https?:\/\/[^'"><\s)]+)/);
    if (urlMatch) {
      cleanUrl = urlMatch[1];
    }
    if (cleanUrl.includes("family=")) {
      const familyMatch = cleanUrl.match(/[?&]family=([^&:]+)/);
      if (familyMatch) {
        const detectedName = decodeURIComponent(familyMatch[1]).replace(
          /\+/g,
          " ",
        );
        if (!nameField.value || nameField.value === lastDetectedFontName) {
          nameField.value = detectedName;
        }
        lastDetectedFontName = detectedName;
      }
    } else if (nameField.value === lastDetectedFontName) {
      nameField.value = "";
      lastDetectedFontName = "";
    }
  });

  // Reset Fonts
  row.querySelector("#ci-font-reset").addEventListener("click", () => {
    const rawTa = row.getRootNode().querySelector("#ci-raw-textarea");
    if (rawTa) {
      let val = rawTa.value;
      val = val.replace(
        /\/\* === FONT OVERRIDE: [\s\S]*?\/\* === END FONT: .*? \*\/\n?/g,
        "",
      );
      val = val.replace(
        /@import url\(['"]https:\/\/fonts\.googleapis\.com.*?['"]\);\n?/g,
        "",
      );
      rawTa.value = val.trimStart();
      rawTa.dispatchEvent(new Event("input"));
      const applyBtn = row.getRootNode().querySelector("#ci-btn-apply");
      if (applyBtn) applyBtn.click();
      flashMessage(
        row.querySelector("#ci-flash-font"),
        "Fonts Reset!",
        "#c84b4b",
      );
    }
  });

  row.querySelector('[data-action="font"]').addEventListener("click", () => {
    const url = row.querySelector("#ci-font-url").value.trim();
    let name = row.querySelector("#ci-font-name").value.trim();
    const scope = row.querySelector("#ci-font-scope").value;
    const customSel = row.querySelector("#ci-font-custom-sel").value.trim();

    let cleanUrl = url;
    const urlMatch = cleanUrl.match(/(https?:\/\/[^'"><\s)]+)/);
    if (urlMatch) {
      cleanUrl = urlMatch[1];
    }

    if (!name && cleanUrl && cleanUrl.includes("family=")) {
      const familyMatch = cleanUrl.match(/[?&]family=([^&:]+)/);
      if (familyMatch) {
        name = decodeURIComponent(familyMatch[1]).replace(/\+/g, " ");
        row.querySelector("#ci-font-name").value = name;
      }
    }

    if (!name) {
      flashMessage(
        row.querySelector("#ci-flash-font"),
        "Enter a font name",
        "#c84b4b",
      );
      return;
    }

    if (!name.includes("'") && !name.includes('"') && !name.includes(",")) {
      name = `'${name}', sans-serif`;
    }

    const lines = [];
    const scopeName =
      scope === "custom"
        ? "CUSTOM_" + customSel.replace(/[^a-zA-Z0-9]/g, "")
        : scope.toUpperCase();
    const START_MARKER = `/* === FONT OVERRIDE: ${scopeName} === */`;
    const END_MARKER = `/* === END FONT: ${scopeName} === */`;

    lines.push(START_MARKER);

    // Prepend the @import safely to the very top of the CSS file
    if (cleanUrl) {
      const rawTa = row.getRootNode().querySelector("#ci-raw-textarea");
      if (rawTa) {
        const importStmt = `@import url('${cleanUrl}');\n`;
        if (!rawTa.value.includes(`@import url('${cleanUrl}')`)) {
          rawTa.value = importStmt + rawTa.value;
          rawTa.dispatchEvent(new Event("input"));
        }
      } else {
        lines.push(`@import url('${cleanUrl}');`);
      }
    }

    if (scope === "both") {
      lines.push(
        `:root {\n  --font-display: ${name} !important;\n  --font-body: ${name} !important;\n}`,
      );
    } else if (scope === "display") {
      lines.push(`:root {\n  --font-display: ${name} !important;\n}`);
    } else if (scope === "body") {
      lines.push(`:root {\n  --font-body: ${name} !important;\n}`);
    } else if (scope === "custom" && customSel) {
      lines.push(`${customSel} {\n  font-family: ${name} !important;\n}`);
    } else {
      flashMessage(
        row.querySelector("#ci-flash-font"),
        "Enter a selector",
        "#c84b4b",
      );
      return;
    }

    lines.push(END_MARKER);
    const finalCss = lines.join("\n");

    flashMessage(row.querySelector("#ci-flash-font"));
    replaceOrAppendBlock(finalCss, START_MARKER, END_MARKER);
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
  // If label and cls are the same, just use one to avoid repetition
  const searchVal = el.label === el.cls ? el.label : (el.label + " " + el.cls);
  row.dataset.search = searchVal.toLowerCase();

  const countBadge = document.createElement("span");
  if (el._count && el._count > 1) {
    countBadge.style.cssText =
      "font-size:9px; color:#c8aa6e; background:rgba(200,170,110,0.1); border:1px solid rgba(200,170,110,0.3); padding:0 4px; border-radius:4px; margin-right:4px; font-weight:bold;";
    countBadge.textContent = "×" + el._count;
  }
  const notBadge = document.createElement("span");
  notBadge.className = "ci-not-in-dom";
  notBadge.title = "Element not found in current DOM";
  notBadge.style.cssText =
    "font-size:8px;color:#2a3a4a;background:rgba(0,0,0,0.3);border:1px solid #1a2535;padding:1px 5px;letter-spacing:0.05em;display:none;flex-shrink:0;";
  notBadge.textContent = "not in DOM";
  const info = document.createElement("div");
  info.style.cssText =
    "display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;";
  if (el._count && el._count > 1) info.appendChild(countBadge);
  const labelSpan = document.createElement("span");
  labelSpan.className = "ci-element-label";
  labelSpan.textContent = el.label;
  const clsCode = document.createElement("code");
  clsCode.className = "ci-element-cls";
  clsCode.textContent = el.cls;
  // Copy selector helper
  clsCode.title = "Click to copy selector";
  clsCode.style.cursor = "pointer";
  clsCode.addEventListener("click", (e) => {
    e.stopPropagation();
    try {
      navigator.clipboard.writeText(el.cls);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = el.cls;
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    const prev = clsCode.textContent;
    clsCode.textContent = "✓ copied";
    clsCode.style.color = "#4caf82";
    clsCode.style.borderColor = "#4caf82";
    setTimeout(() => {
      clsCode.textContent = prev;
      clsCode.style.color = "";
      clsCode.style.borderColor = "";
    }, 1200);
  });

  // Raw button handler
  const sendBtn = document.createElement("button");
  sendBtn.className = "ci-az-send-btn";
  sendBtn.textContent = "→ Raw";
  sendBtn.title = "Send all current values to Raw CSS";
  sendBtn.style.cssText = "margin-left:auto;flex-shrink:0;";
  sendBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const regs = _inputs.filter((r) => r.cls === el.cls && r.inputEl);
    const batch = {};
    regs.forEach((reg) => {
      let val = reg.inputEl?.value?.trim();
      if (!val || val === "" || val === "auto" || val === "normal") return;
      const finalProp = reg.prop === "scale" ? "transform" : reg.prop;
      if (
        (finalProp === "background-image" || finalProp === "content") &&
        val !== "none" &&
        val !== "inherit" &&
        val !== "initial" &&
        val !== "unset" &&
        !val.startsWith("url(") &&
        !val.startsWith("linear-gradient(") &&
        !val.startsWith("radial-gradient(")
      ) {
        val = `url('${val}')`;
      }
      batch[finalProp] = val;
    });
    if (Object.keys(batch).length === 0) return;
    setCssBatch(el.cls, batch);
    sendToRaw();
  });

  // Extract assets button
  const extractBtn = document.createElement("button");
  extractBtn.className = "ci-az-send-btn";
  extractBtn.textContent = "🖼";
  extractBtn.title = "Extract assets for this element";
  extractBtn.style.cssText = "flex-shrink:0;";
  extractBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    extractAndNavigate(el.cls);
  });

  info.appendChild(labelSpan);
  info.appendChild(clsCode);
  info.appendChild(notBadge);
  info.appendChild(sendBtn);
  info.appendChild(extractBtn);
  row.appendChild(info);
  const controls = document.createElement("div");
  controls.className = "ci-element-controls";
  const localRegs = [];
  el.props.forEach((prop) => {
    const { wrap, reg } = buildPropControl(el.cls, prop, notBadge);
    controls.appendChild(wrap);
    if (reg) localRegs.push(reg);
  });
  row.appendChild(controls);

  if (el._domNode) {
    localRegs.forEach((r) => (r.domNode = el._domNode));
  }

  // Row virtualization
  row._regs = localRegs;
  _rowObserver.observe(row);

  return row;
}

// PROP CONTROLS
function buildPropControl(cls, prop, notBadge) {
  if (typeof prop === "object") {
    if (prop.type === "bg-replace")
      return { wrap: buildBgReplaceControl(cls, prop, notBadge), reg: null };
    if (prop.type === "img-replace")
      return { wrap: buildImgReplaceControl(cls, prop, notBadge), reg: null };
    return { wrap: document.createElement("span"), reg: null };
  }

  if (prop.type === "smart-asset") {
    const row = buildCompactAssetRow(prop.asset, (css) => {
      appendToRaw(css);
      flashMessage(notBadge, "Asset CSS Added!", "#4caf82");
    });
    return { wrap: row, reg: null };
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
  else if (prop === "background-image" || prop === "content") {
    const textIn = makeTextInput("url(...) or path", "120px");
    const browseBtn = document.createElement("button");
    browseBtn.className = "ci-btn-prop";
    browseBtn.textContent = "+";
    browseBtn.title = "Browse assets";
    browseBtn.style.width = "24px";
    browseBtn.style.height = "24px";
    browseBtn.addEventListener("click", () => attachFilePickerToInput(textIn));

    const group = document.createElement("div");
    group.style.display = "flex";
    group.style.gap = "4px";
    group.appendChild(textIn);
    group.appendChild(browseBtn);

    input = {
      container: group,
      textIn: textIn,
      get value() {
        return textIn.value;
      },
    };
  } else if (prop === "left" || prop === "top") {
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
    let val = input.value.trim();
    if (!val) return;

    // Auto-wrap paths in url() for background-image and content
    if (
      (prop === "background-image" || prop === "content") &&
      val !== "none" &&
      val !== "inherit" &&
      val !== "initial" &&
      val !== "unset" &&
      !val.startsWith("url(") &&
      !val.startsWith("linear-gradient(") &&
      !val.startsWith("radial-gradient(")
    ) {
      val = `url('${val}')`;
    }

    const finalProp = prop === "scale" ? "transform" : prop;
    setCssProperty(cls, finalProp, val);
    sendToRaw();
  });

  inner.appendChild(input.container);
  inner.appendChild(btn);
  wrap.appendChild(inner);
  const reg = {
    cls,
    prop: prop === "scale" ? "transform" : prop,
    inputEl: input.textIn || input.container,
    notBadge,
  };
  register(reg);
  return { wrap, reg };
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
  const browseBtn = document.createElement("button");
  browseBtn.className = "ci-btn-prop";
  browseBtn.textContent = "+";
  browseBtn.title = "Browse assets";
  browseBtn.addEventListener("click", () => attachFilePickerToInput(urlInput));

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
  inner.appendChild(browseBtn);
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
  const browseBtn = document.createElement("button");
  browseBtn.className = "ci-btn-prop";
  browseBtn.textContent = "+";
  browseBtn.title = "Browse assets";
  browseBtn.addEventListener("click", () => attachFilePickerToInput(urlInput));

  const btn = makeAddBtn(() => {
    const url = urlInput.value.trim();
    if (!url) return;
    setCssProperty(cls, "content", `url('${url}')`);
    sendToRaw();
  });
  inner.appendChild(urlInput);
  inner.appendChild(browseBtn);
  inner.appendChild(btn);
  wrap.appendChild(inner);
  return wrap;
}

// [DELETED] buildChildImgReplaceControl — replaced by smart-asset system

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
function getSmartProperties(el, searchIntent = []) {
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

  if (props.has("background-image")) {
    props.add("background-size");
    props.add("background-position");
    props.add("background-repeat");
  }

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
  const assets = collectFromNode(el, "unknown");
  assets.forEach((a) => {
    props.add({ type: "smart-asset", asset: a });
  });

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

// ELEMENT PICKER
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
  
  const settings = getSettings();
  let isGlobal = settings.lastGlobalToggle || false;
  let currentTarget = null;
  let isInShadow = false; // tracks whether currentTarget lives inside a shadow root
  let isLocked = false;

  // Shadow-piercing elementFromPoint
  function deepElementFromPoint(x, y) {
    // Start with the document-level hit
    let best = document.elementFromPoint(x, y);
    let bestArea = best
      ? best.getBoundingClientRect().width * best.getBoundingClientRect().height
      : Infinity;
    let bestInShadow = false;

    const roots = getShadowRoots();
    for (const { shadowRoot, host } of roots) {
      // Skip our own modal shadow root
      if (host.id === "snooze-css-host") continue;
      try {
        const hostRect = host.getBoundingClientRect();
        // Quick bounds check before the more expensive elementFromPoint call
        if (
          x < hostRect.left ||
          x > hostRect.right ||
          y < hostRect.top ||
          y > hostRect.bottom
        )
          continue;

        const hit = shadowRoot.elementFromPoint(x, y);
        if (!hit || hit === host) continue;

        const hitRect = hit.getBoundingClientRect();
        const area = hitRect.width * hitRect.height;
        // Prefer the smallest element (deepest in the tree) under the cursor
        if (area < bestArea && area > 0) {
          best = hit;
          bestArea = area;
          bestInShadow = true;
        }
      } catch {
        /* shadow root may be detached */
      }
    }

    isInShadow = bestInShadow;
    return best;
  }

  // Selector builder
  function buildSelector(el) {
    return buildStrategicSelector(el, isGlobal ? 'categorical' : 'specific');
  }

  function getShadowHostLabel(el) {
    // Walk up until we find a shadow root, return its host selector
    let node = el.parentNode;
    while (node) {
      if (node.nodeType === 11) {
        // ShadowRoot
        const host = node.host;
        const tag = host.tagName.toLowerCase();
        const cls = [...(host.classList || [])]
          .filter((c) => !/^(ng-|ember)/i.test(c))
          .slice(0, 2)
          .join(".");
        return tag + (cls ? "." + cls : "");
      }
      node = node.parentNode;
    }
    return null;
  }

  function isElementInShadow(el) {
    let node = el;
    while (node) {
      if (node.parentNode && node.parentNode.nodeType === 11) return true;
      node = node.parentNode;
    }
    return false;
  }

  function renderOverlay() {
    if (!currentTarget) return;
    const rect = currentTarget.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.top = rect.top + "px";
    overlay.style.left = rect.left + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    const selector = buildSelector(currentTarget);
    const hostLabel = isInShadow ? getShadowHostLabel(currentTarget) : null;

    const shadowBadge = hostLabel
      ? `<div style="font-size:9px;color:#c84b4b;margin-bottom:2px;">◆ shadow of ${hostLabel}</div>`
      : "";

    const globalCheckHtml = `
      <label style="display:flex; align-items:center; gap:4px; cursor:pointer; margin-top:6px; padding-top:6px; border-top:1px solid rgba(200,170,110,0.2); pointer-events:auto;">
        <input type="checkbox" id="ci-global-toggle" ${isGlobal ? 'checked' : ''} style="margin:0; width:12px; height:12px;">
        <span style="font-size:10px; color:#c8aa6e;">Global Selector</span>
      </label>
    `;

    if (isLocked) {
      overlay.style.borderColor = "#4caf82";
      overlay.style.backgroundColor = "rgba(76, 175, 130, 0.2)";
      label.style.borderColor = "#4caf82";
      label.style.color = "#4caf82";
      label.innerHTML = `${shadowBadge}<div style="font-weight:bold; font-size:12px; margin-bottom:4px;">${selector}</div><div style="font-size:9px; color:#a0b4c8; font-family:'Sora', sans-serif;">[Scroll / Arrows] Change Depth •[Click / Enter] Confirm • [Esc] Unlock</div>${globalCheckHtml}`;
    } else {
      overlay.style.borderColor = hostLabel ? "#c84b4b" : "#c8aa6e";
      overlay.style.backgroundColor = hostLabel
        ? "rgba(200, 75, 75, 0.15)"
        : "rgba(200, 170, 110, 0.2)";
      label.style.borderColor = hostLabel ? "#c84b4b" : "#c8aa6e";
      label.style.color = hostLabel ? "#c84b4b" : "#c8aa6e";
      label.innerHTML = `${shadowBadge}<div style="font-weight:bold; font-size:12px; margin-bottom:4px;">${selector}</div><div style="font-size:9px; color:#a0b4c8; font-family:'Sora', sans-serif;">[Click] Lock element • [Esc] Cancel</div>${globalCheckHtml}`;
    }

    const toggle = label.querySelector("#ci-global-toggle");
    if (toggle) {
      toggle.addEventListener("change", (e) => {
        isGlobal = e.target.checked;
        settings.lastGlobalToggle = isGlobal;
        saveSettings();
        renderOverlay();
      });
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
    const target = deepElementFromPoint(e.clientX, e.clientY);
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
    document.removeEventListener("mousedown", blockEvent, true);
       document.removeEventListener("mouseup", blockEvent, true);
       document.removeEventListener("pointerdown", blockEvent, true);
       document.removeEventListener("pointerup", blockEvent, true);
    overlay.remove();
    label.remove();
    if (backdrop) backdrop.style.display = "flex"; // restore modal
  }
  function confirmSelection() {
    cleanup();
    if (!currentTarget) return;
    const finalSelector = buildSelector(currentTarget);
    onPickCallback(finalSelector, currentTarget);
  }
  function blockEvent(e) {
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  function onClick(e) {
    // Ignore clicks on the checkbox and its wrapping label element only
    const toggle = label.querySelector("#ci-global-toggle");
    if (toggle && (e.target === toggle || e.target === toggle.closest("label"))) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
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
    if (e.deltaY < 0) {
      // Traverse to parent/host
      const parent = currentTarget.parentNode;
      if (parent && parent.nodeType === 11) {
        nextTarget = parent.host;
      } else {
        nextTarget = currentTarget.parentElement;
      }
    } else if (e.deltaY > 0) {
      // Step INTO shadow roots if they exist, otherwise normal light DOM
      const sRoot = currentTarget.shadowRoot || getShadowRoots().find(r => r.host === currentTarget)?.shadowRoot;
      nextTarget = sRoot ? sRoot.firstElementChild : currentTarget.firstElementChild;
      //nextTarget = currentTarget.firstElementChild;
    }
    if (
      nextTarget &&
      nextTarget.tagName !== "HTML" &&
      nextTarget.tagName !== "BODY"
    ) {
      currentTarget = nextTarget;
      isInShadow = isElementInShadow(currentTarget);
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
      if (e.key === "ArrowUp") {
        const parent = currentTarget.parentNode;
        nextTarget =
          parent && parent.nodeType === 11
            ? parent.host
            : currentTarget.parentElement;
      } else if (e.key === "ArrowDown") {
        const sRoot = currentTarget.shadowRoot || getShadowRoots().find(r => r.host === currentTarget)?.shadowRoot;
        nextTarget = sRoot ? sRoot.firstElementChild : currentTarget.firstElementChild;
      } else if (e.key === "ArrowLeft") {
        nextTarget = currentTarget.previousElementSibling;
      } else if (e.key === "ArrowRight") {
        nextTarget = currentTarget.nextElementSibling;
      }
      if (
        nextTarget &&
        nextTarget.tagName !== "HTML" &&
        nextTarget.tagName !== "BODY"
      ) {
        currentTarget = nextTarget;
        isInShadow = isElementInShadow(currentTarget);
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
  document.addEventListener("mousedown", blockEvent, true);
  document.addEventListener("mouseup", blockEvent, true);
  document.addEventListener("pointerdown", blockEvent, true);
  document.addEventListener("pointerup", blockEvent, true);
}
export function cleanupBuilderTab() {
  if (_rowObserver) {
    _rowObserver.disconnect();
  }
  _bodyEl = null;
  _inputs = [];
  _activeInputs.clear();
  _deepScanCache = null;
  _scrollPos = 0;
  _activeTags = [];
  _searchRenderToken = 0;
  setRefreshCallback(null); // clear the callback reference
}