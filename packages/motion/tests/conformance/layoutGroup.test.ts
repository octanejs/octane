import { afterEach, describe, expect, it, vi } from 'vitest';

const { animateMock } = vi.hoisted(() => ({
	animateMock: vi.fn(() => ({ stop: vi.fn() })),
}));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
	inView: vi.fn(() => vi.fn()),
}));

import { mount, nextPaint } from '../_helpers';
import {
	GroupedHero,
	GroupedHeroSwitch,
	GroupedNamedHero,
	NestedGroupId,
} from '../_fixtures/layout-group.tsrx';

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

afterEach(() => {
	Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
	animateMock.mockClear();
});

describe('LayoutGroup', () => {
	it('keeps same-commit shared layout switches working inside one group', async () => {
		Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
			return this.id === 'grouped-hero-before'
				? { left: 0, top: 0, width: 100, height: 100 }
				: { left: 200, top: 0, width: 100, height: 100 };
		});

		const result = mount(GroupedHeroSwitch, { active: 'before' });
		await nextPaint();
		animateMock.mockClear();
		result.update(GroupedHeroSwitch, { active: 'after' });
		await nextPaint();

		const hero = result.find('#grouped-hero-after');
		expect(hero.style.transform).toContain('translate(-200px, 0px)');
		expect(animateMock).toHaveBeenCalledWith(
			hero,
			{ transform: 'translate(0px, 0px) scale(1, 1)' },
			{ duration: 0.2 },
		);
		result.unmount();
	});

	it('does not animate a reopened fixed-id group from its stale box', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 100 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);

		const first = mount(GroupedHero, { groupId: 'pipeline-environments' });
		await nextPaint();
		first.unmount();
		await Promise.resolve();

		box = { left: 200, top: 0, width: 100, height: 100 };
		animateMock.mockClear();
		const second = mount(GroupedHero, { groupId: 'pipeline-environments' });
		await nextPaint();
		expect(second.find('#grouped-hero').style.transform).toBe('');
		expect(animateMock).not.toHaveBeenCalled();
		second.unmount();
	});

	it('isolates equal layoutIds between named groups', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 100 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);

		const first = mount(GroupedHero, { groupId: 'first' });
		await nextPaint();
		first.unmount();

		box = { left: 200, top: 0, width: 100, height: 100 };
		animateMock.mockClear();
		const second = mount(GroupedHero, { groupId: 'second' });
		expect(second.find('#grouped-hero').style.transform).toBe('');
		expect(animateMock).not.toHaveBeenCalled();
		second.unmount();

		box = { left: 300, top: 0, width: 100, height: 100 };
		const matching = mount(GroupedHero, { groupId: 'first' });
		expect(matching.find('#grouped-hero').style.transform).toContain('translate(-300px, 0px)');
		expect(animateMock).toHaveBeenCalled();
		matching.unmount();
	});

	it('updates the layoutId namespace when the group id changes', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 100 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);

		const result = mount(GroupedHero, { groupId: 'switch-before' });
		await nextPaint();

		box = { left: 100, top: 0, width: 100, height: 100 };
		result.update(GroupedHero, { groupId: 'switch-after' });
		await nextPaint();
		result.unmount();

		box = { left: 300, top: 0, width: 100, height: 100 };
		animateMock.mockClear();
		const matching = mount(GroupedHero, { groupId: 'switch-after' });
		expect(matching.find('#grouped-hero').style.transform).toContain('translate(-200px, 0px)');
		expect(animateMock).toHaveBeenCalled();
		matching.unmount();
	});

	it('does not publish a snapshot when a mounted element changes namespaces', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 100 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);

		const survivor = mount(GroupedHero, { groupId: 'before' });
		await nextPaint();
		box = { left: 100, top: 0, width: 100, height: 100 };
		survivor.update(GroupedHero, { groupId: 'after' });

		box = { left: 300, top: 0, width: 100, height: 100 };
		animateMock.mockClear();
		const oldNamespace = mount(GroupedHero, { groupId: 'before' });

		expect(oldNamespace.find('#grouped-hero').style.transform).toBe('');
		expect(animateMock).not.toHaveBeenCalled();
		oldNamespace.unmount();
		survivor.unmount();
	});

	it('keeps separator-colliding group and layout ids isolated', async () => {
		let box: any = { left: 0, top: 0, width: 100, height: 100 };
		Element.prototype.getBoundingClientRect = vi.fn(() => box);

		const first = mount(GroupedNamedHero, { groupId: 'a-b', layoutId: 'c' });
		await nextPaint();
		first.unmount();

		box = { left: 200, top: 0, width: 100, height: 100 };
		animateMock.mockClear();
		const collision = mount(GroupedNamedHero, { groupId: 'a', layoutId: 'b-c' });
		expect(collision.find('#grouped-named-hero').style.transform).toBe('');
		expect(animateMock).not.toHaveBeenCalled();
		collision.unmount();

		box = { left: 300, top: 0, width: 100, height: 100 };
		const matching = mount(GroupedNamedHero, { groupId: 'a-b', layoutId: 'c' });
		expect(matching.find('#grouped-named-hero').style.transform).toContain(
			'translate(-300px, 0px)',
		);
		expect(animateMock).toHaveBeenCalled();
		matching.unmount();
	});

	it('preserves the public flattened LayoutGroup id', () => {
		const result = mount(NestedGroupId);
		expect(result.find('#layout-group-id').textContent).toBe('a-b-c');
		result.unmount();
	});
});
