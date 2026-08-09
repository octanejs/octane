import { renderToPipeableStream } from 'octane/server';
import { App } from './App.tsrx';

export function renderApp(options) {
	return renderToPipeableStream(App, {}, options);
}
