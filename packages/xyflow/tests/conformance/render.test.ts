import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import { XyflowDiff } from '../_fixtures/xyflow-diff.tsrx';

describe('@octanejs/xyflow — render contract', () => {
	let root: ReturnType<typeof mount> | undefined;

	afterEach(() => {
		root?.unmount();
		root = undefined;
	});

	it('renders nodes inside the flow viewport', () => {
		root = mount(XyflowDiff);
		flushEffects();
		flushSync(function flush() {});

		expect(root.container.querySelector('.react-flow')).not.toBeNull();
		expect(root.container.querySelectorAll('.react-flow__node').length).toBeGreaterThan(0);
	});
});
