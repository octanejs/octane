<script setup vapor lang="ts">
import { shallowRef } from 'vue';
import { CARDS, INITIAL_VALUE } from '../../../../hydration-interactivity/shared.js';

const props = defineProps<{
	controlled?: boolean;
	deferred?: boolean;
}>();

const draft = shallowRef(INITIAL_VALUE);
const clicks = shallowRef(0);

function onInput(event: Event) {
	draft.value = (event.currentTarget as HTMLInputElement).value;
}
</script>

<template>
	<main class="hydration-page">
		<h1>Hydration interactivity benchmark</h1>
		<section class="hydration-editor">
			<label for="hydration-input">Your draft</label>
			<input
				v-if="props.controlled"
				id="hydration-input"
				autocomplete="off"
				:value="draft"
				@input="onInput"
			/>
			<input v-else id="hydration-input" autocomplete="off" @input="onInput" />
			<output id="hydration-output">{{ draft }}</output>
			<button id="hydration-action" type="button" @click="clicks++">Record interaction</button>
			<output id="hydration-clicks">{{ clicks }}</output>
		</section>
		<ul id="hydration-cards">
			<li v-for="card of CARDS" :key="card.id" class="hydration-card" :data-card-id="card.id">
				<h2>{{ card.title }}</h2>
				<p>{{ card.description }}</p>
			</li>
		</ul>
	</main>
</template>
