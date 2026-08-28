/**
 * Persistence.
 *
 * Autosave to localStorage on a short debounce, plus explicit JSON export and
 * import so a board can move between machines or into version control. The
 * exported shape is the same one the seed file uses, which makes hand-editing
 * a board in a text editor a supported workflow rather than an accident.
 */
import { state, serialize, load, subscribe } from './store.js';

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

export function restore() {
  try {
    /* A v1 board is still readable: store.load() folds `done` into `status`
       and fills in the sprint fields, so an upgrade never loses a board. */
    const raw = localStorage.getItem(KEY) || localStorage.getItem('runway.board.v1');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.buckets) || !data.buckets.length) return false;
    load(data);  /* store.load() migrates older shapes on the way in */
    return true;
  } catch (err) {
    console.warn('Saved board was unreadable, starting from seed:', err);
    return false;
  }
}

export function clearSaved() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
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
