/** The connection key. Reads the same type table the renderer draws from. */
import { TYPES } from '../config/types.js';
import { el, $, clear } from '../util/dom.js';

export function renderLegend() {
  const root = $('#legend');
  clear(root);
  root.appendChild(el('h2', { text: 'Connections' }));
  for (const t of Object.values(TYPES)) {
    root.appendChild(el('div', { class: 'li' }, [
      el('span', {
        class: 'swatchline',
        style: `border-top-color:${t.color};border-top-style:${t.dash ? 'dashed' : 'solid'};border-top-width:${Math.min(t.width, 3)}px`,
      }),
      el('span', {}, [
        el('span', { class: 't', text: t.label }),
        document.createTextNode(' '),
        el('span', { class: 'd', text: t.note }),
      ]),
    ]));
  }
}
