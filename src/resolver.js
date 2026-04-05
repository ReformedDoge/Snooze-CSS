// Absolute path resolver
let _base = null;

export function initResolver(metaUrl) {
  if (!metaUrl) return;
  const normalized = metaUrl.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  // _base will be something like "https://plugins/Snooze-CSS/"
  _base = lastSlash === -1 ? "https://plugins/Snooze-CSS/" : normalized.substring(0, lastSlash + 1);
}

// Rewrite relative url() paths to absolute plugin URLs
export function resolveAssetUrls(css) {
  if (!_base || !css) return css;

  // We simply replace the relative prefix with the absolute one.
  // This handles:
  // 1. url("./assets/img.png") -> url("https://.../assets/img.png")
  // 2. [src="./assets/img.png"] -> [src="https://.../assets/img.png"]
  // 3. [style*="./assets/img.png"] -> [style*="https://.../assets/img.png"]
  
  // We use a regex for "./assets/" to ensure we don't accidentally 
  // match things like "my-assets/" or "/assets/".
  return css.replace(/\.\/assets\//g, _base + "assets/");
}