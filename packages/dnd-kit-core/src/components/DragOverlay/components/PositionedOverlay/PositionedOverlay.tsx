/** @jsxImportSource octane */
import { createElement } from 'octane';
import type { CSSProperties, JSX, OctaneNode, Ref } from 'octane';
import { CSS, isKeyboardEvent } from '@octanejs/dnd-kit-utilities';

import type { Transform } from '@octanejs/dnd-kit-utilities';

import { getRelativeTransformOrigin } from '../../../../utilities';
import type { ClientRect, UniqueIdentifier } from '../../../../types';

type TransitionGetter = (activatorEvent: Event | null) => CSSProperties['transition'] | undefined;

export interface Props {
	as: keyof JSX.IntrinsicElements;
	activatorEvent: Event | null;
	adjustScale?: boolean;
	children?: OctaneNode;
	className?: string;
	id: UniqueIdentifier;
	rect: ClientRect | null;
	style?: CSSProperties;
	transition?: string | TransitionGetter;
	transform: Transform;
	// Octane has no forwardRef, so the overlay takes its ref as a prop.
	ref?: Ref<HTMLElement>;
}

const baseStyles: CSSProperties = {
	position: 'fixed',
	touchAction: 'none',
};

const defaultTransition: TransitionGetter = (activatorEvent) => {
	const isKeyboardActivator = isKeyboardEvent(activatorEvent);

	return isKeyboardActivator ? 'transform 250ms ease' : undefined;
};

export const PositionedOverlay = ({
	as,
	activatorEvent,
	adjustScale,
	children,
	className,
	rect,
	style,
	transform,
	transition = defaultTransition,
	ref,
}: Props) => {
	if (!rect) {
		return null;
	}

	const scaleAdjustedTransform = adjustScale
		? transform
		: {
				...transform,
				scaleX: 1,
				scaleY: 1,
			};
	const styles: CSSProperties | undefined = {
		...baseStyles,
		width: rect.width,
		height: rect.height,
		top: rect.top,
		left: rect.left,
		transform: CSS.Transform.toString(scaleAdjustedTransform),
		transformOrigin:
			adjustScale && activatorEvent
				? getRelativeTransformOrigin(
						activatorEvent as MouseEvent | KeyboardEvent | TouchEvent,
						rect,
					)
				: undefined,
		transition: typeof transition === 'function' ? transition(activatorEvent) : transition,
		...style,
	};

	return createElement(
		as,
		{
			className,
			style: styles,
			ref,
		},
		children,
	);
};
