// Ported from react-hot-toast@2.6.1 src/components/toast-bar.tsx
// (https://github.com/timolins/react-hot-toast/tree/v2.6.1).
//
// Octane adaptations: memo and the style types come from octane, goober's
// styled('div') becomes styledDiv, templates carry the published build's
// collapsed whitespace (see styled.tsrx), and the render-prop branch is an @if
// block.
import { keyframes } from '../goober.js';
import { type CSSProperties, type FC, memo } from 'octane';
import { type Renderable, type Toast, type ToastPosition, resolveValue } from '../core/types';
import { prefersReducedMotion } from '../core/utils';
import { styledDiv } from './styled.tsrx';
import { ToastIcon } from './toast-icon.tsrx';

const enterAnimation = (factor: number) =>
	` 0% {transform: translate3d(0,${factor * -200}%,0) scale(.6); opacity:.5;} 100% {transform: translate3d(0,0,0) scale(1); opacity:1;} `;

const exitAnimation = (factor: number) =>
	` 0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;} 100% {transform: translate3d(0,${factor * -150}%,-1px) scale(.6); opacity:0;} `;

const fadeInAnimation = `0%{opacity:0;} 100%{opacity:1;}`;
const fadeOutAnimation = `0%{opacity:1;} 100%{opacity:0;}`;

// Use :where() for zero specificity - allows Tailwind to override easily
const ToastBarBase = styledDiv` :where(&) { display: flex; align-items: center; background: #fff; color: #363636; line-height: 1.3; will-change: transform; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1), 0 3px 3px rgba(0, 0, 0, 0.05); max-width: 350px; pointer-events: auto; padding: 8px 10px; border-radius: 8px; } `;

const Message = styledDiv` display: flex; justify-content: center; margin: 4px 10px; color: inherit; flex: 1 1 auto; white-space: pre-line; `;

interface ToastBarProps {
	toast: Toast;
	position?: ToastPosition;
	style?: CSSProperties;
	children?: (components: { icon: Renderable; message: Renderable }) => Renderable;
}

const getAnimationStyle = (position: ToastPosition, visible: boolean): CSSProperties => {
	const top = position.includes('top');
	const factor = top ? 1 : -1;

	const [enter, exit] = prefersReducedMotion()
		? [fadeInAnimation, fadeOutAnimation]
		: [enterAnimation(factor), exitAnimation(factor)];

	return {
		animation: visible
			? `${keyframes(enter)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`
			: `${keyframes(exit)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`,
	};
};

function ToastBarBody(props: ToastBarProps) @{
	const { toast, position, style, children } = props;
	const animationStyle: CSSProperties = toast.height
		? getAnimationStyle(toast.position || position || 'top-center', toast.visible)
		: { opacity: 0 };

	const icon = <ToastIcon toast={toast} />;
	const message = <Message {...toast.ariaProps}>{resolveValue(toast.message, toast)}</Message>;

	<ToastBarBase
		className={toast.className}
		style={{
			...animationStyle,
			...style,
			...toast.style,
		}}
	>
		@if (typeof children === 'function') {
			<>{children({ icon, message })}</>
		} @else {
			<>
				{icon}
				{message}
			</>
		}
	</ToastBarBase>
}

// TypeScript 5.9 resolves `FC = memo(function … )` to memo's ComponentBody
// overload, so the body is a declaration.
export const ToastBar: FC<ToastBarProps> = memo(ToastBarBody);
