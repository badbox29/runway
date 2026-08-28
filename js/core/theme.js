/**
 * Theme control.
 *
 * Scheme and mode are two independent axes written to `data-scheme` and
 * `data-mode` on the root element; CSS does the rest. The choice is stored
 * separately from the board, because a theme is a property of this device and
 * this pair of eyes, not of the data — importing someone else's board should
 * not repaint your screen.
 *
 * Mode defaults to the OS preference and keeps following it until you pick a
 * mode explicitly.
 */
import { SCHEMES, DEFAULT_SCHEME, DEFAULT_MODE, isScheme, isMode } from '../config/schemes.js';

const KEY = 'runway.theme.v1';
const listeners = new Set();

let current = { scheme: DEFAULT_SCHEME, mode: DEFAULT_MODE, followSystem: true };

const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    return {
      scheme: isScheme(saved.scheme) ? saved.scheme : DEFAULT_SCHEME,
      mode: isMode(saved.mode) ? saved.mode : DEFAULT_MODE,
      followSystem: saved.followSystem !== false,
    };
  } catch {
    return null;
  }
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode */ }
}

function apply() {
  const root = document.documentElement;
  root.dataset.scheme = current.scheme;
  root.dataset.mode = current.mode;
  for (const fn of listeners) fn(current);
}

export function initTheme() {
  const saved = read();
  if (saved) current = saved;
  if (current.followSystem && media) current.mode = media.matches ? 'dark' : 'light';
  if (media) {
    const onChange = (e) => {
      if (!current.followSystem) return;
      current.mode = e.matches ? 'dark' : 'light';
      apply();
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else if (media.addListener) media.addListener(onChange);
  }
  apply();
}

export function setScheme(scheme) {
  if (!isScheme(scheme) || scheme === current.scheme) return;
  current.scheme = scheme;
  write();
  apply();
}

export function setMode(mode) {
  if (!isMode(mode)) return;
  current.mode = mode;
  current.followSystem = false;
  write();
  apply();
}

export const toggleMode = () => setMode(current.mode === 'dark' ? 'light' : 'dark');

export const getTheme = () => ({ ...current });
export const isDark = () => current.mode === 'dark';
export const schemeList = () => Object.entries(SCHEMES).map(([id, s]) => ({ id, ...s }));

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Read a live token value — used where SVG needs a real colour, not a var(). */
export function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
