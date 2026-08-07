import { useContext, useEffect, useMemo } from 'octane';
import type { ControlPosition, IControl } from '../types/lib';
import { MapContext } from './map.tsrx';
import type { MapContextValue } from './map.tsrx';

type ControlOptions = {
	position?: ControlPosition;
};

export function useControl<T extends IControl>(
	onCreate: (context: MapContextValue) => T,
	opts?: ControlOptions,
): T;

export function useControl<T extends IControl>(
	onCreate: (context: MapContextValue) => T,
	onRemove: (context: MapContextValue) => void,
	opts?: ControlOptions,
): T;

export function useControl<T extends IControl>(
	onCreate: (context: MapContextValue) => T,
	onAdd: (context: MapContextValue) => void,
	onRemove: (context: MapContextValue) => void,
	opts?: ControlOptions,
): T;

export function useControl<T extends IControl>(
	onCreate: (context: MapContextValue) => T,
	arg1?: ((context: MapContextValue) => void) | ControlOptions,
	arg2?: ((context: MapContextValue) => void) | ControlOptions,
	arg3?: ControlOptions,
): T {
	// Octane's compiler rewrites a custom-hook call site in a `.tsrx` module to
	// `withSlot(sym, useControl, ...args, sym)` and deliberately retains that
	// trailing symbol, so bindings that read their slot off the last argument
	// keep working. This hook resolves its optional trailing parameters
	// positionally, so an un-stripped symbol wins the `arg3 || arg2 || arg1`
	// race and the caller's options disappear — a control silently lands in the
	// default corner. No legitimate argument here is ever a symbol.
	if (typeof arg1 === 'symbol') arg1 = undefined;
	if (typeof arg2 === 'symbol') arg2 = undefined;
	if (typeof arg3 === 'symbol') arg3 = undefined;

	const context = useContext(MapContext);
	const ctrl = useMemo(() => onCreate(context), []);

	useEffect(() => {
		const opts = (arg3 || arg2 || arg1) as ControlOptions;
		const onAdd = typeof arg1 === 'function' && typeof arg2 === 'function' ? arg1 : null;
		const onRemove = typeof arg2 === 'function' ? arg2 : typeof arg1 === 'function' ? arg1 : null;

		const { map } = context;
		if (!map.hasControl(ctrl)) {
			map.addControl(ctrl, opts?.position);
			if (onAdd) {
				onAdd(context);
			}
		}

		return () => {
			if (onRemove) {
				onRemove(context);
			}
			// Map might have been removed (parent effects are destroyed before child ones)
			if (map.hasControl(ctrl)) {
				map.removeControl(ctrl);
			}
		};
	}, []);

	return ctrl;
}
