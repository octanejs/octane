import memoize from './memoize';

type TextStyle = {
	fontSize?: string | number;
	fontWeight?: string | number;
};

function characterWidth(character: string): number {
	if (/\s/.test(character)) return 0.33;
	if (/[ilI1|!.,'`:;]/.test(character)) return 0.29;
	if (/[mwMW@#%&]/.test(character)) return 0.9;
	if (/[^\u0000-\u00ff]/.test(character)) return 1;
	if (/[A-Z0-9]/.test(character)) return 0.62;
	return 0.56;
}

/**
 * Deterministic font-metric approximation shared by SSR and the first client
 * render. Browser SVG measurement during render produces different wrapping
 * before hydration; post-adoption measurement belongs in explicit refs/hooks.
 */
function getStringWidth(str: string, style: object = {}): number | null {
	const textStyle = style as TextStyle;
	const parsedFontSize =
		typeof textStyle.fontSize === 'number'
			? textStyle.fontSize
			: Number.parseFloat(textStyle.fontSize ?? '16');
	const fontSize = Number.isFinite(parsedFontSize) ? parsedFontSize : 16;
	const numericWeight = Number.parseFloat(String(textStyle.fontWeight ?? 400));
	const weightFactor = Number.isFinite(numericWeight) && numericWeight >= 600 ? 1.04 : 1;
	return (
		[...str].reduce((width, character) => width + characterWidth(character), 0) *
		fontSize *
		weightFactor
	);
}

export default memoize(getStringWidth, (str, style) => `${str}_${JSON.stringify(style)}`);
