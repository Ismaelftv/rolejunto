import type pt from './pt';
import type ptX from './extra/pt';
import type ptL from './live/pt';
export type BaseDict = typeof pt;
export type ExtraDict = typeof ptX;
export type LiveDict = typeof ptL;
export type Dict = BaseDict & ExtraDict & LiveDict;
export type Lang = 'pt' | 'es' | 'en' | 'zh';
