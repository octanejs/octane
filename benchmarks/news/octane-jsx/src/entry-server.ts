import { render } from 'octane/server';
import { App } from './App.tsx';

// SSR entry. The harness loads this via ssrLoadModule and times renderApp().
export async function renderApp(): Promise<{ head: string; body: string; css: string }> {
	const { head, body, css } = await render(App);
	return { head, body, css };
}
