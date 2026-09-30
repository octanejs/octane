import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import { PuckRenderProbe } from '../_fixtures/puck-render-probe.tsrx';
import { PuckEditorProbe } from '../_fixtures/puck-editor-probe.tsrx';

describe('@octanejs/puck — render contract', () => {
	let root: ReturnType<typeof mount> | undefined;

	afterEach(function cleanup() {
		root?.unmount();
		root = undefined;
	});

	it('renders configured content via Render', () => {
		root = mount(PuckRenderProbe);
		flushEffects();
		flushSync(function flush() {});

		expect(root.container.querySelector('h1')?.textContent).toBe('Hello Puck');
	});

	it('renders the components stored in a slot field via Render', () => {
		root = mount(PuckRenderProbe);
		flushEffects();
		flushSync(function flush() {});

		expect(root.container.querySelector('.columns h1')?.textContent).toBe('Inside a slot');
	});

	it('mounts the full Puck editor shell', () => {
		root = mount(PuckEditorProbe);
		flushEffects();
		flushSync(function flush() {});

		expect(root.container.querySelector('#root')).toBeTruthy();
	});
});
