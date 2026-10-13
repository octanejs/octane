import { renderToString } from 'octane/server';
import { shellProps } from './props.ts';
import { Shell } from './shell.tsrx';

// Built by the harness for the server to produce the markup that the
// split-shell client hydrates. It is never measured.
export function render(): string {
	return renderToString(Shell, shellProps()).html;
}
