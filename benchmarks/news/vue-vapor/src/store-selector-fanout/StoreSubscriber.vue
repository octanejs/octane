<script setup vapor lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import {
	getStoreSelectorStress,
	markSubscriberRender,
	selectTotal,
} from '../../../../store-selector-fanout/shared.js';

const props = defineProps<{ generation: number; index: number }>();
const store = getStoreSelectorStress().store;
// `shallowRef` keeps the 2,000-element snapshot out of the deep proxy, so the
// measured work stays the selection itself rather than reactivity plumbing.
const snapshot = shallowRef(store.getSnapshot());
let unsubscribe: (() => void) | undefined;

onMounted(() => {
	unsubscribe = store.subscribe(() => {
		snapshot.value = store.getSnapshot();
	});
});

onUnmounted(() => {
	unsubscribe?.();
});

// Vue has no render pass to re-run for the selection: the computed recomputes
// when the store publishes a new snapshot and never because a parent rendered.
const total = computed(() => selectTotal(snapshot.value.values));

markSubscriberRender();
</script>

<template>
	<output :data-subscriber-index="props.index" :data-generation="props.generation">{{
		total
	}}</output>
</template>
