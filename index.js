/**
 * @name Snooze-CSS
 * @version 1.1.1
 * @author SnoozeFest - github@ReformedDoge
 */
import { createModal } from "./src/modal.js";
import { initResolver, resolveAssetUrls } from "./src/resolver.js";
import {
  initShadowRootManager,
  applyCSSToAllRoots,
} from "./src/shadow-manager.js";
import { loadSettings, applyWindowEffect } from "./src/settings.js";
import { checkForUpdates } from "./src/settings.js";
import { getActiveProfileCSS } from "./src/storage.js";

export function init() {
  console.log("[Snooze-CSS] init");
  // Apply settings
  loadSettings().then((settings) => {
    applyWindowEffect(settings.windowEffect);
  });
  // Check for updates if enabled by the user
  checkForUpdates(); 

  // Initialize shadow tracking
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
    // Load active profile
  const css = await getActiveProfileCSS();
    if (css) {
      const resolved = resolveAssetUrls(css);
      applyCSSToAllRoots(resolved);
      console.log("[Snooze-CSS] Restored saved CSS from active profile");
    }
  } catch (err) {
    // Fallback
    try {
      const raw = await DataStore.get("Snooze-CSS-css");
      if (raw) {
        const resolved = resolveAssetUrls(raw);
        applyCSSToAllRoots(resolved);
        console.log("[Snooze-CSS] Restored saved CSS (legacy fallback)");
      }
    } catch (innerErr) {
      console.warn("[Snooze-CSS] Could not restore CSS:", innerErr);
    }
  }
}
