import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { App } from './_fixtures/capture-events.tsrx';

// Regression: `onXxxCapture` handlers must fire in the CAPTURE phase (root→target),
// before bubble handlers. Previously the compiler lowered `onClickCapture` to a dead
// `$$clickcapture` slot + a never-fired `clickcapture` delegated event.
describe('onXxxCapture — capture-phase delegated handlers', () => {
	it('fires capture root→target, then bubble target→root', () => {
		const log: string[] = [];
		const r = mount(App as any, { log: (m: string) => log.push(m) });
		r.click('.inner');
		expect(log).toEqual(['outer-capture', 'inner-capture', 'inner-bubble', 'outer-bubble']);
		r.unmount();
	});
});
