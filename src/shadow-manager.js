/**
 * SHADOW ROOT CSS INJECTION MANAGER
 *
 * Hooks Element.prototype.attachShadow to track all shadow roots
 * created after plugin initialization. Provides methods to inject CSS into
 * both the main document and all tracked shadow roots simultaneously.
 *
 * Tracks shadow roots in a Map for iteration support. Dead/detached roots are
 * cleaned up automatically when CSS is applied.
 *
 *   applyCSSToAllRoots(cssText);
 */

// Global registry: Map<ShadowRoot, { host: Element, styleEl?: HTMLStyleElement }>
// Uses regular Map to support iteration (forEach). Manual cleanup on dead roots.
let _shadowRegistry = new Map();
let _isInitialized = false;
let _originalAttachShadow = null;
let _currentCssCache = "";
export const _globalSheet = new CSSStyleSheet();

/**
 * Initialize the shadow root manager.
 * Must be called once at plugin startup, before views load.
 * Hooks Element.prototype.attachShadow to track all shadow roots.
 * Also does a one-time scan for shadow roots that already exist
 * (elements mounted before the plugin loaded).
 */
export function initShadowRootManager() {
  if (_isInitialized) {
    console.warn("[Snooze-CSS] Shadow manager already initialized");
    return;
  }

  // Store the original attachShadow
  _originalAttachShadow = Element.prototype.attachShadow;

  Element.prototype.attachShadow = function (init) {
    const shadowRoot = _originalAttachShadow.call(this, init);

    // Register this shadow root
    const metadata = { host: this };
    _shadowRegistry.set(shadowRoot, metadata);

    console.log(
      "[Snooze-CSS] Shadow root created for",
      this.tagName,
      this.className || this.id || "",
    );

    if (this.id !== "snooze-css-host") {
      try {
        // Prevent UI frameworks from overwriting our sheet
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

  // One-time scan for shadow roots that existed before the hook was installed.
  // This catches elements mounted at page load before the plugin ran.
  _scanExistingShadowRoots(document.documentElement);

  console.log("[Snooze-CSS] Shadow root manager initialized");
}

/**
 * Recursively walk the DOM and register any open shadow roots that
 * already exist. Called once at init for roots created before the hook.
 * @param {Element} root
 */
function _scanExistingShadowRoots(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.shadowRoot && node.id !== "snooze-css-host") {
      if (!_shadowRegistry.has(node.shadowRoot)) {
        _shadowRegistry.set(node.shadowRoot, { host: node });
        try {
          const sheets = node.shadowRoot.adoptedStyleSheets;
          if (!sheets.includes(_globalSheet)) {
            node.shadowRoot.adoptedStyleSheets = [...sheets, _globalSheet];
          }
        } catch (err) {}
        // Recurse into the shadow root itself
        _scanExistingShadowRoots(node.shadowRoot);
      }
    }
    node = walker.nextNode();
  }
}

/**
 * Apply CSS to both the main document and all known shadow roots.
 * The main document style is stored in #__Snooze-CSS.
 * Each shadow root adopts the globally shared CSSStyleSheet.
 *
 * @param {string} cssText - The CSS string to inject
 * @returns {boolean} - true if injection succeeded
 */
export function applyCSSToAllRoots(cssText) {
  if (typeof cssText !== "string") return false;

  _currentCssCache = cssText;

  // 1. Inject into main document (main viewport)
  let mainStyleEl = document.getElementById("__Snooze-CSS");
  if (!mainStyleEl) {
    mainStyleEl = document.createElement("style");
    mainStyleEl.id = "__Snooze-CSS";
    document.head.appendChild(mainStyleEl);
  }
  mainStyleEl.textContent = cssText;

  // 2. Sync to the shared stylesheet
  try {
    _globalSheet.replaceSync(cssText);
  } catch (err) {
    console.warn("replaceSync failed", err);
  }

  // 3. Fallback/Ensure injection for all known shadow roots
  const injectedCount = injectCSSToShadowRoots();

  console.log(
    `[Snooze-CSS] CSS applied: main document + ${injectedCount} shadow root(s)`,
  );

  return true;
}

/**
 * Internal: Inject CSS into all shadow roots in the registry.
 */
function injectCSSToShadowRoots() {
  let count = 0;
  const toDelete = [];

  _shadowRegistry.forEach((metadata, shadowRoot) => {
    try {
      // A shadow root is dead when its host is no longer in the document.
      // NOTE: host.shadowRoot returns null for closed roots, so we cannot use
      // that as a liveness check — use isConnected on the host element instead.
      if (!shadowRoot.host || !shadowRoot.host.isConnected) {
        toDelete.push(shadowRoot);
        return;
      }

      // Avoid injecting into the plugin's own modal shadow root.
      if (shadowRoot.host.id === "snooze-css-host") {
        return;
      }

      const sheets = shadowRoot.adoptedStyleSheets;
      if (!sheets.includes(_globalSheet)) {
        shadowRoot.adoptedStyleSheets = [...sheets, _globalSheet];
      }

      count++;
    } catch (err) {
      console.warn("[Snooze-CSS] Failed to inject into shadow root:", err);
      toDelete.push(shadowRoot);
    }
  });

  // Clean up dead shadow roots from the registry
  toDelete.forEach((sr) => _shadowRegistry.delete(sr));

  return count;
}

/**
 * Get an array of all currently tracked shadow roots.
 * Useful for debugging or analyzer integration.
 *
 * @returns {Array<{ shadowRoot: ShadowRoot, host: Element }>}
 */
export function getShadowRoots() {
  const result = [];
  const toDelete = [];

  _shadowRegistry.forEach((metadata, shadowRoot) => {
    try {
      // isConnected is the correct liveness check — host.shadowRoot is null
      // for closed roots even when they are perfectly alive.
      if (!shadowRoot.host || !shadowRoot.host.isConnected) {
        toDelete.push(shadowRoot);
        return;
      }
      result.push({ shadowRoot, host: metadata.host });
    } catch (err) {
      toDelete.push(shadowRoot);
    }
  });

  // Clean up dead ones
  toDelete.forEach((sr) => _shadowRegistry.delete(sr));

  return result;
}

/**
 * Check if an element is inside a known shadow root.
 * Returns the shadow root if found, null otherwise.
 *
 * @param {Element} el - The element to check
 * @returns {ShadowRoot|null}
 */
export function findShadowRoot(el) {
  if (!el) return null;
  let current = el;
  while (current) {
    // Walk up the tree; if we hit a ShadowRoot, we're in shadow DOM
    if (current.parentNode && current.parentNode.nodeType === 11) {
      // Node.DOCUMENT_FRAGMENT_NODE = 11 (ShadowRoot)
      return current.parentNode;
    }
    current = current.parentNode;
  }
  return null;
}

/**
 * Get the host element of a shadow root (if tracked).
 *
 * @param {ShadowRoot} shadowRoot
 * @returns {Element|null}
 */
export function getShadowRootHost(shadowRoot) {
  const metadata = _shadowRegistry.get(shadowRoot);
  return metadata ? metadata.host : null;
}

/**
 * Utility: Print debug info about tracked shadow roots to console.
 */
export function debugShadowRoots() {
  const roots = getShadowRoots();
  console.log("[Snooze-CSS] Tracked shadow roots:", roots.length);
  roots.forEach((item, i) => {
    const hostLabel =
      item.host.tagName.toLowerCase() +
      (item.host.className ? "." + item.host.className.split(" ")[0] : "") +
      (item.host.id ? "#" + item.host.id : "");
    console.log(`  [${i}] "${hostLabel}"`);
  });
}
