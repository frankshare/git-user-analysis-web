/** 汉字范围（CJK 统一表意文字基本区） */
const CJK = '\u4e00-\u9fa5';

/** 是否包含中文 */
export const hasCjk = (s: string): boolean => new RegExp('[' + CJK + ']').test(s || '');

/** 数字兜底：JSON 里的 star 有时是字符串 */
export const toNum = (v: unknown): number =>
  typeof v === 'number' ? v : parseInt(String(v ?? 0), 10) || 0;
