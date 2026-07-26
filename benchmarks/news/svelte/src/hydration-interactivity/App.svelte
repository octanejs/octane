<script>
	import {
		CARDS,
		INITIAL_VALUE,
		readHydrationDraft,
	} from '../../../../hydration-interactivity/shared.js';

	let { controlled = false } = $props();
	let draft = $state(readHydrationDraft());
	let clicks = $state(0);
	let focuses = $state(0);
	let submitted = $state(INITIAL_VALUE);

	function onInput(event) {
		draft = event.currentTarget.value;
	}

	function onSend() {
		const input = document.querySelector('#hydration-input');
		const query = input?.value ?? INITIAL_VALUE;
		draft = query;
		submitted = query;
		clicks++;
	}
</script>

<main class="hydration-page">
	<h1>Hydration interactivity benchmark</h1>
	<section class="hydration-editor">
		<label for="hydration-input">Search query</label>
		{#if controlled}
			<input
				id="hydration-input"
				type="search"
				autocomplete="off"
				value={draft}
				oninput={onInput}
			/>
		{:else}
			<input id="hydration-input" type="search" autocomplete="off" oninput={onInput} />
		{/if}
		<output id="hydration-output">{draft}</output>
		<button id="hydration-action" type="button" onclick={onSend} onfocus={() => focuses++}>
			Send search
		</button>
		<output id="hydration-clicks">{clicks}</output>
		<output id="hydration-focuses">{focuses}</output>
		<output id="hydration-submitted">{submitted}</output>
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
