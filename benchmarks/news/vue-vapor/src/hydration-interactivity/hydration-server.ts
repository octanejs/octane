import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import App from './App.vue';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

export async function renderApp(props: HydrationBenchmarkProps = {}) {
	return { head: '', body: await renderToString(createSSRApp(App, props)), css: '' };
}
