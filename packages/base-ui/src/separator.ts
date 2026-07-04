// Ported from .base-ui/packages/react/src/separator/Separator.tsx (v1.6.0).
// A separator element accessible to screen readers. Renders a `<div>`.
import { S, subSlot } from './internal';
import { useRenderElement } from './utils/useRenderElement';

type Orientation = 'horizontal' | 'vertical';

export interface SeparatorState {
	orientation: Orientation;
}

export interface SeparatorProps {
	orientation?: Orientation;
	className?: string | ((state: SeparatorState) => string | undefined);
	render?: import('./utils/useRenderElement').RenderProp<SeparatorState>;
	ref?: any;
	[key: string]: any;
}

// octane: forwardRef → ref-as-prop. The compiler gives this component its own
// per-instance scope, so `S('Separator')` resolves to a distinct slot per instance.
export function Separator(props: SeparatorProps): any {
	const slot = S('Separator');
	const { className, render, orientation = 'horizontal', style, ref, ...elementProps } = props;

	const state: SeparatorState = { orientation };

	return useRenderElement(
		'div',
		{ className, render, style },
		{
			state,
			ref,
			props: [{ role: 'separator', 'aria-orientation': orientation }, elementProps],
		},
		subSlot(slot, 're'),
	);
}

export namespace Separator {
	export type Props = SeparatorProps;
	export type State = SeparatorState;
}
