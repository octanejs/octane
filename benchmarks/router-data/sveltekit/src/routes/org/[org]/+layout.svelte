<script>
	let { data, children } = $props();
</script>

<section class="org" data-org={data.id}>
	<h1>{data.name}</h1>
	{@render children()}
</section>
