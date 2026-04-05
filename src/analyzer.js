// DOM/CSS ANALYZER

import { sendToRaw } from "./raw.js";
import { copyText, buildStrategicSelector } from "./utils.js";
import { getShadowRoots, _globalSheet } from "./shadow-manager.js";

// CLIENT ZONES

const CLIENT_ZONES = [
  {
    id: "__full__",
    label: "Full Page (all zones)",
    desc: "All viewports simultaneously. Best for a complete overview.",
  },
  {
    id: "rcp-fe-viewport-main",
    label: "Main View",
    desc: "The active screen — Profile, Loot, Lobby, Store, etc. Only this part swaps.",
  },
  {
    id: "rcp-fe-viewport-overlay",
    label: "Navigation & Top Bar",
    desc: "Play button, nav tabs, currency display, window controls.",
  },
  {
    id: "rcp-fe-viewport-sidebar",
    label: "Social Sidebar",
    desc: "Friends list, status, search, action bar.",
  },
  {
    id: "rcp-fe-viewport-persistent",
    label: "Activity Center",
    desc: "Persistent slide-out panel — activity center, esports viewer.",
  },
  {
    id: "#lol-uikit-layer-manager",
    label: "Layer Manager (Popups & Chat)",
    desc: "Tooltips, modals, dropdowns, detached chat. Lives outside the viewport root — the only way to theme these.",
  },
];

// KNOWN SCREENS
const KNOWN_SCREENS = [
  { tag: "rcp-fe-lol-navigation", label: "Navigation Bar" },
  { tag: "rcp-fe-lol-parties", label: "Home / Lobby" },
  { tag: "rcp-fe-lol-profiles", label: "Profile" },
  { tag: "rcp-fe-lol-social", label: "Social Panel" },
  { tag: "rcp-fe-lol-activity-center", label: "Activity Center" },
  { tag: "social", label: "Social Plugin Root" },
  { tag: "rcp-fe-lol-champ-select", label: "Champion Select" },
  { tag: "rcp-fe-lol-loot", label: "Loot" },
  { tag: "rcp-fe-lol-postgame", label: "Post-Game" },
  { tag: "rcp-fe-lol-store", label: "Store" },
  { tag: "rcp-fe-lol-collections", label: "Collections" },
  { tag: "rcp-fe-lol-clash", label: "Clash" },
  { tag: "rcp-fe-lol-match-history", label: "Match History" },
  { tag: "rcp-fe-lol-leagues", label: "Leagues / Ranked" },
  { tag: "rcp-fe-lol-event-hub", label: "Event Hub" },
  { tag: "rcp-fe-lol-highlights", label: "Highlights" },
  { tag: "rcp-fe-lol-tft", label: "TFT" },
  { tag: "rcp-fe-lol-yourshop", label: "Your Shop" },
  { tag: "rcp-fe-lol-settings", label: "Settings" },
  { tag: "rcp-fe-lol-champion-details", label: "Champion Details" },
  { tag: "rcp-fe-lol-champion-statistics", label: "Champion Statistics" },
  { tag: "rcp-fe-lol-skins-picker", label: "Skins Picker" },
  { tag: "rcp-fe-lol-premade-voice", label: "Premade Voice" },
  { tag: "rcp-fe-lol-new-player-experience", label: "New Player Experience" },
  { tag: "rcp-fe-lol-kickout", label: "Kickout / AFK" },
  { tag: "rcp-fe-lol-esports-spectate", label: "Esports Spectate" },
  { tag: "rcp-fe-lol-objectives", label: "Objectives" },
  { tag: "rcp-fe-lol-tft-team-planner", label: "TFT Team Planner" },
  { tag: "rcp-fe-lol-uikit", label: "UI Kit (global)" },
  { tag: "rcp-fe-lol-shared-components", label: "Shared Components" },
];

// ZONE IDs
const FULL_PAGE_ZONE_IDS = [
  "rcp-fe-viewport-main",
  "rcp-fe-viewport-overlay",
  "rcp-fe-viewport-sidebar",
  "rcp-fe-viewport-persistent",
  "#lol-uikit-layer-manager",
];

// STYLE BASELINE
let _defaultStyles = null;
function getDefaultStyles() {
  if (_defaultStyles) return _defaultStyles;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const cs = window.getComputedStyle(el);
  const defaults = {};
  for (let i = 0; i < cs.length; i++) {
    defaults[cs[i]] = cs.getPropertyValue(cs[i]).trim();
  }
  document.body.removeChild(el);
  _defaultStyles = defaults;
  return defaults;
}

// FILTERED PROPERTIES
const SKIP_PROPS = new Set([
  "perspective-origin",
  "transform-origin",
  "block-size",
  "inline-size",
  "min-block-size",
  "min-inline-size",
  "inset-block-start",
  "inset-block-end",
  "inset-inline-start",
  "inset-inline-end",
  "border-block-start-color",
  "border-block-end-color",
  "border-inline-start-color",
  "border-inline-end-color",
  "border-block-start-style",
  "border-block-end-style",
  "border-inline-start-style",
  "border-inline-end-style",
  "border-block-start-width",
  "border-block-end-width",
  "border-inline-start-width",
  "border-inline-end-width",
  "padding-block-start",
  "padding-block-end",
  "padding-inline-start",
  "padding-inline-end",
  "margin-block-start",
  "margin-block-end",
  "margin-inline-start",
  "margin-inline-end",
  "text-decoration-color",
  "text-emphasis-color",
  "column-rule-color",
  "caret-color",
  "outline-color",
  "-webkit-text-stroke-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-thickness",
  "text-decoration",
  "unicode-bidi",
  "writing-mode",
  "direction",
]);

// FORCE INCLUDE PROPERTIES
const ALWAYS_INCLUDE = new Set([
  "color",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "background-attachment",
  "border-color",
  "border-style",
  "border-width",
  "border-radius",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "opacity",
  "display",
  "visibility",
  "overflow",
  "overflow-x",
  "overflow-y",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "width",
  "height",
  "max-width",
  "max-height",
  "min-width",
  "min-height",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "flex",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "justify-content",
  "align-items",
  "align-self",
  "align-content",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "line-height",
  "text-align",
  "text-transform",
  "text-overflow",
  "white-space",
  "word-break",
  "filter",
  "backdrop-filter",
  "-webkit-backdrop-filter",
  "box-shadow",
  "text-shadow",
  "transform",
  "transition",
  "animation-name",
  "animation-duration",
  "cursor",
  "pointer-events",
  "user-select",
  "-webkit-mask",
  "-webkit-mask-image",
  "-webkit-mask-size",
  "-webkit-mask-position",
  "-webkit-mask-repeat",
  "stroke",
  "stroke-width",
  "fill",
  "mix-blend-mode",
  "isolation",
  "content",
  "-webkit-text-fill-color",
]);

function getNonDefaultStyles(el) {
  const defaults = getDefaultStyles();
  const cs = window.getComputedStyle(el);
  const result = {};
  for (let i = 0; i < cs.length; i++) {
    const prop = cs[i];
    if (SKIP_PROPS.has(prop) && !ALWAYS_INCLUDE.has(prop)) continue;
    const val = cs.getPropertyValue(prop).trim();
    const def = defaults[prop] ?? "";
    if (!val || val === def) continue;
    if (
      !ALWAYS_INCLUDE.has(prop) &&
      (val === "auto" ||
        val === "normal" ||
        val === "none" ||
        val === "0px" ||
        val === "rgba(0, 0, 0, 0)" ||
        val === "transparent")
    )
      continue;
    if (
      (prop === "top" ||
        prop === "right" ||
        prop === "bottom" ||
        prop === "left") &&
      val === "0px"
    )
      continue;
    result[prop] = val;
  }
  return result;
}

