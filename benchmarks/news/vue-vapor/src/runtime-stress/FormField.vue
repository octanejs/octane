<script setup vapor lang="ts">
import { shallowRef, watchEffect } from 'vue';
import { markFieldRender, recordValidation } from '../../../../runtime-stress/shared.js';

const props = defineProps<{ index: number }>();
const value = shallowRef('');

watchEffect(() => {
	markFieldRender(props.index, value.value);
});

function onInput(event: Event) {
	value.value = (event.currentTarget as HTMLInputElement).value;
	recordValidation(value.value);
}
</script>

<template>
	<label>
		<input
			:name="`field-${props.index}`"
			:data-field-index="props.index"
			:value="value"
			@input="onInput"
		/>
		<output :data-field-output="props.index">{{ value }}</output>
	</label>
</template>
