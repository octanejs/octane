/** @jsxImportSource octane */
import { useEffect, useRef, useSyncExternalStore, type OctaneNode } from 'octane';
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

export const MenuItem = (props: MenuItemProps) => {
	const store = useMenuStore();

	const buttonRef = useRef<HTMLButtonElement | null>(null);
	// The store identity is fixed for the lifetime of the row, so capture
	// `value` and the generated dom id once and reuse the same identity for
	// registration, hover/active checks, and cleanup.
	const registeredValueRef = useRef(props.value);
	const registeredValue = registeredValueRef.current;
	const domIdRef = useRef<string | null>(null);
	if (domIdRef.current === null) domIdRef.current = store.createItemId();
	const domId = domIdRef.current;

	const role = props.role ?? 'menuitem';
	const isEnabled = !props.disabled;

	// Keep the registration's callbacks reading the latest props without
	// re-registering the row on every render (React props are per-render objects,
	// unlike Solid's live getters).
	const latestRef = useRef({ disabled: props.disabled, onSelect: props.onSelect });
	latestRef.current = { disabled: props.disabled, onSelect: props.onSelect };

	const activeValue = useSyncExternalStore(store.subscribe, store.activeValue);
	const isActive = activeValue === registeredValue;

	useEffect(() => {
		const buttonElement = buttonRef.current;
		if (!buttonElement) return;
		store.registerItem({
			value: registeredValue,
			domId,
			element: buttonElement,
			isEnabled: () => !latestRef.current.disabled,
			onSelect: () => latestRef.current.onSelect?.(),
		});
		return () => store.unregisterItem(registeredValue);
	}, []);

	return (
		<button
			ref={buttonRef}
			id={domId}
			data-react-grab-ignore-events
			data-react-grab-menu-item={props.dataId ?? registeredValue}
			type="button"
			role={role}
			aria-checked={role === 'menuitemradio' ? Boolean(props.checked) : undefined}
			aria-disabled={Boolean(props.disabled)}
			tabindex={store.keyboardNavigation ? (isActive ? 0 : -1) : undefined}
			disabled={props.disabled}
			class={cn(
				'relative z-1 contain-layout flex items-center justify-between w-full px-2 py-1 cursor-pointer text-left border-none bg-transparent disabled:opacity-40 disabled:cursor-default',
				props.class,
			)}
			onPointerDown={(event) => event.stopPropagation()}
			onPointerEnter={() => {
				if (isEnabled && store.canActivateOnHover()) store.setActiveItem(registeredValue);
			}}
			onPointerLeave={() => {
				if (store.clearActiveOnPointerLeave) store.setActiveItem(null);
			}}
			onClick={(event) => {
				event.stopPropagation();
				if (!isEnabled) return;
				props.onSelect?.();
			}}
		>
			{props.children}
		</button>
	);
};