// VISIBILITY CHECK
function isInvisible(el, relaxed = false) {
  if (!el || el.nodeType !== 1) return true;
  if (el.classList.contains("hidden")) return true;
  const cs = window.getComputedStyle(el);
  if (cs.display === "none") return true;
  if (cs.visibility === "hidden") return true;
  if (!relaxed && cs.opacity === "0") return true;
  return false;
}

// GEOMETRY HELPERS
function getRect(el) {
  try {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return (
      Math.round(r.x) + "," + Math.round(r.y) + " " + Math.round(r.width) + "\xd7" + Math.round(r.height)
    );
  } catch {
    return null;
  }
}

function getRectRaw(el) {
  try {
    return el.getBoundingClientRect();
  } catch {
    return null;
  }
}

// ELEMENT FINGERPRINTING
function classFingerprint(el, depth) {
  const classes = [...el.classList]
    .filter(
      (c) =>
        !/^(ember-view|ng-|active|hover|focus|selected|disabled|open|closed|visible|hidden|loading)$/i.test(
          c,
        ),
    )
    .sort()
    .join(".");
  const base = el.tagName.toLowerCase() + (classes ? "." + classes : "");
  const parentTag = el.parentElement
    ? el.parentElement.tagName.toLowerCase()
    : "";
  return base + "@" + depth + ":" + parentTag;
}


// DOM TRAVERSAL
export function walkDOM(roots, maxDepth, skipInvisible = true, relaxed = false) {
  const rootList = Array.isArray(roots) ? roots : [roots];
  const seen = new Set();
  const elements = [];
  const treeLines = [];
  const shadowStylesheets = [];
  const allTrackedRoots =
    typeof getShadowRoots === "function" ? getShadowRoots() : [];

  function walk(el, depth, prefix, isLast, fromShadow) {
    if (depth > maxDepth) return;
    
    if (el.nodeType !== 1 && (depth > 0 || el.nodeType !== 11)) return;

    if (el.nodeType === 1 && el.tagName.toLowerCase() === "slot") return;
    if (el.nodeType === 1 && el.id === "snooze-css-host") return;

    if (skipInvisible && depth > 0 && el.nodeType === 1 && isInvisible(el, relaxed)) return;

    const childPfx = depth === 0 ? "" : prefix + (isLast ? "   " : "\u2502  ");

    if (el.nodeType === 1) {
      const fp = classFingerprint(el, depth);
      const selector = buildStrategicSelector(el);
      const rect = getRect(el);
      const connector = depth === 0 ? "" : isLast ? "\u2514\u2500 " : "\u251c\u2500 ";
      const shadowMark = fromShadow ? "\u25c6 " : "";
      const rectStr = rect ? "[" + rect + "]" : "";

      let leftSide = prefix + connector + shadowMark + selector;
      if (rectStr) {
          leftSide = leftSide.padEnd(55, " ") + rectStr;
      }
      treeLines.push(leftSide);

      if (!seen.has(el)) {
        seen.add(el);
        const styles = getNonDefaultStyles(el);
        const rawRect = getRectRaw(el);
        elements.push({
          fingerprint: fp,
          selector,
          depth,
          styles,
          rect,
          rawRect,
          fromShadow: !!fromShadow,
          domNode: el,
          hasImgChild: !!el.querySelector("img"),
        });
      }
    }

    // Process children
    const lightChildren = el.nodeType === 1 ? [...el.children] : [...el.childNodes].filter(n => n.nodeType === 1);

    // Shadow root traversal
    const sRoot =
      el.shadowRoot || allTrackedRoots.find((r) => r.host === el)?.shadowRoot;

    if (sRoot) {
      try {
        const hostSel = buildStrategicSelector(el);
        const standardSheets = [...sRoot.styleSheets];
        const adoptedSheets = sRoot.adoptedStyleSheets
          ? [...sRoot.adoptedStyleSheets]
          : [];
        const allSheets = [...standardSheets, ...adoptedSheets];

        allSheets.forEach((sheet) => {
          if (sheet === _globalSheet || sheet.href?.includes("Snooze-CSS"))
            return;

          try {
            const rules = [...sheet.cssRules];
            rules.forEach((rule) => {
              if (rule.cssText) {
                shadowStylesheets.push({ host: hostSel, rule: rule.cssText });
              }
            });
          } catch {
            /* cross-origin or unreadable */
          }
        });
      } catch {
        /* ignore */
      }
    }

    const shadowChildren = sRoot ? [...sRoot.children] : [];
    const allChildren = [...lightChildren, ...shadowChildren];

    allChildren.forEach((child, i) => {
      const isShadowChild = i >= lightChildren.length;
      walk(
        child,
        depth + 1,
        childPfx,
        i === allChildren.length - 1,
        isShadowChild,
      );
    });
  }

  rootList.forEach((root) => {
    if (!root) return;
    if (rootList.length > 1) {
      const zoneRect = getRect(root);
      const zoneLabel =
        buildStrategicSelector(root) + (zoneRect ? "[" + zoneRect + "]" : "");
      treeLines.push("");
      treeLines.push("\u250c\u2500\u2500 ZONE:" + zoneLabel);
    }
    walk(root, 0, "", true, false);
  });

  return { elements, treeLines, shadowStylesheets };
}

