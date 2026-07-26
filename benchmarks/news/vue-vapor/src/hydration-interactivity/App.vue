<script setup vapor lang="ts">
import { onMounted, shallowRef } from 'vue';
import {
	CARDS,
	INITIAL_VALUE,
	readHydrationDraft,
} from '../../../../hydration-interactivity/shared.js';

const props = defineProps<{
	controlled?: boolean;
	deferred?: boolean;
}>();

const hydrationDraft = readHydrationDraft();
const draft = shallowRef(INITIAL_VALUE);
const clicks = shallowRef(0);
const focuses = shallowRef(0);
const submitted = shallowRef(INITIAL_VALUE);

onMounted(() => {
	if (hydrationDraft !== INITIAL_VALUE) draft.value = hydrationDraft;
});

function onInput(event: Event) {
	draft.value = (event.currentTarget as HTMLInputElement).value;
}

function onSend() {
	const input = document.querySelector<HTMLInputElement>('#hydration-input');
	const query = input?.value ?? INITIAL_VALUE;
	draft.value = query;
	submitted.value = query;
	clicks.value++;
}
</script>

<template>
	<main class="hydration-page">
		<h1>Hydration interactivity benchmark</h1>
		<section class="hydration-editor">
			<label for="hydration-input">Search query</label>
			<input
				v-if="props.controlled"
				id="hydration-input"
				type="search"
				autocomplete="off"
				:value="draft"
				@input="onInput"
			/>
			<input v-else id="hydration-input" type="search" autocomplete="off" @input="onInput" />
			<output id="hydration-output">{{ draft }}</output>
			<button id="hydration-action" type="button" @click="onSend" @focus="focuses++">
				Send search
			</button>
			<output id="hydration-clicks">{{ clicks }}</output>
			<output id="hydration-focuses">{{ focuses }}</output>
			<output id="hydration-submitted">{{ submitted }}</output>
		</section>
		<ul id="hydration-cards">
			<li v-for="card of CARDS" :key="card.id" class="hydration-card" :data-card-id="card.id">
				<h2>{{ card.title }}</h2>
				<p>{{ card.description }}</p>
			</li>
		</ul>
	</main>
</template>
