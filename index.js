/**
 * @name Snooze-CSS
 * @version 1.0.0
 * @author SnoozeFest - github@ReformedDoge
 */
import { createModal } from './src/modal.js';
import { initResolver, resolveAssetUrls } from './src/resolver.js';

export function init() {
  console.log('[Snooze-CSS] init');

  initResolver(import.meta.url);
  injectSavedCSS();

  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'c') {
      e.preventDefault();
      createModal();
    }
  });
}
console.log('meta path:', import.meta.url)
async function injectSavedCSS() {
  try {
    const raw = await DataStore.get('Snooze-CSS-css');
    if (raw) {
      let el = document.getElementById('__Snooze-CSS');
      if (!el) {
        el = document.createElement('style');
        el.id = '__Snooze-CSS';
        document.head.appendChild(el);
      }
      el.textContent = resolveAssetUrls(raw);
      console.log('[Snooze-CSS] Restored saved CSS');
    }
  } catch (err) {
    console.warn('[Snooze-CSS] Could not restore CSS:', err);
  }
}