// LAYOUT ANALYSIS
function buildOverlayContext(cw, ch) {
  const lines = [];
  const PERSISTENT_ZONES = [
    {
      label: "Navigation bar (top overlay)",
      note: "Always visible. Contains play button, nav tabs, currency, window controls.",
      selectors: [
        "section.rcp-fe-viewport-overlay",
        "rcp-fe-viewport-overlay",
        ".rcp-fe-lol-navigation-app",
        "#rcp-fe-lol-navigation-app",
      ],
    },
    {
      label: "Social sidebar (right side)",
      note: "Always visible. Friends list, status bar, action buttons.",
      selectors: [
        "section.rcp-fe-viewport-sidebar",
        "rcp-fe-viewport-sidebar",
        ".lol-social-sidebar",
        ".social-plugin-home",
      ],
    },
    {
      label: "Activity center (persistent panel)",
      note: "Slide-out panel — may be hidden. Sits over the main viewport when open.",
      selectors: [
        "section.rcp-fe-viewport-persistent",
        "rcp-fe-viewport-persistent",
      ],
    },
    {
      label: "Layer manager (popups / chat)",
      note: "Outside viewport root. Tooltips, modals, dropdowns render here.",
      selectors: ["#lol-uikit-layer-manager"],
    },
    {
      label: "Navigation root component",
      note: "The inner nav app element — useful for measuring the actual nav height.",
      selectors: [".navigation-root-component", "#rcp-fe-lol-navigation-app"],
    },
    {
      label: "Navbar backdrop / play button area",
      note: "The top bar backdrop that contains the play button and nav tabs.",
      selectors: [
        ".navbar_backdrop",
        ".rcp-fe-lol-navigation-app .navbar_backdrop",
      ],
    },
  ];

  const found = [];

  PERSISTENT_ZONES.forEach((zone) => {
    let el = null;
    for (const sel of zone.selectors) {
      el = document.querySelector(sel);
      if (el) break;
    }
    if (!el) return;

    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;

    // Visibility check
    const x = Math.round(r.x),
      y = Math.round(r.y);
    const w = Math.round(r.width),
      h = Math.round(r.height);

    found.push({ label: zone.label, note: zone.note, x, y, w, h });
  });

  // Detect navigation height
  const navIndicators = [
    ".navigation-root-component",
    "lol-uikit-navigation-bar.main-nav-bar",
    ".navbar_backdrop",
  ];
  let navHeight = null;
  for (const sel of navIndicators) {
    const el = document.querySelector(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.height > 20 && r.height < 200) {
        navHeight = Math.round(r.bottom);
        break;
      }
    }
  }

  if (!found.length && navHeight === null) return "";

  lines.push("\u2500\u2500 PERSISTENT OVERLAY REGIONS" + "\u2500".repeat(33));
  lines.push(
    "These zones are ALWAYS rendered on top of the main screen content.",
  );
  lines.push(
    "Do NOT place CSS-repositioned elements in these areas — they will",
  );
  lines.push(
    "be covered. These are measured live from the current client state.",
  );
  lines.push("");
  lines.push("" + "ZONE".padEnd(40) + "POSITION          SIZE      OCCUPIES");
  lines.push("" + "\u2500".repeat(78));

  found.forEach((z) => {
    const pos = ("x:" + z.x + "y:" + z.y).padEnd(18);
    const dim = (z.w + "\xd7" + z.h).padEnd(10);
    let occupies = "";
    if (z.y < 20 && z.h < ch * 0.25) occupies = "top" + z.h + "px strip";
    else if (z.x > cw * 0.6) occupies = "right" + z.w + "px strip";
    else if (z.x < 20 && z.w < cw * 0.25) occupies = "left" + z.w + "px strip";
    else occupies = z.w + "\xd7" + z.h + "overlay";
    lines.push("" + z.label.padEnd(40) + pos + dim + occupies);
    lines.push("\u2192" + z.note);
  });

  lines.push("");

  // Safe area detection
  const topBars = found.filter((z) => z.y < 50 && z.h < ch * 0.25);
  const rightBars = found.filter((z) => z.x > cw * 0.6 && z.w < cw * 0.4);

  const safeTop =
    navHeight ||
    (topBars.length ? Math.max(...topBars.map((z) => z.y + z.h)) : 0);
  const safeRight = rightBars.length
    ? Math.min(...rightBars.map((z) => z.x))
    : cw;

  lines.push("SAFE CONTENT AREA (not covered by persistent chrome):");
  lines.push(
    "x:0  y:" +
      safeTop +
      "→" +
      safeRight +
      "\xd7" +
      (ch - safeTop) +
      "px",
  );
  lines.push(
    "Top" +
      safeTop +
      "px reserved by nav  ·  Right" +
      (cw - safeRight) +
      "px reserved by sidebar",
  );
  lines.push("");

  return lines.join("\n");
}

function buildLayoutSummary(roots, elements, screenLabel) {
  const lines = [];

  const vpRoot = document.getElementById("rcp-fe-viewport-root");
  const vpRect = vpRoot ? vpRoot.getBoundingClientRect() : null;
  const cw = vpRect ? Math.round(vpRect.width) : window.innerWidth;
  const ch = vpRect ? Math.round(vpRect.height) : window.innerHeight;

  lines.push("CANVAS:" + cw + "\xd7" + ch + "px  (client window dimensions)");
  lines.push("SCREEN:" + screenLabel);
  lines.push("");

  const overlayCtx = buildOverlayContext(cw, ch);
  if (overlayCtx) lines.push(overlayCtx);

  // Background detection
  const isBackgroundContainer = (e) =>
    e.rawRect.width > cw * 0.55 && e.rawRect.height > ch * 0.55;

  const mapped = elements
    .filter(
      (e) =>
        e.rawRect &&
        e.rawRect.width > 20 &&
        e.rawRect.height > 12 &&
        !isBackgroundContainer(e) &&
        (e.styles.position ||
          e.styles.display ||
          e.styles.width ||
          e.styles.height),
    )
    .sort(
      (a, b) =>
        b.rawRect.width * b.rawRect.height - a.rawRect.width * a.rawRect.height,
    )
    .slice(0, 40);

  // Spatial bucketing
  const top = mapped.filter((e) => e.rawRect.y < ch * 0.18);
  const bottom = mapped.filter(
    (e) => e.rawRect.y + e.rawRect.height > ch * 0.78,
  );
  const left = mapped.filter(
    (e) => e.rawRect.x < cw * 0.22 && e.rawRect.y >= ch * 0.1,
  );
  const right = mapped.filter(
    (e) => e.rawRect.x > cw * 0.68 && e.rawRect.y >= ch * 0.1,
  );
  const center = mapped.filter((e) => {
    const mx = e.rawRect.x + e.rawRect.width / 2;
    const my = e.rawRect.y + e.rawRect.height / 2;
    return mx > cw * 0.22 && mx < cw * 0.68 && my > ch * 0.18 && my < ch * 0.78;
  });

  const fmt = (e) => {
    const r = e.rawRect;
    const pos = ("x:" + Math.round(r.x) + "y:" + Math.round(r.y)).padEnd(18);
    const dim = (Math.round(r.width) + "\xd7" + Math.round(r.height)).padEnd(
      10,
    );
    return "" + e.selector.padEnd(50) + pos + dim;
  };

  lines.push("SPATIAL MAP");
  lines.push("SELECTOR".padEnd(50) + "POSITION          SIZE");

  const pushZone = (label, items) => {
    if (!items.length) return;
    lines.push("");
    lines.push(label);
    items.slice(0, 8).forEach((e) => lines.push(fmt(e)));
  };

  pushZone("TOP (header/nav area):", top);
  pushZone("LEFT (sidebar/column):", left);
  pushZone("CENTER (main content):", center);
  pushZone("RIGHT (panel/sidebar):", right);
  pushZone("BOTTOM (footer/bar):", bottom);

  // Depth analysis
  const stacked = elements
    .filter(
      (e) =>
        e.styles["z-index"] &&
        e.styles["z-index"] !== "auto" &&
        parseInt(e.styles["z-index"]) !== 0,
    )
    .sort(
      (a, b) => parseInt(b.styles["z-index"]) - parseInt(a.styles["z-index"]),
    )
    .slice(0, 10);

  if (stacked.length) {
    lines.push("");
    lines.push("Z-INDEX STACK");
    stacked.forEach((e) => {
      lines.push(
        "z:" + String(e.styles["z-index"]).padStart(8) + "" + e.selector,
      );
    });
  }

  // Glass effect detection
  const glass = elements.filter(
    (e) => e.styles["backdrop-filter"] || e.styles["-webkit-backdrop-filter"],
  );
  if (glass.length) {
    lines.push("");
    lines.push("GLASS / BLUR PANELS");
    glass.slice(0, 8).forEach((e) => {
      const bf =
        e.styles["backdrop-filter"] || e.styles["-webkit-backdrop-filter"];
      lines.push(
        "" +
          e.selector +
          "\u2192" +
          bf +
          (e.rect ? "[" + e.rect + "]" : ""),
      );
    });
  }

  // Absolute positioning analysis
  const absEls = elements
    .filter(
      (e) =>
        e.styles.position === "absolute" &&
        e.rawRect &&
        e.rawRect.width > 30 &&
        e.rawRect.height > 12 &&
        !isBackgroundContainer(e),
    )
    .slice(0, 16);
  if (absEls.length) {
    lines.push("");
    lines.push("ABSOLUTELY POSITIONED ELEMENTS");
    absEls.forEach((e) => lines.push(fmt(e)));
  }

  lines.push("");
  return lines.join("\n");
}

// Analyzes containing blocks, repositioning logic, and layout contexts.

