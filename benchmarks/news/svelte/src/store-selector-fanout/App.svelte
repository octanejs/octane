<script>
	import {
		SELECTOR_SUBSCRIBERS,
		getStoreSelectorStress,
	} from '../../../../store-selector-fanout/shared.js';
	import StoreSubscriber from './StoreSubscriber.svelte';

	let visible = $state(false);
	let generation = $state(0);
	const stress = getStoreSelectorStress();
	const store = stress.store;
	// The harness drives discrete parent renders through this, so a re-render
	// costs no Playwright round trip and no timer floor.
	stress.bump = () => generation++;
</script>

<main>
	<button id="selector-toggle" type="button" onclick={() => (visible = !visible)}>
		Toggle subscribers
	</button>
	<button id="selector-write" type="button" onclick={() => store.writeAll(7)}>
		Write every store value
	</button>
	<button id="selector-rewrite" type="button" onclick={() => store.writeAll(9)}>
		Rewrite every store value
	</button>
	<output id="selector-generation">{generation}</output>
	{#if visible}
		<div id="selector-subscribers">
			{#each SELECTOR_SUBSCRIBERS as index (index)}
				<StoreSubscriber {generation} {index} />
			{/each}
		</div>
	{/if}
</main>
