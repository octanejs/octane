import { createElement } from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { createRoot as createOctaneRoot, flushSync } from 'octane';
import OctaneTextareaAutosize from '../../src/index.tsrx';
import ReactTextareaAutosize from '../../upstream/src/index.tsx';

type Runtime = 'octane' | 'react';
type Observation = { heights: number[]; order: string[] };

const observations: Record<Runtime, Observation> = {
	octane: { heights: [], order: [] },
	react: { heights: [], order: [] },
};

const style = {
	boxSizing: 'border-box' as const,
	borderTopWidth: '1px',
	borderBottomWidth: '1px',
	fontFamily: 'Arial, sans-serif',
	fontSize: '16px',
	lineHeight: '20px',
	overflow: 'hidden',
	paddingTop: '4px',
	paddingBottom: '4px',
	width: '180px',
};

function props(runtime: Runtime) {
	const observation = observations[runtime];
	return {
		'aria-label': `${runtime} message`,
		defaultValue: 'one',
		form: `${runtime}-form`,
		maxRows: 4,
		minRows: 2,
		style,
		onHeightChange(height: number) {
			observation.heights.push(height);
			observation.order.push(`height:${height}`);
		},
		onInputCapture() {
			observation.order.push('input:capture');
		},
		onChangeCapture() {
			observation.order.push('change:capture');
		},
		onInput() {
			observation.order.push('input');
		},
		onChange() {
			observation.order.push('change');
		},
	};
}

const octaneRoot = createOctaneRoot(document.querySelector('#octane-root')!);
octaneRoot.render(OctaneTextareaAutosize, props('octane'));
flushSync(() => {});

const reactRoot = createReactRoot(document.querySelector('#react-root')!);
reactRoot.render(createElement(ReactTextareaAutosize, props('react')));

window.__textareaAutosizeParity = {
	resetLogs() {
		for (const observation of Object.values(observations)) {
			observation.heights.length = 0;
			observation.order.length = 0;
		}
	},
	state(runtime) {
		const textarea = document.querySelector(`#${runtime}-root textarea`) as HTMLTextAreaElement;
		return {
			height: textarea.style.height,
			heights: [...observations[runtime].heights],
			order: [...observations[runtime].order],
			value: textarea.value,
			width: getComputedStyle(textarea).width,
		};
	},
};

declare global {
	interface Window {
		__textareaAutosizeParity: {
			resetLogs(): void;
			state(runtime: Runtime): Observation & { height: string; value: string; width: string };
		};
	}
}
