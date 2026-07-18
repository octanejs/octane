import { createRoot as createOctaneRoot } from '../../../src/index.js';
import { createRoot as createReactRoot, type Root as ReactRoot } from 'react-dom/client';
import { createElement } from 'react';
import * as OctaneFixture from '../../_fixtures/native-change-matrix.tsrx';
import * as ReactFixture from 'virtual:native-change-react-fixture';

type RuntimeName = 'octane' | 'react';

type BrowserEventRecord = {
	label: string;
	type: string;
	nativeType: string;
	value: string;
	checked: boolean | null;
	cancelable: boolean;
	defaultPrevented: boolean;
	radios: boolean[];
};

type BrowserState = {
	inputs: Array<{ value: string; checked: boolean; type: string }>;
	output: string;
};

const containers: Record<RuntimeName, HTMLElement> = {
	octane: document.querySelector('#octane-root')!,
	react: document.querySelector('#react-root')!,
};
const logs: Record<RuntimeName, BrowserEventRecord[]> = { octane: [], react: [] };

let octaneRoot: ReturnType<typeof createOctaneRoot> | null = null;
let reactRoot: ReactRoot | null = null;

function record(runtime: RuntimeName, label: string, event: Event): void {
	const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
	const nativeEvent = (event as Event & { nativeEvent?: Event }).nativeEvent ?? event;
	logs[runtime].push({
		label,
		type: event.type,
		nativeType: nativeEvent.type,
		value: target.value,
		checked: 'checked' in target ? target.checked : null,
		cancelable: event.cancelable,
		defaultPrevented: event.defaultPrevented,
		radios: Array.from(
			containers[runtime].querySelectorAll<HTMLInputElement>('input[type="radio"]'),
		).map((radio) => radio.checked),
	});
}

function mount(name: string): void {
	octaneRoot?.unmount();
	reactRoot?.unmount();
	containers.octane.replaceChildren();
	containers.react.replaceChildren();
	logs.octane.length = 0;
	logs.react.length = 0;

	const OctaneComponent = (OctaneFixture as Record<string, any>)[name];
	const ReactComponent = (ReactFixture as Record<string, any>)[name];
	if (!OctaneComponent || !ReactComponent) throw new Error(`Unknown matrix export: ${name}`);

	octaneRoot = createOctaneRoot(containers.octane);
	octaneRoot.render(OctaneComponent, {
		record: (label: string, event: Event) => record('octane', label, event),
	});
	reactRoot = createReactRoot(containers.react);
	reactRoot.render(
		createElement(ReactComponent, {
			record: (label: string, event: Event) => record('react', label, event),
		}),
	);
}

function state(runtime: RuntimeName): BrowserState {
	return {
		inputs: Array.from(containers[runtime].querySelectorAll<HTMLInputElement>('input')).map(
			(input) => ({ value: input.value, checked: input.checked, type: input.type }),
		),
		output: containers[runtime].querySelector('output')?.textContent ?? '',
	};
}

window.__nativeChangeMatrix = { mount, logs, state };

declare global {
	interface Window {
		__nativeChangeMatrix: {
			mount(name: string): void;
			logs: Record<RuntimeName, BrowserEventRecord[]>;
			state(runtime: RuntimeName): BrowserState;
		};
	}
}
