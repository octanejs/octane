// Command (root). Owns the external store, item/group registration, filtering,
// score sort, keyboard navigation, and controlled `value` handling, and provides
// the store + command contexts to its children.
import { useId, useLayoutEffect, useMemo, useRef } from 'octane';
import { CommandContext, StoreContext } from '../context.tsrx';
import { useAsRef, useLazyRef, useScheduleLayoutEffect } from '../hooks.tsrx';
import { defaultFilter } from '../filter';
import { findNextSibling, findPreviousSibling } from '../lib/dom';
import {
	GROUP_HEADING_SELECTOR,
	GROUP_ITEMS_SELECTOR,
	GROUP_SELECTOR,
	ITEM_SELECTOR,
	SELECT_EVENT,
	VALID_ITEM_SELECTOR,
	VALUE_ATTR,
	srOnlyStyles,
} from '../lib/constants';
import type { CommandProps, Context, State, Store } from '../types';

export function CommandRoot(props: CommandProps) @{
	const state = useLazyRef<State>(
		() => ({
			search: '',
			value: props.value ?? props.defaultValue ?? '',
			selectedItemId: undefined,
			filtered: { count: 0, items: new Map(), groups: new Set() },
		}),
	);
	const allItems = useLazyRef<Set<string>>(() => new Set());
	const allGroups = useLazyRef<Map<string, Set<string>>>(() => new Map());
	const ids = useLazyRef<Map<string, { value: string; keywords?: string[] }>>(() => new Map());
	const listeners = useLazyRef<Set<() => void>>(() => new Set());
	const propsRef = useAsRef(props);

	// Destructure the cmdk-specific props out of `etc` so they are not spread as
	// DOM attributes; the reactive reads below use `propsRef.current` instead.
	const {
		label,
		children,
		value,
		onKeyDown,
		vimBindings = true,
		onValueChange: _onValueChange,
		filter: _filter,
		shouldFilter: _shouldFilter,
		loop: _loop,
		disablePointerSelection: _disablePointerSelection,
		defaultValue: _defaultValue,
		...etc
	} = props;

	const listId = useId();
	const labelId = useId();
	const inputId = useId();

	const listInnerRef = useRef<HTMLDivElement | null>(null);

	const schedule = useScheduleLayoutEffect();

	/** Controlled mode `value` handling. */
	useLayoutEffect(() => {
		if (value !== undefined) {
			state.current.value = value.trim();
			store.emit();
		}
	}, [value]);

	useLayoutEffect(() => {
		schedule(6, scrollSelectedIntoView);
	}, []);

	const store: Store = useMemo(() => {
		return {
			subscribe: (cb) => {
				listeners.current.add(cb);
				return () => listeners.current.delete(cb);
			},
			snapshot: () => state.current,
			setState: (key, next, _opts) => {
				if (Object.is(state.current[key], next)) return;
				(state.current as Record<string, unknown>)[key] = next;

				if (key === 'search') {
					// Filter synchronously before emitting back to children.
					filterItems();
					sort();
					schedule(1, selectFirstItem);
				} else if (key === 'value') {
					// Force focus input or root so accessibility works.
					const active = document.activeElement;
					if (active?.hasAttribute('cmdk-input') || active?.hasAttribute('cmdk-root')) {
						const input = document.getElementById(inputId);
						if (input) input.focus();
						else document.getElementById(listId)?.focus();
					}

					schedule(7, () => {
						state.current.selectedItemId = getSelectedItem()?.id;
						store.emit();
					});

					// `_opts` truthy means "do not scroll the selection into view".
					if (!_opts) schedule(5, scrollSelectedIntoView);

					if (propsRef.current?.value !== undefined) {
						// Controlled: call the callback instead of updating internal state.
						propsRef.current.onValueChange?.(String(next ?? ''));
						return;
					}
				}

				store.emit();
			},
			emit: () => {
				listeners.current.forEach((l) => l());
			},
		};
	}, []);

	const context: Context = useMemo(
		() => ({
			value: (id, itemValue, keywords) => {
				if (itemValue !== ids.current.get(id)?.value) {
					ids.current.set(id, { value: itemValue ?? '', keywords });
					state.current.filtered.items.set(id, score(itemValue ?? '', keywords));
					schedule(2, () => {
						sort();
						store.emit();
					});
				}
			},
			item: (id, groupId) => {
				allItems.current.add(id);

				if (groupId) {
					if (!allGroups.current.has(groupId)) allGroups.current.set(groupId, new Set([id]));
					else allGroups.current.get(groupId)!.add(id);
				}

				// Batch: multiple items can mount in one pass.
				schedule(3, () => {
					filterItems();
					sort();
					if (!state.current.value) selectFirstItem();
					store.emit();
				});

				return () => {
					ids.current.delete(id);
					allItems.current.delete(id);
					state.current.filtered.items.delete(id);
					const selectedItem = getSelectedItem();

					schedule(4, () => {
						filterItems();
						if (selectedItem?.getAttribute('id') === id) selectFirstItem();
						store.emit();
					});
				};
			},
			group: (id) => {
				if (!allGroups.current.has(id)) allGroups.current.set(id, new Set());
				return () => {
					ids.current.delete(id);
					allGroups.current.delete(id);
				};
			},
			filter: () => propsRef.current.shouldFilter !== false,
			label: label || props['aria-label'] as string,
			getDisablePointerSelection: () => propsRef.current.disablePointerSelection ?? false,
			listId,
			inputId,
			labelId,
			listInnerRef,
		}),
		[],
	);

	function score(itemValue: string, keywords?: string[]) {
		const filter = propsRef.current?.filter ?? defaultFilter;
		return itemValue ? filter(itemValue, state.current.search, keywords) : 0;
	}

	function selectFirstItem() {
		const item = getValidItems().find((i) => i.getAttribute('aria-disabled') !== 'true');
		const value = item?.getAttribute(VALUE_ATTR);
		store.setState('value', value || '');
	}

	/** Filters the current items. */
	function filterItems() {
		if (!state.current.search || propsRef.current.shouldFilter === false) {
			state.current.filtered.count = allItems.current.size;
			return;
		}

		state.current.filtered.groups = new Set();
		let itemCount = 0;

		for (const id of allItems.current) {
			const value = ids.current.get(id)?.value ?? '';
			const keywords = ids.current.get(id)?.keywords ?? [];
			const rank = score(value, keywords);
			state.current.filtered.items.set(id, rank);
			if (rank > 0) itemCount++;
		}

		for (const [groupId, group] of allGroups.current) {
			for (const itemId of group) {
				if ((state.current.filtered.items.get(itemId) ?? 0) > 0) {
					state.current.filtered.groups.add(groupId);
					break;
				}
			}
		}

		state.current.filtered.count = itemCount;
	}

	/** Sorts items by score, and groups by highest item score, by reordering the
 * real DOM nodes (cmdk's DOM-authoritative model). */
	function sort() {
		if (!state.current.search || propsRef.current.shouldFilter === false) return;

		const scores = state.current.filtered.items;

		// Highest score per visible group.
		const groups: [string, number][] = [];
		state.current.filtered.groups.forEach((groupId) => {
			const items = allGroups.current.get(groupId);
			let max = 0;
			items?.forEach((item) => {
				max = Math.max(scores.get(item) ?? 0, max);
			});
			groups.push([groupId, max]);
		});

		const listInsertionElement = listInnerRef.current;
		if (!listInsertionElement) return;

		// OCTANE DIVERGENCE: only reorder items that will stay visible (score > 0).
		// Upstream also pushes the non-matching items to the bottom before they
		// unmount, but moving a node and then unmounting it orphans it in an
		// octane HYDRATED tree (the node is carried out of its hydration-marker
		// range, so its removal leaves an empty host behind). The non-matches
		// unmount from their original positions anyway, so the visible result —
		// matching items in score order — is identical.
		getValidItems().filter((item) => (scores.get(item.getAttribute('id') ?? '') ?? 0) > 0).sort(
			(a, b) => (scores.get(b.getAttribute('id') ?? '') ?? 0) -
				(scores.get(a.getAttribute('id') ?? '') ?? 0),
		).forEach((item) => {
			const group = item.closest(GROUP_ITEMS_SELECTOR);
			if (group) {
				const node =
					item.parentElement === group ? item : item.closest(`${GROUP_ITEMS_SELECTOR} > *`);
				if (node) group.appendChild(node);
			} else {
				const node =
					item.parentElement === listInsertionElement
						? item
						: item.closest(`${GROUP_ITEMS_SELECTOR} > *`);
				if (node) listInsertionElement.appendChild(node);
			}
		});

		groups.sort((a, b) => b[1] - a[1]).forEach((group) => {
			const element = listInnerRef.current?.querySelector(
				`${GROUP_SELECTOR}[${VALUE_ATTR}="${encodeURIComponent(group[0])}"]`,
			);
			if (element?.parentElement) element.parentElement.appendChild(element);
		});
	}

	function getSelectedItem() {
		return listInnerRef.current?.querySelector(`${ITEM_SELECTOR}[aria-selected="true"]`);
	}

	function getValidItems() {
		return Array.from(listInnerRef.current?.querySelectorAll(VALID_ITEM_SELECTOR) || []);
	}

	function updateSelectedToIndex(index: number) {
		const items = getValidItems();
		const item = items[index];
		if (item) store.setState('value', item.getAttribute(VALUE_ATTR) || '');
	}

	function updateSelectedByItem(change: 1 | -1) {
		const selected = getSelectedItem();
		const items = getValidItems();
		const index = items.findIndex((item) => item === selected);

		let newSelected = items[index + change];

		if (propsRef.current?.loop) {
			newSelected = index + change < 0
				? items[items.length - 1]
				: index + change === items.length
					? items[0]
					: items[index + change];
		}

		if (newSelected) store.setState('value', newSelected.getAttribute(VALUE_ATTR) || '');
	}

	function updateSelectedByGroup(change: 1 | -1) {
		const selected = getSelectedItem();
		let group = selected?.closest(GROUP_SELECTOR);
		let item: Element | null | undefined;

		while (group && !item) {
			group = change > 0
				? findNextSibling(group, GROUP_SELECTOR)
				: findPreviousSibling(group, GROUP_SELECTOR);
			item = group?.querySelector(VALID_ITEM_SELECTOR);
		}

		if (item) {
			store.setState('value', item.getAttribute(VALUE_ATTR) || '');
		} else {
			updateSelectedByItem(change);
		}
	}

	function scrollSelectedIntoView() {
		const item = getSelectedItem();
		if (item) {
			if (item.parentElement?.firstChild === item) {
				// First item in a group — keep the group heading in view too.
				item.closest(GROUP_SELECTOR)?.querySelector(GROUP_HEADING_SELECTOR)?.scrollIntoView({
					block: 'nearest',
				});
			}
			item.scrollIntoView({ block: 'nearest' });
		}
	}

	const last = () => updateSelectedToIndex(getValidItems().length - 1);

	const next = (e: KeyboardEvent) => {
		e.preventDefault();
		if (e.metaKey) last();
		else if (e.altKey) updateSelectedByGroup(1);
		else updateSelectedByItem(1);
	};

	const prev = (e: KeyboardEvent) => {
		e.preventDefault();
		if (e.metaKey) updateSelectedToIndex(0);
		else if (e.altKey) updateSelectedByGroup(-1);
		else updateSelectedByItem(-1);
	};

	<div
		ref={props.ref}
		tabIndex={-1}
		{...etc}
		cmdk-root=""
		onKeyDown={(e) => {
			onKeyDown?.(e);

			const isComposing = e.isComposing || e.keyCode === 229;
			if (e.defaultPrevented || isComposing) return;

			switch (e.key) {
				case 'n':
				case 'j': {
					if (vimBindings && e.ctrlKey) next(e);
					break;
				}
				case 'ArrowDown': {
					next(e);
					break;
				}
				case 'p':
				case 'k': {
					if (vimBindings && e.ctrlKey) prev(e);
					break;
				}
				case 'ArrowUp': {
					prev(e);
					break;
				}
				case 'Home': {
					e.preventDefault();
					updateSelectedToIndex(0);
					break;
				}
				case 'End': {
					e.preventDefault();
					last();
					break;
				}
				case 'Enter': {
					e.preventDefault();
					const item = getSelectedItem();
					if (item) item.dispatchEvent(new Event(SELECT_EVENT));
				}
			}
		}}
	>
		<label cmdk-label="" for={inputId} id={labelId} style={srOnlyStyles}>{label}</label>
		<StoreContext.Provider value={store}>
			<CommandContext.Provider value={context}>{children}</CommandContext.Provider>
		</StoreContext.Provider>
	</div>
}
