<script setup vapor lang="ts">
import { shallowRef } from 'vue';
import {
	SELECTOR_SUBSCRIBERS,
	getStoreSelectorStress,
} from '../../../../store-selector-fanout/shared.js';
import StoreSubscriber from './StoreSubscriber.vue';

const visible = shallowRef(false);
const generation = shallowRef(0);
const stress = getStoreSelectorStress();
const store = stress.store;
// The harness drives discrete parent renders through this, so a re-render costs
// no Playwright round trip and no timer floor.
stress.bump = () => {
	generation.value++;
};
</script>

<template>
	<main>
		<button id="selector-toggle" type="button" @click="visible = !visible">
			Toggle subscribers
		</button>
		<button id="selector-write" type="button" @click="store.writeAll(7)">
			Write every store value
		</button>
		<button id="selector-rewrite" type="button" @click="store.writeAll(9)">
			Rewrite every store value
		</button>
		<output id="selector-generation">{{ generation }}</output>
		<div v-if="visible" id="selector-subscribers">
			<StoreSubscriber
				v-for="index of SELECTOR_SUBSCRIBERS"
				:key="index"
				:generation="generation"
				:index="index"
			/>
		</div>
	</main>
</template>
