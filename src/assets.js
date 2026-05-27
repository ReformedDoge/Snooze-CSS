// Assets Extractor Tab

import { getShadowRoots } from "./shadow-manager.js";
import { appendToRaw } from "./raw.js";
import { flashMessage, copyText, buildStrategicSelector, attachFilePicker } from "./utils.js";

// State
let _switchTab = null;
export function setSwitchTab(fn) { _switchTab = fn; }
function switchTab(name) { if (_switchTab) _switchTab(name); }

// Helpers
function appendCssToRaw(css) { appendToRaw(css); }

// The asset CSS properties we care about
export const ASSET_PROPS = [
  "background-image",
  "content",
  "-webkit-mask-image",
  "-webkit-mask",
  "border-image-source",
];

// HTML attributes that directly reference media assets
export const ASSET_ATTRS = ["src", "poster", "srcset", "data-src"];

// Tags where we collect src attributes
export const MEDIA_TAGS = new Set(["img", "video", "source", "lol-uikit-video", "uikit-video"]);

// Regex to pull all url(...) tokens from a CSS value
const URL_RE = /url\((['"]?)([^'")]+)\1\)/g;

let _container = null;
let _currentSelector = null;

// PUBLIC API

export function buildAssetsTab(container) {
  _container = container;
  container.innerHTML = "";

  // Inspector UI
  const inspector = document.createElement("div");
  inspector.style.cssText =
    "padding:12px 14px 10px;border-bottom:1px solid #1a2535;background:#060e1a;flex-shrink:0;";
  inspector.innerHTML = `
    <div style="font-size:9px;color:#4a6070;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Extract assets for selector</div>
    <div style="display:flex;gap:6px;align-items:center;">
      <input class="ci-input" id="ax-sel-input" type="text" placeholder=".class-name or #id" style="flex:1;font-family:'Fira Code',monospace;font-size:11px;">
      <button class="ci-btn-prop" id="ax-picker-btn" title="Pick element on screen">🎯</button>
      <button class="ci-btn-primary" id="ax-extract-btn" style="padding:6px 16px;font-size:10px;">Extract</button>
    </div>
  `;
  container.appendChild(inspector);

  const selInput = inspector.querySelector("#ax-sel-input");
  const extractBtn = inspector.querySelector("#ax-extract-btn");
  const pickerBtn = inspector.querySelector("#ax-picker-btn");

  extractBtn.addEventListener("click", () => {
    const sel = selInput.value.trim();
    if (sel) runExtraction(sel);
  });
  selInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const sel = selInput.value.trim();
      if (sel) runExtraction(sel);
    }
  });
  // Integration with builder picker via custom event
  pickerBtn.addEventListener("click", () => {
    container.dispatchEvent(new CustomEvent("ax-pick-element", { bubbles: true }));
  });

  const empty = document.createElement("div");
  empty.id = "ax-empty";
  empty.style.cssText =
    "padding:40px 18px;text-align:center;color:#2a3a4a;font-size:11px;line-height:1.8;";
  empty.innerHTML =
    `<div style="font-size:24px;margin-bottom:8px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1em;height:1em;vertical-align:-0.125em;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>` +
    `Enter a selector above, click the 🎯 picker, or click the ` +
    `<strong style="color:#785a28;display:inline-flex;align-items:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1em;height:1em;vertical-align:-0.125em;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></strong> button on any element in the Visual Builder.`;
  container.appendChild(empty);

  const content = document.createElement("div");
  content.id = "ax-content";
  content.style.display = "none";
  container.appendChild(content);
}

// External Navigation Handler
export function extractAndNavigate(selector, targetNode = null) {
  switchTab("assets");
  _currentSelector = selector;
  // Pre-fill the inspector input with the selector
  if (_container) {
    const input = _container.querySelector("#ax-sel-input");
    if (input) input.value = selector;
  }
  runExtraction(selector, targetNode);
}

// CORE EXTRACTION

