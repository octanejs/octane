<script>
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { rename } from '../../../../../../../../../shared/api.js';

	let { data } = $props();
	const tab = $derived(page.url.searchParams.get('tab') ?? 'a');

	async function onsubmit(event) {
		event.preventDefault();
		const title = String(new FormData(event.currentTarget).get('title'));
		await rename(data.id, title);
		await invalidate(`task:${data.id}`);
	}
</script>

<article class="task" data-task={data.id} data-tab={tab}>
	<h2 class="task-title" data-title={data.title}>{data.title}</h2>
	<form class="rename" method="post" {onsubmit}>
		<input name="title" />
		<button type="submit">Save</button>
	</form>
</article>
