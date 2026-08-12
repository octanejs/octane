// Command (root). Owns the external store, item/group registration, filtering,
// score sort, keyboard navigation, and controlled `value` handling, and provides
// the store + command contexts to its children.
import { useLayoutEffect, useMemo, useRef } from 'octane';
import { CommandContext, StoreContext } from '../context.tsrx';
import { useAsRef, useId, useLazyRef, useScheduleLayoutEffect } from '../hooks.tsrx';
import { defaultFilter } from '../filter';
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
			scheduleSelectedItemIdSync();
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

					scheduleSelectedItemIdSync();

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
					// OCTANE DIVERGENCE[value-change-filter-refresh][differential:cmdk-value-change-filter]:
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
					releaseValue(id);
					allItems.current.delete(id);
					// An item leaving its group has to be dropped from that group's member
					// set too, or the set accumulates dead ids for the Command's lifetime
					// (unbounded growth in a menu whose results churn) and filterItems()
					// walks them on every keystroke. Documented in status.json; no paired
					// DOM oracle distinguishes the bookkeeping from upstream.
					if (groupId) allGroups.current.get(groupId)?.delete(id);
					const selectedItem = getSelectedItem();

					// Keyed per ITEM, not per teardown path. The batcher is a Map, so a
					// shared key means the last teardown in a multi-item removal
					// overwrites the others — and the callback that survives captured a
					// different `selectedItem`, so nothing notices the selected item
					// left. Removing the selected item alongside any sibling then
					// stranded the selection on a node that no longer exists.
					scheduleFromTeardown(`item-remove:${id}`, () => {
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
					// OCTANE DIVERGENCE[force-mount-empty-count][differential:cmdk-force-mount-empty]:
					// Releasing the force-mount count on unmount is required so Empty can
					// reappear once no force-mounted item remains visible.
					releaseValue(id);
					allForceMounted.current.delete(id);
					state.current.forceMountedCount = allForceMounted.current.size;
					// OCTANE DIVERGENCE[selected-force-mount-teardown][differential:cmdk-selected-force-mount]:
					// A force-mounted item is selectable like any other, so losing the
					// selected one has to move the selection on — exactly as the plain
					// item teardown does. Without this the value stays pointing at a node
					// that is gone: nothing renders `aria-selected`, the combobox's
					// `aria-activedescendant` dangles at a removed id, and Enter does
					// nothing until the user arrows away.
					const selectedItem = getSelectedItem();

					// Per item for the same reason as the plain path, and distinct from
					// the mount emit above, which also used key 8 — a mount and a
					// teardown in one pass cancelled each other out.
					scheduleFromTeardown(`force-remove:${id}`, () => {
						if (selectedItem?.getAttribute('id') === id) selectFirstItem();
						store.emit();
					});
				};
			},
			group: (id) => {
				if (!allGroups.current.has(id)) allGroups.current.set(id, new Set());
				return () => {
					releaseValue(id);
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
			// OCTANE DIVERGENCE[duplicate-value-warning][differential:cmdk-duplicate-value]:
			// Development builds report duplicate values; upstream accepts them silently.
			console.warn(
				`[@octanejs/cmdk] ${owners} items share the value ${JSON.stringify(next)}. ` +
					`Selection is keyed by value, so they will all appear selected at once and ` +
					`only the first will respond to Enter. Give each item a unique \`value\` prop.`,
			);
		}
	}

	/**
 * Queue a teardown's follow-up work.
 *
 * Octane runs a removed child's effect cleanups DURING the parent's render
 * (`renderBranchSlot` → `unmountBlock` → `unmountScope` →
 * `runEffectCleanupCallback`), so calling `schedule` straight from a teardown
 * lands its `ss({})` mid-render and the runtime reports "Cannot update a
 * component (`CommandRoot`) while rendering a different component" — advice a
 * teardown cannot act on, since it does not choose when it runs. Hopping a
 * microtask moves the update out of the render pass; the queued work itself is
 * unchanged and still runs before paint.
 *
 * Only the teardowns defer. Every other caller schedules from a layout effect,
 * where the synchronous update is both correct and load-bearing (the search →
 * filter → select-first chain has to settle inside the same commit).
 */
	function scheduleFromTeardown(id: string | number, cb: () => void) {
		queueMicrotask(() => schedule(id, cb));
	}

	/**
 * Drop everything `context.value` registered for `id`. Items, force-mounted
 * items AND groups all register their value through the same `useValue` hook,
 * so all three teardown paths have to release through here. Releasing on only
 * one of them leaves the entry alive past the component: the dev-only owner
 * count then reports a duplicate for a value just one live component holds
 * (re-showing a force-mounted item counts 2, then 3, ...), and `ids` /
 * `filtered.items` keep growing for the Command's lifetime.
 */
	function releaseValue(id: string) {
		if (process.env.NODE_ENV !== 'production') {
			trackValueOwner(ids.current.get(id)?.value, '');
		}
		ids.current.delete(id);
		state.current.filtered.items.delete(id);
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

		// Only filterable items carry a filter score. Force-mounted items and
		// groups register their value through the same `useValue` hook, so
		// `context.value` scores them too — against whatever the search was at
		// registration time, and nothing refreshes it because the loop below walks
		// `allItems`, which holds neither. A force-mounted item registered before
		// the user typed therefore kept the score of the EMPTY search (0.99, higher
		// than a genuine prefix match) for the rest of its life, and outranked
		// every real match once ranking read these scores.
		for (const id of state.current.filtered.items.keys()) {
			if (!allItems.current.has(id)) state.current.filtered.items.delete(id);
		}

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
 * Inline styles this component applied, mapped to the values that were there
 * before, so clearing a search restores the consumer's own inline styling
 * rather than deleting it.
 */
	const styled = useLazyRef<Map<HTMLElement, Record<string, string>>>(() => new Map());

	function setStyle(element: HTMLElement, property: string, value: string) {
		const previous = styled.current.get(element) ?? {};
		if (!(property in previous)) {
			previous[property] = element.style.getPropertyValue(property);
			styled.current.set(element, previous);
		}
		element.style.setProperty(property, value);
	}

	/** Restore every inline style this component set, in one pass. */
	function clearStyles() {
		styled.current.forEach((previous, element) => {
			for (const property of Object.keys(previous)) {
				if (previous[property]) element.style.setProperty(property, previous[property]);
				else element.style.removeProperty(property);
			}
		});
		styled.current.clear();
	}

	/** The direct child of `container` that positions `item` — the item itself, or
 * the wrapper element it sits inside. */
	function positionedNode(item: Element, container: Element): HTMLElement | null {
		// Walk up to the child the container actually lays out. `order` applies to
		// a flex CHILD, so an item nested in a wrapper has to rank through that
		// wrapper — resolving only the item itself leaves the wrapper unranked, and
		// an unranked flex child keeps `order: 0` and paints ahead of every ranked
		// one. Upstream resolves a single level (`closest(GROUP_ITEMS > *)`), which
		// covers a wrapper inside a group but not one directly under the list.
		let node: Element | null = item;
		while (node && node.parentElement !== container) node = node.parentElement;
		return node instanceof HTMLElement ? node : null;
	}

	/** Make `container` order its children by the `order` property. */
	function asOrderedContainer(container: Element) {
		if (!(container instanceof HTMLElement)) return;
		setStyle(container, 'display', 'flex');
		setStyle(container, 'flex-direction', 'column');
	}

	/**
 * Order items by score, and groups by their best item score, using CSS `order`.
 *
 * OCTANE DIVERGENCE[runtime-adaptation-divergences][differential:cmdk-filter-selection-empty]: cmdk's sort is DOM-authoritative — it puts matches in
 * score order by physically relocating item nodes into the list sizer. Octane
 * fences every component's DOM with a pair of comment markers and tracks the
 * range between them, and a template construct like `@for` or `@if` wraps each
 * item in a SECOND, outer range. Relocating a node carries it out of every one
 * of those ranges at once: the loop later clears a range that is now empty and
 * the real node is orphaned in the list forever (observed as every item
 * surviving a removal, stacked above a "No results found." empty state).
 *
 * Carrying the flanking markers along only ever repairs the innermost range,
 * so it breaks again at each new nesting construct. Expressing the order
 * declaratively removes the class of bug instead of an instance of it: no node
 * is ever moved, so no range is ever violated, and clearing the search
 * restores true source order for free — physical reordering left a scrambled
 * residue that accumulated across searches and never recovered.
 *
 * The cost is that the sizer and each group's item container become flex
 * columns while a filter is active, so a consumer who relies on physical DOM
 * order (`:nth-child` styling, drag handles) or on a custom container
 * `display` sees a divergence from upstream. This marker authenticates ranking
 * and aria wiring only; event/ref adaptations are out of scope for this case.
 */
	function sort() {
		if (!state.current.search || propsRef.current.shouldFilter === false) {
			// No active filter: source order is the answer, so drop everything we set.
			clearStyles();
			return;
		}

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

		clearStyles();
		asOrderedContainer(listInsertionElement);

		// Ungrouped items and group hosts are siblings in the sizer, so their ranks
		// share one space and must not collide. Upstream appends the ranked items
		// first and the ranked groups after them, which puts groups below any
		// directly-listed item; `topLevel` reserves that many slots so the group
		// ranks below continue past them instead of tying.
		let topLevel = 0;

		// OCTANE DIVERGENCE[force-mount-rank-order][differential:cmdk-force-mount-rank]:
		// EVERY valid item gets a rank, not just the matches. A non-match usually
		// unmounts and never needs one, but a force-mounted item never scores and
		// never unmounts — and an unranked child keeps the initial `order` of 0,
		// which sorts it AHEAD of every ranked match instead of out of the way. So
		// a mid-list forceMount jumped to the top of its container whenever the
		// search did not match it. Ranking everything puts zero-scoring items last,
		// which is also what upstream does: it sorts all valid items by score and
		// appends them, so the zero-scorers end up at the bottom.
		//
		// The sort is stable on the DOM index, so items that score equally keep
		// their source order.
		getValidItems().map(
			(item, index) => ({
				item,
				index,
				score: scores.get(item.getAttribute('id') ?? '') ?? 0,
			}),
		).sort((a, b) => b.score - a.score || a.index - b.index).map(({ item }) => item).forEach((
			item,
			rank,
		) => {
			const group = item.closest(GROUP_ITEMS_SELECTOR);
			const container = group ?? listInsertionElement;
			if (group) asOrderedContainer(group);
			const node = positionedNode(item, container);
			if (!node) return;
			// A grouped item is ranked against its own container's children, so the
			// global rank works there — it is sparse but monotonic. A sizer child
			// shares one rank space with the group hosts numbered below, so it needs
			// a DENSE counter: the global rank skips ahead whenever a grouped item
			// outranks it, which let an ungrouped item tie a group host and leave the
			// two painting in DOM order.
			setStyle(node, 'order', String(group ? rank + 1 : topLevel += 1));
		});

		// OCTANE DIVERGENCE[corrected-group-ordering][differential:cmdk-groups]: upstream looks each group element up by
		// `[cmdk-group=""][data-value="<groupId>"]`, but `data-value` holds the
		// group's VALUE (its heading text), never its id — so upstream's selector
		// can never match and its group reordering is effectively dead code.
		// Resolve the id to its registered value and match on that instead, so
		// groups genuinely reorder by their best item score. Comparing the
		// attribute directly also avoids escaping problems for values containing
		// quotes (upstream encodes the selector but writes `data-value` raw).
		const groupElements = Array.from(listInsertionElement.querySelectorAll(GROUP_SELECTOR));
		groups.sort((a, b) => b[1] - a[1]).forEach(([groupId], rank) => {
			const groupValue = ids.current.get(groupId)?.value;
			if (!groupValue) return;
			const element = groupElements.find((el) => el.getAttribute(VALUE_ATTR) === groupValue);
			// Through the positioned node for the same reason items do: a group
			// wrapped in another element is not itself the sizer's flex child, so
			// ordering the group host would do nothing and leave the wrapper
			// unranked at `order: 0`, ahead of everything.
			const node =
				element ? positionedNode(element, listInsertionElement) : null;
			if (node) setStyle(node, 'order', String(topLevel + rank + 1));
		});
	}

	function getSelectedItem() {
		return listInnerRef.current?.querySelector(`${ITEM_SELECTOR}[aria-selected="true"]`);
	}

	function scheduleSelectedItemIdSync() {
		// Selection state renders before its DOM id can be observed. Defer the
		// lookup until the selected Item has committed, then publish the id to
		// Input/List. Controlled prop reconciliation bypasses setState('value')
		// so it does not call onValueChange, but it still needs this same
		// accessibility follow-up.
		schedule(7, () => {
			state.current.selectedItemId = getSelectedItem()?.id;
			store.emit();
		});
	}

	/** Element children of `container`, in the order they are painted. */
	function orderedChildren(container: Element): HTMLElement[] {
		return Array.from(container.children).filter(
			(child): child is HTMLElement => child instanceof HTMLElement,
		).map((child, index) => ({ child, index, order: Number(child.style.order) || 0 })).sort(
			(a, b) => a.order - b.order || a.index - b.index,
		).map(({ child }) => child);
	}

	/**
 * Selectable items in the order the user sees them.
 *
 * Selection and arrow-key navigation both read this, so it has to agree with
 * what is on screen. While a filter is active the ranking lives in CSS `order`
 * rather than in DOM order (see `sort()`), and the two disagree — walking the
 * DOM would select and navigate in source order behind a differently-ordered
 * list. Descending through the ranked containers keeps group ranking and
 * within-group ranking composed in the right order.
 *
 * With no filter active nothing carries an `order`, so DOM order already IS
 * visual order and the flat query is both correct and cheaper.
 */
	function getValidItems(): Element[] {
		const root = listInnerRef.current;
		if (!root) return [];
		if (styled.current.size === 0) return Array.from(root.querySelectorAll(VALID_ITEM_SELECTOR));

		const items: Element[] = [];
		const walk = (container: Element) => {
			for (const child of orderedChildren(container)) {
				if (child.matches(ITEM_SELECTOR)) {
					if (child.matches(VALID_ITEM_SELECTOR)) items.push(child);
					continue;
				}
				walk(child);
			}
		};
		walk(root);
		return items;
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

	/** Groups in the order they are painted, for the same reason `getValidItems`
 * exists: while a filter is active the ranking lives in CSS `order`, so DOM
 * order and on-screen order disagree. */
	function getOrderedGroups(): Element[] {
		const root = listInnerRef.current;
		if (!root) return [];
		const groups = Array.from(root.querySelectorAll(GROUP_SELECTOR));
		if (styled.current.size === 0) return groups;
		// Read the rank off the positioned node, not the group host: a wrapped group
		// carries its `order` on the wrapper, so reading the host would see 0 for
		// every such group and collapse navigation back to DOM order.
		return groups.map(
			(group, index) => ({
				group,
				index,
				order: Number(positionedNode(group, root)?.style.order) || 0,
			}),
		).sort((a, b) => a.order - b.order || a.index - b.index).map(({ group }) => group);
	}

	function updateSelectedByGroup(change: 1 | -1) {
		const selected = getSelectedItem();
		const group = selected?.closest(GROUP_SELECTOR);

		// Step through the groups as the user sees them, and take each candidate's
		// first item in RANKED order too — `querySelector` would return whichever
		// item happens to come first in the DOM, which is a different item once a
		// filter is active.
		const groups = getOrderedGroups();
		const items = getValidItems();
		let index =
			group ? groups.indexOf(group) : -1;
		let item: Element | undefined;

		while (index >= 0 && !item) {
			index += change;
			const candidate = groups[index];
			if (!candidate) break;
			item = items.find((element) => element.closest(GROUP_SELECTOR) === candidate);
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
		ref={props.ref ?? null}
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