// Find nearest positioned ancestor or viewport.
function findContainingBlock(el) {
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    try {
      const cs = window.getComputedStyle(node);
      const pos = cs.position;
      if (
        pos === "absolute" ||
        pos === "relative" ||
        pos === "fixed" ||
        pos === "sticky"
      ) {
        return { node, rect: node.getBoundingClientRect() };
      }
      if (cs.transform && cs.transform !== "none") {
        return { node, rect: node.getBoundingClientRect() };
      }
    } catch {
      /* ignore */
    }
    node = node.parentElement;
  }
  return null;
}

// Position Detection
function detectPositionMechanism(el, styles) {
  const pos = styles.position;

  if (pos === "absolute" || pos === "fixed") {
    const parts = [];
    if (styles.top && styles.top !== "auto") parts.push("top:" + styles.top);
    if (styles.left && styles.left !== "auto")
      parts.push("left:" + styles.left);
    if (styles.bottom && styles.bottom !== "auto" && styles.bottom !== "0px")
      parts.push("bottom:" + styles.bottom);
    if (styles.right && styles.right !== "auto" && styles.right !== "0px")
      parts.push("right:" + styles.right);
    return (
      (pos === "absolute" ? "position:absolute" : "position:fixed") +
      (parts.length ? "via" + parts.join(",") : "(inset 0)")
    );
  }

  if (pos === "relative") {
    const parts = [];
    if (styles.top && styles.top !== "auto" && styles.top !== "0px")
      parts.push("top:" + styles.top);
    if (styles.left && styles.left !== "auto" && styles.left !== "0px")
      parts.push("left:" + styles.left);
    return (
      "position:relative" +
      (parts.length ? "via" + parts.join(",") : "(no offset)")
    );
  }

  try {
    if (el.parentElement) {
      const pcs = window.getComputedStyle(el.parentElement);
      if (pcs.display === "flex" || pcs.display === "inline-flex") {
        const parts = [];
        if (styles["align-self"] && styles["align-self"] !== "auto")
          parts.push("align-self:" + styles["align-self"]);
        if (styles["margin-top"] && styles["margin-top"] !== "0px")
          parts.push("margin-top:" + styles["margin-top"]);
        if (styles["margin-left"] && styles["margin-left"] !== "0px")
          parts.push("margin-left:" + styles["margin-left"]);
        if (styles["flex-shrink"] !== undefined)
          parts.push("flex-shrink:" + styles["flex-shrink"]);
        return (
          "flex item in" +
          pcs["flex-direction"] +
          "flex" +
          (parts.length ? "— override:" + parts.join(",") : "")
        );
      }
      if (pcs.display === "grid" || pcs.display === "inline-grid") {
        return "grid item — use grid-area or position:absolute to reposition";
      }
    }
  } catch {
    /* ignore */
  }

  return "normal flow (position:static) — use position:absolute to reposition";
}

function buildCssConstraints(elements) {
  const lines = [];

  lines.push("CSS CONSTRAINTS");
  lines.push("");

  // Absolute child detection
  const absParents = [];
  elements.forEach((el) => {
    if (!el.rawRect) return;
    const area = el.rawRect.width * el.rawRect.height;
    if (area < 400) return;
    const absChildren = elements.filter((child) => {
      if (
        child === el ||
        child.styles.position !== "absolute" ||
        !child.rawRect
      )
        return false;
      const pr = el.rawRect,
        cr = child.rawRect;
      return (
        cr.x >= pr.x - 10 &&
        cr.y >= pr.y - 10 &&
        cr.x + cr.width <= pr.x + pr.width + 10 &&
        cr.y + cr.height <= pr.y + pr.height + 10
      );
    });
    if (absChildren.length >= 2) {
      absParents.push({
        el,
        count: absChildren.length,
        childExamples: absChildren.slice(0, 3),
      });
    }
  });

  if (absParents.length) {
    lines.push(
      "CONTAINERS WITH ABSOLUTE CHILDREN — do not resize or change their dimensions:",
    );
    lines.push(
      "Children use top/left relative to this container's width/height.",
    );
    lines.push(
      "Safe: move the whole container. Unsafe: resize it or set children position:static.",
    );
    lines.push("");
    absParents.slice(0, 8).forEach(({ el, count, childExamples }) => {
      const r = el.rawRect;
      lines.push(
        "" +
          el.selector +
          "[" +
          Math.round(r.width) +
          "\xd7" +
          Math.round(r.height) +
          "]  \u2192" +
          count +
          "abs children",
      );
      childExamples.forEach((s) => lines.push("child:" + s));
    });
    lines.push("");
  }

  // REPOSITIONING GUIDE
  lines.push("REPOSITIONING GUIDE — exact CSS values for moving each element:");
  lines.push(
    '"CB" = containing block (the positioned ancestor top/left is relative to)',
  );
  lines.push('"To move to viewport x:X y:Y" — use these CSS values');
  lines.push("Formula: left = target_x - cb_x, top = target_y - cb_y");
  lines.push("");
  const repositionableEls = elements.filter(
    (el) => el.rawRect && el.rawRect.width > 26 && el.rawRect.height > 10,
  );

  repositionableEls.slice(0, 20).forEach((el) => {
    const r = el.rawRect;
    const vx = Math.round(r.x),
      vy = Math.round(r.y);
    const vw = Math.round(r.width),
      vh = Math.round(r.height);
    const mechanism = detectPositionMechanism(el.domNode, el.styles);

    let cbVx = 0,
      cbVy = 0,
      cbDesc = "viewport";
    const cb = el.domNode ? findContainingBlock(el.domNode) : null;
    if (cb) {
      cbVx = Math.round(cb.rect.x);
      cbVy = Math.round(cb.rect.y);
      cbDesc = buildStrategicSelector(cb.node) + "@ vp:" + cbVx + "," + cbVy;
    }

    const curCssLeft = vx - cbVx;
    const curCssTop = vy - cbVy;

    lines.push(
      "\u25b6" +
        el.selector +
        "[vp:" +
        vx +
        "," +
        vy +
        "" +
        vw +
        "\xd7" +
        vh +
        "]",
    );
    lines.push("position mechanism:" + mechanism);
    lines.push("CB:" + cbDesc);
    lines.push(
      "current CSS: left:" + curCssLeft + "px  top:" + curCssTop + "px",
    );
    // Safe area coordinates
    const safeTop = 82;
    const toTopLeft =
      "left:" + (0 - cbVx) + "px  top:" + (safeTop - cbVy) + "px";
    const toTopRight =
      "left:" + (862 - cbVx - vw) + "px  top:" + (safeTop - cbVy) + "px";
    const toBotLeft =
      "left:" + (0 - cbVx) + "px  top:" + (720 - vh - cbVy) + "px";
    const toBotRight =
      "left:" + (862 - cbVx - vw) + "px  top:" + (720 - vh - cbVy) + "px";
    lines.push("\u2192 to place at safe-top-left:" + toTopLeft);
    lines.push("\u2192 to place at safe-top-right:" + toTopRight);
    lines.push("\u2192 to place at safe-bot-left:" + toBotLeft);
    lines.push("\u2192 to place at safe-bot-right:" + toBotRight);
    lines.push("");
  });

  // ENGINE-MANAGED ELEMENTS
  const engineTags = [
    "lol-regalia",
    "lol-uikit",
    "uikit-state-machine",
    "lol-parties",
  ];
  const engineEls = elements.filter((el) =>
    engineTags.some(
      (t) => el.selector.startsWith(t) || el.selector.includes("." + t),
    ),
  );
  if (engineEls.length) {
    lines.push(
      "ENGINE-MANAGED (Riot custom elements — internal layout recalculated at runtime):",
    );
    lines.push(
      "Safe: color, opacity, filter, transform on the element itself.",
    );
    lines.push(
      "Safe to move: set top/left on the outermost custom element tag.",
    );
    lines.push(
      "Unsafe: override top/left/width/height on children inside these.",
    );
    lines.push("");
    engineEls.slice(0, 6).forEach((el) => {
      lines.push("" + el.selector + (el.rect ? "[" + el.rect + "]" : ""));
    });
    lines.push("");
  }

  // FLEX/GRID CONTEXT DETECTION
  const flexContexts = [];
  elements.forEach((el) => {
    if (!el.domNode) return;
    const d = el.styles.display;
    if (d !== "flex" && d !== "grid") return;
    if (!el.rawRect || el.rawRect.width < 50) return;
    const children = [...el.domNode.children].filter((c) => {
      try {
        const r = c.getBoundingClientRect();
        return r.width > 10 && r.height > 10;
      } catch {
        return false;
      }
    });
    if (children.length < 2) return;
    const fd = el.styles["flex-direction"] || "row";
    const jc = el.styles["justify-content"] || "flex-start";
    const ai = el.styles["align-self"] || "auto";
    flexContexts.push({ el, d, fd, jc, ai, childCount: children.length });
  });

  if (flexContexts.length) {
    lines.push(
      "FLEX/GRID LAYOUT CONTEXTS — children are positioned by the layout engine:",
    );
    lines.push(
      "To reposition a flex/grid child with CSS top/left, you MUST first",
    );
    lines.push(
      "set position:absolute on that child (removing it from flex/grid flow).",
    );
    lines.push(
      "OR change the parent flex-direction / justify-content / align-items.",
    );
    lines.push("");
    flexContexts.slice(0, 8).forEach(({ el, d, fd, jc, ai, childCount }) => {
      lines.push(
        "" + el.selector + "display:" + d + "flex-direction:" + fd,
      );
      lines.push(
        "justify-content:" +
          jc +
          "align-self:" +
          ai +
          "(" +
          childCount +
          "children in flow)",
      );
      lines.push(
        "\u2192 children use flex placement — add position:absolute to take a child out of flow",
      );
    });
    lines.push("");
  }

  // Z-INDEX STACKING
  lines.push(
    "Z-INDEX STACKING — if you reposition elements, set z-index to control layering:",
  );
  lines.push(
    "Elements later in DOM render on top by default (z-index:auto).",
  );
  lines.push("If repositioned elements are covered, increase their z-index.");
  lines.push(
    "If repositioned elements cover others, decrease or set z-index:0.",
  );
  lines.push("");
  const stacked = elements.filter(
    (e) => e.styles["z-index"] && e.styles["z-index"] !== "auto",
  );
  if (stacked.length) {
    stacked
      .sort(
        (a, b) => parseInt(b.styles["z-index"]) - parseInt(a.styles["z-index"]),
      )
      .slice(0, 10)
      .forEach((e) =>
        lines.push(
          "z:" + String(e.styles["z-index"]).padStart(6) + "" + e.selector,
        ),
      );
    lines.push(
      "z:     0  (default for all other elements — last in DOM = on top)",
    );
  } else {
    lines.push("No explicit z-index found. DOM order determines stacking.");
    lines.push(
      "Sub-nav and emblems share the same stacking context — last in DOM wins.",
    );
    lines.push(
      "If sub-nav is after emblems in DOM, it renders on top and vice versa.",
    );
  }
  lines.push("");

  // OVERFLOW CLIPPING
  const clippers = elements.filter(
    (el) =>
      (el.styles["overflow-x"] === "hidden" ||
        el.styles["overflow-y"] === "hidden" ||
        el.styles["overflow"] === "hidden") &&
      el.rawRect &&
      el.rawRect.width > 100,
  );
  if (clippers.length) {
    lines.push(
      "OVERFLOW:HIDDEN — elements repositioned outside these bounds will be clipped:",
    );
    lines.push(
      "Add overflow:visible !important to the container before repositioning children.",
    );
    lines.push("");
    clippers.slice(0, 6).forEach((el) => {
      const r = el.rawRect;
      lines.push(
        "" +
          el.selector +
          "clips at [" +
          Math.round(r.x) +
          "," +
          Math.round(r.y) +
          "" +
          Math.round(r.width) +
          "\xd7" +
          Math.round(r.height) +
          "]",
      );
    });
    lines.push("");
  }

  return lines.join("\n");
}

