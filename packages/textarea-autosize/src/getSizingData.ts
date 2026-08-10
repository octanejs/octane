import isBrowser from '#is-browser';
import { pick } from './utils.js';

const SIZING_STYLE = [
	'borderBottomWidth',
	'borderLeftWidth',
	'borderRightWidth',
	'borderTopWidth',
	'boxSizing',
	'fontFamily',
	'fontSize',
	'fontStyle',
	'fontWeight',
	'letterSpacing',
	'lineHeight',
	'paddingBottom',
	'paddingLeft',
	'paddingRight',
	'paddingTop',
	'tabSize',
	'textIndent',
	'textRendering',
	'textTransform',
	'width',
	'wordBreak',
	'wordSpacing',
	'scrollbarGutter',
] as const;
type SizingProp = Extract<(typeof SIZING_STYLE)[number], keyof CSSStyleDeclaration>;
type SizingStyle = Pick<CSSStyleDeclaration, SizingProp>;
export type SizingData = { sizingStyle: SizingStyle; paddingSize: number; borderSize: number };
const isIE = isBrowser ? !!(document.documentElement as any).currentStyle : false;

export default function getSizingData(node: HTMLElement): SizingData | null {
	const style = window.getComputedStyle(node);
	if (style === null) return null;
	const sizingStyle = pick(SIZING_STYLE as readonly SizingProp[], style);
	if (sizingStyle.boxSizing === '') return null;
	if (isIE && sizingStyle.boxSizing === 'border-box') {
		sizingStyle.width = `${parseFloat(sizingStyle.width!) + parseFloat(sizingStyle.borderRightWidth!) + parseFloat(sizingStyle.borderLeftWidth!) + parseFloat(sizingStyle.paddingRight!) + parseFloat(sizingStyle.paddingLeft!)}px`;
	}
	return {
		sizingStyle,
		paddingSize: parseFloat(sizingStyle.paddingBottom!) + parseFloat(sizingStyle.paddingTop!),
		borderSize:
			parseFloat(sizingStyle.borderBottomWidth!) + parseFloat(sizingStyle.borderTopWidth!),
	};
}
