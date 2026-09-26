import { hydrateRoot, type ComponentBody } from 'octane';
import { bootstrapStreamedSignalHydration } from 'octane/hydration/streamed-signals';
import type { StreamedShellProps } from '../../packages/octane/tests/hydration/_fixtures/streamed-static-shell.tsrx';

// The same generic entry path is used by both variants. The behavioral suite
// supplies the stream and tests the owner join before/after a second value.
export function hydrate(
	container: Element,
	component: ComponentBody<StreamedShellProps>,
	props: StreamedShellProps,
) {
	const hydration = bootstrapStreamedSignalHydration({
		buildId: 'shell-build',
		documentId: 'shell-document',
	});
	const root = hydrateRoot(container, component, props, { signalOwner: hydration.signalOwner });
	return { root, hydration };
}