let _lastElements = [];

// OUTPUT FORMATTER
function formatOutput(
  screenTag,
  screenLabel,
  elements,
  treeLines,
  roots,
  shadowStylesheets,
) {
  const lines = [];

  lines.push("SNOOZE-CSS ANALYZER");
  lines.push("Screen :" + screenLabel);
  lines.push("Zone   :" + screenTag);
  lines.push("Visible elements:" + elements.length + "unique");
  const shadowCount = elements.filter((e) => e.fromShadow).length;
  if (shadowCount)
    lines.push("Shadow DOM elements:" + shadowCount + "(\u25c6 in tree)");
  if (shadowStylesheets && shadowStylesheets.length)
    lines.push(
      "Shadow stylesheets extracted:" + shadowStylesheets.length + "rules",
    );
  lines.push("\u2550".repeat(62));
  lines.push("");

  lines.push(buildLayoutSummary(roots, elements, screenLabel));

  // CSS Constraints
  lines.push(buildCssConstraints(elements));

  // DOM TREE GENERATOR
  lines.push("DOM TREE");
  lines.push("selector [x,y width\u00d7height]");
  lines.push("");
  treeLines.forEach((l) => lines.push(l));
  lines.push("");

  // STYLE REPORTER
  lines.push("ELEMENTS & STYLES");
  lines.push("Only theming-relevant non-default properties.");
  lines.push("Each block: selector  @ x,y  width\xd7height");
  lines.push("");
  elements.forEach(({ selector, styles, rect, fromShadow }) => {
    const entries = Object.entries(styles);
    if (!entries.length) return;
    const shadow = fromShadow ? "\u25c6shadow" : "";
    const rectPart = rect ? "@" + rect : "";
    lines.push(selector + shadow + rectPart);
    entries.forEach(([p, v]) => lines.push("" + p + ":" + v));
    lines.push("");
  });

  // SHADOW DOM STYLE EXTRACTOR
  if (shadowStylesheets && shadowStylesheets.length) {
    lines.push("SHADOW DOM SOURCE STYLESHEETS");
    lines.push(
      "These rules live inside shadow roots. Normal CSS CANNOT override them.",
    );
    lines.push(
      "To reposition shadow children: move the HOST element (e.g. lol-regalia-*)",
    );
    lines.push(
      "or use CSS custom properties if the shadow CSS uses var() references.",
    );
    lines.push("");
    // Group by host
    const byHost = {};
    shadowStylesheets.forEach(({ host, rule }) => {
      if (!byHost[host]) byHost[host] = [];
      byHost[host].push(rule);
    });
    Object.entries(byHost).forEach(([host, rules]) => {
      lines.push("HOST:" + host);
      // Only emit rules with position/size/layout properties — skip decoration
      const layoutKeywords = [
        "position",
        "top",
        "left",
        "right",
        "bottom",
        "width",
        "height",
        "display",
        "flex",
        "grid",
        "transform",
        "margin",
        "padding",
        "justify-content",
        "align-items",
        "align-self",
        "overflow",
      ];
      const layoutRules = rules.filter((r) =>
        layoutKeywords.some(
          (kw) => r.includes(kw + ":") || r.includes(kw + ":"),
        ),
      );
      layoutRules.slice(0, 20).forEach((r) => {
        // Indent each line of the rule for readability
        r.split("\n").forEach((line) => lines.push("" + line.trim()));
        lines.push("");
      });
      if (layoutRules.length === 0) {
        lines.push("(no layout rules — decoration only)");
        lines.push("");
      }
    });
  }

  // COLOR PALETTE
  const colors = new Set();
  elements.forEach(({ styles }) => {
    [
      "color",
      "background-color",
      "border-top-color",
      "box-shadow",
      "text-shadow",
      "fill",
      "stroke",
    ].forEach((p) => {
      if (styles[p]) {
        const m = styles[p].match(/(?:#[0-9a-f]{3,8}|rgba?\([^)]+\))/gi);
        if (m) m.forEach((c) => colors.add(c));
      }
    });
  });
  if (colors.size) {
    lines.push("COLOR PALETTE");
    lines.push([...colors].join("\xb7"));
    lines.push("");
  }

  // FONT INVENTORY
  const fonts = new Set();
  elements.forEach(({ styles }) => {
    if (styles["font-family"]) {
      styles["font-family"]
        .split(",")
        .forEach((f) => fonts.add(f.trim().replace(/['"]/g,"")));
    }
  });
  if (fonts.size) {
    lines.push("FONTS");
    lines.push([...fonts].join("\xb7"));
    lines.push("");
  }

  // ASSET INVENTORY
  const images = new Set();
  elements.forEach(({ styles }) => {
    [
      "background-image",
      "content",
      "-webkit-mask",
      "-webkit-mask-image",
    ].forEach((p) => {
      if (styles[p] && styles[p] !== "none") {
        const m = styles[p].match(
          /url\("[^"]+"\)|url\('[^']+'\)|url\([^)]+\)/g,
        );
        if (m) m.forEach((u) => images.add(u));
      }
    });
  });
  if (images.size) {
    lines.push("IMAGES / ASSETS");
    [...images].forEach((u) => lines.push(u));
    lines.push("");
  }

  return lines.join("\n");
}

// ANALYZER UI

export function buildAnalyzerTab(container) {
  container.innerHTML = `
    <div class="ci-az-header">
      <div class="ci-az-row" style="gap:8px;flex-wrap:wrap;">
        <div class="ci-field" style="flex:1;min-width:180px;">
          <div class="ci-label">Zone / Screen</div>
          <select class="ci-select" id="az-screen-select">
            <option value=""> Auto-detect active screen </option>
          </select>
        </div>
        <div class="ci-field" style="width:82px;">
          <div class="ci-label">Max depth</div>
          <div style="display:flex;align-items:center;gap:4px;">
            <input type="range" class="ci-slider" id="az-depth" min="1" max="20" value="12" style="width:44px;">
            <span id="az-depth-val" style="font-size:10px;color:#c8aa6e;min-width:16px;">12</span>
          </div>
        </div>
        <div class="ci-field" style="width:auto;">
          <div class="ci-label">Options</div>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:10px;color:#4a6070;white-space:nowrap;">
            <input type="checkbox" id="az-skip-hidden" checked style="accent-color:#785a28;">
            Skip hidden
          </label>
        </div>
      </div>
      <div id="az-zone-desc" style="font-size:9px;color:#2a4050;margin-top:5px;min-height:12px;line-height:1.4;padding:0 1px;"></div>
      <div class="ci-az-row" style="margin-top:8px;">
        <button class="ci-btn-primary" id="az-capture-btn" style="padding:7px 18px;">&#x25CE; Capture</button>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:10px;color:#4a6070;">
          <input type="checkbox" id="az-auto" style="accent-color:#785a28;">
          Auto on screen change
        </label>
        <span id="az-status" style="font-size:10px;color:#4a6070;margin-left:auto;"></span>
      </div>
    </div>

    <div id="az-tabs" class="ci-az-subtabs">
      <button class="ci-az-subtab ci-az-subtab-active" data-view="tree">DOM Tree</button>
      <button class="ci-az-subtab" data-view="elements">Elements</button>
      <button class="ci-az-subtab" data-view="raw">Raw Text</button>
    </div>

    <div id="az-empty" style="padding:32px 18px;text-align:center;color:#2a3a4a;font-size:11px;">
      Select a zone and click Capture, or navigate to a screen with auto-detect on.
    </div>

    <div id="az-content" style="display:none;">
      <div id="az-view-tree"     class="az-view"></div>
      <div id="az-view-elements" class="az-view" style="display:none;"></div>
      <div id="az-view-raw"      class="az-view" style="display:none;">
        <div style="display:flex;justify-content:flex-end;margin-bottom:6px;gap:5px;flex-wrap:wrap;">
          <button class="ci-btn-secondary" id="az-copy-btn"        style="font-size:10px;padding:4px 10px;">&#x2398; All</button>
          <button class="ci-btn-secondary" id="az-copy-layout-btn" style="font-size:10px;padding:4px 10px;">Layout</button>
          <button class="ci-btn-secondary" id="az-copy-tree-btn"   style="font-size:10px;padding:4px 10px;">Tree</button>
          <button class="ci-btn-secondary" id="az-copy-styles-btn" style="font-size:10px;padding:4px 10px;">Styles</button>
          <button class="ci-btn-secondary" id="az-copy-json-btn"   style="font-size:10px;padding:4px 10px;color:#c8aa6e;border-color:#785a28;">Agentic Context (JSON)</button>
        </div>
        <textarea class="ci-textarea ci-az-textarea" id="az-raw-output" readonly spellcheck="false"></textarea>
      </div>
    </div>
  `;

  const select = container.querySelector("#az-screen-select");
  const descEl = container.querySelector("#az-zone-desc");

  // Zones
  const zoneGroup = document.createElement("optgroup");
  zoneGroup.label = "Client Zones (architectural sections)";
  CLIENT_ZONES.forEach((z) => {
    const opt = document.createElement("option");
    opt.value = z.id;
    opt.textContent = z.label;
    opt.dataset.desc = z.desc;
    zoneGroup.appendChild(opt);
  });
  select.appendChild(zoneGroup);

  // Specific Screens Group
  const screenGroup = document.createElement("optgroup");
  screenGroup.label = "Specific Screens";

  const livePlugins = [...document.querySelectorAll("link[data-plugin-name]")]
    .map((l) => l.dataset.pluginName)
    .filter(Boolean);

  const screenList =
    livePlugins.length > 0
      ? livePlugins.map((tag) => {
          const known = KNOWN_SCREENS.find((s) => s.tag === tag);
          return { tag, label: known ? known.label : tag };
        })
      : KNOWN_SCREENS;

  screenList.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.tag;
    opt.textContent = s.label + "(" + s.tag + ")";
    screenGroup.appendChild(opt);
  });
  select.appendChild(screenGroup);

  // Depth Slider
  const depthSlider = container.querySelector("#az-depth");
  const depthVal = container.querySelector("#az-depth-val");
  depthSlider.addEventListener("input", () => {
    depthVal.textContent = depthSlider.value;
  });

  // Sub-Tab Switching
  container.querySelectorAll(".ci-az-subtab").forEach((btn) => {
    btn.addEventListener("click", () => {
      container
        .querySelectorAll(".ci-az-subtab")
        .forEach((b) => b.classList.remove("ci-az-subtab-active"));
      btn.classList.add("ci-az-subtab-active");
      container
        .querySelectorAll(".az-view")
        .forEach((v) => (v.style.display = "none"));
      container.querySelector("#az-view-" + btn.dataset.view).style.display =
        "block";
    });
  });

  // Capture UI
  container
    .querySelector("#az-capture-btn")
    .addEventListener("click", () => runCapture(container));

  // Copy Buttons
  container.querySelector("#az-copy-btn").addEventListener("click", () => {
    copyText(container.querySelector("#az-raw-output").value);
    setStatus(container, "Copied \u2713", "ok");
  });
  container
    .querySelector("#az-copy-layout-btn")
    .addEventListener("click", () => {
      const raw = container.querySelector("#az-raw-output").value;
      copyText(
        extractSection(
          raw,
          "SPATIAL MAP",
          "DOM TREE",
        ),
      );
      setStatus(container, "Layout copied \u2713", "ok");
    });
  container.querySelector("#az-copy-tree-btn").addEventListener("click", () => {
    const raw = container.querySelector("#az-raw-output").value;
    copyText(
      extractSection(raw, "DOM TREE", "ELEMENTS"),
    );
    setStatus(container, "Tree copied \u2713", "ok");
  });
  container
    .querySelector("#az-copy-styles-btn")
    .addEventListener("click", () => {
      const raw = container.querySelector("#az-raw-output").value;
      copyText(
        extractSection(
          raw,
          "ELEMENTS & STYLES",
          "COLOR PALETTE",
        ),
      );
      setStatus(container, "Styles copied \u2713", "ok");
    });

  container.querySelector("#az-copy-json-btn").addEventListener("click", () => {
    if (!_lastElements || _lastElements.length === 0) {
      setStatus(container, "No data to capture", "err");
      return;
    }

    const vpRoot = document.getElementById("rcp-fe-viewport-root");
    const vpRect = vpRoot ? vpRoot.getBoundingClientRect() : null;

    const screenName =
      container.querySelector("#az-screen-select")?.options[
        container.querySelector("#az-screen-select").selectedIndex
      ]?.text || "unknown";

    const aiData = {
      screen: screenName,
      canvas: {
        width: vpRect ? Math.round(vpRect.width) : window.innerWidth,
        height: vpRect ? Math.round(vpRect.height) : window.innerHeight,
      },
      elements: _lastElements.map((e) => {
        const out = { sel: e.selector, depth: e.depth };
        if (e.rect) out.rect = e.rect;
        if (Object.keys(e.styles).length) out.styles = e.styles;
        if (e.fromShadow) out.shadow = true;
        return out;
      }),
    };

    copyText(JSON.stringify(aiData, null, 2));
    setStatus(container, "Agentic Context copied \u2713", "ok");
  });

  setupAutoDetect(container);
  updateActiveScreens(select);
}

// CAPTURE ENGINE
// Resolve zone/screen ID to Element
function resolveZoneRoot(id) {
  if (!id) return null;
  if (id.startsWith("#")) return document.querySelector(id);
  // Section tags like rcp-fe-viewport-main appear as both tag and class in the DOM
  const byTag = document.querySelector(id);
  if (byTag) return byTag;
  const byClass = document.querySelector("." + id);
  if (byClass) return byClass;
  const byAttr = document.querySelector('[data-screen-name="' + id + '"]');
  if (byAttr) return byAttr;
  return null;
}

function findScreenRoot(tag) {
  if (!tag) return null;
  const byTag = document.querySelector(tag);
  if (byTag) return byTag;
  const byClass = document.querySelector("." + tag);
  if (byClass) return byClass;
  const byAttr = document.querySelector('[data-screen-name="' + tag + '"]');
  if (byAttr) return byAttr;
  return null;
}

function getActiveScreenTag() {
  // Find populated screen roots
  const visibleScreens = [
    ...document.querySelectorAll("[data-screen-name]"),
  ].filter(
    (el) =>
      !el.classList.contains("hidden") &&
      el.offsetParent !== null &&
      el.childElementCount > 0,
  );

  if (visibleScreens.length > 0) {
    // Prefer screens in the main viewport first
    const mainVpScreen = visibleScreens.find((el) =>
      el.closest(".rcp-fe-viewport-main"),
    );
    if (mainVpScreen) return mainVpScreen.dataset.screenName;

    // Prefer active screens
    const activeScreen = visibleScreens.find((el) =>
      el.classList.contains("active"),
    );
    if (activeScreen) return activeScreen.dataset.screenName;

    // Fallback to the first valid populated screen
    return visibleScreens[0].dataset.screenName;
  }

  // Fall back to walking viewport-main children if no [data-screen-name] is found
  const viewport = document.querySelector(
    "section.rcp-fe-viewport-main, rcp-fe-viewport-main",
  );
  if (viewport) {
    for (const child of viewport.children) {
      if (child.childElementCount === 0) continue; // Skip empty wrappers

      const tag = child.tagName.toLowerCase();
      if (tag.startsWith("rcp-fe-")) return tag;

      const rcpClass = [...child.classList].find((c) =>
        c.startsWith("rcp-fe-"),
      );
      if (rcpClass) return rcpClass;

      if (child.dataset.screenName) return child.dataset.screenName;

      for (const gc of child.children) {
        const gtag = gc.tagName.toLowerCase();
        if (gtag.startsWith("rcp-fe-")) return gtag;
        const gClass = [...gc.classList].find((c) => c.startsWith("rcp-fe-"));
        if (gClass) return gClass;
        if (gc.dataset.screenName) return gc.dataset.screenName;
      }
    }
  }
  return null;
}

// Main capture entry
function runCapture(container) {
  const select = container.querySelector("#az-screen-select");
  const depth = parseInt(container.querySelector("#az-depth").value);
  const skipHidden = container.querySelector("#az-skip-hidden").checked;

  let screenTag = select.value;
  let screenLabel =
    select.options[select.selectedIndex]?.text
      ?.split("(")[0]
      ?.replace(/^\u25cf /, "")
      .trim() || screenTag;

  const doCapture = (roots, tag, label) => {
    setStatus(container, "Capturing\u2026", "info");
    requestAnimationFrame(() => {
      try {
        const rootArr = Array.isArray(roots) ? roots : [roots];
        const { elements, treeLines, shadowStylesheets } = walkDOM(
          rootArr,
          depth,
          skipHidden,
        );
        const rawText = formatOutput(
          tag,
          label,
          elements,
          treeLines,
          rootArr,
          shadowStylesheets,
        );
        renderResults(container, tag, label, elements, treeLines, rawText);
        setStatus(
          container,
          label + "\u00b7" + elements.length + "elements",
          "ok",
        );
      } catch (err) {
        setStatus(container, "Capture failed:" + err.message, "err");
        console.error("[Snooze-CSS Analyzer]", err);
      }
    });
  };

  // Full page
  if (screenTag === "__full__") {
    const roots = FULL_PAGE_ZONE_IDS.map(resolveZoneRoot).filter(Boolean);
    if (!roots.length) {
      setStatus(container, "No viewport zones found", "err");
      return;
    }
    doCapture(roots, "__full__", "Full Page");
    return;
  }

  // Client zone
  const isZone = CLIENT_ZONES.some((z) => z.id === screenTag);
  if (isZone) {
    const root = resolveZoneRoot(screenTag);
    if (!root) {
      setStatus(container, screenTag + "not found", "err");
      return;
    }
    doCapture(root, screenTag, screenLabel);
    return;
  }

  // Auto-detect
  if (!screenTag) {
    screenTag = getActiveScreenTag();
    if (!screenTag) {
      setStatus(container, "No active screen found", "err");
      return;
    }
    const known = KNOWN_SCREENS.find((s) => s.tag === screenTag);
    screenLabel = known ? known.label : screenTag;
  }

  // Specific screen
  const root = findScreenRoot(screenTag);
  if (!root) {
    setStatus(container, screenTag + "not in DOM", "err");
    return;
  }
  doCapture(root, screenTag, screenLabel);
}

// RESULT RENDERER

function renderResults(
  container,
  screenTag,
  screenLabel,
  elements,
  treeLines,
  rawText,
) {
  container.querySelector("#az-empty").style.display = "none";
  container.querySelector("#az-content").style.display = "block";

  container.querySelector("#az-raw-output").value = rawText;
  _lastElements = elements;

  // DOM tree
  const treeEl = container.querySelector("#az-view-tree");
  treeEl.innerHTML = "";
  const pre = document.createElement("pre");
  pre.className = "ci-az-pre";
  pre.textContent = treeLines.join("\n");
  treeEl.appendChild(pre);

  // Elements view
  const elEl = container.querySelector("#az-view-elements");
  elEl.innerHTML = "";

  const withStyles = elements.filter((e) => Object.keys(e.styles).length > 0);
  const withoutStyles = elements.filter(
    (e) => Object.keys(e.styles).length === 0,
  );
  const shadowCount = elements.filter((e) => e.fromShadow).length;

  const countBar = document.createElement("div");
  countBar.style.cssText =
    "font-size:10px;color:#4a6070;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #1a2535;";
  countBar.textContent =
    withStyles.length +
    "styled  \xb7" +
    withoutStyles.length +
    "unstyled" +
    (shadowCount ? "\xb7" + shadowCount + "from shadow DOM" : "");
  elEl.appendChild(countBar);

  withStyles.forEach(({ selector, styles, rect, fromShadow }) => {
    const block = document.createElement("div");
    block.className = "ci-az-element";

    const header = document.createElement("div");
    header.className = "ci-az-element-header";

    const selEl = document.createElement("code");
    selEl.className = "ci-az-selector";
    selEl.textContent = selector + (fromShadow ? "\u25c6" : "");

    const meta = document.createElement("span");
    meta.style.cssText =
      "display:flex;align-items:center;gap:6px;flex-shrink:0;";

    if (rect) {
      const rb = document.createElement("span");
      rb.style.cssText =
        'font-size:8px;color:#2a4050;font-family:"Fira Code",monospace;white-space:nowrap;';
      rb.textContent = rect;
      meta.appendChild(rb);
    }

    const count = document.createElement("span");
    count.className = "ci-az-prop-count";
    count.textContent = Object.keys(styles).length + "props";
    meta.appendChild(count);

    const sendBtn = document.createElement("button");
    sendBtn.className = "ci-az-send-btn";
    sendBtn.title = "Send all props to Raw CSS";
    sendBtn.textContent = "\u2192 Raw";
    sendBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sendToRaw(
        selector +
          "{\n" +
          Object.entries(styles)
            .map(([p, v]) => "\t" + p + ":" + v + "!important;")
            .join("\n") +
          "\n}",
      );
    });

    const copyBtn = document.createElement("button");
    copyBtn.className = "ci-az-copy-el";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyText(
        selector +
          "{\n" +
          Object.entries(styles)
            .map(([p, v]) => "" + p + ":" + v + ";")
            .join("\n") +
          "\n}",
      );
      copyBtn.textContent = "\u2713";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
    });

    header.appendChild(selEl);
    header.appendChild(meta);
    header.appendChild(sendBtn);
    header.appendChild(copyBtn);
    block.appendChild(header);

    const body = document.createElement("div");
    body.className = "ci-az-element-body";

    Object.entries(styles).forEach(([prop, val]) => {
      const row = document.createElement("div");
      row.className = "ci-az-prop-row";

      const propEl = document.createElement("span");
      propEl.className = "ci-az-prop-name";
      propEl.textContent = prop;

      const valEl = document.createElement("span");
      valEl.className = "ci-az-prop-val";
      valEl.textContent = val;

      if (/^(#|rgb|hsl)/.test(val)) {
        const sw = document.createElement("span");
        sw.style.cssText =
          "display:inline-block;width:10px;height:10px;border-radius:2px;border:1px solid #1a2535;background:" +
          val +
          ";margin-right:4px;vertical-align:middle;flex-shrink:0;";
        valEl.prepend(sw);
      }

      const sendPropBtn = document.createElement("button");
      sendPropBtn.className = "ci-az-send-prop-btn";
      sendPropBtn.title = "Send to Raw CSS";
      sendPropBtn.textContent = "\u2192";
      sendPropBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        sendToRaw(selector + "{\n\t" + prop + ":" + val + "!important;\n}");
      });

      row.appendChild(propEl);
      row.appendChild(valEl);
      row.appendChild(sendPropBtn);
      body.appendChild(row);
    });

    let collapsed = false;
    header.style.cursor = "pointer";
    header.addEventListener("click", () => {
      collapsed = !collapsed;
      body.style.display = collapsed ? "none" : "block";
      block.style.opacity = collapsed ? "0.5" : "1";
    });

    block.appendChild(body);
    elEl.appendChild(block);
  });

  if (withoutStyles.length) {
    const ub = document.createElement("div");
    ub.className = "ci-az-element";
    ub.style.opacity = "0.4";
    const uh = document.createElement("div");
    uh.className = "ci-az-element-header";
    uh.style.cursor = "pointer";
    uh.textContent =
      withoutStyles.length + "visible but unstyled elements (click to expand)";
    const ubody = document.createElement("div");
    ubody.className = "ci-az-element-body";
    ubody.style.display = "none";
    withoutStyles.forEach(({ selector, rect }) => {
      const row = document.createElement("div");
      row.style.cssText =
        'font-size:10px;color:#3a5060;padding:2px 0;font-family:"Fira Code",monospace;';
      row.textContent = selector + (rect ? "[" + rect + "]" : "");
      ubody.appendChild(row);
    });
    uh.addEventListener("click", () => {
      ubody.style.display = ubody.style.display === "none" ? "block" : "none";
    });
    ub.appendChild(uh);
    ub.appendChild(ubody);
    elEl.appendChild(ub);
  }
}

