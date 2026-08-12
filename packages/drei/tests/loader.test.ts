import * as React from 'react';
import { act as reactAct } from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { Loader as ReactLoader } from '@react-three/drei/web/Loader.js';
import { useProgress as reactUseProgress } from '@react-three/drei/core/Progress.js';
import { act as octaneAct, createRoot as createOctaneRoot } from 'octane';
import { useProgress as octaneUseProgress } from '@octanejs/drei';
import { describe, expect, it } from 'vitest';
import { LoaderScene } from './_fixtures/loader.tsrx';

function snapshot(container: HTMLElement) {
	const outer = container.firstElementChild as HTMLElement;
	const inner = outer.firstElementChild!.firstElementChild as HTMLElement;
	const bar = inner.firstElementChild as HTMLElement;
	const data = inner.lastElementChild as HTMLElement;
	return {
		text: data.innerText,
		outerStyle: outer.getAttribute('style'),
		barStyle: bar.getAttribute('style'),
	};
}

describe('Loader', () => {
	it('matches React progress text, merged styles, and bar transform', async () => {
		const options = {
			containerStyles: { background: 'navy' },
			barStyles: { background: 'lime' },
			dataInterpolation: (progress: number) => `Ready ${progress.toFixed(1)}`,
			initialState: () => true,
		};
		reactUseProgress.setState({ active: true, progress: 100 });
		octaneUseProgress.setState({ active: true, progress: 100 });
		const reactContainer = document.createElement('div');
		const reactRoot = createReactRoot(reactContainer);
		await reactAct(async () => reactRoot.render(React.createElement(ReactLoader, options)));
		const octaneContainer = document.createElement('div');
		const octaneRoot = createOctaneRoot(octaneContainer);
		await octaneAct(() => octaneRoot.render(LoaderScene, options));
		await Promise.resolve();
		expect(snapshot(octaneContainer)).toEqual(snapshot(reactContainer));
		(octaneContainer.querySelector('span') as HTMLElement).innerText = 'mutated';
		expect(snapshot(octaneContainer)).not.toEqual(snapshot(reactContainer));
		octaneRoot.unmount();
		await reactAct(async () => reactRoot.unmount());
	});
});
