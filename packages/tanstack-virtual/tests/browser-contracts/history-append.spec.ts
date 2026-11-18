import { expect, test } from '@playwright/test';

// #2860: the reconcile frame queued by the chat fixture's initial scrollToEnd()
// must not pull a reader who scrolled up back to the old end after an append.
test('a held initial scrollToEnd frame does not leave history after an append', async ({
	page,
}) => {
	// Hold every animation frame queued in the task that mounts the chat, which
	// includes the reconcile frame scheduled by the mount-time scrollToEnd().
	await page.addInitScript(() => {
		const held: FrameRequestCallback[] = [];
		const request = window.requestAnimationFrame.bind(window);
		let holding: boolean | null = null;
		window.requestAnimationFrame = (callback) => {
			if (holding === null) {
				holding = true;
				queueMicrotask(() => (holding = false));
			}
			if (!holding) return request(callback);
			held.push(callback);
			return 0;
		};
		Object.assign(window, {
			__heldFrames: () => held.length,
			__releaseFrames: () => {
				for (const callback of held.splice(0)) request(callback);
			},
		});
	});
	await page.goto('/chat/');
	expect(await page.evaluate(() => (window as any).__heldFrames())).toBeGreaterThan(0);

	const scroller = page.locator('#scroll-container');
	const firstVisible = () =>
		scroller.evaluate((container) => {
			const top = container.getBoundingClientRect().top;
			return Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]')).find(
				(node) => node.getBoundingClientRect().bottom > top + 1,
			)?.dataset.messageId;
		});
	const state = () =>
		scroller.evaluate((el) => ({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight }));

	await scroller.evaluate((el) => (el.scrollTop = 350));
	await expect.poll(firstVisible).toBe('m-7');
	expect(await state()).toEqual({ scrollTop: 350, scrollHeight: 1500 });

	await page.click('#append');
	await expect.poll(state).toEqual({ scrollTop: 350, scrollHeight: 1550 });

	await page.evaluate(() => (window as any).__releaseFrames());
	await page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
	);
	expect(await state()).toEqual({ scrollTop: 350, scrollHeight: 1550 });
	expect(await firstVisible()).toBe('m-7');
});
