import { renderToString } from 'inferno-server';
import { createElement } from 'inferno-create-element';
import { App } from './App.jsx';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

export async function renderApp(props: HydrationBenchmarkProps = {}) {
	return { head: '', body: renderToString(createElement(App, props)), css: '' };
}