function runExtraction(selector, targetNode = null) {
  if (!_container) return;

  const emptyEl = _container.querySelector("#ax-empty");
  const content = _container.querySelector("#ax-content");
  if (!emptyEl || !content) return;

  // When invoked from a specific element (e.g. the builder's extract button),
  // restrict extraction to that exact node to avoid collecting assets from all
  // DOM instances that share the same selector (e.g. repeated tooltip elements).
  let domNodes;
  if (targetNode) {
    domNodes = [targetNode];
  } else {
    domNodes = piercingQuerySelectorAll(selector);
  }

  emptyEl.style.display = "none";
  content.style.display = "block";
  content.innerHTML = "";

  // Header UI
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:10px 14px;background:#060e1a;" +
    "border-bottom:2px solid #785a28;flex-shrink:0;";

  const titleEl = document.createElement("div");
  titleEl.style.cssText = "flex:1;min-width:0;";
  titleEl.innerHTML =
    `<div style="font-size:9px;color:#4a6070;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:2px;">Extracting assets for</div>` +
    `<code style="font-size:11px;color:#c8aa6e;font-family:'Fira Code',monospace;word-break:break-all;">${selector}</code>` +
    `<div style="font-size:9px;color:#7a8a9a;margin-top:2px;">Found ${domNodes.length} matching element${domNodes.length === 1 ? "" : "s"}</div>`;

  const rerunBtn = document.createElement("button");
  rerunBtn.className = "ci-btn-secondary";
  rerunBtn.style.cssText = "font-size:10px;padding:4px 10px;flex-shrink:0;";
  rerunBtn.textContent = "↻ Refresh";
  rerunBtn.addEventListener("click", () => runExtraction(selector));

  if (domNodes.length === 0) {
    header.appendChild(titleEl);
    content.appendChild(header);
    const err = document.createElement("div");
    err.style.cssText = "padding:24px 18px;color:#c84b4b;font-size:11px;";
    err.textContent = `Element not found in DOM: ${selector}`;
    content.appendChild(err);
    return;
  }

  header.appendChild(titleEl);
  header.appendChild(rerunBtn);
  content.appendChild(header);

  const seenAssets = new Set();
  const selfAssets = [];
  const childAssets = [];
  const ancestorAssets = [];

  for (const domNode of domNodes) {
    const nodeSelf = collectFromNode(domNode, selector);
    for (const a of nodeSelf) {
      const fp = `${a.prop}|${a.url}`;
      if (!seenAssets.has(fp)) {
        seenAssets.add(fp);
        selfAssets.push(a);
      }
    }

    const nodeChildren = collectFromDescendants(domNode, selector, seenAssets);
    for (const a of nodeChildren) {
      childAssets.push(a);
    }

    const nodeAncestors = collectFromAncestors(domNode, selector, seenAssets);
    for (const a of nodeAncestors) {
      ancestorAssets.push(a);
    }
  }

  const totalCount =
    selfAssets.length + childAssets.length + ancestorAssets.length;

  if (totalCount === 0) {
    const none = document.createElement("div");
    none.style.cssText =
      "padding:24px 18px;color:#4a6070;font-size:11px;text-align:center;";
    none.textContent = "No image assets found for this element or its context.";
    content.appendChild(none);
    return;
  }

  // Summary bar
  const summary = document.createElement("div");
  summary.style.cssText =
    "padding:6px 14px;font-size:10px;color:#4a6070;border-bottom:1px solid #1a2535;" +
    "display:flex;align-items:center;justify-content:space-between;";
  summary.innerHTML = `<span>${totalCount} asset${totalCount !== 1 ? "s" : ""} found</span>`;
  content.appendChild(summary);

  // Build the three groups
  if (selfAssets.length > 0) {
    content.appendChild(buildAssetGroup("This Element", selfAssets, false));
  }
  if (childAssets.length > 0) {
    content.appendChild(
      buildAssetGroup("Children & Descendants", childAssets, true),
    );
  }
  if (ancestorAssets.length > 0) {
    content.appendChild(
      buildAssetGroup("Behind It (Ancestors)", ancestorAssets, true),
    );
  }
}

// ASSET COLLECTION

// Collect assets from a single node
export function collectFromNode(node, selector) {
  if (!node) return [];
  const results = [];

  // CSS Assets
  const cs = window.getComputedStyle(node);
  const semanticSel = buildStrategicSelector(node, 'specific');
  const genericSel = buildStrategicSelector(node, 'categorical');
  
  for (const prop of ASSET_PROPS) {
    const val = cs.getPropertyValue(prop)?.trim();
    if (!val || val === "none") continue;
    extractUrls(val).forEach((url) => {
      results.push({ 
        selector, 
        prop, 
        url, 
        domNode: node, 
        isAttr: false, 
        exactSelector: semanticSel,
        genericSelector: genericSel
      });
    });
  }

  // Attribute Assets
  const tag = node.tagName.toLowerCase();
  if (MEDIA_TAGS.has(tag)) {
    for (const attr of ASSET_ATTRS) {
      const val = node.getAttribute(attr);
      if (!val || val.startsWith("data:")) continue;
      if (attr === "srcset") {
        val.split(",").forEach((part) => {
          const url = part.trim().split(/\s+/)[0];
          if (url) results.push({ 
            selector, 
            prop: "srcset", 
            url, 
            domNode: node, 
            isAttr: true, 
            exactSelector: semanticSel,
            genericSelector: genericSel
          });
        });
      } else {
        const parentSel = node.parentElement ? buildStrategicSelector(node.parentElement, 'categorical') : "*";
        
        let insetStr = "0";
        if (node.parentElement) {
           const pRect = node.parentElement.getBoundingClientRect();
           const cRect = node.getBoundingClientRect();
           const t = Math.round(cRect.top - pRect.top);
           const r = Math.round(pRect.right - cRect.right);
           const b = Math.round(pRect.bottom - cRect.bottom);
           const l = Math.round(cRect.left - pRect.left);
           if (t !== 0 || r !== 0 || b !== 0 || l !== 0) {
              if (t === r && r === b && b === l) {
                insetStr = `${t}px`;
              } else {
                insetStr = `${t}px ${r}px ${b}px ${l}px`;
              }
           }
        }
        
        results.push({ 
          selector, 
          prop: attr, 
          url: val, 
          domNode: node, 
          isAttr: true, 
          parentSelector: parentSel, 
          exactSelector: semanticSel, 
          genericSelector: genericSel,
          inset: insetStr 
        });
      }
    }
  }

  return results;
}

function collectFromDescendants(rootNode, rootSelector, seenAssets) {
  const results = [];
  walkForAssets(rootNode, rootSelector, results, seenAssets, false);
  return results;
}