// AUTO-DETECTION ENGINE

function setupAutoDetect(container) {
  let observer = null;
  const ref = new WeakRef(container);

  const tryAttach = () => {
    const viewport = document.querySelector(
      "section.rcp-fe-viewport-main, rcp-fe-viewport-main",
    );
    if (!viewport) {
      setTimeout(tryAttach, 500);
      return;
    }

    observer = new MutationObserver(() => {
      const c = ref.deref();
      if (!c || !document.contains(c)) {
        observer.disconnect();
        return;
      }
      if (!c.querySelector("#az-auto")?.checked) return;
      clearTimeout(observer._t);
      observer._t = setTimeout(() => {
        updateActiveScreens(c.querySelector("#az-screen-select"));
        runCapture(c);
      }, 600);
    });

    observer.observe(viewport, { childList: true, subtree: false });
  };

  tryAttach();
}

function updateActiveScreens(select) {
  [...select.options].forEach((opt) => {
    if (!opt.value || opt.value === "__full__") return;
    const inDOM = !!(resolveZoneRoot(opt.value) || findScreenRoot(opt.value));
    if (inDOM && !opt.textContent.startsWith("\u25cf"))
      opt.textContent = "\u25cf" + opt.textContent;
    if (!inDOM && opt.textContent.startsWith("\u25cf"))
      opt.textContent = opt.textContent.replace(/^\u25cf /, "");
  });
}

// HELPERS

function extractSection(text, fromMarker, toMarker) {
  const start = text.indexOf(fromMarker);
  if (start === -1) return text;
  const end = toMarker ? text.indexOf(toMarker, start) : text.length;
  return text.substring(start, end === -1 ? text.length : end).trim();
}

function setStatus(container, msg, type = "info") {
  const el = container.querySelector("#az-status");
  if (!el) return;
  el.textContent = msg;
  el.style.color =
    type === "ok" ? "#4caf82" : type === "err" ? "#c84b4b" : "#785a28";
}

export function cleanupAnalyzerTab() {
  _lastElements = [];
}