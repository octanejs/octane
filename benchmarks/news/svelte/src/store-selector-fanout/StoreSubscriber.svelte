<script>
	import {
		getStoreSelectorStress,
		markSubscriberRender,
		selectTotal,
	} from '../../../../store-selector-fanout/shared.js';

	let { generation, index } = $props();
	const store = getStoreSelectorStress().store;
	// `$state.raw` keeps the 2,000-element snapshot out of the deep proxy, so the
	// measured work stays the selection itself rather than reactivity plumbing.
	let snapshot = $state.raw(store.getSnapshot());

	$effect(() =>
		store.subscribe(() => {
			snapshot = store.getSnapshot();
		}),
	);

	// Svelte has no render pass to re-run: the derived recomputes when the store
	// publishes a new snapshot and never because a parent rendered.
	const total = $derived(selectTotal(snapshot.values));

	markSubscriberRender();
</script>

<output data-subscriber-index={index} data-generation={generation}>{total}</output>