function collectFromAncestors(node, _rootSelector, seenAssets) {
  const results = [];
  // Ancestor walk
  let current = node.parentNode || node.parentElement;
  while (current) {
    // Shadow boundary cross
    if (current.nodeType === 11) {
      current = current.host;
      if (!current) break;
    }
    if (current.nodeType !== 1) {
      current = current.parentNode;
      continue;
    }
    // Stop at roots
    if (
      current === document.body ||
      current === document.documentElement ||
      current.id === "rcp-fe-viewport-root"
    )
      break;

    const sel = buildStrategicSelector(current, 'categorical');
    const assets = collectFromNode(current, sel);
    for (const asset of assets) {
      const fp = `${asset.prop}|${asset.url}`;
      if (!seenAssets.has(fp)) {
        seenAssets.add(fp);
        results.push(asset);
      }
    }

    current = current.parentNode || current.parentElement;
  }
  return results;
}

// Descendant Walker
function walkForAssets(node, _parentSelector, results, seenAssets, includeSelf) {
  if (!node || node.nodeType !== 1) return;
  if (node.id === "snooze-css-host") return;

  if (includeSelf) {
    const sel = buildStrategicSelector(node, 'categorical');
    let combinedSel = sel;
    if (_parentSelector && _parentSelector !== "unknown" && !sel.includes(_parentSelector)) {
      combinedSel = `${_parentSelector} ${sel}`;
    }
    const assets = collectFromNode(node, combinedSel);
    for (const asset of assets) {
      const fp = `${asset.prop}|${asset.url}`;
      if (!seenAssets.has(fp)) {
        seenAssets.add(fp);
        results.push(asset);
      }
    }
  }

  // Light DOM children
  for (const child of node.children) {
    walkForAssets(child, _parentSelector, results, seenAssets, true);
  }

  // Shadow DOM walk
  const trackedRoots = getShadowRoots();
  const tracked = trackedRoots.find((r) => r.host === node);
  const shadowRoot = tracked?.shadowRoot || node.shadowRoot;
  if (shadowRoot) {
    // When crossing a shadow boundary, standard descendant combinators break.
    // We wrap the parent context in :host-context() so it can still match ancestors outside the shadow root!
    let shadowParentSel = _parentSelector;
    if (shadowParentSel && shadowParentSel !== "unknown" && !shadowParentSel.startsWith(":host-context")) {
      shadowParentSel = `:host-context(${shadowParentSel})`;
    }
    
    for (const child of shadowRoot.children) {
      walkForAssets(child, shadowParentSel, results, seenAssets, true);
    }
  }
}

// ASSET URL EXTRACTION

function extractUrls(cssValue) {
  const urls = [];
  let match;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(cssValue)) !== null) {
    const raw = match[2].trim();
    if (raw && raw !== "none" && !raw.startsWith("data:")) {
      urls.push(raw);
    }
  }
  return urls;
}

// UI BUILDING

function buildAssetGroup(title, assets, collapsed) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "border-bottom:1px solid #1a2535;";

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;" +
    "background:#060e1a;user-select:none;transition:background 0.15s;";
  header.addEventListener(
    "mouseenter",
    () => (header.style.background = "#091220"),
  );
  header.addEventListener(
    "mouseleave",
    () => (header.style.background = "#060e1a"),
  );

  const icon = document.createElement("span");
  icon.style.cssText =
    "font-size:9px;color:#785a28;flex-shrink:0;transition:transform 0.2s;" +
    `transform:${collapsed ? "rotate(0deg)" : "rotate(90deg)"}`;
  icon.textContent = "▸";

  const labelEl = document.createElement("span");
  labelEl.style.cssText =
    `font-size:11px;font-weight:600;letter-spacing:0.04em;flex:1;` +
    `color:${collapsed ? "#7a8a9a" : "#c8aa6e"}`;
  labelEl.textContent = title;

  const countEl = document.createElement("span");
  countEl.style.cssText =
    "font-size:9px;color:#2a3a4a;background:rgba(0,0,0,0.3);border:1px solid #1a2535;" +
    "padding:1px 6px;border-radius:8px;";
  countEl.textContent = assets.length;

  header.appendChild(icon);
  header.appendChild(labelEl);
  header.appendChild(countEl);

  const body = document.createElement("div");
  body.style.cssText = `background:#050c18;border-top:1px solid #1a2535;display:${collapsed ? "none" : "block"};`;

  header.addEventListener("click", () => {
    const open = body.style.display === "none";
    body.style.display = open ? "block" : "none";
    icon.style.transform = open ? "rotate(90deg)" : "rotate(0deg)";
    labelEl.style.color = open ? "#c8aa6e" : "#7a8a9a";
  });

  assets.forEach((asset) => body.appendChild(buildAssetRow(asset)));

  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

