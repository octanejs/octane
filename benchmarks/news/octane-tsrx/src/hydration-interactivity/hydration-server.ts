import { renderToString } from 'octane/server';
import { App } from './App.tsrx';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

export async function renderApp(props: HydrationBenchmarkProps = {}) {
	const { html, css } = renderToString(App, props);
	return { head: '', body: html, css };
}
