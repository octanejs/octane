import { render } from 'svelte/server';
import App from './App.svelte';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

export async function renderApp(props: HydrationBenchmarkProps = {}) {
	const { body, head } = render(App, { props });
	return { head, body, css: '' };
}
