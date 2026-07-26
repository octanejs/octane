<script setup vapor lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { mountLifecycleResource } from '../../../../runtime-stress/shared.js';

const props = defineProps<{ index: number; tick: number }>();
let release: (() => void) | undefined;

onMounted(() => {
	release = mountLifecycleResource(props.index);
});

onUnmounted(() => {
	release?.();
});
</script>

<template>
	<li :data-lifecycle-row="props.index">{{ props.index }}:{{ props.tick }}</li>
</template>
