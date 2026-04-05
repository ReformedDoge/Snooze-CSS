// SHADOW ROOT MANAGER

// Global registry
// WeakMap for automatic GC of metadata when the shadow root is destroyed
let _shadowRegistry = new WeakMap();
// Set of WeakRefs to allow iteration while still being memory-safe
let _iterableShadowRoots = new Set();

let _isInitialized = false;
let _originalAttachShadow = null;
let _currentCssCache = "";
export const _globalSheet = new CSSStyleSheet();

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

    console.log(
      "[Snooze-CSS] Shadow root created for",
      this.tagName,
      this.className || this.id || "",
    );

    if (this.id !== "snooze-css-host") {
      try {
        // Prevent UI frameworks from overwriting sheets
        const desc = Object.getOwnPropertyDescriptor(
          ShadowRoot.prototype,
          "adoptedStyleSheets",
        );
        if (desc && desc.set) {
          Object.defineProperty(shadowRoot, "adoptedStyleSheets", {
            set: function (val) {
              if (val && !val.includes(_globalSheet))
                val = [...val, _globalSheet];
              desc.set.call(this, val);
            },
            get: desc.get,
          });
        }
        shadowRoot.adoptedStyleSheets = [
          ...shadowRoot.adoptedStyleSheets,
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

  _currentCssCache = cssText;

  // Extract @import rules
  let importRules = "";
  const safeCssText = cssText.replace(/@import\s+(?:url\([^)]+\)|["'][^"']+["'])[^;]*;/gi, (match) => {
    importRules += match + "\n";
    return "";
  });

  // 1. Main document injection
  let mainStyleEl = document.getElementById("__Snooze-CSS");
  if (!mainStyleEl) {
    mainStyleEl = document.createElement("style");
    mainStyleEl.id = "__Snooze-CSS";
    document.head.appendChild(mainStyleEl);
  }
  mainStyleEl.textContent = importRules + safeCssText;

  // 2. Shared stylesheet sync
  try {
    _globalSheet.replaceSync(safeCssText);
  } catch (err) {
    console.warn("replaceSync failed", err);
  }

  // 3. Shadow root injection
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

      const sheets = shadowRoot.adoptedStyleSheets;
      if (!sheets.includes(_globalSheet)) {
        shadowRoot.adoptedStyleSheets = [...sheets, _globalSheet];
      }
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
    if (!sr || !sr.host || !sr.host.isConnected) {
      deadRefs.push(ref);
      return;
    }
    result.push({ shadowRoot: sr, host: sr.host });
  });

  // Prune the iterable set to keep it lean
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