function buildAssetRow(asset) {
  const row = document.createElement("div");
  row.className = "ax-asset-row";
  row.style.cssText = "padding:10px 14px;border-bottom:1px solid #0a1520;display:flex;gap:10px;align-items:flex-start;";

  // Thumbnail
  const thumb = document.createElement("div");
  thumb.style.cssText = "width:56px;height:56px;flex-shrink:0;background:#030810;border:1px solid #1a2535;overflow:hidden;display:flex;align-items:center;justify-content:center;position:relative;";
  const ext = asset.url.split("?")[0].split(".").pop().toLowerCase();
  if (["webm", "mp4", "ogg"].includes(ext)) {
    const v = document.createElement("video"); v.src = asset.url; v.style.cssText = "max-width:100%;max-height:100%;";
    v.muted = true; v.autoplay = true; v.loop = true;
    thumb.appendChild(v);
  } else {
    const i = document.createElement("img"); i.src = asset.url; i.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;";
    thumb.appendChild(i);
  }

  const main = document.createElement("div");
  main.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;";

  // Meta (Prop Badge + URL)
  const meta = document.createElement("div");
  meta.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;";
  const propBadge = document.createElement("span");
  propBadge.style.cssText = "font-size:8px;color:#c8aa6e;background:rgba(200,170,110,0.1);border:1px solid rgba(200,170,110,0.3);padding:1px 6px;text-transform:uppercase;";
  propBadge.textContent = asset.prop;
  meta.appendChild(propBadge);
  const urlEl = document.createElement("div");
  urlEl.style.cssText = "font-size:9px;color:#2a4050;font-family:monospace;word-break:break-all;background:rgba(0,0,0,0.3);padding:3px 6px;";
  urlEl.textContent = asset.url;

  // SELECTOR STRATEGY
  const selRow = document.createElement("div");
  selRow.style.cssText = "display:flex;gap:6px;align-items:center;";
  const selLabel = document.createElement("span");
  selLabel.style.cssText = "font-size:9px;color:#4a6070;width:50px;flex-shrink:0;";
  selLabel.textContent = "Target:";
  const selSelect = document.createElement("select");
  selSelect.className = "ci-select";
  selSelect.style.cssText = "font-size:10px;height:24px;flex:1;min-width:0;";

  const fileName  = asset.url.split('/').pop().split('?')[0]; 
  const sniper    = asset.isAttr ? `[src*="${fileName}"]` : "";

  const baseScenarios = [
    { label: "1. Contextual", val: asset.selector },
    { label: "2. Specific Node", val: asset.exactSelector },
    { label: "3. Global Node", val: asset.genericSelector }
  ];

  const seenScenarios = new Set();
  baseScenarios.forEach(s => {
    if (!s.val) return;
    
    // For attributes, offer both with and without sniper
    const optionsToAdd = [];
    if (asset.isAttr) {
       optionsToAdd.push({ label: s.label + " + Sniper", val: `${s.val}${sniper}`.trim() });
       optionsToAdd.push({ label: s.label, val: s.val.trim() });
    } else {
       optionsToAdd.push({ label: s.label, val: s.val.trim() });
    }

    optionsToAdd.forEach(opt => {
      if (opt.val && !seenScenarios.has(opt.val)) {
        seenScenarios.add(opt.val);
        const o = document.createElement("option"); o.value = opt.val; o.textContent = `${opt.label}: ${opt.val}`;
        selSelect.appendChild(o);
      }
    });
  });
  
  if (asset.isAttr && sniper && !seenScenarios.has(sniper)) {
     const o = document.createElement("option"); o.value = sniper; o.textContent = `Universal URL: ${sniper}`;
     selSelect.appendChild(o);
  }
  selRow.append(selLabel, selSelect);

  // REPLACE STRATEGY
  const methodRow = document.createElement("div");
  methodRow.style.cssText = "display:flex;gap:6px;align-items:center;";
  const methodLabel = document.createElement("span");
  methodLabel.style.cssText = "font-size:9px;color:#4a6070;width:50px;flex-shrink:0;";
  methodLabel.textContent = "Method:";
  const methodSelect = document.createElement("select");
  methodSelect.className = "ci-select";
  methodSelect.style.cssText = "font-size:10px;height:24px;flex:1;min-width:0;";

  const sInfo = getCssStrategy(asset);
  if (sInfo.options) {
    sInfo.options.forEach(opt => {
      const o = document.createElement("option"); o.value = opt.id; o.textContent = opt.label;
      methodSelect.appendChild(o);
    });
  } else {
    const o = document.createElement("option"); o.value = "default"; o.textContent = sInfo.hint;
    methodSelect.appendChild(o);
  }
  methodRow.append(methodLabel, methodSelect);

  // INPUT ROW (With File Picker)
  const replaceRow = document.createElement("div");
  replaceRow.style.cssText = "display:flex;gap:4px;align-items:center;";

  const replaceInput = document.createElement("input");
  replaceInput.type = "text"; replaceInput.className = "ci-input";
  replaceInput.placeholder = "Replacement URL or ./assets/file.png…";
  replaceInput.style.cssText = "font-size:10px;padding:4px 8px;flex:1;";

  const browseBtn = document.createElement("button");
  browseBtn.className = "ci-btn-prop";
  browseBtn.textContent = "+";
  browseBtn.title = "Browse local assets";
  browseBtn.style.cssText = "width:26px;height:26px;flex-shrink:0;";
  browseBtn.addEventListener("click", () => attachAssetPicker(replaceInput));

  replaceRow.append(replaceInput, browseBtn);

  // ACTION BUTTONS
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:6px;align-items:center;margin-top:2px;";

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "ci-btn-secondary";
  downloadBtn.style.cssText = "font-size:10px;padding:3px 10px;";
  downloadBtn.textContent = "⬇ Download";
  downloadBtn.addEventListener("click", () => downloadAsset(asset.url));

  const sendBtn = document.createElement("button");
  sendBtn.className = "ci-az-send-btn";
  sendBtn.textContent = "→ Raw CSS";
  sendBtn.addEventListener("click", () => {
    const rep = replaceInput.value.trim();
    if (!rep) return;
    const finalAsset = {
      ...asset,
      selector: selSelect.value,
      strategyId: methodSelect.value
    };
    appendCssToRaw(generateReplacementCSS(finalAsset, rep));
    switchTab("raw");
  });

  btnRow.append(downloadBtn, sendBtn);

  // Build the main content
  main.append(meta, urlEl, selRow, methodRow, replaceRow, btnRow);

  // SUGGESTED EFFECTS (LAZY LOADED)
  const effectWrap = document.createElement("div");
  effectWrap.style.cssText = "margin-top:2px;border:1px solid rgba(200,170,110,0.2);border-radius:2px;";
  
  const effectHeader = document.createElement("div");
  effectHeader.style.cssText = "font-size:9px;color:#c8aa6e;text-transform:uppercase;padding:4px 8px;cursor:pointer;background:rgba(200,170,110,0.05);display:flex;align-items:center;gap:4px;user-select:none;";
  effectHeader.innerHTML = `<span style="font-size:8px;transition:transform 0.2s;">▸</span> <span>Suggested Effects</span>`;
  
  const effectBody = document.createElement("div");
  effectBody.style.cssText = "display:none;padding:8px;font-size:9px;color:#7a8a9a;background:rgba(0,0,0,0.2);";
  
  effectWrap.appendChild(effectHeader);
  effectWrap.appendChild(effectBody);
  main.append(effectWrap);

  let effectLoaded = false;
  let effectOpen = false;

  effectHeader.addEventListener("click", async () => {
    effectOpen = !effectOpen;
    effectBody.style.display = effectOpen ? "block" : "none";
    effectHeader.querySelector("span").style.transform = effectOpen ? "rotate(90deg)" : "rotate(0deg)";
    
    if (effectOpen && !effectLoaded) {
      effectLoaded = true;
      effectBody.innerHTML = `<div style="text-align:center;padding:10px;color:#4a6070;">Detecting base color...</div>`;
      
      const isVideo = ["webm", "mp4", "ogg"].includes(ext);
      const baseRgb = await extractDominantColor(asset.url, isVideo);
      const baseHex = rgbToHexStr(baseRgb.r, baseRgb.g, baseRgb.b);
      
      effectBody.innerHTML = "";
      
      const controlsRow = document.createElement("div");
      controlsRow.style.cssText = "display:flex;gap:12px;margin-bottom:8px;align-items:center;flex-wrap:wrap;";
      
      const modeWrap = document.createElement("div");
      modeWrap.style.cssText = "display:flex;align-items:center;gap:4px;";
      const modeSelect = document.createElement("select");
      modeSelect.className = "ci-select";
      modeSelect.style.cssText = "font-size:10px;height:22px;";
      modeSelect.innerHTML = `
        <option value="relative">Shift (Preserve Multi-Color)</option>
        <option value="solid">Solid (Uniform Recolor)</option>
        <option disabled>──────────</option>
        <option value="grayscale">Grayscale</option>
        <option value="sepia">Sepia</option>
        <option value="invert">Invert Colors</option>
        <option value="blur">Blur (Soft)</option>
        <option value="brighten">Brighten</option>
        <option value="darken">Darken</option>
        <option value="contrast">High Contrast</option>
      `;
      modeWrap.innerHTML = `<span>Mode:</span>`;
      modeWrap.appendChild(modeSelect);

      const baseWrap = document.createElement("div");
      baseWrap.style.cssText = "display:flex;align-items:center;gap:4px;"; 
      const baseInput = document.createElement("input");
      baseInput.type = "color";
      baseInput.value = baseHex;
      baseInput.title = "Base Color (Auto-detected. Change if the script guessed the wrong dominant color)";
      baseInput.style.cssText = "width:20px;height:20px;padding:0;border:none;background:none;cursor:pointer;";
      baseWrap.innerHTML = `<span>Base:</span>`;
      baseWrap.appendChild(baseInput);
      
      const targetWrap = document.createElement("div");
      targetWrap.style.cssText = "display:flex;align-items:center;gap:4px;";
      const targetInput = document.createElement("input");
      targetInput.type = "color";
      targetInput.value = "#d44a4a"; // Default target red
      targetInput.style.cssText = "width:20px;height:20px;padding:0;border:none;background:none;cursor:pointer;";
      targetWrap.innerHTML = `<span>Target:</span>`;
      targetWrap.appendChild(targetInput);
      
      controlsRow.appendChild(modeWrap);
      controlsRow.appendChild(targetWrap);
      controlsRow.appendChild(baseWrap);
      
      const optionsRow = document.createElement("div");
      optionsRow.style.cssText = "display:flex;gap:12px;margin-bottom:8px;align-items:center;";
      
      const isolateWrap = document.createElement("label");
      isolateWrap.style.cssText = "display:flex;align-items:center;gap:4px;cursor:pointer;font-size:10px;color:#a0b4c8;";
      const isolateCheck = document.createElement("input");
      isolateCheck.type = "checkbox";
      isolateCheck.style.accentColor = "#c8aa6e";
      isolateWrap.appendChild(isolateCheck);
      isolateWrap.appendChild(document.createTextNode("Apply to background only (preserve children)"));
      optionsRow.appendChild(isolateWrap);
      
      const tag = asset.domNode?.tagName?.toLowerCase() || "";
      const isReplacedElement = tag === "img" || tag === "video" || tag === "source";
      if (isReplacedElement) {
         isolateWrap.style.display = "none";
      }

      effectBody.appendChild(controlsRow);
      effectBody.appendChild(optionsRow);
      
      const cssOut = document.createElement("textarea");
      cssOut.spellcheck = false;
      cssOut.style.cssText = "font-family:monospace;white-space:pre-wrap;line-height:1.4;margin-bottom:6px;width:100%;min-height:56px;background:rgba(0,0,0,0.1);border:1px solid rgba(255,255,255,0.05);color:#7a8a9a;padding:6px;box-sizing:border-box;resize:vertical;font-size:9px;";
      effectBody.appendChild(cssOut);
      
      const copyBtn = document.createElement("button");
      copyBtn.className = "ci-btn-secondary";
      copyBtn.style.cssText = "font-size:9px;padding:2px 8px;";
      copyBtn.textContent = "Copy Filter CSS";
      copyBtn.addEventListener("click", () => {
         copyText(cssOut.value);
         copyBtn.textContent = "Copied!";
         setTimeout(() => copyBtn.textContent = "Copy Filter CSS", 1500);
      });
      effectBody.appendChild(copyBtn);
      
      const updateFilter = () => {
         let filterStr;
         let comment = "";
         const mode = modeSelect.value;
         const isolate = isolateCheck.checked && !isReplacedElement;
         
         if (mode === "solid") {
            filterStr = calculateSolidFilter(targetInput.value);
            comment = `/* Solid Recolor (→ ${targetInput.value}) */`;
         } else if (mode === "relative") {
            const currentBaseRgb = hexToRgb(baseInput.value);
            filterStr = calculateRelativeFilter(currentBaseRgb, targetInput.value);
            comment = `/* Relative Color Shift (${baseInput.value} → ${targetInput.value}) */`;
         } else if (mode === "grayscale") {
            filterStr = "grayscale(100%)";
            comment = `/* Grayscale Effect */`;
         } else if (mode === "sepia") {
            filterStr = "sepia(100%)";
            comment = `/* Sepia Effect */`;
         } else if (mode === "invert") {
            filterStr = "invert(100%)";
            comment = `/* Invert Colors */`;
         } else if (mode === "blur") {
            filterStr = "blur(4px)";
            comment = `/* Blur Effect */`;
         } else if (mode === "brighten") {
            filterStr = "brightness(1.5)";
            comment = `/* Brighten Effect */`;
         } else if (mode === "darken") {
            filterStr = "brightness(0.5)";
            comment = `/* Darken Effect */`;
         } else if (mode === "contrast") {
            filterStr = "contrast(1.5) saturate(1.2)";
            comment = `/* High Contrast Effect */`;
         }
         
         // Update UI visibility
         if (mode === "relative") {
             baseWrap.style.display = "flex";
             targetWrap.style.display = "flex";
         } else if (mode === "solid") {
             baseWrap.style.display = "none";
             targetWrap.style.display = "flex";
         } else {
             baseWrap.style.display = "none";
             targetWrap.style.display = "none";
         }
         
         const type = getCssStrategy(asset).type;
         const videoSuffix = (type.includes("video") && tag !== "video" && tag !== "source") ? " video" : "";
         const targetSelector = selSelect.value + videoSuffix;
         
         if (isolate) {
            cssOut.value = `${comment}\n${targetSelector} {\n  position: relative !important;\n}\n${targetSelector}::before {\n  content: "" !important;\n  position: absolute !important;\n  inset: 0 !important;\n  background-image: inherit !important;\n  background-size: inherit !important;\n  background-repeat: inherit !important;\n  background-position: inherit !important;\n  filter: ${filterStr} !important;\n  pointer-events: none !important;\n  z-index: 0 !important;\n  border-radius: inherit !important;\n}\n${targetSelector} > * {\n z-index: 1 !important;\n}`;
         } else {
            cssOut.value = `${comment}\n${targetSelector} {\n  filter: ${filterStr} !important;\n}`;
         }
      };
      
      modeSelect.addEventListener("change", updateFilter);
      baseInput.addEventListener("input", updateFilter);
      targetInput.addEventListener("input", updateFilter);
      selSelect.addEventListener("change", updateFilter);
      isolateCheck.addEventListener("change", updateFilter);
      
      updateFilter();
    }
  });

  row.append(thumb, main);
  return row;
}

