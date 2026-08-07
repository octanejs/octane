<script setup vapor>
// Vue Vapor twin: same routes and tree shape as the octane fixtures. The outer
// v-if chain reads a computed of the TOP-LEVEL segment, which is what keeps the
// nested layout alive across 'a/x' -> 'a/y'.
import { shallowRef, computed } from 'vue';
import PageA from './PageA.vue';
import PageB from './PageB.vue';
import NestedLayout from './NestedLayout.vue';
import { bindRoute } from './state.js';

const props = defineProps({ route: String });

const route = shallowRef(props.route);
bindRoute((next) => {
	route.value = next;
});

const top = computed(() => (route.value === 'a' ? 'a' : route.value === 'b' ? 'b' : 'nested'));
const section = computed(() => (route.value === 'a/x' ? 'x' : 'y'));
</script>

<template>
	<div class="shell">
		<nav class="nav">
			<span class="crumb">{{ route }}</span>
		</nav>
		<div class="outlet" :data-route="route">
			<PageA v-if="top === 'a'" />
			<PageB v-else-if="top === 'b'" />
			<NestedLayout v-else :section="section" />
		</div>
	</div>
</template>
