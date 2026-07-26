import { createElement } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { App } from './App.jsx';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

export async function renderApp(props: HydrationBenchmarkProps = {}) {
	return { head: '', body: renderToString(createElement(App, props)), css: '' };
}
