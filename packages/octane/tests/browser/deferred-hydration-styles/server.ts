import { renderToString } from 'octane/server';
import { never } from 'octane/hydration';
import { App } from './App.tsrx';

export function render(): string {
	return renderToString(App, { when: never() }).html;
}
