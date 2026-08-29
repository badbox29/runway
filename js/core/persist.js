/**
 * Persistence.
 *
 * Autosave to localStorage on a short debounce, plus explicit JSON export and
 * import so a board can move between machines or into version control. The
 * exported shape is the same one the seed file uses, which makes hand-editing
 * a board in a text editor a supported workflow rather than an accident.
 */
import { state, serialize, subscribe } from './store.js';

const KEY = 'runway.board.v2';
let timer = null;

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(serialize()));
    return true;
  } catch (err) {
    console.warn('Could not save board:', err);
    return false;
  }
}

/**
 * Read the saved board without applying it.
 *
 * Deliberately does not call load(): whether a saved board should win over the
 * bundled demo is a policy question, and policy lives in main.js. An earlier
 * version decided here, which meant a new data/seed.js had no effect for
 * anyone who had ever opened the app — the saved board silently won forever.
 *
 * @returns {object|null} the parsed board, or null if there isn't a usable one
 */
export function readSaved() {
  try {
    /* A v1 board is still readable: store.load() folds `done` into `status`
       and fills in the sprint fields, so an upgrade never loses a board. */
    const raw = localStorage.getItem(KEY) || localStorage.getItem('runway.board.v1');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.buckets) || !data.buckets.length) return null;
    return data;
  } catch (err) {
    console.warn('Saved board was unreadable, falling back to the demo board:', err);
    return null;
  }
}

export function clearSaved() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem('runway.board.v1');
  } catch { /* nothing to do */ }
}

export function startAutosave(delay = 500) {
  subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(save, delay);
  });
}

export function exportFile() {
  const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `runway-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.buckets)) throw new Error('No buckets in that file.');
        load(data);
        resolve(data);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

export { state };
