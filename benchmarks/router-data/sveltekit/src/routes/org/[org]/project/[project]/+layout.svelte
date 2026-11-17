<script>
	let { data, children } = $props();
</script>

<section class="project" data-project={data.id}>
	<h2>{data.name}</h2>
	{@render children()}
</section>
