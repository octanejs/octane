<script setup vapor lang="ts">
import { onMounted, onUnmounted, shallowRef, watchEffect } from 'vue';
import { getRuntimeStress, markStoreRender } from '../../../../runtime-stress/shared.js';

const props = defineProps<{ index: number }>();
const store = getRuntimeStress().store;
const value = shallowRef(store.get(props.index));
let unsubscribe: (() => void) | undefined;

onMounted(() => {
	unsubscribe = store.subscribe(() => {
		value.value = store.get(props.index);
	});
});

onUnmounted(() => {
	unsubscribe?.();
});

watchEffect(() => {
	markStoreRender(props.index, value.value);
});
</script>

<template>
	<output :data-subscriber-index="props.index">{{ value }}</output>
</template>
