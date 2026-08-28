/**
 * Colour schemes.
 *
 * A scheme themes the *paper* — ground, surface, ink, lines. It deliberately
 * does not touch bucket colours or connection colours, because those are
 * identity: a bucket is magenta because you made it magenta, and it should not
 * change meaning when you dim the lights. Dark mode instead lifts those stored
 * hues at render time (see util/patterns.js), which keeps the saved board
 * portable between modes and between schemes.
 *
 * Token values live in css/tokens.css. This file is the registry the UI reads
 * to build the picker, so adding a scheme means adding one entry here and one
 * selector block there.
 */
export const SCHEMES = {
  paper: {
    label: 'Paper',
    note: 'cool slate, quiet and printerly',
  },
  clay: {
    label: 'Clay',
    note: 'warm stone, low contrast for long sessions',
  },
  signal: {
    label: 'Signal',
    note: 'high contrast for a dense board',
  },
};

export const MODES = { light: 'Light', dark: 'Dark' };

export const DEFAULT_SCHEME = 'paper';
export const DEFAULT_MODE = 'light';

export const isScheme = (v) => Object.prototype.hasOwnProperty.call(SCHEMES, v);
export const isMode = (v) => v === 'light' || v === 'dark';
