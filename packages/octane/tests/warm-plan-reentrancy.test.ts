import { expect, it } from 'vitest';
import { act, mount, type MountResult } from './_helpers';
import {
	AdjacentPanelsHost,
	IndependentWarmPanels,
	IndependentWarmRoot,
} from './_fixtures/parallel-use.tsrx';

function resources(onStart?: (name: string) => void) {
	const requests: Array<{ name: string; resolve(value: string): void }> = [];
	return {
		requests,
		load(name: string, version = 0) {
			onStart?.(name);
			return new Promise<string>((resolve) =>
				requests.push({ name: `${name}:${version}`, resolve }),
			);
		},
		settle() {
			for (const request of requests) request.resolve(request.name);
		},
	};
}

it('keeps independent requests and results isolated when a loader renders another root', async () => {
	const secondary = resources();
	let nested: MountResult | undefined;
	let entered = false;
	const primary = resources((name) => {
		if (name !== 'activity-summary' || entered) return;
		entered = true;
		nested = mount(IndependentWarmRoot, {
			content: IndependentWarmPanels,
			load: secondary.load,
		});
	});
	const root = mount(AdjacentPanelsHost, { load: primary.load, version: 0 });
	try {
		expect(entered).toBe(true);
		expect(root.find('.fallback').textContent).toBe('panels-loading');
		expect(primary.requests.map((request) => request.name).sort()).toEqual([
			'activity-summary:0',
			'activity:0',
			'insights-chart:0',
			'insights:0',
		]);
		expect(secondary.requests.map((request) => request.name)).toEqual(['first:0', 'second:0']);
		expect(nested!.find('.first-pending').textContent).toBe('first pending');
		expect(nested!.find('.second-pending').textContent).toBe('second pending');

		await act(() => secondary.settle());
		const nestedNodes = nested!.findAll('.independent-warm-value');
		expect(nestedNodes.map((node) => node.textContent)).toEqual(['first:0', 'second:0']);
		expect(root.find('.fallback').textContent).toBe('panels-loading');
		await act(() => primary.settle());
		expect(root.find('.activity-value').textContent).toBe('activity:0');
		expect(root.find('.activity-summary').textContent).toBe('activity-summary:0');
		expect(root.find('.insights-value').textContent).toBe('insights:0');
		expect(root.find('.insights-chart').textContent).toBe('insights-chart:0');

		root.update(AdjacentPanelsHost, { load: primary.load, version: 1 });
		await act(() => primary.settle());
		expect(root.find('.activity-value').textContent).toBe('activity:1');
		expect(root.find('.activity-summary').textContent).toBe('activity-summary:1');
		expect(root.find('.insights-value').textContent).toBe('insights:1');
		expect(root.find('.insights-chart').textContent).toBe('insights-chart:1');
		expect(primary.requests.map((request) => request.name).sort()).toEqual([
			'activity-summary:0',
			'activity-summary:1',
			'activity:0',
			'activity:1',
			'insights-chart:0',
			'insights-chart:1',
			'insights:0',
			'insights:1',
		]);
		expect(secondary.requests.map((request) => request.name)).toEqual(['first:0', 'second:0']);
		const survivingNodes = nested!.findAll('.independent-warm-value');
		expect(survivingNodes[0]).toBe(nestedNodes[0]);
		expect(survivingNodes[1]).toBe(nestedNodes[1]);
		expect(survivingNodes.map((node) => node.textContent)).toEqual(['first:0', 'second:0']);
	} finally {
		nested?.unmount();
		root.unmount();
	}
});
