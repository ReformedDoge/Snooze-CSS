import { flattenCSS } from "./css-parser.js";
import { Utils } from "./generalUtils.js";

// Global registry
let _shadowRegistry = new WeakMap();
let _iterableShadowRoots = new Set();

// Iframe registry
let _iterableIframes = new Set(); // Set<WeakRef<HTMLIFrameElement>>
let _iframeObserver = null;
let _lastSafeCssText = ""; // cached for re-injection on iframe load

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

  // Scan existing DOM for shadow roots and iframes
  _scanExistingShadowRoots(document.documentElement);
  _scanExistingIframes(document.documentElement);

  // Watch for new iframes added to DOM
  _startIframeObserver();

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

// Walk DOM for same-origin iframes
function _scanExistingIframes(root) {
  let elements;
  try {
    // root might be a ShadowRoot or a Document fragment — querySelectorAll works on both
    elements = root.querySelectorAll("iframe");
  } catch {
    return;
  }

  elements.forEach((iframe) => _registerIframe(iframe));
}

// Register a single iframe, attach load listener, inject immediately if ready
function _registerIframe(iframe) {
  // Deduplicate via WeakRef scan
  for (const ref of _iterableIframes) {
    if (ref.deref() === iframe) return; // already tracked
  }

  _iterableIframes.add(new WeakRef(iframe));

  // Inject now if the document is already accessible
  _tryInjectToIframe(iframe);

  // Re-inject whenever the iframe navigates / reloads
  iframe.addEventListener("load", () => {
    _tryInjectToIframe(iframe);
  });
}

// Inject _lastSafeCssText into an iframe's document as a <style> tag
function _tryInjectToIframe(iframe) {
  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc || !doc.head) return false;

    let styleEl = doc.getElementById("__Snooze-CSS-iframe");
    if (!styleEl) {
      styleEl = doc.createElement("style");
      styleEl.id = "__Snooze-CSS-iframe";
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = _lastSafeCssText;
    return true;
  } catch {
    return false;
  }
}

// MutationObserver to catch iframes added after init
function _startIframeObserver() {
  if (_iframeObserver) return;
  _iframeObserver = Utils.DOM.observer.observe("iframe", _registerIframe);
}

// Inject CSS to all tracked iframes, return count
function injectCSSToIframes() {
  let count = 0;
  const dead = [];

  _iterableIframes.forEach((ref) => {
    const iframe = ref.deref();

    if (!iframe || !iframe.isConnected) {
      dead.push(ref);
      return;
    }

    if (_tryInjectToIframe(iframe)) count++;
  });

  dead.forEach((ref) => _iterableIframes.delete(ref));
  return count;
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

  // Cache for iframe re-injection on load events
  _lastSafeCssText = safeCssText;

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
  const shadowCount = injectCSSToShadowRoots();

  // Sync iframes — also pick up any iframes added since init
  _scanExistingIframes(document.documentElement);
  const iframeCount = injectCSSToIframes();

  console.log(
    `[Snooze-CSS] CSS applied: main document + ${shadowCount} shadow root(s) + ${iframeCount} iframe(s)`
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

// Get tracked iframes
export function getIframes() {
  const result = [];
  const deadRefs = [];

  _iterableIframes.forEach((ref) => {
    const iframe = ref.deref();

    if (!iframe || !iframe.isConnected) {
      deadRefs.push(ref);
      return;
    }

    result.push(iframe);
  });

  deadRefs.forEach((ref) => _iterableIframes.delete(ref));

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