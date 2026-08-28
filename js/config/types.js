/**
 * Connection types.
 *
 * These deliberately occupy a different visual register than buckets:
 * darker, wire-like hues, with dash pattern and terminator carrying as much
 * of the signal as colour does. A pale casing stroke is drawn underneath each
 * line (see ui/edges.js) so a connection stays legible where it crosses a
 * patterned bucket header.
 *
 * `directed` controls whether order matters. An undirected type (either/or,
 * conflicts, do together) draws no arrowhead and reads the same both ways.
 */
export const TYPES = {
  depends: {
    label: 'Depends on',
    note: 'can’t start until the other is done',
    color: '#1B4D8F',
    dash: '',
    width: 2,
    marker: 'arrow',
    directed: true,
  },
  blocks: {
    label: 'Blocks',
    note: 'a hard stop until it clears',
    color: '#A81D28',
    dash: '',
    width: 2.6,
    marker: 'bar',
    directed: true,
  },
  either: {
    label: 'Either / or',
    note: 'pick one, not both',
    color: '#7A3FA8',
    dash: '9 5',
    width: 2,
    marker: 'none',
    directed: false,
  },
  clash: {
    label: 'Conflicts',
    note: 'same slot, can’t do both',
    color: '#C2560E',
    dash: '7 4 2 4',
    width: 2,
    marker: 'none',
    directed: false,
  },
  bundle: {
    label: 'Do together',
    note: 'one trip, one sitting',
    color: '#1F7A5A',
    dash: '',
    width: 3.4,
    marker: 'none',
    directed: false,
  },
  waiting: {
    label: 'Waiting on',
    note: 'needs another person first',
    color: '#5B6B7C',
    dash: '2 5',
    width: 2.2,
    marker: 'arrowOpen',
    directed: true,
  },
  informs: {
    label: 'Informs',
    note: 'changes how you’d do the other',
    color: '#0F6E6E',
    dash: '1 4',
    width: 1.8,
    marker: 'arrowOpen',
    directed: true,
  },
};

export const TYPE_KEYS = Object.keys(TYPES);
export const typeOf = (k) => TYPES[k] || TYPES.depends;
