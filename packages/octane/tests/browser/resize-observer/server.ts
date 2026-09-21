import { renderToString } from 'octane/server';
import { ResizeFeedback } from '../../_fixtures/resize-observer.tsrx';

export function render(): string {
	return renderToString(ResizeFeedback, {
		observe: true,
		expose() {},
		ready() {},
	}).html;
}
