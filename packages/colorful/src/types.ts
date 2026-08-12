import type { Octane } from 'octane/jsx-runtime';

export interface RgbColor {
	r: number;
	g: number;
	b: number;
}

export interface RgbaColor extends RgbColor {
	a: number;
}

export interface HslColor {
	h: number;
	s: number;
	l: number;
}

export interface HslaColor extends HslColor {
	a: number;
}

export interface HsvColor {
	h: number;
	s: number;
	v: number;
}

export interface HsvaColor extends HsvColor {
	a: number;
}

export type ObjectColor = RgbColor | HslColor | HsvColor | RgbaColor | HslaColor | HsvaColor;
export type AnyColor = string | ObjectColor;

export interface ColorModel<T extends AnyColor> {
	defaultColor: T;
	toHsva: (defaultColor: T) => HsvaColor;
	fromHsva: (hsva: HsvaColor) => T;
	equal: (first: T, second: T) => boolean;
}

type ColorPickerHTMLAttributes = Omit<
	Octane.JSX.IntrinsicElements['div'],
	'color' | 'onChange' | 'onChangeCapture'
>;

export interface ColorPickerBaseProps<T extends AnyColor> extends ColorPickerHTMLAttributes {
	color: T;
	onChange: (newColor: T) => void;
	onChangeEnd?: (newColor: T) => void;
}

// OCTANE DIVERGENCE[react-colorful-native-event-attributes][types:react-colorful-adapted]: residual host handlers use Octane native DOM event attributes instead of React synthetic event types.
// OCTANE DIVERGENCE[react-colorful-native-event-attributes][differential:react-colorful-controlled]: same event-model adaptation observed by the controlled differential against react-colorful@5.8.0.
type ColorInputHTMLAttributes = Omit<Octane.JSX.IntrinsicElements['input'], 'onChange' | 'value'>;

export interface ColorInputBaseProps extends ColorInputHTMLAttributes {
	color?: string;
	onChange?: (newColor: string) => void;
}
