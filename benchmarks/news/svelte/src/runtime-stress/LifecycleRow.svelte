<script>
	import { mountLifecycleResource } from '../../../../runtime-stress/shared.js';

	let { index, tick } = $props();

	$effect(() => mountLifecycleResource(index));
</script>

<li data-lifecycle-row={index}>{index}:{tick}</li>
