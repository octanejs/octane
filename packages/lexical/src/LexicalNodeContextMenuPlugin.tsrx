// Ported 1:1 from @lexical/react/src/LexicalNodeContextMenuPlugin.tsx (0.46.0). The
// React version is built entirely on @floating-ui/REACT — useFloating, useRole,
// useDismiss, useListNavigation, useTypeahead, useInteractions, and the
// FloatingPortal/FloatingOverlay/FloatingFocusManager components. octane now has the
// faithful binding (@octanejs/floating-ui), so this mirrors the original directly
// instead of re-implementing positioning/keyboard/dismiss by hand. octane adaptations:
// no forwardRef (refs are props), and the per-item `getItemProps()` is spread onto the
// host <button>/<hr> (octane applies ref / on* / tabindex / role from a prop spread).
import {
	useFloating,
	useRole,
	useDismiss,
	useListNavigation,
	useTypeahead,
	useInteractions,
	offset,
	flip,
	shift,
	autoUpdate,
	FloatingPortal,
	FloatingOverlay,
	FloatingFocusManager,
} from '@octanejs/floating-ui';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { $getNearestNodeFromDOMNode, $getRoot } from 'lexical';
import { useEffect, useRef, useState } from 'octane';

class MenuOption {
	key: string;
	ref?: { current: HTMLElement | null };

	constructor(key: string) {
		this.key = key;
		this.ref = { current: null };
		this.setRefElement = this.setRefElement.bind(this);
	}

	setRefElement(element: HTMLElement | null) {
		this.ref = { current: element };
	}
}

export class NodeContextMenuOption extends MenuOption {
	type: string;
	title: string;
	icon: unknown;
	disabled: boolean;
	$onSelect: () => void;
	$showOn?: (node: unknown) => boolean;

	constructor(title, options) {
		super(title);
		this.type = 'item';
		this.title = title;
		this.disabled = options.disabled ?? false;
		this.icon = options.icon ?? null;
		this.$onSelect = options.$onSelect;
		if (options.$showOn) {
			this.$showOn = options.$showOn;
		}
	}
}

export class NodeContextMenuSeparator extends MenuOption {
	type: string;
	$showOn?: (node: unknown) => boolean;

	constructor(options) {
		super('_separator');
		this.type = 'separator';
		if (options && options.$showOn) {
			this.$showOn = options.$showOn;
		}
	}
}

// The floating menu container + its items. Mirrors the React render's inner <div>:
// the resolved floating props are spread onto it, and each item spreads its own
// getItemProps() onto a <button> (or <hr> for a separator).
function ContextMenuList(props) @{
	<div
		class={props.className}
		ref={props.setFloating}
		style={props.floatingStyles}
		role="menu"
		{...props.floatingProps}
	>
		@for (const item of props.items; key item.key) {
			@if (item.type === 'item') {
				<button {...item.itemProps} class={item.className} role="menuitem" disabled={item.disabled}>
					{item.icon}
					<span>
						{item.label as string}
					</span>
				</button>
			} @else {
				<hr {...item.itemProps} class={item.className} />
			}
		}
	</div>
}

export function NodeContextMenuPlugin(props) @{
	const items = props.items;
	const className = props.className;
	const itemClassName = props.itemClassName;
	const separatorClassName = props.separatorClassName;

	const [editor] = useLexicalComposerContext();
	const [activeIndex, setActiveIndex] = useState(null);
	const [isOpen, setIsOpen] = useState(false);
	const [renderItems, setRenderItems] = useState([]);

	const listItemsRef = useRef([]);
	const listContentRef = useRef([]);

	const f = useFloating({
		middleware: [
			offset({ alignmentAxis: 4, mainAxis: 5 }),
			flip({ fallbackPlacements: ['left-start'] }),
			shift({ padding: 10 }),
		],
		onOpenChange: setIsOpen,
		open: isOpen,
		placement: 'right-start',
		strategy: 'fixed',
		whileElementsMounted: autoUpdate,
	});

	const role = useRole(f.context, { role: 'menu' });
	const dismiss = useDismiss(f.context);
	const listNavigation = useListNavigation(f.context, {
		activeIndex,
		listRef: listItemsRef,
		onNavigate: setActiveIndex,
	});
	const typeahead = useTypeahead(f.context, {
		activeIndex,
		enabled: isOpen,
		listRef: listContentRef,
		onMatch: setActiveIndex,
	});
	const { getFloatingProps, getItemProps } = useInteractions([
		role,
		dismiss,
		listNavigation,
		typeahead,
	]);

	// Build the menu model on right-click and open the menu at the cursor.
	useEffect(() => {
		function onContextMenu(e) {
			e.preventDefault();

			f.refs.setPositionReference({
				getBoundingClientRect() {
					return {
						bottom: e.clientY,
						height: 0,
						left: e.clientX,
						right: e.clientX,
						top: e.clientY,
						width: 0,
						x: e.clientX,
						y: e.clientY,
					};
				},
			});

			let visibleItems = [];
			if (items) {
				editor.read(() => {
					const node = $getNearestNodeFromDOMNode(e.target) ?? $getRoot();
					if (node) {
						visibleItems = items.filter((option) => (option.$showOn ? option.$showOn(node) : true));
					}
				});
			}

			const renderableItems = visibleItems.map((option, index) => {
				if (option.type === 'separator') {
					return {
						className: separatorClassName,
						key: option.key + '-' + index,
						type: option.type,
					};
				}
				return {
					className: itemClassName,
					disabled: option.disabled,
					icon: option.icon,
					key: option.key,
					label: option.title,
					onSelect: () => editor.update(() => option.$onSelect()),
					title: option.title,
					type: option.type,
				};
			});

			listContentRef.current = renderableItems.map((item) => item.key);
			setRenderItems(renderableItems);
			setIsOpen(true);
		}

		return editor.registerRootListener((rootElement) => {
			if (rootElement !== null) {
				rootElement.addEventListener('contextmenu', onContextMenu);
				return () => rootElement.removeEventListener('contextmenu', onContextMenu);
			}
		});
	}, [items, itemClassName, separatorClassName, editor]);

	// Attach per-item refs + handlers via getItemProps, mirroring the React render.
	// (Computed every render; `renderItems` is empty while closed, so this is a no-op
	// until the menu opens.)
	listItemsRef.current = [];
	const itemsForRender = renderItems.map((item, index) => {
		const onSelect = () => {
			if (item.onSelect) {
				item.onSelect();
			}
			setIsOpen(false);
		};
		return {
			...item,
			itemProps: getItemProps({
				onClick: onSelect,
				onMouseUp: onSelect,
				ref: (node) => {
					listItemsRef.current[index] = node;
				},
				tabIndex: activeIndex === index ? 0 : -1,
			}),
		};
	});

	@if (isOpen) {
		<FloatingPortal>
			<FloatingOverlay lockScroll={true}>
				<FloatingFocusManager context={f.context} initialFocus={f.refs.floating}>
					<ContextMenuList
						className={className}
						setFloating={f.refs.setFloating}
						floatingStyles={f.floatingStyles}
						floatingProps={getFloatingProps()}
						items={itemsForRender}
					/>
				</FloatingFocusManager>
			</FloatingOverlay>
		</FloatingPortal>
	}
}
