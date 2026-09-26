import { clone, componentSlot, tryBlock, type Scope } from '../../../src/runtime.js';
import { StreamedChild, type StreamedShellProps } from './streamed-static-shell.tsrx';

// Hand-written stand-in for compiler output for this fixed, already-resolved
// server shape. These sites must match the server's compiled component call.
const childSite = 'c:9f51aa73';

function childInBoundary(_props: unknown, scope: Scope, extra?: unknown[]): void {
	const props = extra![0] as StreamedShellProps;
	componentSlot(
		scope,
		0,
		scope.block.parentNode,
		StreamedChild,
		props,
		scope.block.endMarker,
		undefined,
		true,
		false,
		false,
		childSite,
	);
}

function unsupportedPending(): void {
	throw new Error('The test surrogate requires the server boundary to have resolved.');
}

export function StreamedShellSurrogate(props: StreamedShellProps, scope: Scope): void {
	// Clone adopts this already-existing node during hydration and records root
	// ownership. No shell template or static markup is retained here.
	const main = clone(scope.block.parentNode.firstChild!);
	const boundary = main.firstChild!.nextSibling;
	tryBlock(scope, 0, main, childInBoundary, null, unsupportedPending, boundary, [props]);
}
