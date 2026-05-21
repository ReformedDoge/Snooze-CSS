/**
 * @name Snooze-CSS
 * @version 1.2.0
 * @author SnoozeFest - github@ReformedDoge
 * @description ?!
 * @link https://github.com/ReformedDoge
 */
import { createModal } from "./src/modal.js";
import { initResolver, resolveAssetUrls } from "./src/resolver.js";
import {
  initShadowRootManager,
  applyCSSToAllRoots,
} from "./src/shadow-manager.js";
import { loadSettings, applyWindowEffect } from "./src/settings.js";
import { checkForUpdates } from "./src/settings.js";
import { getActiveProfileCSS, Storage } from "./src/storage.js";

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

  // Workaround for Web Component / CEF @keyframes startup bug
  // Detached shadow roots fail to resolve keyframes in older CEF builds
  // We wait until the main client navigation shell is fully connected to the DOM,
  // then silently re-apply the active profile to kickstart the animations.
  if (window.rcp) {
    window.rcp.whenReady('rcp-fe-lol-navigation').then(() => {
      setTimeout(() => {
        console.log("[Snooze-CSS] Navigation ready, kickstarting animations...");
        injectSavedCSS();
      }, 1000);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === "c") {
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
      const raw = await Storage.get("Snooze-CSS-css");
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