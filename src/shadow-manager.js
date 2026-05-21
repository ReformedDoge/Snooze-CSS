import { flattenCSS } from "./css-parser.js";

// Global registry
let _shadowRegistry = new WeakMap();
let _iterableShadowRoots = new Set();

let _isInitialized = false;
let _originalAttachShadow = null;

export const _globalSheet = new CSSStyleSheet();
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
        const sheets = shadowRoot.adoptedStyleSheets;

        if (!sheets.includes(_globalSheet)) {
          shadowRoot.adoptedStyleSheets = [...sheets, _globalSheet];
        }
      } catch (err) {}
    }

    return shadowRoot;
  };

  _isInitialized = true;

  // Scan existing DOM
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
          const sheets = node.shadowRoot.adoptedStyleSheets;

          if (!sheets.includes(_globalSheet)) {
            node.shadowRoot.adoptedStyleSheets = [...sheets, _globalSheet];
          }
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

  let flatCss = "";

  try {
    flatCss = flattenCSS(cssText);
  } catch (err) {
    console.error("[Snooze-CSS] CSS Flattener failed, falling back to raw", err);
    flatCss = cssText;
  }

  // Extract @import + @font-face (must stay in document for CEF)
  let importRules = "";

  const safeCssText = flatCss.replace(
    /(@import\s+(?:url\([^)]+\)|["'][^"']+["'])[^;]*;|@font-face\s*\{[\s\S]*?\})/gi,
    (match) => {
      importRules += match + "\n";
      return "";
    }
  );

  // MAIN DOCUMENT INJECTION (force full refresh to apply animations correctly)
  let mainStyleEl = document.getElementById("__Snooze-CSS");

  if (mainStyleEl) mainStyleEl.remove();

  mainStyleEl = document.createElement("style");
  mainStyleEl.id = "__Snooze-CSS";
  mainStyleEl.textContent = importRules + safeCssText;
  document.head.appendChild(mainStyleEl);

  // Shared stylesheet sync (Required to style elements inside shadow DOM)
  try {
    _globalSheet.replaceSync(safeCssText);
  } catch (err) {
    console.warn("replaceSync failed", err);
  }

  // Sync shadow roots
  const injectedCount = injectCSSToShadowRoots();

  console.log(
    `[Snooze-CSS] CSS applied: main document + ${injectedCount} shadow root(s)`
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

      const sheets = shadowRoot.adoptedStyleSheets;

      if (!sheets.includes(_globalSheet)) {
        shadowRoot.adoptedStyleSheets = [...sheets, _globalSheet];
      }

      count++;
    } catch (err) {}
  });

  return count;
}

// Get tracked shadow roots (cleaning up dead references and disconnected elements)
export function getShadowRoots() {
  const result = [];
  const deadRefs = [];

  _iterableShadowRoots.forEach((ref) => {
    const sr = ref.deref();

    if (!sr || !sr.host || !sr.host.isConnected) {
      deadRefs.push(ref);
      return;
    }

    result.push({ shadowRoot: sr, host: sr.host });
  });

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

// Debug
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