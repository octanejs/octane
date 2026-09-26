import { StreamedShellSurrogate } from '../../packages/octane/tests/hydration/_fixtures/streamed-static-shell-client.ts';
import { hydrate } from './streamed-hydrate.ts';

export function start(container: Element, props: Parameters<typeof StreamedShellSurrogate>[0]) {
	return hydrate(container, StreamedShellSurrogate, props);
}
