/**
 * @name Snooze-CSS
 * @version 1.0.0
 * @author SnoozeFest - github@ReformedDoge
 */
import { createModal } from "./src/modal.js";
import { initResolver, resolveAssetUrls } from "./src/resolver.js";
import {
  initShadowRootManager,
  applyCSSToAllRoots,
} from "./src/shadow-manager.js";

export function init() {
  console.log("[Snooze-CSS] init");

  // Initialize shadow root tracking FIRST, before any views load
  initShadowRootManager();

  initResolver(import.meta.url);
  injectSavedCSS();

  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key === "c") {
      e.preventDefault();
      createModal();
    }
  });
}
console.log("meta path:", import.meta.url);
async function injectSavedCSS() {
  try {
    const raw = await DataStore.get("Snooze-CSS-css");
    if (raw) {
      const resolved = resolveAssetUrls(raw);
      applyCSSToAllRoots(resolved);
      console.log("[Snooze-CSS] Restored saved CSS");
    }
  } catch (err) {
    console.warn("[Snooze-CSS] Could not restore CSS:", err);
  }
}
