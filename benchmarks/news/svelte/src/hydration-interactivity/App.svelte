<script>
	import { CARDS, INITIAL_VALUE } from '../../../../hydration-interactivity/shared.js';

	let { controlled = false } = $props();
	let draft = $state(INITIAL_VALUE);
	let clicks = $state(0);

	function onInput(event) {
		draft = event.currentTarget.value;
	}
</script>

<main class="hydration-page">
	<h1>Hydration interactivity benchmark</h1>
	<section class="hydration-editor">
		<label for="hydration-input">Your draft</label>
		{#if controlled}
			<input id="hydration-input" autocomplete="off" value={draft} oninput={onInput} />
		{:else}
			<input id="hydration-input" autocomplete="off" oninput={onInput} />
		{/if}
		<output id="hydration-output">{draft}</output>
		<button id="hydration-action" type="button" onclick={() => clicks++}>
			Record interaction
		</button>
		<output id="hydration-clicks">{clicks}</output>
	</section>
	<ul id="hydration-cards">
		{#each CARDS as card (card.id)}
			<li class="hydration-card" data-card-id={card.id}>
				<h2>{card.title}</h2>
				<p>{card.description}</p>
			</li>
		{/each}
	</ul>
</main>
