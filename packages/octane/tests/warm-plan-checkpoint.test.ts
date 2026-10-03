import { expect, it } from 'vitest';
import { act, mount } from './_helpers';
import { FullCheckpointFrame, LiteCheckpointHost } from './_fixtures/warm-plan-checkpoint.tsrx';

function resources() {
	const started: string[] = [];
	let setBumper: ((version: number) => void) | undefined;
	let settle: (() => void) | undefined;
	return {
		started,
		load(name: string, version: number): Promise<string> {
			const value = `${name}:${version}`;
			started.push(value);
			if (name === 'bumper' && version > 0) {
				return new Promise<string>((resolve) => {
					settle = () => resolve(value);
				});
			}
			return Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
		},
		expose(set: (version: number) => void) {
			setBumper = set;
		},
		bump(version: number) {
			setBumper!(version);
		},
		settle() {
			settle!();
		},
	};
}

// A frame's warm plan lives only while that frame renders. Once the frame
// returns, a descendant that re-renders alone and suspends must not run the
// frame's plan, which would start the frame's other requests again.
it.each([
	['a full render frame', FullCheckpointFrame],
	['a lite render frame', LiteCheckpointHost],
])('drops the warm plan of %s when its render returns', async (_, Frame) => {
	const requests = resources();
	const root = mount(Frame, { load: requests.load, version: 1, expose: requests.expose });
	try {
		expect(root.find('.checkpoint-leaf').textContent).toBe('leaf:1');
		expect(root.find('.checkpoint-bumper').textContent).toBe('bumper:0');
		expect(requests.started).toEqual(['leaf:1', 'bumper:0']);

		await act(() => requests.bump(1));
		expect(root.find('.checkpoint-pending').textContent).toBe('pending');
		expect(root.find('.checkpoint-leaf').textContent).toBe('leaf:1');
		expect(requests.started).toEqual(['leaf:1', 'bumper:0', 'bumper:1']);

		await act(() => requests.settle());
		expect(root.find('.checkpoint-bumper').textContent).toBe('bumper:1');
		expect(root.find('.checkpoint-leaf').textContent).toBe('leaf:1');
		expect(requests.started).toEqual(['leaf:1', 'bumper:0', 'bumper:1']);
	} finally {
		root.unmount();
	}
});
