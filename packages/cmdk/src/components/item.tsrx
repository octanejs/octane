// Command.Item. Registers itself, tracks selection, and fires onSelect via the
// native cmdk select event (dispatched by the root's Enter handler or a click).
import { useContext, useEffect, useLayoutEffect, useRef } from 'octane';
import { GroupContext, useCommand, useStore } from '../context.tsrx';
import { useAsRef, useCmdk, useId, useValue } from '../hooks.tsrx';
import { SELECT_EVENT } from '../lib/constants';
import type { ItemProps } from '../types';

export function Item(props: ItemProps) @{
	const id = useId();
	const ref = useRef<HTMLDivElement | null>(null);
	const groupContext = useContext(GroupContext);
	const context = useCommand()!;
	const propsRef = useAsRef(props);
	const forceMount = propsRef.current?.forceMount ?? groupContext?.forceMount;

	useLayoutEffect(() => {
		// A force-mounted item is exempt from filtering, so it is registered on the
		// force-mount path instead — it still has to be counted somewhere, or Empty
		// renders "no results" while this item is on screen.
		return forceMount ? context.forceItem(id) : context.item(id, groupContext?.id);
	}, [forceMount]);

	// deps: the provided `value` prop, else the rendered element's textContent
	// (via `ref`). cmdk's string-child inspection is dropped — octane's compiled
	// children are opaque, and the textContent fallback covers the same case.
	const value = useValue(id, ref, [props.value, ref], props.keywords);

	const store = useStore()!;
	const selected = useCmdk((s) => Boolean(s.value && s.value === value.current));
	const render = useCmdk(
		(s) => forceMount
			? true
			: context.filter() === false
				? true
				: !s.search
					? true
					: (s.filtered.items.get(id) ?? 0) > 0,
	);

	useEffect(() => {
		const element = ref.current;
		if (!element || props.disabled) return;
		element.addEventListener(SELECT_EVENT, onSelect);
		return () => element.removeEventListener(SELECT_EVENT, onSelect);
	}, [render, props.onSelect, props.disabled]);

	function onSelect() {
		select();
		propsRef.current.onSelect?.(value.current ?? '');
	}

	function select() {
		store.setState('value', value.current ?? '', true);
	}

	if (!render) return null;

	const {
		disabled,
		value: _value,
		onSelect: _onSelect,
		forceMount: _forceMount,
		keywords: _keywords,
		children,
		ref: _ref,
		...etc
	} = props;

	<div
		ref={[ref, props.ref]}
		{...etc}
		id={id}
		cmdk-item=""
		role="option"
		aria-disabled={Boolean(disabled)}
		aria-selected={Boolean(selected)}
		data-disabled={Boolean(disabled)}
		data-selected={Boolean(selected)}
		onPointerMove={disabled || context.getDisablePointerSelection() ? undefined : select}
		onClick={disabled ? undefined : onSelect}
	>{children}</div>
}
