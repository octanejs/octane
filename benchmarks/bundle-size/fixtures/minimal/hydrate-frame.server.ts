import { renderToString } from 'octane/server';
import { Frame } from './hydrate-frame-app.tsrx';
import { frameProps } from './hydrate-frame-props.ts';

// Built by the harness for the server to produce the markup that the
// hydrate-frame client scenario adopts. It is never measured.
export function render(): string {
	return renderToString(Frame, frameProps()).html;
}
