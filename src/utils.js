import { getSettings } from "./settings.js";

// FLASH MESSAGE
export function flashMessage(target, msg = "Added", duration = 1800) {
  const el =
    typeof target === "string" ? document.getElementById(target) : target;
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

// CLIPBOARD HELPERS
export function copyText(text) {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

// SECTION BUILDER
export function makeSection(title, desc) {
  const sec = document.createElement("div");
  sec.style.cssText =
    "background:#060e1a;border:1px solid #1a2535;padding:14px 16px;";

  const t = document.createElement("div");
  t.style.cssText =
    "font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#c8aa6e;" +
    (desc ? "margin-bottom:4px;" : "");
  t.textContent = title;
  sec.appendChild(t);

  if (desc) {
    const d = document.createElement("div");
    d.style.cssText = "font-size:10px;color:#3a5060;line-height:1.5;";
    d.textContent = desc;
    sec.appendChild(d);
  }

  return sec;
}

// TOGGLE SWITCH
export function makeToggle(initial, onChange) {
  const track = document.createElement("div");
  const thumb = document.createElement("div");
  track.appendChild(thumb);
  let on = initial;

  const render = () => {
    track.style.cssText =
      "width:36px;height:18px;border-radius:9px;cursor:pointer;position:relative;flex-shrink:0;transition:background 0.2s,border-color 0.2s;" +
      "background:" +
      (on ? "#785a28" : "#1a2535") +
      ";" +
      "border:1px solid" +
      (on ? "#c8aa6e" : "#2a3a4a") +
      ";";
    thumb.style.cssText =
      "position:absolute;top:2px;width:12px;height:12px;border-radius:50%;transition:left 0.2s,background 0.2s;" +
      "left:" +
      (on ? "18px" : "2px") +
      ";" +
      "background:" +
      (on ? "#c8aa6e" : "#4a6070") +
      ";";
  };

  render();
  track.addEventListener("click", () => {
    on = !on;
    render();
    onChange(on);
  });
  return track;
}

// COLOR UTILS
export function rgbToHex(rgb) {
  if (!rgb || rgb === "transparent" || rgb === "rgba(0, 0, 0, 0)") return "";
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "";
  return (
    "#" +
    [m[1], m[2], m[3]]
      .map((n) => parseInt(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

// HTML ESCAPE
export function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// CUSTOM CONFIRM DIALOG
export function customConfirm(parent, message, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "ci-confirm-overlay";
  overlay.innerHTML = `
    <div class="ci-confirm-box">
      <div class="ci-confirm-msg">${message}</div>
      <div class="ci-confirm-actions">
        <button class="ci-confirm-btn ci-confirm-btn--yes">Delete</button>
        <button class="ci-confirm-btn ci-confirm-btn--no">Cancel</button>
      </div>
    </div>
  `;

  const btnYes = overlay.querySelector(".ci-confirm-btn--yes");
  const btnNo = overlay.querySelector(".ci-confirm-btn--no");

  const close = (confirmed) => {
    overlay.classList.add("fade-out");
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (confirmed) onConfirm();
    }, 200);
  };

  btnYes.onclick = () => close(true);
  btnNo.onclick = () => close(false);

  parent.appendChild(overlay);
}
// SELECTOR ENGINE
export function buildStrategicSelector(el, mode = 'specific') {
  if (!el) return "unknown";
  if (el instanceof ShadowRoot) return "#shadow-root";
  if (el.nodeType !== 1) return el.tagName || "node";

  const settings = getSettings();
  const config = settings.selectorConfig || {
    ids: true, attrs: true, media: true, classes: true, climbing: true
  };

  const tag = el.tagName.toLowerCase();
  const ignoreClasses = /^(ng-|ember|active|hover|focus|selected|disabled|open|closed|visible|hidden|loading|ready|loaded|ember-application|ember-view)/i;
  
  const getCleanClasses = (node) => {
    if (!node.classList) return [];
    return [...node.classList].filter(c => !ignoreClasses.test(c) && !/^\d+(\.\d+)*$/.test(c));
  };
  
  // SUB-FUNCTION TO BUILD A SELECTOR FOR A SINGLE NODE
  const buildNodeSelector = (node, isCategorical) => {
    const nodeTag = node.tagName.toLowerCase();
    
    // 1. ID (for specific mode only)
    if (!isCategorical && config.ids && node.id && !/^(ember|ng-)\d+$/.test(node.id)) {
      return "#" + CSS.escape(node.id);
    }

    // 2. Specific Attributes (for specific mode only)
    if (!isCategorical && config.attrs) {
      const attrPriorities = ["data-screen-name", "data-testid", "action", "name", "role"];
      for (const attr of attrPriorities) {
        const val = node.getAttribute(attr);
        if (val) return `${nodeTag}[${attr}="${CSS.escape(val)}"]`;
      }
    }
    
    // 3. Media Snipers (for specific mode only)
    if (!isCategorical && config.media && (nodeTag === "img" || nodeTag === "video" || nodeTag === "source")) {
      const src = node.getAttribute("src");
      if (src && !src.startsWith("data:")) return `${nodeTag}[src="${CSS.escape(src)}"]`;
    }

    // 4. Class Signature
    let classStr = "";
    if (config.classes) {
      const maxClasses = isCategorical ? 1 : 3;
      const classes = getCleanClasses(node).slice(0, maxClasses);
      classStr = classes.length ? "." + classes.map(CSS.escape).join(".") : "";
    }
    
    // In categorical mode, class-only is better for custom elements.
    const isCustomTag = nodeTag.includes("-");
    if (isCategorical && classStr && isCustomTag) return classStr;
    if (nodeTag === "div" && classStr) return classStr;
    
    return nodeTag + classStr;
  };

  const isCategorical = (mode === 'categorical');
  let selector = buildNodeSelector(el, isCategorical);

  // For contextual mode, we start with the element's selector and prepend its parent
  if (mode === 'contextual' && el.parentElement) {
    const parentSelector = buildNodeSelector(el.parentElement, true); // Parent is always categorical
    if (parentSelector) {
      selector = `${parentSelector} > ${selector}`;
    }
  }

  // Check for uniqueness. If not unique, attempt to climb.
  const root = el.getRootNode();
  try {
    if (root.querySelectorAll(selector).length === 1) {
      return selector;
    }
  } catch (e) {
    // Invalid selector, proceed to climbing
  }
  
  // Last resort for specific mode: Nth-child
  if (mode === 'specific') {
    const parent = el.parentElement;
    if (parent) {
      const index = Array.from(parent.children).indexOf(el) + 1;
      const baseSelector = buildNodeSelector(el, true); // use a more generic base for nth-child
      const indexedSelector = `${baseSelector}:nth-child(${index})`;
      
      const parentSelector = buildNodeSelector(parent, true);
      const finalSelector = `${parentSelector} > ${indexedSelector}`;
      
      try {
        if (root.querySelectorAll(finalSelector).length === 1) return finalSelector;
      } catch(e) {}
      // Fallback if parented version fails
      try {
        if (root.querySelectorAll(indexedSelector).length === 1) return indexedSelector;
      } catch (e) {}
    }
  }

  return selector; // Return the best we could do
}
