// Ported from .base-ui/packages/react/src/fieldset/ (v1.6.0):
//   index.ts / index.parts.ts (the `Fieldset` namespace),
//   root/FieldsetRoot.tsx, root/FieldsetRootContext.ts, legend/FieldsetLegend.tsx.
//
// Groups a shared legend with related controls. `Fieldset.Root` renders a
// `<fieldset>`; `Fieldset.Legend` renders a `<div>` whose generated id is fed back
// into the root as `aria-labelledby`. Base UI uses a PLAIN React context here (not the
// scoped-context factory) — ported as a plain octane createContext. octane is
// ref-as-prop (React-19 shape), so `forwardRef` collapses to a `ref` prop.
import {
	createContext,
	createElement,
	useContext,
	useLayoutEffect,
	useMemo,
	useState,
} from 'octane';

import { S, splitSlot, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import { useBaseUiId } from './utils/useBaseUiId';

// --- Context -----------------------------------------------------------------

export interface FieldsetRootContextValue {
	legendId: string | undefined;
	setLegendId: (id: string | undefined) => void;
	disabled: boolean | undefined;
}

const FieldsetRootContext = createContext<FieldsetRootContextValue | undefined>(undefined);

export function useFieldsetRootContext(optional: true): FieldsetRootContextValue | undefined;
export function useFieldsetRootContext(optional?: false): FieldsetRootContextValue;
export function useFieldsetRootContext(optional = false): FieldsetRootContextValue | undefined {
	// octane context reads are not slot-threaded (see runtime `useContext`).
	const context = useContext(FieldsetRootContext);
	if (!context && !optional) {
		throw new Error(
			'Base UI: FieldsetRootContext is missing. Fieldset parts must be placed within <Fieldset.Root>.',
		);
	}
	return context;
}

// --- Root --------------------------------------------------------------------

export interface FieldsetRootState {
	/** Whether the component should ignore user interaction. */
	disabled: boolean;
}

export interface FieldsetRootProps {
	disabled?: boolean;
	className?: string | ((state: FieldsetRootState) => string | undefined);
	render?: RenderProp<FieldsetRootState>;
	style?: Record<string, any> | ((state: FieldsetRootState) => Record<string, any> | undefined);
	ref?: any;
	[key: string]: any;
}

function FieldsetRoot(props: FieldsetRootProps): any {
	const slot = S('FieldsetRoot');
	const { render, className, style, disabled: disabledProp = false, ref, ...elementProps } = props;

	const [legendId, setLegendId] = useState<string | undefined>(
		undefined,
		subSlot(slot, 'legendId'),
	);

	const parentDisabled = useFieldsetRootContext(true)?.disabled;
	const disabled = parentDisabled || disabledProp;

	const state: FieldsetRootState = { disabled };

	const element = useRenderElement(
		'fieldset',
		{ render, className, style },
		{
			ref,
			state,
			props: [{ 'aria-labelledby': legendId, disabled }, elementProps],
		},
		subSlot(slot, 're'),
	);

	const contextValue: FieldsetRootContextValue = useMemo(
		() => ({ legendId, setLegendId, disabled }),
		[legendId, setLegendId, disabled],
		subSlot(slot, 'ctx'),
	);

	return createElement(FieldsetRootContext.Provider, { value: contextValue, children: element });
}

// --- Legend ------------------------------------------------------------------

export interface FieldsetLegendState {
	/** Whether the component should ignore user interaction. */
	disabled: boolean;
}

export interface FieldsetLegendProps {
	id?: string;
	className?: string | ((state: FieldsetLegendState) => string | undefined);
	render?: RenderProp<FieldsetLegendState>;
	style?: Record<string, any> | ((state: FieldsetLegendState) => Record<string, any> | undefined);
	ref?: any;
	[key: string]: any;
}

function FieldsetLegend(props: FieldsetLegendProps): any {
	const slot = S('FieldsetLegend');
	const { render, className, style, id: idProp, ref, ...elementProps } = props;

	const { disabled, setLegendId } = useFieldsetRootContext();

	const id = useBaseUiId(idProp, subSlot(slot, 'id'));

	useLayoutEffect(
		() => {
			setLegendId(id);
			return () => {
				setLegendId(undefined);
			};
		},
		[setLegendId, id],
		subSlot(slot, 'e:legendId'),
	);

	const state: FieldsetLegendState = { disabled: disabled ?? false };

	return useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref,
			props: [{ id }, elementProps],
		},
		subSlot(slot, 're'),
	);
}

// --- Namespace (mirrors `export * as Fieldset`) ------------------------------

export const Fieldset = {
	Root: FieldsetRoot,
	Legend: FieldsetLegend,
};
