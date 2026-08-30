import { renderToString } from 'octane/server';
import { DeepWrapperChain } from './fixture.tsrx';

export function renderCase(depth: number): string {
	return renderToString(DeepWrapperChain, { depth }).html;
}
