/* 
Rewrites relative url() paths in dynamically injected CSS to absolute
plugin URLs, so local assets work regardless of document.baseURI.

Usage:
  import { initResolver, resolveAssetUrls } from './resolver.js';
  initResolver(import.meta.url);  // call once in index.js
  el.textContent = resolveAssetUrls(css);  // call before every injection 
*/

let _base = null;

// Call once from index.js, passing import.meta.url
export function initResolver(metaUrl) {
  // Normalize Windows backslashes to forward slashes
  // metaUrl = 'https://plugins/Snooze-CSS/index.js'  → 'https://plugins/Snooze-CSS/'
  // metaUrl = 'https://plugins/Snooze-CSS\index.js' → 'https://plugins/Snooze-CSS/'
  const normalized = metaUrl.replace(/\\/g, "/");

  // Extract directory by finding the last slash and keeping everything up to it (inclusive)
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    console.warn(
      "[Snooze-CSS] initResolver: malformed meta URL, cannot extract base:",
      metaUrl,
    );
    _base = "https://plugins/Snooze-CSS/"; // Fallback
    return;
  }

  _base = normalized.substring(0, lastSlash + 1);

  // Defensive check: ensure base contains 'Snooze-CSS' to catch loader bugs early
  if (!_base.includes("Snooze-CSS")) {
    console.warn(
      "[Snooze-CSS] initResolver: Snooze-CSS not found in base URL. metaUrl:",
      metaUrl,
      "normalized:",
      normalized,
      "extracted base:",
      _base,
    );
  }

  console.log("[Snooze-CSS] Asset base:", _base);
}

// Rewrite any local url() paths in injected CSS to absolute plugin URLs.
// Remote URLs (http/https/data), protocol-relative, and absolute paths pass through as-is.
export function resolveAssetUrls(css) {
  if (!_base || !css) return css;

  // Matches url('...'), url("..."), url(...) and captures the URL path.
  return css.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (match, quote, path) => {
      const trimmed = path.trim();

      // Preserve full URLs / data URIs / protocol-relative URIs (remote resources)
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) {
        return match;
      }

      let absolute;
      try {
        if (trimmed.startsWith("/")) {
          // Normalize root-relative path to plugin directory root (e.g. /assets/foo.jpg -> https://plugins/Snooze-CSS/assets/foo.jpg)
          absolute = _base.replace(/\/$/, "") + trimmed;
        } else {
          absolute = new URL(trimmed, _base).href;
        }
      } catch (err) {
        console.warn("[Snooze-CSS] resolveAssetUrls invalid url", trimmed, err);
        return match;
      }

      if (absolute !== trimmed) {
        console.debug("[Snooze-CSS] resolveAssetUrls", trimmed, "→", absolute);
      }

      return "url(" + quote + absolute + quote + ")";
    },
  );
}
