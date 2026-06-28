// Ported from @lexical/react/src/LexicalNodeContextMenuPlugin.tsx. The React
// version is built entirely on @floating-ui/REACT (useFloating, useInteractions,
// useListNavigation, useTypeahead, FloatingPortal/Overlay/FocusManager), which is
// React-only. octane has @floating-ui/DOM (the agnostic core), so this is a
// re-implementation on that: computePosition+autoUpdate for placement, a keydown
// handler for arrow/enter/escape + type-ahead, and an outside-click dismiss, with
// the floating menu rendered via octane's createPortal. Public API (the option /
// separator classes + the plugin props) matches @lexical/react.
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { $getNearestNodeFromDOMNode, $getRoot } from 'lexical';
import { createPortal, useEffect, useRef, useState } from 'octane';

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

function ContextMenuBody(props) @{
	<div
		class={props.className}
		ref={props.floatingRef}
		role="menu"
		style="position: fixed; top: 0; left: 0"
	>
		@for (const item of props.renderItems; key item.key) {
			@if (item.type === 'item') {
				<button
					class={item.className}
					role="menuitem"
					disabled={item.disabled}
					tabindex={-1}
					ref={item.setRef}
					onClick={item.onClick}
					onMouseUp={item.onClick}
					onMouseEnter={item.onMouseEnter}
				>
					{item.icon}
					<span>
						{item.label as string}
					</span>
				</button>
			} @else {
				<hr class={item.className} />
			}
		}
	</div>
}

export function NodeContextMenuPlugin(props) {
	const items = props.items;
	const className = props.className;
	const itemClassName = props.itemClassName;
	const separatorClassName = props.separatorClassName;

	const [editor] = useLexicalComposerContext();
	const [activeIndex, setActiveIndex] = useState(null);
	const [isOpen, setIsOpen] = useState(false);
	const [renderItems, setRenderItems] = useState([]);

	const floatingRef = useRef(null);
	const positionRef = useRef(null);
	const listItemsRef = useRef([]);

	// Build the menu model on right-click and open the menu at the cursor.
	useEffect(() => {
		function onContextMenu(e) {
			e.preventDefault();

			positionRef.current = {
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
			};

			let visibleItems = [];
			if (items) {
				editor.read(() => {
					const node = $getNearestNodeFromDOMNode(e.target) ?? $getRoot();
					if (node) {
						visibleItems = items.filter((option) => option.$showOn ? option.$showOn(node) : true);
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
					select: () => editor.update(() => option.$onSelect()),
					title: option.title,
					type: option.type,
				};
			});

			setRenderItems(renderableItems);
			setActiveIndex(null);
			setIsOpen(true);
		}

		return editor.registerRootListener((rootElement) => {
			if (rootElement !== null) {
				rootElement.addEventListener('contextmenu', onContextMenu);
				return () => rootElement.removeEventListener('contextmenu', onContextMenu);
			}
		});
	}, [items, itemClassName, separatorClassName, editor]);

	// Position the floating menu + wire keyboard navigation + outside-click dismiss
	// while it is open. Re-runs when the rendered items change.
	useEffect(() => {
		if (!isOpen) {
			return;
		}
		const floatingEl = floatingRef.current;
		const reference = positionRef.current;
		if (floatingEl === null || reference === null) {
			return;
		}

		const selectableIndexes = renderItems.map(
			(item, i) => (item.type === 'item' && !item.disabled ? i : -1),
		).filter((i) => i >= 0);

		const focusIndex = (idx) => {
			setActiveIndex(idx);
			const el = listItemsRef.current[idx];
			if (el) {
				el.focus();
			}
		};

		const move = (delta) => {
			if (selectableIndexes.length === 0) {
				return;
			}
			const current = selectableIndexes.indexOf(activeIndex);
			let next;
			if (current === -1) {
				next = delta > 0 ? 0 : selectableIndexes.length - 1;
			} else {
				next = (current + delta + selectableIndexes.length) % selectableIndexes.length;
			}
			focusIndex(selectableIndexes[next]);
		};

		const close = () => {
			setIsOpen(false);
			editor.focus();
		};

		let typeahead = '';
		let typeaheadTimer = null;

		const onKeyDown = (event) => {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				move(1);
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				move(-1);
			} else if (event.key === 'Enter' || event.key === ' ') {
				if (activeIndex !== null && renderItems[activeIndex] && renderItems[activeIndex].select) {
					event.preventDefault();
					renderItems[activeIndex].select();
					close();
				}
			} else if (event.key === 'Escape') {
				event.preventDefault();
				close();
			} else if (event.key.length === 1) {
				// Type-ahead: jump to the first selectable item whose label matches.
				typeahead += event.key.toLowerCase();
				if (typeaheadTimer !== null) {
					clearTimeout(typeaheadTimer);
				}
				typeaheadTimer = setTimeout(() => {
					typeahead = '';
				}, 500);
				const match = selectableIndexes.find(
					(i) => (renderItems[i].label || '').toLowerCase().startsWith(typeahead),
				);
				if (match !== undefined) {
					focusIndex(match);
				}
			}
		};

		const onPointerDown = (event) => {
			if (!floatingEl.contains(event.target)) {
				close();
			}
		};

		const update = () => {
			computePosition(reference, floatingEl, {
				strategy: 'fixed',
				placement: 'right-start',
				middleware: [
					offset({ alignmentAxis: 4, mainAxis: 5 }),
					flip({ fallbackPlacements: ['left-start'] }),
					shift({ padding: 10 }),
				],
			}).then(({ x, y }) => {
				floatingEl.style.left = `${x}px`;
				floatingEl.style.top = `${y}px`;
			});
		};

		const cleanupAutoUpdate = autoUpdate(reference, floatingEl, update);
		document.addEventListener('keydown', onKeyDown);
		document.addEventListener('pointerdown', onPointerDown, true);
		// Focus the menu so keyboard navigation works immediately.
		floatingEl.focus({ preventScroll: true });

		return () => {
			cleanupAutoUpdate();
			document.removeEventListener('keydown', onKeyDown);
			document.removeEventListener('pointerdown', onPointerDown, true);
			if (typeaheadTimer !== null) {
				clearTimeout(typeaheadTimer);
			}
		};
	}, [isOpen, renderItems, activeIndex, editor]);

	if (!isOpen) {
		return null;
	}

	// Attach per-item refs + handlers, then portal the menu.
	listItemsRef.current = [];
	const itemsForRender = renderItems.map((item, index) => {
		if (item.type !== 'item') {
			return item;
		}
		return {
			...item,
			setRef: (node) => {
				listItemsRef.current[index] = node;
			},
			onClick: () => {
				if (item.select) {
					item.select();
				}
				setIsOpen(false);
				editor.focus();
			},
			onMouseEnter: () => setActiveIndex(index),
		};
	});

	return createPortal(ContextMenuBody, document.body, {
		className,
		floatingRef,
		renderItems: itemsForRender,
	});
}
