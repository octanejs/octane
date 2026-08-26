import { createTestRenderer, type TestRendererOptions } from '@opentui/core/testing';
import type { UniversalComponent } from 'octane/universal';
import { act } from './scheduling.js';
import { createRoot, type Root } from './root.js';

export function testRender(
	component: UniversalComponent<void | undefined>,
	options: TestRendererOptions,
): ReturnType<typeof createTestRenderer>;
export function testRender<P>(
	component: UniversalComponent<P>,
	props: P,
	options: TestRendererOptions,
): ReturnType<typeof createTestRenderer>;
export async function testRender<P>(
	component: UniversalComponent<P>,
	propsOrOptions: P | TestRendererOptions,
	maybeOptions?: TestRendererOptions,
): ReturnType<typeof createTestRenderer> {
	const props = maybeOptions === undefined ? undefined : (propsOrOptions as P);
	const options = (maybeOptions ?? propsOrOptions) as TestRendererOptions;
	let root: Root | null = null;
	const testSetup = await createTestRenderer({
		...options,
		onDestroy() {
			root?.unmount();
			root = null;
			options.onDestroy?.();
		},
	});
	root = createRoot(testSetup.renderer);
	await act(() => {
		if (root === null) return;
		if (maybeOptions === undefined) root.render(component as UniversalComponent<void>);
		else root.render(component, props as P);
	});
	return testSetup;
}
