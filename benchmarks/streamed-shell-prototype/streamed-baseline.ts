import { StreamedStaticShell } from '../../packages/octane/tests/hydration/_fixtures/streamed-static-shell.tsrx';
import { hydrate } from './streamed-hydrate.ts';

export function start(container: Element, props: Parameters<typeof StreamedStaticShell>[0]) {
	return hydrate(container, StreamedStaticShell, props);
}
