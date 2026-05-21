import { flattenCSS } from "./css-parser.js";

// SHADOW ROOT MANAGER

// Global registry
let _shadowRegistry = new WeakMap();
let _iterableShadowRoots = new Set();

let _isInitialized = false;
let _originalAttachShadow = null;
export let _globalSheet = new CSSStyleSheet();
_globalSheet._isSnooze = true;

// Initialize manager
export function initShadowRootManager() {
  if (_isInitialized) {
    console.warn("[Snooze-CSS] Shadow manager already initialized");
    return;
  }

  _originalAttachShadow = Element.prototype.attachShadow;

  Element.prototype.attachShadow = function (init) {
    const shadowRoot = _originalAttachShadow.call(this, init);

    _shadowRegistry.set(shadowRoot, { host: this });
    _iterableShadowRoots.add(new WeakRef(shadowRoot));

    if (this.id !== "snooze-css-host") {
      try {
        const desc = Object.getOwnPropertyDescriptor(
          ShadowRoot.prototype,
          "adoptedStyleSheets",
        );
        if (desc && desc.set) {
          Object.defineProperty(shadowRoot, "adoptedStyleSheets", {
            set: function (val) {
              if (val) {
                val = val.filter(s => !s._isSnooze);
                val.push(_globalSheet);
              }
              desc.set.call(this, val);
            },
            get: desc.get,
          });
        }
        shadowRoot.adoptedStyleSheets = [
          ...shadowRoot.adoptedStyleSheets.filter(s => !s._isSnooze),
          _globalSheet,
        ];
      } catch (err) {}
    }

    return shadowRoot;
  };

  _isInitialized = true;

  // Scan for roots
  _scanExistingShadowRoots(document.documentElement);

  console.log("[Snooze-CSS] Shadow root manager initialized");
}

// Walk DOM for shadow roots
function _scanExistingShadowRoots(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.shadowRoot && node.id !== "snooze-css-host") {
      if (!_shadowRegistry.has(node.shadowRoot)) {
        _shadowRegistry.set(node.shadowRoot, { host: node });
        _iterableShadowRoots.add(new WeakRef(node.shadowRoot));
        try {
          let sheets = node.shadowRoot.adoptedStyleSheets;
          sheets = sheets.filter(s => !s._isSnooze);
          sheets.push(_globalSheet);
          node.shadowRoot.adoptedStyleSheets = sheets;
        } catch (err) {}
        _scanExistingShadowRoots(node.shadowRoot);
      }
    }
    node = walker.nextNode();
  }
}

// Apply CSS globally
export function applyCSSToAllRoots(cssText) {
  if (typeof cssText !== "string") return false;

  // Flatten the CSS (preserves @keyframes safely)
  let flatCss = "";
  try {
    flatCss = flattenCSS(cssText);
  } catch (err) {
    console.error("[Snooze-CSS] CSS Flattener failed, falling back to raw", err);
    flatCss = cssText;
  }

  // Extract @import and @font-face rules
  // @font-face MUST live in the main document's light DOM to function in CEF
  let importRules = "";
  let safeCssText = flatCss.replace(/(@import\s+(?:url\([^)]+\)|["'][^"']+["'])[^;]*;|@font-face\s*\{[\s\S]*?\})/gi, (match) => {
    importRules += match + "\n";
    return "";
  });

  // Main document injection - completely recreate the tag to bust CEF cache
  let mainStyleEl = document.getElementById("__Snooze-CSS");
  if (mainStyleEl) mainStyleEl.remove();
  mainStyleEl = document.createElement("style");
  mainStyleEl.id = "__Snooze-CSS";
  mainStyleEl.textContent = importRules + safeCssText;
  document.head.appendChild(mainStyleEl);

  // Shared stylesheet sync - recreate the sheet to bust CEF cache
  const newSheet = new CSSStyleSheet();
  newSheet._isSnooze = true;
  try {
    newSheet.replaceSync(safeCssText);
    _globalSheet = newSheet;
  } catch (err) {
    console.warn("replaceSync failed", err);
  }

  // Shadow root injection
  const injectedCount = injectCSSToShadowRoots();

  console.log(
    `[Snooze-CSS] CSS applied: main document + ${injectedCount} shadow root(s)`,
  );

  return true;
}

// Inject to registry roots
function injectCSSToShadowRoots() {
  let count = 0;
  const roots = getShadowRoots();

  roots.forEach(({ shadowRoot }) => {
    try {
      if (shadowRoot.host.id === "snooze-css-host") return;

      let sheets = shadowRoot.adoptedStyleSheets;
      sheets = sheets.filter(s => !s._isSnooze);
      sheets.push(_globalSheet);
      shadowRoot.adoptedStyleSheets = sheets;
      
      count++;
    } catch (err) {}
  });

  return count;
}

// Get tracked shadow roots (cleaning up dead WeakRefs along the way)
export function getShadowRoots() {
  const result = [];
  const deadRefs = [];

  _iterableShadowRoots.forEach((ref) => {
    const sr = ref.deref();
    // Do NOT purge detached elements (host.isConnected === false) on startup!
    // Detached elements are still alive and will be connected to the DOM soon.
    if (!sr || !sr.host) {
      deadRefs.push(ref);
      return;
    }
    result.push({ shadowRoot: sr, host: sr.host });
  });

  // Prune the iterable set to keep it lean (only truly GC'd ones)
  deadRefs.forEach((ref) => _iterableShadowRoots.delete(ref));

  return result;
}

// Find parent shadow root
export function findShadowRoot(el) {
  if (!el) return null;
  let current = el;
  while (current) {
    if (current.parentNode && current.parentNode.nodeType === 11) {
      return current.parentNode;
    }
    current = current.parentNode;
  }
  return null;
}

// Get shadow host
export function getShadowRootHost(shadowRoot) {
  const metadata = _shadowRegistry.get(shadowRoot);
  return metadata ? metadata.host : null;
}

// Debug tracked roots
export function debugShadowRoots() {
  const roots = getShadowRoots();
  console.log("[Snooze-CSS] Tracked shadow roots:", roots.length);
  roots.forEach((item, i) => {
    const hostLabel =
      item.host.tagName.toLowerCase() +
      (item.host.className ? "." + item.host.className.split(" ")[0] : "") +
      (item.host.id ? "#" + item.host.id : "");
    console.log(`[${i}] "${hostLabel}"`);
  });
}
