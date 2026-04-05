// UI Styles

export const STYLES = `
    #css-injector-backdrop {
      position: fixed;
      inset: 0;
      z-index: 9999;
      pointer-events: none;
    }

    #css-injector-modal {
      pointer-events: all;
    }

    #css-injector-modal {
      position: fixed;
      min-width: 400px;
      min-height: 200px;
      background: #0a1428;
      border: 1px solid #785a28;
      box-shadow: 0 0 0 1px #000, 0 24px 80px rgba(0,0,0,0.85);
      display: flex;
      flex-direction: column;
      overflow: visible; /* Required for the profiles sidecar to be visible */
      font-family: 'LoL Display', 'Beaufort for LOL', serif;
      pointer-events: all;
    }

    .ci-header {
      display: flex;
      align-items: center;
      padding: 14px 18px 10px;
      gap: 10px;
      flex-shrink: 0;
      cursor: move;
      user-select: none;
    }
      
    ::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }

    ::-webkit-scrollbar-track {
      background: rgba(6, 14, 26, 0.6); /* Dark blue track */
      border-left: 1px solid #1a2535;   /* Clean separator line */
    }

    /* Horizontal scrollbar layout */
    ::-webkit-scrollbar-track:horizontal {
      border-left: none;
      border-top: 1px solid #1a2535;
    }

    ::-webkit-scrollbar-thumb {
      background-color: #3a5060; /* Muted idle color */
      /* Floating thumb trick */
      background-clip: padding-box;
      border: 3px solid transparent; 
      border-radius: 6px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background-color: #785a28; /* Hextech Gold */
    }

    ::-webkit-scrollbar-thumb:active {
      background-color: #c8aa6e; /* Bright Gold when clicked */
    }

    ::-webkit-scrollbar-corner {
      background: #060e1a;
    }

    #css-injector-modal::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, #c8aa6e, transparent);
      pointer-events: none;
      z-index: 1;
    }

    /* RESIZE HANDLES */
    .ci-resize-handle {
      position: absolute;
      z-index: 10;
    }
    .ci-rh-n  { top: -3px;    left: 8px;    right: 8px;   height: 6px;  cursor: n-resize;  }
    .ci-rh-s  { bottom: -3px; left: 8px;    right: 8px;   height: 6px;  cursor: s-resize;  }
    .ci-rh-e  { right: -3px;  top: 8px;     bottom: 8px;  width: 6px;   cursor: e-resize;  }
    .ci-rh-w  { left: -3px;   top: 8px;     bottom: 8px;  width: 6px;   cursor: w-resize;  }
    .ci-rh-ne { top: -3px;    right: -3px;  width: 12px;  height: 12px; cursor: ne-resize; }
    .ci-rh-nw { top: -3px;    left: -3px;   width: 12px;  height: 12px; cursor: nw-resize; }
    .ci-rh-se { bottom: -3px; right: -3px;  width: 12px;  height: 12px; cursor: se-resize; }
    .ci-rh-sw { bottom: -3px; left: -3px;   width: 12px;  height: 12px; cursor: sw-resize; }

    .ci-header {
      display: flex;
      align-items: center;
      padding: 14px 18px 10px;
      gap: 10px;
      flex-shrink: 0;
      cursor: move;
      user-select: none;
    }

    .ci-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #c8aa6e;
      flex: 1;
    }

    .ci-hotkey {
      font-size: 10px;
      color: #4a6070;
      letter-spacing: 0.06em;
      background: rgba(255,255,255,0.04);
      border: 1px solid #1e2d3d;
      padding: 2px 7px;
    }

    .ci-minimize {
      background: none;
      border: none;
      color: #4a6070;
      font-size: 15px;
      line-height: 1;
      cursor: pointer;
      padding: 2px 6px;
      transition: color 0.15s;
    }
    .ci-minimize:hover { color: #c8aa6e; }

    .ci-close {
      background: none;
      border: none;
      color: #4a6070;
      font-size: 13px;
      cursor: pointer;
      padding: 2px 6px;
      transition: color 0.15s;
    }
    .ci-close:hover { color: #c84b4b; }

    .ci-tabs {
      display: flex;
      padding: 0 18px;
      border-bottom: 1px solid #1e2d3d;
      flex-shrink: 0;
    }

    .ci-tab {
      background: none;
      border: none;
      font-family: inherit;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #4a6070;
      padding: 8px 16px 10px;
      cursor: pointer;
      position: relative;
      transition: color 0.15s;
    }

    .ci-tab::after {
      content: '';
      position: absolute;
      bottom: -1px; left: 0; right: 0;
      height: 2px;
      background: #c8aa6e;
      transform: scaleX(0);
      transition: transform 0.2s;
    }

    .ci-tab:hover { color: #a0b4c8; }
    .ci-tab-active { color: #f0e6d3 !important; }
    .ci-tab-active::after { transform: scaleX(1); }

    .ci-body {
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    }

    .ci-panel { padding: 16px 18px; }
    .ci-panel--flush { padding: 0; }
    .ci-panel-hidden { display: none !important; }

    /* SEARCH */
    .ci-search {
      width: 100%;
      background: rgba(0,0,0,0.35);
      border: 1px solid #1e2d3d;
      border-bottom-color: #785a28;
      color: #a0b4c8;
      font-family: 'Sora', 'Arial', sans-serif;
      font-size: 11px;
      padding: 7px 10px;
      outline: none;
    }

    .ci-search:focus { border-color: #785a28; color: #f0e6d3; }
    .ci-search::placeholder { color: #2a3a4a; }

    /* COLLAPSIBLE GROUPS */
    .ci-group {
      margin-bottom: 4px;
      border: 1px solid #1a2535;
    }

    .ci-group-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      cursor: pointer;
      background: #060e1a;
      user-select: none;
      transition: background 0.15s;
    }

    .ci-group-header:hover { background: #091220; }

    .ci-group[data-generic="true"] .ci-group-header {
      background: #0a1628;
      border-left: 2px solid #c8aa6e;
    }

    .ci-group-icon {
      font-size: 9px;
      color: #785a28;
      transition: transform 0.2s;
      flex-shrink: 0;
    }

    .ci-group-open > .ci-group-header .ci-group-icon {
      transform: rotate(90deg);
    }

    .ci-group-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: #7a8a9a;
      flex: 1;
      transition: color 0.15s;
    }

    .ci-group-open > .ci-group-header .ci-group-label { color: #c8aa6e; }
    .ci-group[data-generic="true"] .ci-group-label { color: #c8aa6e; }

    .ci-group-count {
      font-size: 9px;
      color: #2a3a4a;
      background: rgba(0,0,0,0.3);
      border: 1px solid #1a2535;
      padding: 1px 6px;
      border-radius: 8px;
    }

    .ci-group-body {
      display: none;
      background: #050c18;
      border-top: 1px solid #1a2535;
    }

    .ci-group-open > .ci-group-body { display: block; }

    /* GENERIC TOOL ROWS */
    .ci-generic-row {
      padding: 14px 14px 10px;
      border-bottom: 1px solid #0e1c2e;
    }

    .ci-generic-row:last-child { border-bottom: none; }

    .ci-generic-title {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #c8aa6e;
      margin-bottom: 3px;
    }

    .ci-generic-desc {
      font-size: 10px;
      color: #3a5060;
      margin-bottom: 10px;
      line-height: 1.5;
    }

    .ci-inline-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }

    .ci-field { display: flex; flex-direction: column; }

    /* CATALOG ELEMENT ROWS */
    .ci-element-row {
      padding: 8px 14px;
      border-bottom: 1px solid #0a1520;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .ci-element-row:last-child { border-bottom: none; }
    .ci-element-row:hover { background: rgba(200,170,110,0.02); }

    .ci-element-info {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .ci-element-label {
      font-size: 11px;
      color: #8a9aaa;
      flex: 1;
    }

    .ci-element-cls {
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 9px;
      color: #2a4a5a;
      background: rgba(0,0,0,0.3);
      padding: 1px 5px;
      border: 1px solid #0e1c2e;
      flex-shrink: 0;
    }

    .ci-element-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: flex-start;
    }

    /* PROPERTY CONTROLS */
    .ci-prop-wrap {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .ci-prop-label {
      font-size: 8px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #2a4050;
    }

    .ci-prop-inner {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .ci-prop-input {
      padding: 4px 6px !important;
      font-size: 10px !important;
    }

    .ci-prop-select {
      padding: 4px 22px 4px 6px !important;
      font-size: 10px !important;
      width: auto !important;
    }

    .ci-btn-prop {
      background: transparent;
      border: 1px solid #785a28;
      color: #785a28;
      font-size: 11px;
      padding: 3px 7px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      flex-shrink: 0;
      line-height: 1;
    }

    .ci-btn-prop:hover { background: #785a28; color: #f0e6d3; }

    .ci-color-pair {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* SHARED FORM ELEMENTS */
    .ci-label {
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #4a6070;
      margin-bottom: 3px;
    }

    .ci-input, .ci-select {
      width: 100%;
      background: rgba(0,0,0,0.35);
      border: 1px solid #1e2d3d;
      color: #a0b4c8;
      font-family: 'Sora', 'Arial', sans-serif;
      font-size: 11px;
      padding: 6px 9px;
      outline: none;
      transition: border-color 0.15s, color 0.15s;
    }

    .ci-input:focus, .ci-select:focus {
      border-color: #785a28;
      color: #f0e6d3;
    }

    .ci-select {
      appearance: none;
      cursor: pointer;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23785a28'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 9px center;
      background-color: rgba(0,0,0,0.35);
      padding-right: 26px;
    }

    option { background: #091220; }

    .ci-color-input {
      width: 32px;
      height: 28px;
      padding: 2px 3px;
      background: rgba(0,0,0,0.35);
      border: 1px solid #1e2d3d;
      cursor: pointer;
      flex-shrink: 0;
    }

    .ci-btn-add {
      margin-top: 8px;
      padding: 6px 13px;
      font-family: inherit;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: transparent;
      border: 1px solid #785a28;
      color: #c8aa6e;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }

    .ci-btn-add:hover { background: #785a28; color: #f0e6d3; }

    .ci-flash {
      display: inline-block;
      font-size: 10px;
      color: #4caf82;
      margin-left: 8px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .ci-flash.show { opacity: 1; }

    /* RAW TAB */
    .ci-raw-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .ci-raw-label {
      font-size: 10px;
      color: #4a6070;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .ci-line-count {
      font-size: 10px;
      color: #4a6070;
    }

    .ci-textarea {
      width: 100%;
      height: 260px;
      resize: vertical;
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 11px;
      line-height: 1.6;
      padding: 10px 12px;
      color: #a8c8a0;
      background: rgba(0,0,0,0.45);
      border: 1px solid #1e2d3d;
      outline: none;
      transition: border-color 0.15s;
    }

    .ci-textarea:focus { border-color: #785a28; }

    .ci-raw-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      align-items: center;
    }

    .ci-btn-primary {
      padding: 8px 20px;
      font-family: inherit;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: linear-gradient(180deg, #785a28 0%, #5a4020 100%);
      border: 1px solid #c8aa6e;
      color: #f0e6d3;
      cursor: pointer;
      transition: opacity 0.15s, box-shadow 0.15s;
    }

    .ci-btn-primary:hover {
      opacity: 0.85;
      box-shadow: 0 0 12px rgba(200,170,110,0.3);
    }

    .ci-btn-secondary {
      padding: 8px 14px;
      font-family: inherit;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: transparent;
      border: 1px solid #1e2d3d;
      color: #4a6070;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }

    .ci-btn-secondary:hover { border-color: #4a6070; color: #a0b4c8; }

    .ci-btn-danger {
      padding: 8px 14px;
      font-family: inherit;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: transparent;
      border: 1px solid #5a2828;
      color: #c84b4b;
      cursor: pointer;
      transition: background 0.15s;
    }

    .ci-btn-danger:hover { background: rgba(200,75,75,0.1); }

    .ci-note {
      margin-top: 12px;
      padding: 9px 11px;
      background: rgba(200,170,110,0.04);
      border: 1px solid #1a2535;
      font-size: 10px;
      color: #4a6070;
      line-height: 1.6;
      font-family: 'Sora', 'Arial', sans-serif;
    }

    .ci-note span { color: #785a28; }

    /* TAB SIZE CONTROLS */
    .ci-tab-size-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
      border: 1px solid #1e2d3d;
      padding: 2px 6px;
    }

    .ci-tab-size-wrap #ci-tabsize-val {
      font-size: 10px;
      color: #c8aa6e;
      min-width: 8px;
      text-align: center;
      font-family: 'Fira Code', monospace;
    }

    .ci-tab-size-btn {
      background: none;
      border: none;
      color: #785a28;
      font-size: 13px;
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
      transition: color 0.15s;
    }

    .ci-tab-size-btn:hover { color: #c8aa6e; }

    .ci-format-btn {
      padding: 4px 10px !important;
      font-size: 10px !important;
    }

    /* AUTOCOMPLETE DROPDOWN */
    .ci-ac-dropdown {
      position: absolute;
      z-index: 99999;
      background: #060e1a;
      border: 1px solid #785a28;
      border-top: none;
      max-height: 180px;
      overflow-y: auto;
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 11px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.7);
    }

    .ci-ac-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 10px;
      cursor: pointer;
      color: #a0b4c8;
      border-bottom: 1px solid #0a1628;
      transition: background 0.1s;
    }

    .ci-ac-item:last-child { border-bottom: none; }

    .ci-ac-item:hover,
    .ci-ac-item.active {
      background: #0d1e35;
      color: #f0e6d3;
    }

    .ci-ac-match { color: #c8aa6e; }

    .ci-ac-badge {
      font-size: 8px;
      color: #2a3a4a;
      background: rgba(0,0,0,0.4);
      border: 1px solid #1a2535;
      padding: 1px 5px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      flex-shrink: 0;
      margin-left: 8px;
      font-family: 'Sora', sans-serif;
    }

    /* SCROLL BUTTONS */
    .ci-scroll-btns {
      position: absolute;
      right: 6px;
      top: 6px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      pointer-events: none;
    }

    /* Sticky scroll buttons */
    .ci-scroll-btns.ci-scroll-btns--sticky {
      position: sticky;
      bottom: 12px;
      top: auto;
      float: right;
      margin-right: -18px;
      z-index: 10;
    }

    .ci-scroll-btn {
      width: 22px;
      height: 22px;
      background: rgba(6,14,26,0.85);
      border: 1px solid #785a28;
      color: #785a28;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: all;
      transition: background 0.15s, color 0.15s;
    }

    .ci-scroll-btn:hover {
      background: #785a28;
      color: #f0e6d3;
    }

    /* COLLAPSIBLE GROUPS */
    .ci-group {
      margin-bottom: 6px;
      border: 1px solid #1e2d3d;
      overflow: hidden;
    }

    .ci-group-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      background: #091220;
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }

    .ci-group-header:hover { background: #0d1a30; }

    .ci-group-icon { font-size: 13px; flex-shrink: 0; }

    .ci-group-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #c8aa6e;
      flex: 1;
    }

    .ci-group-arrow {
      font-size: 11px;
      color: #785a28;
      transition: transform 0.2s;
      flex-shrink: 0;
    }

    .ci-group-collapsed .ci-group-arrow { transform: rotate(-90deg); }
    .ci-group-collapsed .ci-group-body  { display: none; }

    .ci-group-body {
      border-top: 1px solid #1e2d3d;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* CATALOG ITEMS */
    .ci-item {
      background: rgba(0,0,0,0.2);
      border: 1px solid #151f2e;
      padding: 10px 12px;
      position: relative;
    }

    .ci-item::before {
      content: '';
      position: absolute;
      left: 0; top: 3px; bottom: 3px;
      width: 2px;
      background: #2a3a50;
    }

    .ci-item-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 3px;
      flex-wrap: wrap;
    }

    .ci-item-label {
      font-size: 11px;
      font-weight: 600;
      color: #a0b4c8;
      letter-spacing: 0.02em;
    }

    .ci-item-sel {
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 9px;
      color: #4a6070;
      background: rgba(0,0,0,0.3);
      padding: 1px 5px;
      border: 1px solid #151f2e;
    }

    .ci-item-desc {
      font-size: 10px;
      color: #364a5a;
      margin-bottom: 8px;
      line-height: 1.4;
      font-family: 'Sora', 'Arial', sans-serif;
    }

    .ci-item-controls {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px;
      margin-bottom: 8px;
    }

    .ci-ctrl-wrap { display: flex; flex-direction: column; gap: 3px; }

    .ci-item-footer { display: flex; align-items: center; gap: 0; }

    /* RANGE SLIDER */
    .ci-slider {
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: #1e2d3d;
      outline: none;
      cursor: pointer;
    }

    .ci-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      background: #785a28;
      cursor: pointer;
      border: 1px solid #c8aa6e;
    }

    .ci-slider-val {
      font-size: 10px;
      color: #c8aa6e;
      min-width: 32px;
      text-align: right;
      font-family: 'Fira Code', monospace;
    }

    /* GENERIC TOOLS */
    .ci-generic-tools { display: flex; flex-direction: column; gap: 0; }

    .ci-generic-section {
      padding: 12px 0;
      border-bottom: 1px solid #151f2e;
    }

    .ci-generic-section:last-child { border-bottom: none; padding-bottom: 0; }
    .ci-generic-section:first-child { padding-top: 0; }

    .ci-generic-title {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #a0b4c8;
      margin-bottom: 3px;
    }

    .ci-generic-desc {
      font-size: 10px;
      color: #364a5a;
      margin-bottom: 8px;
      line-height: 1.4;
      font-family: 'Sora', 'Arial', sans-serif;
    }

    /* ANALYZER TAB */
    .ci-az-header {
      background: #060e1a;
      border: 1px solid #1a2535;
      padding: 12px 14px;
      margin-bottom: 10px;
    }

    .ci-az-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .ci-az-subtabs {
      display: flex;
      border-bottom: 1px solid #1a2535;
      margin-bottom: 10px;
      flex-shrink: 0;
    }

    .ci-az-subtab {
      background: none;
      border: none;
      font-family: inherit;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #4a6070;
      padding: 6px 14px 8px;
      cursor: pointer;
      position: relative;
      transition: color 0.15s;
    }

    .ci-az-subtab::after {
      content: '';
      position: absolute;
      bottom: -1px; left: 0; right: 0;
      height: 2px;
      background: #785a28;
      transform: scaleX(0);
      transition: transform 0.2s;
    }

    .ci-az-subtab:hover { color: #a0b4c8; }
    .ci-az-subtab-active { color: #c8aa6e !important; }
    .ci-az-subtab-active::after { transform: scaleX(1); }

    .az-view { min-height: 200px; }

    .ci-az-pre {
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 10px;
      color: #a0b4c8;
      line-height: 1.7;
      white-space: pre;
      overflow-x: auto;
      margin: 0;
      padding: 4px 0;
    }

    .ci-az-textarea {
      height: 380px;
      font-size: 10px;
      color: #8aaa80;
      resize: vertical;
    }

    .ci-az-element {
      border: 1px solid #1a2535;
      margin-bottom: 6px;
      background: #060e1a;
    }

    .ci-az-element-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      border-bottom: 1px solid #1a2535;
      background: rgba(0,0,0,0.2);
    }

    .ci-az-selector {
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 10px;
      color: #c8aa6e;
      flex: 1;
      word-break: break-all;
    }

    .ci-az-prop-count {
      font-size: 9px;
      color: #2a3a4a;
      background: rgba(0,0,0,0.3);
      border: 1px solid #1a2535;
      padding: 1px 6px;
      flex-shrink: 0;
    }

    .ci-az-copy-el {
      background: transparent;
      border: 1px solid #1a2535;
      color: #4a6070;
      font-size: 9px;
      padding: 2px 7px;
      cursor: pointer;
      font-family: inherit;
      letter-spacing: 0.05em;
      flex-shrink: 0;
      transition: border-color 0.15s, color 0.15s;
    }

    .ci-az-copy-el:hover { border-color: #785a28; color: #c8aa6e; }

    .ci-az-element-body {
      padding: 6px 10px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .ci-az-prop-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 10px;
      padding: 1px 0;
      border-bottom: 1px solid rgba(26,37,53,0.5);
    }

    .ci-az-prop-row:last-child { border-bottom: none; }

    .ci-az-prop-name {
      font-family: 'Fira Code', 'Consolas', monospace;
      color: #6a8aaa;
      flex-shrink: 0;
      min-width: 180px;
    }

    .ci-az-prop-val {
      font-family: 'Fira Code', 'Consolas', monospace;
      color: #a8c8a0;
      word-break: break-all;
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
    }

    .ci-az-send-btn {
      background: transparent;
      border: 1px solid #785a28;
      color: #785a28;
      font-size: 9px;
      padding: 2px 7px;
      cursor: pointer;
      font-family: inherit;
      letter-spacing: 0.05em;
      flex-shrink: 0;
      transition: background 0.15s, color 0.15s;
    }

    .ci-az-send-btn:hover { background: #785a28; color: #f0e6d3; }

    .ci-az-send-prop-btn {
      background: transparent;
      border: 1px solid #1a2535;
      color: #2a3a4a;
      font-size: 9px;
      width: 18px;
      height: 18px;
      cursor: pointer;
      flex-shrink: 0;
      margin-left: auto;
      display: none;
      align-items: center;
      justify-content: center;
      transition: border-color 0.15s, color 0.15s, background 0.15s;
    }

    .ci-az-prop-row:hover .ci-az-send-prop-btn {
      display: flex;
    }

    .ci-az-send-prop-btn:hover {
      border-color: #785a28;
      color: #c8aa6e;
      background: rgba(120,90,40,0.15);
    }

    /* SEARCH & FILTER MENU */
    .ci-search-wrap {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: stretch;
      height: 36px;
    }
    .ci-search { 
      width: 100%;
      height: 36px;
      box-sizing: border-box !important;
      background: rgba(0,0,0,0.45) !important;
      padding: 0 36px 0 12px !important;
      font-size: 12px !important;
      border: 1px solid #1e2d3d !important;
      border-bottom: 2px solid #785a28 !important;
      color: #a0b4c8 !important;
      outline: none !important;
      line-height: 36px !important;
    }
    .ci-search:focus { border-color: #785a28 !important; color: #f0e6d3 !important; }
    .ci-search::placeholder { color: #2a3a4a !important; }

    .ci-filter-btn {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 34px;
      background: none !important;
      border: none !important;
      border-left: 1px solid #1e2d3d !important;
      color: #c8aa6e !important; 
      font-size: 14px;
      cursor: pointer;
      outline: none;
      transition: background 0.15s, color 0.15s;
      z-index: 10;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      line-height: 1;
      padding: 0 !important;
    }
    .ci-filter-btn:hover {
      background: rgba(120,90,40,0.2) !important;
      color: #c8aa6e !important;
    }

    .ci-search-btn {
      flex-shrink: 0;
      height: 36px;
      box-sizing: border-box !important;
      align-self: center !important;
      background: linear-gradient(180deg, #785a28 0%, #5a4020 100%) !important;
      border: 1px solid #c8aa6e !important;
      color: #f0e6d3 !important; 
      font-size: 11px !important;
      font-weight: 700 !important;
      padding: 0 16px !important;
      cursor: pointer;
      text-transform: uppercase !important;
      letter-spacing: 0.08em !important;
      transition: all 0.2s !important;
      white-space: nowrap !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-family: inherit !important;
    }
    .ci-search-btn:hover { box-shadow: 0 0 12px rgba(200, 170, 110, 0.35) !important; filter: brightness(1.1); }

    .ci-tag-container { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; align-items: center; min-height: 24px; }
    .ci-tag {
      display: flex; align-items: center; gap: 8px; background: rgba(30,35,40,0.6) !important;
      border: 1px dashed rgba(200, 170, 110, 0.4) !important; color: #a0b4c8 !important; 
      font-size: 11px !important; font-style: italic !important;
      padding: 4px 12px !important; border-radius: 4px !important; 
      transition: all 0.2s; cursor: default;
    }
    .ci-tag:hover { border-style: solid !important; border-color: #c8aa6e !important; color: #f0e6d3 !important; }
    .ci-tag-plus { color: #785a28 !important; font-weight: bold !important; font-style: normal !important; font-size: 14px; }
    .ci-tag-remove { 
      cursor: pointer; color: #4a6070 !important; font-weight: normal !important; 
      font-size: 14px !important; line-height: 1; margin-left: 4px; font-style: normal !important;
    }
    .ci-tag-remove:hover { color: #c84b4b !important; }

    /* HEXTECH SUGGESTION MENU */
    .ci-suggestion-box {
      position: absolute; z-index: 10000; background: #010a13 !important; border: 1px solid #785a28 !important;
      box-shadow: 0 10px 50px rgba(0,0,0,0.95) !important; width: 100%; top: 100%; left: 0;
      display: none; max-height: 400px; overflow-y: auto; overflow-x: hidden;
    }
    .ci-suggestion-header {
      padding: 12px 16px 6px 16px; font-size: 10px; font-weight: bold; color: #785a28;
      text-transform: uppercase; letter-spacing: 0.15em; background: rgba(0,0,0,0.4);
      border-bottom: 1px solid rgba(120, 90, 40, 0.2);
    }
    .ci-suggestion-item {
      padding: 12px 16px; cursor: pointer; font-size: 13px; color: #f0e6d3 !important;
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 1px solid rgba(120, 90, 40, 0.15); transition: all 0.15s; 
      background: none !important;
    }
    .ci-suggestion-item:hover {
      background: rgba(200, 170, 110, 0.15) !important; border-left: 5px solid #c8aa6e; padding-left: 11px;
    }
    .ci-suggestion-type {
      font-size: 9px; color: #c8aa6e; font-weight: bold; background: rgba(0,0,0,0.7);
      padding: 2px 8px; border-radius: 2px; border: 1px solid rgba(200, 170, 110, 0.4);
      text-transform: uppercase;
    }

    /* PREMIUM RADIO-STYLE TOGGLE SWITCH (GOLD VISIBILITY FIX) */
    .ci-switch-label { 
      display: flex; align-items: center; gap: 10px; font-size: 11px; 
      color: #f0e6d3 !important; cursor: pointer; user-select: none; margin-right: 12px; 
    }
    .ci-switch {
      position: relative; display: inline-block; width: 34px; height: 18px;
      background: #010a13; border: 1px solid #3c3c3c; border-radius: 9px;
      transition: all 0.2s;
    }
    .ci-switch::after {
      content: ''; position: absolute; left: 2px; top: 2px; width: 12px; height: 12px;
      background: #3c3c3c; border-radius: 50%; transition: all 0.2s;
    }
    .ci-switch.active { border-color: #785a28; background: rgba(120, 90, 40, 0.2); }
    .ci-switch.active::after { left: 18px; background: #c8aa6e; box-shadow: 0 0 8px #785a28; }

    /* SEARCH CLOSE BUTTON */
    .ci-search-close {
      cursor: pointer; color: #c84b4b !important; font-size: 16px !important;
      font-weight: bold; padding: 0 10px; transition: color 0.15s;
    }
    .ci-search-close:hover { color: #f0e6d3 !important; }

    /* PREMIUM RADIO-STYLE TOGGLE SWITCH (GOLD VISIBILITY FIX) */
    .ci-switch-label { 
      display: flex; align-items: center; gap: 10px; font-size: 11px; 
      color: #f0e6d3 !important; cursor: pointer; user-select: none; margin-right: 12px; 
    }
    .ci-switch {
      position: relative; display: inline-block; width: 34px; height: 18px;
      background: #010a13; border: 1px solid #3c3c3c; border-radius: 9px;
      transition: all 0.2s;
    }
    .ci-switch::after {
      content: ''; position: absolute; left: 2px; top: 2px; width: 12px; height: 12px;
      background: #3c3c3c; border-radius: 50%; transition: all 0.2s;
    }
    .ci-switch.active { border-color: #785a28; background: rgba(120, 90, 40, 0.2); }
    .ci-switch.active::after { left: 18px; background: #c8aa6e; box-shadow: 0 0 8px #785a28; }
    /* PROFILES PANEL */
    .ci-profiles-panel-float {
      position: absolute;
      left: 100%;
      top: -1px;
      width: 280px;
      height: calc(100% + 2px);
      margin-left: 10px;
      background: #0a1428;
      border: 1px solid #785a28;
      box-shadow: 0 0 30px rgba(0,0,0,0.9);
      display: none;
      flex-direction: column;
      z-index: 1000000;
      animation: ci-side-slide 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: hidden;
      border-radius: 2px;
      font-family: 'LoL Display', 'Beaufort for LOL', serif;
    }

    @keyframes ci-side-slide {
      from { opacity: 0; transform: translateX(-20px); }
      to   { opacity: 1; transform: translateX(0); }
    }

    .ci-pp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      background: #0a1428;
      border-bottom: 2px solid #785a28;
    }

    .ci-pp-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #c8aa6e;
    }

    .ci-pp-close {
      background: none;
      border: none;
      color: #4a6070;
      font-size: 16px;
      cursor: pointer;
      line-height: 1;
    }
    .ci-pp-close:hover { color: #f0e6d3; }

    .ci-pp-list {
      flex: 1;
      overflow-y: auto;
      background: rgba(0,0,0,0.15);
      padding: 8px 0;
    }

    .ci-pp-row {
      padding: 10px 18px;
      border-bottom: 1px solid rgba(120,90,40,0.1);
      transition: all 0.2s;
    }
    .ci-pp-row:hover { background: rgba(200, 170, 110, 0.03); }
    .ci-pp-row--active { background: rgba(200, 170, 110, 0.05); }

    .ci-pp-row-main {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .ci-pp-indicator {
      width: 10px;
      font-size: 10px;
      color: #c8aa6e;
      flex-shrink: 0;
      text-shadow: 0 0 8px rgba(200, 170, 110, 0.6);
    }

    .ci-pp-name {
      background: transparent;
      border: 1px solid transparent;
      color: #a0b4c8;
      font-family: 'Sora', 'Arial', sans-serif;
      font-size: 12px;
      font-weight: 600;
      padding: 2px 6px;
      outline: none;
      flex: 1;
      min-width: 0;
      transition: all 0.15s;
    }
    .ci-pp-name:focus { border-color: #785a28; background: rgba(0,0,0,0.3); color: #f0e6d3; }
    .ci-pp-row--active .ci-pp-name { color: #f0e6d3; }

    .ci-pp-meta {
      font-size: 9px;
      color: #4a6070;
      background: rgba(0,0,0,0.4);
      border: 1px solid #1a2535;
      padding: 2px 6px;
      font-family: 'Fira Code', monospace;
    }

    .ci-pp-row-actions {
      display: flex;
      gap: 8px;
      padding-left: 20px;
    }

    .ci-pp-btn {
      background: rgba(0,0,0,0.2);
      border: 1px solid #1a2535;
      color: #3a5060;
      font-size: 10px;
      padding: 4px 10px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .ci-pp-btn:hover { border-color: #785a28; color: #c8aa6e; background: rgba(120,90,40,0.1); }
    .ci-pp-btn--activate { border-color: #785a28; color: #785a28; font-weight: bold; }
    .ci-pp-btn--activate:hover { color: #c8aa6e; border-color: #c8aa6e; }
    .ci-pp-btn--delete:hover { border-color: #c84b4b; color: #c84b4b; background: rgba(200,75,75,0.1); }

    .ci-pp-footer {
      display: flex;
      gap: 12px;
      padding: 14px 18px;
      background: #0a1428;
      border-top: 1px solid #785a28;
    }

    .ci-pp-action-btn {
      flex: 1;
      background: rgba(120, 90, 40, 0.05);
      border: 1px solid #785a28;
      color: #c8aa6e;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .ci-pp-action-btn:hover { background: #785a28; color: #f0e6d3; }

    /* CUSTOM CONFIRM OVERLAY */
    .ci-confirm-overlay {
      position: absolute;
      inset: 0;
      background: rgba(1, 10, 19, 0.85);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000001;
      animation: ci-fade-in 0.2s ease-out;
    }
    .ci-confirm-overlay.fade-out { opacity: 0; transition: opacity 0.2s; }

    .ci-confirm-box {
      background: #0a1428;
      border: 1px solid #785a28;
      padding: 24px;
      width: 85%;
      box-shadow: 0 0 20px rgba(0,0,0,0.5);
      text-align: center;
      border-radius: 4px;
      animation: ci-zoom-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes ci-zoom-in {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }

    .ci-confirm-msg {
      font-size: 13px;
      color: #f0e6d3;
      margin-bottom: 24px;
      line-height: 1.5;
      font-weight: 600;
    }

    .ci-confirm-actions {
      display: flex;
      gap: 12px;
    }

    .ci-confirm-btn {
      flex: 1;
      padding: 8px;
      background: rgba(0,0,0,0.3);
      border: 1px solid #1a2535;
      color: #c8aa6e;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
    }
    .ci-confirm-btn--yes { border-color: #c84b4b; color: #c84b4b; }
    .ci-confirm-btn--yes:hover { background: rgba(200,75,75,0.15); border-color: #ff5e5e; color: #ff5e5e; }
    .ci-confirm-btn--no:hover { border-color: #c8aa6e; background: rgba(200,170,110,0.1); }

    /* TEXTAREA SCROLL FIX */
    .ci-textarea {
      white-space: pre;
      overflow: auto;
      scrollbar-gutter: stable;
    }
  `;

