import { renderToString } from 'octane/server';
import { TextTypes } from './text-types.tsrx';

export async function render(props: Parameters<typeof TextTypes>[0]): Promise<string> {
	return (await renderToString(TextTypes, props)).html;
}
