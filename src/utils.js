//Shared UI helpers used across builder, settings, analyzer, raw

// FLASH MESSAGE 
// Pass either an element ID string or the flash element itself.
export function flashMessage(target, msg = 'Added ✓', duration = 1800) {
  const el = typeof target === 'string'
    ? document.getElementById(target)
    : target;
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// CLIPBOARD 
// Safe clipboard copy with CEF fallback (navigator.clipboard may not be available)
export function copyText(text) {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// SECTION BUILDER 
// Used in settings tab — creates a titled card container
export function makeSection(title, desc) {
  const sec = document.createElement('div');
  sec.style.cssText = 'background:#060e1a;border:1px solid #1a2535;padding:14px 16px;';

  const t = document.createElement('div');
  t.style.cssText = 'font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#c8aa6e;' + (desc ? 'margin-bottom:4px;' : '');
  t.textContent = title;
  sec.appendChild(t);

  if (desc) {
    const d = document.createElement('div');
    d.style.cssText = 'font-size:10px;color:#3a5060;line-height:1.5;';
    d.textContent = desc;
    sec.appendChild(d);
  }

  return sec;
}

// TOGGLE SWITCH 
// Returns a styled on/off toggle element. onChange(bool) fires on click.
export function makeToggle(initial, onChange) {
  const track = document.createElement('div');
  const thumb = document.createElement('div');
  track.appendChild(thumb);
  let on = initial;

  const render = () => {
    track.style.cssText = 'width:36px;height:18px;border-radius:9px;cursor:pointer;position:relative;flex-shrink:0;transition:background 0.2s,border-color 0.2s;'
      + 'background:' + (on ? '#785a28' : '#1a2535') + ';'
      + 'border:1px solid ' + (on ? '#c8aa6e' : '#2a3a4a') + ';';
    thumb.style.cssText = 'position:absolute;top:2px;width:12px;height:12px;border-radius:50%;transition:left 0.2s,background 0.2s;'
      + 'left:' + (on ? '18px' : '2px') + ';'
      + 'background:' + (on ? '#c8aa6e' : '#4a6070') + ';';
  };

  render();
  track.addEventListener('click', () => { on = !on; render(); onChange(on); });
  return track;
}

// COLOR UTILS 
export function rgbToHex(rgb) {
  if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '';
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '';
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

// HTML ESCAPE 
export function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