/**
 * Returns a compact, inline DOM row for an asset, suitable for the Builder's property list.
 */
export function buildCompactAssetRow(asset, onAdd) {
  const wrap = document.createElement("div");
  wrap.className = "ci-prop-wrap";
  wrap.style.cssText = "flex-basis:100%; margin-top:4px; padding:6px; border:1px solid rgba(200,170,110,0.1); background:rgba(0,0,0,0.2);";

  const top = document.createElement("div");
  top.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:6px;";

  const thumb = document.createElement("div");
  thumb.style.cssText = "width:28px; height:28px; background:#000; border:1px solid #1a2535; flex-shrink:0; display:flex; align-items:center; justify-content:center; overflow:hidden;";
  const ext = asset.url.split("?")[0].split(".").pop().toLowerCase();
  if (["webm", "mp4", "ogg"].includes(ext)) {
    const v = document.createElement("video");
    v.src = asset.url;
    v.style.cssText = "max-width:100%; max-height:100%;";
    v.muted = true;
    v.autoplay = true;
    v.loop = true;
    thumb.appendChild(v);
  } else {
    const i = document.createElement("img");
    i.src = asset.url;
    i.style.cssText = "max-width:100%; max-height:100%;";
    thumb.appendChild(i);
  }

  const info = document.createElement("div");
  info.style.cssText = "flex:1; min-width:0;";
  const pName = document.createElement("div");
  pName.style.cssText = "font-size:9px; color:#c8aa6e; text-transform:uppercase; font-weight:bold;";
  pName.textContent = asset.prop;
  const sInfo = getCssStrategy(asset);
  let sSelect = null;
  if (sInfo.options) {
    sSelect = document.createElement("select");
    sSelect.className = "ci-select";
    sSelect.style.cssText = "font-size:9px; height:22px; margin-top:2px; width:100%;";
    sInfo.options.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.id;
      o.textContent = opt.label;
      if (opt.default) o.selected = true;
      sSelect.appendChild(o);
    });
    info.appendChild(pName);
    info.appendChild(sSelect);
  } else {
    const hint = document.createElement("div");
    hint.style.cssText = "font-size:9px; color:#4a6070; font-style:italic; margin-top:2px;";
    hint.textContent = sInfo.hint;
    info.appendChild(pName);
    info.appendChild(hint);
  }

  top.appendChild(thumb);
  top.appendChild(info);

  const bottom = document.createElement("div");
  bottom.style.cssText = "display:flex; gap:4px; align-items:center;";
  const input = document.createElement("input");
  input.className = "ci-input";
  input.placeholder = "Replacement URL or ./assets/file.png";
  input.style.cssText = "flex:1; font-size:10px; padding:4px 8px; height:24px;";
  const browse = document.createElement("button");
  browse.className = "ci-btn-prop";
  browse.textContent = "+";
  browse.style.width = "24px";
  browse.style.height = "24px";
  browse.addEventListener("click", () => attachAssetPicker(input));
  const add = document.createElement("button");
  add.className = "ci-btn-prop";
  add.textContent = "→";
  add.style.width = "24px";
  add.style.height = "24px";
  add.title = "Add to Raw CSS";
  add.addEventListener("click", () => {
    const rep = input.value.trim();
    if (!rep) return;
    asset.strategyId = sSelect ? sSelect.value : "default";
    asset.isGlobal = false;
    const css = generateReplacementCSS(asset, rep);
    onAdd(css);
  });

  bottom.appendChild(input);
  bottom.appendChild(browse);
  bottom.appendChild(add);

  wrap.appendChild(top);
  wrap.appendChild(bottom);
  return wrap;
}

