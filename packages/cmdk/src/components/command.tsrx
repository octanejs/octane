// Command (root). Owns the external store, item/group registration, filtering,
// score sort, keyboard navigation, and controlled `value` handling, and provides
// the store + command contexts to its children.
import { useLayoutEffect, useMemo, useRef } from 'octane';
import { CommandContext, StoreContext } from '../context.tsrx';
import { useAsRef, useId, useLazyRef, useScheduleLayoutEffect } from '../hooks.tsrx';
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
			forceMountedCount: 0,
		}),
	);
	const allItems = useLazyRef<Set<string>>(() => new Set());
	const allForceMounted = useLazyRef<Set<string>>(() => new Set());
	const allGroups = useLazyRef<Map<string, Set<string>>>(() => new Map());
	const ids = useLazyRef<Map<string, { value: string; keywords?: string[] }>>(() => new Map());
	const listeners = useLazyRef<Set<() => void>>(() => new Set());
	// DEV ONLY: how many live items claim each value, so a duplicate can be
	// reported. Maintained incrementally (O(1) per registration) rather than by
	// scanning `ids` on every value change.
	const valueOwners = useLazyRef<Map<string, number>>(() => new Map());
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
					if (process.env.NODE_ENV !== 'production') {
						trackValueOwner(ids.current.get(id)?.value, itemValue ?? '');
					}
					ids.current.set(id, { value: itemValue ?? '', keywords });
					state.current.filtered.items.set(id, score(itemValue ?? '', keywords));
					// Re-derive the aggregate before sorting. Scoring this one item
					// updates `filtered.items` but leaves `filtered.count` and
					// `filtered.groups` describing the previous values, and those two
					// drive Empty and group visibility — so a value that starts or stops
					// matching an active search would otherwise render an item and "no
					// results" at the same time. filterItems() is the single place that
					// derives all three, so reuse it rather than patching the aggregate
					// here (the batcher collapses a burst of value changes into one).
					schedule(2, () => {
						filterItems();
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
					if (process.env.NODE_ENV !== 'production') {
						trackValueOwner(ids.current.get(id)?.value, '');
					}
					ids.current.delete(id);
					allItems.current.delete(id);
					// An item leaving its group has to be dropped from that group's member
					// set too, or the set accumulates dead ids for the Command's lifetime
					// (unbounded growth in a menu whose results churn) and filterItems()
					// walks them on every keystroke.
					if (groupId) allGroups.current.get(groupId)?.delete(id);
					state.current.filtered.items.delete(id);
					const selectedItem = getSelectedItem();

					schedule(4, () => {
						filterItems();
						if (selectedItem?.getAttribute('id') === id) selectFirstItem();
						store.emit();
					});
				};
			},
			// A force-mounted item bypasses registration and filtering, so it never
			// reaches `filtered.count` — but it IS rendered, and Empty must not
			// announce "no results" over the top of it. Track the live count
			// separately and let Empty consult both.
			forceItem: (id) => {
				allForceMounted.current.add(id);
				state.current.forceMountedCount = allForceMounted.current.size;
				schedule(8, () => store.emit());

				return () => {
					allForceMounted.current.delete(id);
					state.current.forceMountedCount = allForceMounted.current.size;
					schedule(8, () => store.emit());
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

	/**
 * DEV ONLY. Selection is keyed by VALUE, not by item id, so two items sharing
 * a value both report `aria-selected="true"` while only the first one — the
 * one `getSelectedItem()`'s `querySelector` finds — actually responds to
 * Enter. That is an authoring error (cmdk requires unique values) rather than
 * something the runtime can resolve, so report it instead of silently
 * rendering a listbox with two selected options.
 */
	function trackValueOwner(previous: string | undefined, next: string) {
		if (previous) {
			const remaining = (valueOwners.current.get(previous) ?? 1) - 1;
			if (remaining > 0) valueOwners.current.set(previous, remaining);
			else valueOwners.current.delete(previous);
		}
		if (!next) return;
		const owners = (valueOwners.current.get(next) ?? 0) + 1;
		valueOwners.current.set(next, owners);
		if (owners > 1) {
			console.warn(
				`[@octanejs/cmdk] ${owners} items share the value ${JSON.stringify(next)}. ` +
					`Selection is keyed by value, so they will all appear selected at once and ` +
					`only the first will respond to Enter. Give each item a unique \`value\` prop.`,
			);
		}
	}

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

	/**
 * Append `node` to `container`, carrying the comment markers that fence it.
 *
 * cmdk's sort is DOM-authoritative: it puts matches in score order by
 * physically relocating item nodes. That is safe under React, which re-parents
 * the nodes it owns on the next render. Octane instead delimits each
 * component's DOM with a pair of comment markers and tracks the range between
 * them, so appending the element alone strands it outside its own markers —
 * the runtime's bookkeeping then describes a range that no longer contains the
 * node, and the next update or teardown works off stale references (observed
 * as "Cannot read properties of undefined" from an unmount cleanup, and
 * "insertBefore ... not a child of this node" from the following render).
 *
 * Moving the flanking comment nodes with the element keeps the range intact.
 * This does couple the port to how octane fences a component; it is the
 * narrowest thing that works today, and the durable fix belongs upstream —
 * either a supported way to relocate a component's range, or a teardown path
 * that tolerates externally-moved nodes. Covered by the search → narrow →
 * clear → unmount regression test.
 */
	function moveWithMarkers(container: Element, node: Element) {
		const before = node.previousSibling;
		const after = node.nextSibling;
		if (before !== null && before.nodeType === Node.COMMENT_NODE) container.appendChild(before);
		container.appendChild(node);
		if (after !== null && after.nodeType === Node.COMMENT_NODE) container.appendChild(after);
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
				if (node) moveWithMarkers(group, node);
			} else {
				const node =
					item.parentElement === listInsertionElement
						? item
						: item.closest(`${GROUP_ITEMS_SELECTOR} > *`);
				if (node) moveWithMarkers(listInsertionElement, node);
			}
		});

		// OCTANE DIVERGENCE: upstream looks each group element up by
		// `[cmdk-group=""][data-value="<groupId>"]`, but `data-value` holds the
		// group's VALUE (its heading text), never its id — so upstream's selector
		// can never match and its group reordering is effectively dead code.
		// Resolve the id to its registered value and match on that instead, so
		// groups genuinely reorder by their best item score. Comparing the
		// attribute directly also avoids escaping problems for values containing
		// quotes (upstream encodes the selector but writes `data-value` raw).
		const groupElements = Array.from(listInsertionElement.querySelectorAll(GROUP_SELECTOR));
		groups.sort((a, b) => b[1] - a[1]).forEach(([groupId]) => {
			const groupValue = ids.current.get(groupId)?.value;
			if (!groupValue) return;
			const element = groupElements.find((el) => el.getAttribute(VALUE_ATTR) === groupValue);
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
		if (!item) return;
		// Non-browser hosts (jsdom, SSR) do not implement scrollIntoView. Guard it
		// here rather than relying on the scheduler swallowing the failure, so the
		// scheduler is free to report genuine errors.
		if (typeof item.scrollIntoView !== 'function') return;

		if (item.parentElement?.firstChild === item) {
			// First item in a group — keep the group heading in view too.
			item.closest(GROUP_SELECTOR)?.querySelector(GROUP_HEADING_SELECTOR)?.scrollIntoView({
				block: 'nearest',
			});
		}
		item.scrollIntoView({ block: 'nearest' });
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
