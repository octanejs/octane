// Chrome fires `blur`/`focusout` SYNCHRONOUSLY inside removeChild when the
// focused element's subtree is removed ("Perhaps it was moved in a 'blur' event
// handler?"). blur is a DISCRETE event, so dispatchDelegated's end-of-dispatch
// flush would re-enter the scheduler MID-COMMIT — draining queued renders and
// effects while the outer removal walk holds cached nextSibling pointers, which
// then corrupts the walk (removeChild: "not a child"). jsdom never fires blur on
// removal, so this test replays Chrome's behavior by patching the parent's
// removeChild to dispatch a native blur at the focused descendant first.
import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { NavApp } from './_fixtures/blur-during-teardown.tsrx';

describe('discrete events dispatched during an in-progress flush', () => {
	it('blur fired inside the teardown removeChild does not flush re-entrantly', () => {
		const r = mount(NavApp);
		const container = r.container;
		const app = r.find('.app') as HTMLElement;
		const anchor = r.find('.lnk') as HTMLElement;

		// Replay Chrome: removing a subtree that contains the focused element
		// fires blur at that element synchronously, BEFORE the node detaches.
		const originalRemoveChild = app.removeChild.bind(app);
		let blurFired = false;
		(app as any).removeChild = (child: Node) => {
			if (!blurFired && (child === anchor || child.contains(anchor))) {
				blurFired = true;
				anchor.dispatchEvent(new Event('blur')); // non-bubbling, like the real one
			}
			return originalRemoveChild(child);
		};

		// Click "go" → discrete flush commits the page swap → teardown removes the
		// hero section → (patched) blur fires mid-walk → its setState must defer to
		// the ambient flush, not commit re-entrantly.
		(r.find('.go') as HTMLElement).click();

		expect(blurFired).toBe(true);
		// The swap committed exactly once: home branch fully gone, docs branch
		// present once, and the blur handler's update also landed (blurs === 1).
		expect(container.querySelectorAll('.hero').length).toBe(0);
		expect(container.querySelectorAll('.strip').length).toBe(0);
		const docs = container.querySelectorAll('.docs');
		expect(docs.length).toBe(1);
		expect(docs[0].textContent).toBe('docs 1');
		r.unmount();
	});
});
