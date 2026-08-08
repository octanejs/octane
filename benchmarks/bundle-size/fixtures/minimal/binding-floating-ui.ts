import { computePosition } from '@octanejs/floating-ui';

export async function run(container: HTMLElement) {
	const reference = container.ownerDocument.createElement('button');
	const floating = container.ownerDocument.createElement('div');
	const result = await computePosition(reference, floating, {
		placement: 'bottom',
		platform: {
			getElementRects: async () => ({
				reference: { x: 10, y: 20, width: 40, height: 10 },
				floating: { x: 0, y: 0, width: 20, height: 5 },
			}),
			isRTL: async () => false,
		},
	});
	return { x: result.x, y: result.y, placement: result.placement };
}