// CSS GENERATION STRATEGIES

// Pick strategy based on asset/node type
export function getCssStrategy(asset) {
  const tag = asset.domNode?.tagName?.toLowerCase() || "";
  const prop = asset.prop;

  if (prop === "src" || prop === "data-src" || prop === "poster" || prop === "srcset") {
    if (tag === "img") {
      return {
        hint: "Select CSS replacement method:",
        type: "img-src",
        options: [
          { id: "bg-direct", label: "object-position + background", default: true },
          { id: "parent-after", label: ":has() Parent + ::after" },
          { id: "content", label: "content: url()" }
        ]
      };
    }
    if (tag === "video" || tag === "source") {
      return {
        hint: "Select CSS replacement method:",
        type: "video-src",
        options: [
          { id: "bg-direct", label: "object-position + background", default: true }
        ]
      };
    }
    if (tag.includes("lol-uikit-video") || tag.includes("uikit-video")) {
      return {
        hint: "Select CSS replacement method:",
        type: "uikit-video-src",
        options: [
          { id: "bg-direct", label: "video child object-position + background", default: true }
        ]
      };
    }
  }

  // CSS property — background-image, content, -webkit-mask-image, etc.
  return {
    hint: `Strategy: CSS ${prop} replacement on selector`,
    type: "css-prop",
  };
}

