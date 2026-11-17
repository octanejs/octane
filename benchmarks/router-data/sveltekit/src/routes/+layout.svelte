<script>
	let { children } = $props();
</script>

<div class="shell" data-sveltekit-preload-data="hover">
	<nav>
		<a id="l-home" href="/">Home</a>
		<a id="l-cold" href="/org/1/project/2/task/3">Task 3</a>
		<a id="l-sib" href="/org/1/project/2/task/4">Task 4</a>
		<a id="l-tab" href="/org/1/project/2/task/4?tab=b">Task 4, tab b</a>
		<a id="l-pre" href="/org/5/project/6/task/7">Task 7</a>
	</nav>
	{@render children()}
</div>
