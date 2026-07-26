import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App.js';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

export async function renderApp(props: HydrationBenchmarkProps = {}) {
	return { head: '', body: renderToString(createElement(App, props)), css: '' };
}
