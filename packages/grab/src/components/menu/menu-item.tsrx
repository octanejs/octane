import { useEffect, useRef } from 'octane';
import {
	resolveProp,
	runOnce,
	scoped,
	useProp,
	type JSX,
	type OctaneNode,
} from '../../reactive.js';
import { cn } from '../../utils/cn.js';
import { useMenuStore } from './menu-context.js';

interface MenuItemProps {
	value: string;
	// Test/debug hook rendered as data-react-grab-menu-item. Defaults to
	// `value`; pass explicitly when the store identity must stay unique but the
	// attribute should read as something else (e.g. a human label).
	dataId?: string;
	role?: 'menuitem' | 'menuitemradio';
	disabled?: boolean;
	checked?: boolean;
	class?: string;
	onSelect?: () => void;
	children: OctaneNode;
}

export const MenuItem = scoped<MenuItemProps>((props) => {
	const store = useMenuStore();
	const domId = runOnce(() => store.createItemId());
	// The store identity is fixed for the lifetime of the row. Solid props are
	// live getters, so capture `value` once and use the same identity for
	// registration, hover/active checks, and cleanup — otherwise a reactive
	// `value` change would desync them.
	const registeredValue = runOnce(() => resolveProp(props.value));
	const role = useProp(() => resolveProp(props.role) ?? 'menuitem');
	const disabled = useProp(props.disabled);
	const checked = useProp(props.checked);
	const className = useProp(props.class);
	const dataId = useProp(props.dataId);
	const isActive = useProp(() => store.activeValue() === registeredValue);
	const isEnabled = (): boolean => !resolveProp(props.disabled);

	const buttonElement = useRef<HTMLButtonElement | null>(null);

	useEffect(() => {
		if (!buttonElement.current) return;
		store.registerItem({
			value: registeredValue,
			domId,
			element: buttonElement.current,
			isEnabled,
			onSelect: () => resolveProp(props.onSelect)?.(),
		});
		return () => store.unregisterItem(registeredValue);
	}, []);

	return <button
		ref={(element) => {
			buttonElement.current = element;
		}}
		id={domId}
		data-react-grab-ignore-events
		data-react-grab-menu-item={dataId ?? registeredValue}
		type="button"
		role={role}
		aria-checked={role === 'menuitemradio' ? Boolean(checked) : undefined}
		aria-disabled={Boolean(disabled)}
		tabindex={store.keyboardNavigation ? (isActive ? 0 : -1) : undefined}
		disabled={disabled}
		class={cn(
			'relative z-1 contain-layout flex items-center justify-between w-full px-2 py-1 cursor-pointer text-left border-none bg-transparent disabled:opacity-40 disabled:cursor-default',
			className,
		)}
		onPointerDown={(event) => event.stopPropagation()}
		onPointerEnter={() => {
			if (isEnabled() && store.canActivateOnHover()) store.setActiveItem(registeredValue);
		}}
		onPointerLeave={() => {
			if (store.clearActiveOnPointerLeave) store.setActiveItem(null);
		}}
		onClick={(event) => {
			event.stopPropagation();
			if (!isEnabled()) return;
			resolveProp(props.onSelect)?.();
		}}
	>{props.children}</button>;
});
