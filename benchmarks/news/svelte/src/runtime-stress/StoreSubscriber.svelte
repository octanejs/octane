<script>
	import { getRuntimeStress, markStoreRender } from '../../../../runtime-stress/shared.js';

	let { index } = $props();
	const store = getRuntimeStress().store;
	let value = $state(0);

	$effect(() => {
		return store.subscribe(() => {
			value = store.get(index);
		});
	});

	$effect(() => {
		markStoreRender(index, value);
	});
</script>

<output data-subscriber-index={index}>{value}</output>
