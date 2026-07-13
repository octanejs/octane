import { nextPaint } from '../../octane/tests/_helpers';

export { mount, nextPaint, flushEffects, createLog } from '../../octane/tests/_helpers';

export async function settle(ms = 60): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
	for (let index = 0; index < 4; index++) {
		await Promise.resolve();
		await nextPaint();
	}
}