export function generateReplacementCSS(asset, replacementUrl) {
  const strategy = getCssStrategy(asset);
  const origUrl = asset.url;
  const rep = replacementUrl.startsWith("url(") ? replacementUrl : `url('${replacementUrl}')`;
  const type = strategy.type;
  const method = asset.strategyId || "default";
  const sel = asset.selector;
  const tag = asset.domNode?.tagName?.toLowerCase() || "";

  // 1. Handle HTML Attributes (src, poster)
  if (type === "img-src" || type === "video-src" || type === "uikit-video-src") {
    const videoSuffix = (type.includes("video") && tag !== "video" && tag !== "source") ? " video" : "";
    const target = sel + videoSuffix;

    if (method === "bg-direct") {
      return `/* Asset: ${origUrl} (Background Trick) */\n${target} {\n\tobject-position: -9999px !important;\n\tbackground: ${rep} 0 0 / 100% 100% no-repeat !important;\n}\n`;
    } else if (method === "parent-after") {
        return `/* Asset: ${origUrl} (Parent ::after) */\n${sel}:has(img) {\n\tposition: relative !important;\n}\n${sel} img {\n\topacity: 0 !important;\n}\n${sel}::after {\n\tcontent: ''; position: absolute; inset: 0;\n\tbackground: ${rep} center/cover no-repeat;\n}\n`;
    } else {
      // Content mode (Default)
      return `/* Asset: ${origUrl} (Content Swap) */\n${target} {\n\tcontent: ${rep} !important;\n}\n`;
    }
  }

  // 2. Handle Standard CSS Properties (background-image, mask, etc.)
  return `/* Asset: ${origUrl} */\n${sel} {\n\t${asset.prop}: ${rep} !important;\n}\n`;
}

// DOWNLOAD 

async function downloadAsset(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    // Guess mime from URL extension
    const ext = url.split("?")[0].split(".").pop().toLowerCase();
    const mimeMap = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      avif: "image/avif",
      mp4: "video/mp4",
      webm: "video/webm",
    };
    const mime = mimeMap[ext] || "application/octet-stream";
    const blob = new Blob([buffer], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = url.split("/").pop().split("?")[0] || "asset";
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } catch (err) {
    console.error("[Snooze-CSS] Asset download failed:", url, err);
  }
}

