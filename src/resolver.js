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
  // metaUrl = 'https://plugins/Snooze-CSS/index.js'
  // base    = 'https://plugins/Snooze-CSS/'
  _base = metaUrl.substring(0, metaUrl.lastIndexOf('/') + 1);
  console.log('[Snooze-CSS] Asset base:', _base);
}

// Rewrite any url('./...') or url('../...') to absolute plugin URLs.
// Remote URLs (http/https/data) pass through
export function resolveAssetUrls(css) {
  if (!_base || !css) return css;

  // Matches url('...') and url("...") — capture the inner path
  return css.replace(/url\(\s*(['"]?)(\.\.?\/[^'")]+)\1\s*\)/g, (match, quote, path) => {
    // Resolve the relative path against our plugin base
    const absolute = new URL(path, _base).href;
    return 'url(' + quote + absolute + quote + ')';
  });
}
