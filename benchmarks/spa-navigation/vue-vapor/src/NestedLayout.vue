<script setup vapor>
// Survives an 'a/x' -> 'a/y' navigation: App's outer v-if chain keys on the
// top-level segment only, so this component (and its layout div) is reused and
// just its routed child is replaced.
import SectionX from './SectionX.vue';
import SectionY from './SectionY.vue';

defineProps({ section: String });
</script>

<template>
	<div class="layout" data-layout="a">
		<div class="outlet-inner">
			<SectionX v-if="section === 'x'" />
			<SectionY v-else />
		</div>
	</div>
</template>
