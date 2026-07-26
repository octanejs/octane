<script>
	import { markFieldRender, recordValidation } from '../../../../runtime-stress/shared.js';

	let { index } = $props();
	let value = $state('');

	$effect(() => {
		markFieldRender(index, value);
	});

	function onInput(event) {
		value = event.currentTarget.value;
		recordValidation(value);
	}
</script>

<label>
	<input name="field-{index}" data-field-index={index} {value} oninput={onInput} />
	<output data-field-output={index}>{value}</output>
</label>
