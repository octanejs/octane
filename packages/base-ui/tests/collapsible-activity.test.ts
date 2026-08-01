// Regression: an OPEN keyframe-animated Collapsible.Panel must not replay its open animation
// when an `<Activity>` that hid it becomes visible again.
//
// WHY THIS EXISTS. The port originally dropped upstream's
// `shouldPreventActivityResumeAnimationRef` with a comment asserting "Octane has no Activity".
// That was false: octane exports `Activity`, and its hidden subtree has exactly React's contract
// — the block still renders (state and DOM preserved), `deactivateScope` fires each effect's
// cleanup and clears its deps, and the reveal re-render re-fires them. Upstream's
// teardown-marks / reveal-suppresses mechanism therefore applies unchanged, and omitting it left
// a real defect.
//
// THE PANEL MUST BE CLOSED AND REOPENED BEFORE THE ACTIVITY TEST, and that is the whole trick.
// `shouldPreventMountAnimationRef` is seeded to `open`, so a `defaultOpen` panel suppresses its
// animation from first paint and is only cleared once the panel has CLOSED. A test that merely
// mounts open, hides and reveals therefore passes whether or not the Activity ref exists — the
// mount ref alone satisfies it. The first version of this file made exactly that mistake and
// passed with the fix removed. Closing and reopening clears the mount ref, so the only thing
// that can suppress the animation on reveal is the Activity ref.
//
// WHY IT RUNS IN JSDOM at all, when upstream gates its Activity cases behind `skipIf(isJSDOM)`:
// the suppression only engages when `getAnimationType` sees a css-animation, which needs
// `getComputedStyle` to report an animation name and non-zero duration. jsdom does NOT resolve
// those from a stylesheet rule (it reports `none`/`auto`) but DOES resolve inline styles —
// the same fact upstream's SSR panel tests lean on.
import { describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import { CollapsibleActivityHost as Host } from './_fixtures/collapsible-activity.tsrx';

const AUTHOR_ANIMATION = 'panel-slide-down';

async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

// Scoped to the mount container, never `document`: Collapsible does not portal, and a
// document-wide query silently picks up a panel left behind by an earlier failing case, turning
// one real failure into a cascade of misleading ones.
const panel = (c: HTMLElement) => c.querySelector('[data-testid="panel"]') as HTMLElement | null;
const trigger = (c: HTMLElement) =>
	c.querySelector('[data-slot-test="trigger"]') as HTMLElement | null;

async function clickTrigger(c: HTMLElement): Promise<void> {
	flushSync(() => {
		trigger(c)!.click();
	});
	await settle();
}

describe('Collapsible.Panel inside <Activity>', () => {
	it('does not replay the open keyframe animation when the activity is revealed', async () => {
		const m = mount(Host, { mode: 'visible' });
		try {
			await settle();

			// Clear the first-paint suppression: close, then reopen. After this the panel is open
			// with its author animation intact, so anything suppressing it later can only be the
			// Activity path.
			await clickTrigger(m.container);
			await clickTrigger(m.container);

			expect(panel(m.container)).not.toBe(null);
			expect(panel(m.container)!.style.animationName).toBe(AUTHOR_ANIMATION);

			// Hide. State and DOM survive; effects tear down, which is when the port must record
			// that a reveal would otherwise replay the keyframe.
			m.update(Host, { mode: 'hidden' });
			await settle();

			// Reveal.
			m.update(Host, { mode: 'visible' });
			await settle();

			expect(panel(m.container)).not.toBe(null);
			expect(panel(m.container)!.style.animationName).toBe('none');
			// Only the NAME is overridden — the author's other animation properties survive.
			expect(panel(m.container)!.style.animationDuration).toBe('100ms');
		} finally {
			m.unmount();
		}
	});

	it('suppresses the first paint of an initially open panel', async () => {
		// The pre-existing mount-suppression path, asserted separately so a regression in either
		// ref is distinguishable from a regression in the other.
		const m = mount(Host, { mode: 'visible' });
		try {
			await settle();

			expect(panel(m.container)!.style.animationName).toBe('none');
		} finally {
			m.unmount();
		}
	});

	it('lets the animation run on an ordinary reopen that no activity hid', async () => {
		// Guards the other direction: suppression must be one-shot, not permanent. Without this,
		// an implementation that simply never animates would pass the test above.
		const m = mount(Host, { mode: 'visible' });
		try {
			await settle();

			await clickTrigger(m.container);
			await clickTrigger(m.container);

			expect(panel(m.container)!.style.animationName).toBe(AUTHOR_ANIMATION);
		} finally {
			m.unmount();
		}
	});
});
