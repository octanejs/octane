/** @jsxImportSource octane */
import type { CSSProperties, JSX, SignalCSSProperties } from 'octane/jsx-runtime';
import type { CSSProperties as DevCSSProperties } from 'octane/jsx-dev-runtime';
import type {
	CSSProperties as StrongCSSProperties,
	JSX as StrongJSX,
} from 'octane/strong/jsx-runtime';
import type { SignalHandle } from 'octane/signals';
import type { CSSProperties as PublicCSSProperties } from 'octane';

const styles = {
	width: 400,
	margin: 0,
	opacity: 0.5,
	lineHeight: 1.5,
	'font-size': 16,
	'line-height': 1.5,
	'background-color': 'rebeccapurple',
	WebkitLineClamp: 2,
	'-webkit-line-clamp': 2,
	transitionDuration: '200ms',
	'transition-duration': '200ms',
} satisfies CSSProperties;

const customOnly = { '--accent': 'red', '--scale': 2 } satisfies SignalCSSProperties;
const publicStyle: PublicCSSProperties = styles;
const dev: DevCSSProperties = styles;
const strong: StrongCSSProperties = styles;
const strongHost: StrongJSX.IntrinsicElements['div'] = { style: styles };
const html = <div style={styles} />;
const svg = (
	<svg style={styles}>
		<circle style={{ 'stroke-width': 2, 'fill-opacity': 0.5 }} />
	</svg>
);
const inline = <div style={{ 'font-size': 16, '--space': '1rem' }} />;
const cssText = <div style="width: 400px" />;
const omitted = <div style={undefined} />;

// @ts-expect-error Unknown keys must not bypass CSS property checks.
const typo = { widht: 400 } satisfies CSSProperties;
// @ts-expect-error Colors do not accept numbers.
const color = { 'background-color': 42 } satisfies CSSProperties;
// @ts-expect-error Durations require time units, including zero.
const duration = { 'transition-duration': 0 } satisfies CSSProperties;
// @ts-expect-error Custom properties accept strings and numbers, not objects.
const custom = { '--theme': {} } satisfies SignalCSSProperties;
// @ts-expect-error Fallback arrays are not supported.
const array = { display: ['flex', 'block'] } satisfies CSSProperties;
// @ts-expect-error HTML styles preserve the property's value type.
const invalidHtml = <div style={{ 'background-color': 42 }} />;
// @ts-expect-error SVG styles preserve the property's value type.
const invalidSvg = <svg style={{ 'fill-opacity': {} }} />;

declare const size$: SignalHandle<number>;
declare const optional$: SignalHandle<string | number | null | undefined>;
declare const object$: SignalHandle<{ invalid: true }>;
const signals = {
	'font-size': size$,
	'--size': optional$,
} satisfies SignalCSSProperties;
const signalHtml = <div style={signals} />;
const signalSvg = <svg style={{ 'stroke-width': size$ }} />;
const signalStrong: StrongJSX.IntrinsicElements['div'] = { style: signals };
declare const whole$: SignalHandle<SignalCSSProperties | null>;
const whole: JSX.IntrinsicElements['div'] = { style: whole$ };
// @ts-expect-error Plain reusable CSS values do not contain signals.
const plainSignal = { 'font-size': size$ } satisfies CSSProperties;
// @ts-expect-error Signals preserve the property's value type.
const invalidSignal = { 'background-color': size$ } satisfies SignalCSSProperties;
// @ts-expect-error Custom property signals cannot contain objects.
const invalidCustomSignal = { '--theme': object$ } satisfies SignalCSSProperties;

// Libraries can expose named style interfaces without a custom-property index signature.
interface PositioningStyles {
	position: 'absolute' | 'fixed';
	top: number;
	left: number;
	transform?: string;
}
declare const positioning: PositioningStyles;
const reusablePositioning: CSSProperties = positioning;
const positionedHtml = <div style={positioning} />;
const positionedSvg = <svg style={positioning} />;
