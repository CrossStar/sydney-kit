import { colorToHex, type Color } from '@earendil-works/pi-tui';

/** Resolve at execution time; previously emitted PNGs are immutable. */
export function formulaColor(theme: { colors?: { text?: Color }; appearance?: string }): string {
  if (theme.colors?.text) return colorToHex(theme.colors.text);
  return theme.appearance === 'light' ? '#000000' : '#ffffff';
}
