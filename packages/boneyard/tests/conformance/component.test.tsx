/** @jsxImportSource octane */
import { cleanup, render } from '@octanejs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import { Skeleton } from '../../src/index';

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

const bones = {
	name: 'profile',
	width: 300,
	height: 80,
	bones: [
		[0, 0, 20, 20, '50%'],
		[25, 2, 60, 16, 3],
	] as const,
};

describe('@octanejs/boneyard Skeleton', () => {
	// @parity-case differential:boneyard-skeleton
	it('renders documented skeleton geometry and accessibility state', () => {
		const { container } = render(
			<Skeleton name="profile" loading={true} initialBones={bones} animate="solid" />,
		);
		const wrapper = container.querySelector('[data-boneyard="profile"]');
		expect(wrapper?.getAttribute('aria-busy')).toBe('true');
		expect(wrapper?.getAttribute('style')).toContain('height: 80px');
		const rectangles = container.querySelectorAll('[data-boneyard-bone]');
		expect(rectangles).toHaveLength(2);
		expect((rectangles[0] as HTMLElement).style.borderRadius).toBe('50%');
		expect((rectangles[1] as HTMLElement).style.left).toBe('25%');
		expect((rectangles[1] as HTMLElement).style.animation).toBe('none');
	});

	it('shows fallback without bones and children after loading', () => {
		const fallback = render(
			<Skeleton loading={true} fallback={<p>Waiting</p>}>
				<p>Ready</p>
			</Skeleton>,
		);
		expect(fallback.container.textContent).toBe('Waiting');
		fallback.rerender(
			<Skeleton loading={false} fallback={<p>Waiting</p>}>
				<p>Ready</p>
			</Skeleton>,
		);
		expect(fallback.container.textContent).toBe('Ready');
	});

	// @parity-case differential:boneyard-keyed-identity
	it('preserves keyed bone identity when geometry updates', () => {
		const rendered = render(<Skeleton loading={true} initialBones={bones} animate={false} />);
		const firstBone = rendered.container.querySelector('[data-boneyard-bone]')!;
		rendered.rerender(
			<Skeleton
				loading={true}
				initialBones={{ ...bones, bones: [[10, 12, 30, 24, 2], bones.bones[1]] }}
				animate={false}
			/>,
		);
		expect(rendered.container.querySelector('[data-boneyard-bone]')).toBe(firstBone);
		expect((firstBone as HTMLElement).style.left).toBe('10%');
	});
});
