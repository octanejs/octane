import { renderToString } from 'octane/server';
import { Shell } from './Shell.tsrx';

export function render() {
	return renderToString(Shell, {}).html;
}