// FILE PICKER

export function attachAssetPicker(inputEl) {
  attachFilePicker(inputEl);
}

// HELPERS 

function piercingQuerySelectorAll(selector) {
  if (!selector || /^\d+$/.test(selector)) return [];
  const results = new Set();
  try {
    const direct = document.querySelectorAll(selector);
    direct.forEach(n => results.add(n));
  } catch {}
  
  const roots = getShadowRoots();
  for (const { shadowRoot } of roots) {
    if (!shadowRoot) continue;
    try {
      const found = shadowRoot.querySelectorAll(selector);
      found.forEach(n => results.add(n));
    } catch {}
  }
  return Array.from(results);
}

// SMART COLOR SHIFT MATH & CANVAS

function extractDominantColor(url, isVideo) {
  return new Promise((resolve) => {
    const fallback = { r: 10, g: 200, b: 185 }; // Default hextech blue
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = 10;
    canvas.height = 10;
    
    const timer = setTimeout(() => resolve(fallback), 3000); // 3s safeguard
    
    const finalize = (el) => {
       try {
         ctx.drawImage(el, 0, 0, 10, 10);
         const data = ctx.getImageData(0, 0, 10, 10).data;
         const buckets = {};
         let maxCount = 0;
         let bestRgb = fallback;
         let validPixels = 0;

         for (let i = 0; i < data.length; i += 4) {
           const a = data[i+3];
           if (a < 128) continue;
           validPixels++;
           
           const r = data[i], g = data[i+1], b = data[i+2];
           
           // Calculate saturation to weight vibrant colors higher than grays
           const max = Math.max(r, g, b), min = Math.min(r, g, b);
           const s = max === 0 ? 0 : (max - min) / max;
           const weight = 1 + (s * 3); // Vibrant colors count up to 4x more
           
           // Quantize colors into 32-value buckets
           const qR = Math.floor(r / 32) * 32;
           const qG = Math.floor(g / 32) * 32;
           const qB = Math.floor(b / 32) * 32;
           const key = `${qR},${qG},${qB}`;
           
           buckets[key] = (buckets[key] || 0) + weight;
           if (buckets[key] > maxCount) {
             maxCount = buckets[key];
             bestRgb = { r: Math.min(255, qR + 16), g: Math.min(255, qG + 16), b: Math.min(255, qB + 16) };
           }
         }
         clearTimeout(timer);
         if (validPixels === 0) return resolve(fallback);
         resolve(bestRgb);
       } catch (e) {
         clearTimeout(timer);
         resolve(fallback);
       }
    };

    if (isVideo) {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.src = url;
      v.onloadeddata = () => { v.currentTime = 0.5; };
      v.onseeked = () => finalize(v);
      v.onerror = () => { clearTimeout(timer); resolve(fallback); };
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      img.onload = () => finalize(img);
      img.onerror = () => { clearTimeout(timer); resolve(fallback); };
    }
  });
}

function rgbToHexStr(r, g, b) {
  return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toLowerCase();
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : {r: 0, g: 0, b: 0};
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; 
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function calculateRelativeFilter(baseRgb, targetHex) {
  const targetRgb = hexToRgb(targetHex);
  const [bH, bS, bL] = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);
  const [tH, tS, tL] = rgbToHsl(targetRgb.r, targetRgb.g, targetRgb.b);
  
  let hueDiff = tH - bH;
  if (hueDiff > 180) hueDiff -= 360;
  if (hueDiff < -180) hueDiff += 360;
  
  // Ignore base lightness. Scale purely based on how light/dark the target color is compared to a 50% midtone.
  let brightMult = Math.max(0, tL / 50);

  // If base is grayscale, standard hue-rotate does nothing. Force color via sepia.
  if (bS < 5 && tS > 5) {
     let sepiaHueDiff = tH - 40; 
     let sepiaSatMult = (tS / 50) * 2.0; 
     return `sepia(100%) hue-rotate(${sepiaHueDiff.toFixed(1)}deg) saturate(${sepiaSatMult.toFixed(2)}) brightness(${brightMult.toFixed(2)})`;
  }
  
  let satRatio = bS === 0 ? tS / 100 : tS / bS; 
  // Slight 20% boost to compensate for CSS saturate() weakness without blowing out the image
  let satMult = satRatio * 1.2; 
  
  return `hue-rotate(${hueDiff.toFixed(1)}deg) saturate(${satMult.toFixed(2)}) brightness(${brightMult.toFixed(2)})`;
}

function calculateSolidFilter(targetHex) {
  const targetRgb = hexToRgb(targetHex);
  const [tH, tS, tL] = rgbToHsl(targetRgb.r, targetRgb.g, targetRgb.b);
  
  let hueDiff = tH - 38; // Sepia baseline hue is ~38deg
  if (hueDiff > 180) hueDiff -= 360;
  if (hueDiff < -180) hueDiff += 360;
  
  // saturate() needs to push sepia's low saturation (~18%) to the target's level
  const satMult = (tS / 100) * 5.5; 
  
  // brightness() scales relative to 50% lightness
  const brightMult = Math.max(0, tL / 50);

  return `sepia(100%) hue-rotate(${hueDiff.toFixed(1)}deg) saturate(${satMult.toFixed(2)}) brightness(${brightMult.toFixed(2)})`;
}

export function cleanupAssetsTab() {
  _container = null;
  _switchTab = null;
  _currentSelector = null;
}