export const imageTokens = (text: string) => text.matchAll(/\[图片 \d+(?: · \d+×\d+)?\]/g);
export const placeholder = (serial: number) => `[图片 ${serial}]`;
/** Pending images are keyed by the unsized placeholder; sent messages carry the size suffix. */
export const tokenKey = (token: string) => token.replace(/ · \d+×\d+(?=\])/g, '');
export const withSize = (token: string, width: number, height: number) => token.replace(/(?: · \d+×\d+)?\]$/, ` · ${width}×${height}]`);
