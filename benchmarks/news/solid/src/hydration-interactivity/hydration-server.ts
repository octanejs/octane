import { generateHydrationScript, renderToString } from '@solidjs/web';
import { App } from './App.tsrx';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

export async function renderApp(props: HydrationBenchmarkProps = {}) {
	return {
		head: generateHydrationScript(),
		body: renderToString(() => App(props)),
		css: '',
	};
}
