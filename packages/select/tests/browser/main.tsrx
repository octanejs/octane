import './main.mjs';

import React from 'react';
import ReactSelect from 'react-select';
import makeReactAnimated from 'react-select/animated';
import { createRoot as createReactRoot } from 'react-dom/client';
import { flushSync as flushReact } from 'react-dom';
import { useStateManager as useReactStateManager } from 'react-select';
import { useAsync as useReactAsync } from 'react-select/async';
import ReactAsyncCreatableSelect from 'react-select/async-creatable';
import { createRoot, delegateEvents, flushSync } from 'octane';

import { MenuPortal, type MenuPortalProps } from '../../src/components.tsrx';
import { defaultStyles } from '../../src/default-styles';
import { defaultTheme } from '../../src/theme';
import { classNames } from '../../src/utils';
import { StateManagerFixture, type StateManagerResult } from './state-manager-fixture.tsrx';
import { AsyncFixture, type AsyncOption, type AsyncResult } from './async-fixture.tsrx';
import { BrowserSelectFixture, type BrowserSelectOption } from './select-fixture.tsrx';
import { MultiSelectFixture } from './multi-select-fixture.tsrx';
import { NonceFixture } from '../nonce-fixture.tsrx';
import makeAnimated from '../../src/animated/index';
import AsyncCreatableSelect from '../../src/async-creatable.tsrx';
import type { SelectInstance } from '../../src/index';

delegateEvents([
	'click',
	'compositionend',
	'compositionstart',
	'focusin',
	'focusout',
	'input',
	'keydown',
	'mousedown',
	'mousemove',
	'mouseover',
]);

const rootElement = document.getElementById('root');
const portalTarget = document.getElementById('portal-target');
if (!rootElement || !portalTarget) throw new Error('missing browser fixture roots');

const controlElement = document.createElement('div');
controlElement.id = 'control-element';
document.body.appendChild(controlElement);

let rect = { left: 40, width: 180, top: 50, bottom: 80, height: 30 };
controlElement.getBoundingClientRect = () => ({
	...rect,
	right: rect.left + rect.width,
	x: rect.left,
	y: rect.top,
	toJSON: () => ({}),
});

const common = {
	className: 'consumer-portal',
	cx: (state: Record<string, boolean>, ...names: (string | undefined)[]) => classNames(
		'probe',
		state,
		...names.filter((name): name is string => name !== undefined),
	),
	getClassNames: (name: string) => `custom-${name}`,
	getStyles: (name: string, componentProps: unknown) =>
		defaultStyles[name as keyof typeof defaultStyles](componentProps as never, false),
	hasValue: false,
	isMulti: false,
	isRtl: false,
	selectProps: { controlShouldRenderValue: true },
	theme: defaultTheme,
};

const root = createRoot(rootElement);

function render(appendTo: HTMLElement | undefined, menuPosition: 'absolute' | 'fixed') {
	const props: MenuPortalProps = {
		...common,
		appendTo,
		controlElement,
		innerProps: { id: 'menu-portal', 'data-contract': 'forwarded' },
		menuPlacement: 'bottom',
		menuPosition,
		children: <span>Portal child</span>,
	};
	root.render(MenuPortal, props);
	flushSync(() => {});
}

function snapshot() {
	const element = document.getElementById('menu-portal');
	if (!element) return null;
	const style = getComputedStyle(element);
	return {
		child: element.textContent,
		forwarded: element.getAttribute('data-contract'),
		id: element.id,
		parent: element.parentElement?.id,
		position: style.position,
		left: style.left,
		top: style.top,
		width: style.width,
		zIndex: style.zIndex,
	};
}

render(portalTarget, 'absolute');

window.__reactSelectPortal = {
	snapshot,
	async moveControl() {
		rect = { left: 75, width: 240, top: 90, bottom: 130, height: 40 };
		window.dispatchEvent(new Event('resize'));
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		return snapshot();
	},
	async renderFixed() {
		render(undefined, 'fixed');
		await new Promise((resolve) => requestAnimationFrame(resolve));
		return snapshot();
	},
	unmount() {
		root.unmount();
		controlElement.remove();
		return {
			portalChildren: portalTarget.childElementCount,
			rootChildren: rootElement.childElementCount,
		};
	},
};

declare global {
	interface Window {
		__reactSelectPortal: {
			snapshot: typeof snapshot;
			moveControl(): Promise<ReturnType<typeof snapshot>>;
			renderFixed(): Promise<ReturnType<typeof snapshot>>;
			unmount(): { portalChildren: number; rootChildren: number };
		};
	}
}

const octaneAsyncCreatableElement = document.getElementById('octane-async-creatable-root');
const reactAsyncCreatableElement = document.getElementById('react-async-creatable-root');
if (!octaneAsyncCreatableElement || !reactAsyncCreatableElement) {
	throw new Error('missing async creatable roots');
}
const asyncCreatableRequests = {
	octane: [] as PendingRequest[],
	react: [] as PendingRequest[],
};
const asyncCreatableChanges = { octane: [] as unknown[], react: [] as unknown[] };
function asyncCreatableProps(engine: 'octane' | 'react') {
	return {
		cacheOptions: true,
		defaultOptions: [
			{ label: 'Existing', value: 'existing' },
		],
		instanceId: `async-creatable-${engine}`,
		loadOptions(inputValue: string) {
			return new Promise<readonly AsyncOption[]>((resolve, reject) => {
				asyncCreatableRequests[engine].push({ inputValue, reject, resolve });
			});
		},
		onChange(value: unknown, actionMeta: unknown) {
			asyncCreatableChanges[engine].push({ value, actionMeta });
		},
	};
}
const octaneAsyncCreatableRoot = createRoot(octaneAsyncCreatableElement);
const reactAsyncCreatableRoot = createReactRoot(reactAsyncCreatableElement);
flushSync(() => {
	octaneAsyncCreatableRoot.render(AsyncCreatableSelect, asyncCreatableProps('octane') as never);
});
flushReact(() => {
	reactAsyncCreatableRoot.render(
		React.createElement(ReactAsyncCreatableSelect<AsyncOption>, asyncCreatableProps('react')),
	);
});

window.__reactSelectAsyncCreatable = {
	renderCreation() {
		const createProps = (engine: 'octane' | 'react') => ({
			defaultInputValue: 'brand new',
			defaultMenuIsOpen: true,
			defaultOptions: [],
			loadOptions: async () => [],
			onChange(value: unknown, actionMeta: unknown) {
				asyncCreatableChanges[engine].push({ value, actionMeta });
			},
		});
		flushSync(() => octaneAsyncCreatableRoot.render(() => null, {}));
		flushSync(() => {
			octaneAsyncCreatableRoot.render(AsyncCreatableSelect, createProps('octane') as never);
		});
		flushReact(() => reactAsyncCreatableRoot.render(null));
		flushReact(() => {
			reactAsyncCreatableRoot.render(
				React.createElement(ReactAsyncCreatableSelect<AsyncOption>, createProps('react')),
			);
		});
	},
	async resolve(inputValue: string, options: readonly AsyncOption[]) {
		for (const engine of ['octane', 'react'] as const) {
			const request = asyncCreatableRequests[engine].findLast(
				(candidate) => candidate.inputValue === inputValue,
			);
			if (!request) throw new Error(`missing ${engine} request for ${inputValue}`);
			request.resolve(options);
		}
		await settleAsync();
	},
	changes() {
		return {
			octane: [...asyncCreatableChanges.octane],
			react: [...asyncCreatableChanges.react],
		};
	},
};

declare global {
	interface Window {
		__reactSelectAsyncCreatable: {
			renderCreation(): void;
			resolve(inputValue: string, options: readonly AsyncOption[]): Promise<void>;
			changes(): { octane: unknown[]; react: unknown[] };
		};
	}
}

const nonceRootElement = document.getElementById('nonce-root');
if (!nonceRootElement) throw new Error('missing nonce root');
const nonceRoot = createRoot(nonceRootElement);

function renderNonce(cacheKey: string) {
	flushSync(() => nonceRoot.render(NonceFixture, { cacheKey, nonce: 'browser-csp' }));
}

function nonceSnapshot(cacheKey: string) {
	const styles = [
		...document.querySelectorAll(
			`style[data-octane^="${cacheKey}-"], style[data-emotion^="${cacheKey}"]`,
		),
	];
	return {
		classes: [...nonceRootElement.querySelectorAll('[class]')].flatMap(
			(element) => [...element.classList].filter(
				(className) => className.startsWith(`${cacheKey}-`),
			),
		),
		nonces: styles.map((style) => style.getAttribute('nonce')),
		styleCount: styles.length,
	};
}

renderNonce('nonce-browser');
window.__reactSelectNonce = {
	snapshot: () => nonceSnapshot('nonce-browser'),
	switchKey() {
		renderNonce('nonce-next');
		return nonceSnapshot('nonce-next');
	},
};

declare global {
	interface Window {
		__reactSelectNonce: {
			snapshot(): ReturnType<typeof nonceSnapshot>;
			switchKey(): ReturnType<typeof nonceSnapshot>;
		};
	}
}

const octaneSelectElement = document.getElementById('octane-select-root');
const reactSelectElement = document.getElementById('react-select-root');
if (!octaneSelectElement || !reactSelectElement) throw new Error('missing select roots');

const browserSelectOptions: readonly BrowserSelectOption[] = [
	{ label: 'One', value: '1' },
	{ label: 'Two', value: '2' },
	{ label: 'Disabled', value: 'disabled', disabled: true },
];
const selectLogs = {
	octane: [] as Array<Record<string, unknown>>,
	react: [] as Array<Record<string, unknown>>,
};
let octaneSelectInstance: SelectInstance<BrowserSelectOption, false> | null = null;
let reactSelectInstance: ReactSelect<BrowserSelectOption, false> | null = null;

function browserSelectProps(engine: 'octane' | 'react') {
	return {
		ref: (instance: unknown) => {
			if (engine === 'octane') {
				octaneSelectInstance = instance as SelectInstance<BrowserSelectOption, false> | null;
			} else {
				reactSelectInstance = instance as ReactSelect<BrowserSelectOption, false> | null;
			}
		},
		instanceId: 'browser',
		isOptionDisabled: (option: BrowserSelectOption) => Boolean(option.disabled),
		name: 'choice',
		options: browserSelectOptions,
		onChange(value: unknown, actionMeta: Record<string, unknown>) {
			selectLogs[engine].push({ type: 'change', value, actionMeta });
		},
		onInputChange(value: string, actionMeta: Record<string, unknown>) {
			selectLogs[engine].push({ type: 'input', value, actionMeta });
			return value;
		},
		onMenuOpen() {
			selectLogs[engine].push({ type: 'open' });
		},
		onMenuClose() {
			selectLogs[engine].push({ type: 'close' });
		},
	};
}

const octaneSelectRoot = createRoot(octaneSelectElement);
const reactSelectRoot = createReactRoot(reactSelectElement);
flushSync(() => {
	octaneSelectRoot.render(BrowserSelectFixture, browserSelectProps('octane') as never);
});
flushReact(() => {
	reactSelectRoot.render(
		React.createElement(ReactSelect<BrowserSelectOption>, browserSelectProps('react') as never),
	);
});

window.__reactSelectFull = {
	logs() {
		return { octane: [...selectLogs.octane], react: [...selectLogs.react] };
	},
	instanceMethods(engine: 'octane' | 'react') {
		const instance =
			engine === 'octane' ? octaneSelectInstance : reactSelectInstance;
		if (!instance) throw new Error(`missing ${engine} Select instance`);
		return [
			'blur',
			'buildCategorizedOptions',
			'buildFocusableOptions',
			'clearValue',
			'focus',
			'focusOption',
			'focusValue',
			'getClassNames',
			'getComponents',
			'getOptionLabel',
			'getOptionValue',
			'getStyles',
			'getValue',
			'openMenu',
			'popValue',
			'removeValue',
			'selectOption',
			'setValue',
		].filter(
			(name) => typeof (instance as unknown as Record<string, unknown>)[name] === 'function',
		);
	},
	selectThroughInstance(engine: 'octane' | 'react') {
		const instance =
			engine === 'octane' ? octaneSelectInstance : reactSelectInstance;
		if (!instance) throw new Error(`missing ${engine} Select instance`);
		instance.selectOption(browserSelectOptions[1]!);
	},
	clearThroughInstance(engine: 'octane' | 'react') {
		const instance =
			engine === 'octane' ? octaneSelectInstance : reactSelectInstance;
		if (!instance) throw new Error(`missing ${engine} Select instance`);
		instance.clearValue();
	},
	setThroughInstance(engine: 'octane' | 'react') {
		const instance =
			engine === 'octane' ? octaneSelectInstance : reactSelectInstance;
		if (!instance) throw new Error(`missing ${engine} Select instance`);
		instance.setValue(browserSelectOptions[0]!, 'select-option');
	},
	renderRequired() {
		flushSync(() => {
			octaneSelectRoot.render(
				BrowserSelectFixture,
				{
					...browserSelectProps('octane'),
					required: true,
				} as never,
			);
		});
		flushReact(() => {
			reactSelectRoot.render(
				React.createElement(ReactSelect<BrowserSelectOption>, {
					...browserSelectProps('react'),
					required: true,
				}),
			);
		});
	},
	renderAutoFocus(engine: 'octane' | 'react') {
		if (engine === 'octane') {
			flushSync(() => octaneSelectRoot.render(() => null, {}));
			flushSync(() => {
				octaneSelectRoot.render(
					BrowserSelectFixture,
					{
						...browserSelectProps('octane'),
						autoFocus: true,
					} as never,
				);
			});
			return;
		}
		flushReact(() => reactSelectRoot.render(null));
		flushReact(() => {
			reactSelectRoot.render(
				React.createElement(ReactSelect<BrowserSelectOption>, {
					...browserSelectProps('react'),
					autoFocus: true,
				}),
			);
		});
	},
};

const octaneMultiElement = document.getElementById('octane-multi-root');
const reactMultiElement = document.getElementById('react-multi-root');
if (!octaneMultiElement || !reactMultiElement) throw new Error('missing multi roots');
const multiLogs = { octane: [] as unknown[], react: [] as unknown[] };
const multiDefaults = browserSelectOptions.slice(0, 2);
let octaneMultiInstance: SelectInstance<BrowserSelectOption, true> | null = null;
let reactMultiInstance: ReactSelect<BrowserSelectOption, true> | null = null;
const multiProps = (engine: 'octane' | 'react', disableSelected = false) => ({
	defaultValue: multiDefaults,
	instanceId: 'multi-browser',
	...(disableSelected
		? {
				isOptionDisabled: (option: BrowserSelectOption) =>
					option.value === browserSelectOptions[0]!.value,
			}
		: {}),
	isMulti: true as const,
	name: 'multi-choice',
	options: browserSelectOptions,
	ref: (instance: unknown) => {
		if (engine === 'octane') {
			octaneMultiInstance = instance as SelectInstance<BrowserSelectOption, true> | null;
		} else {
			reactMultiInstance = instance as ReactSelect<BrowserSelectOption, true> | null;
		}
	},
	onChange(value: unknown, actionMeta: unknown) {
		multiLogs[engine].push({ value, actionMeta });
	},
});
const octaneMultiRoot = createRoot(octaneMultiElement);
const reactMultiRoot = createReactRoot(reactMultiElement);
flushSync(() => octaneMultiRoot.render(MultiSelectFixture, multiProps('octane') as never));
flushReact(() => {
	reactMultiRoot.render(
		React.createElement(ReactSelect<BrowserSelectOption, true>, multiProps('react') as never),
	);
});

window.__reactSelectMulti = {
	logs() {
		return { octane: [...multiLogs.octane], react: [...multiLogs.react] };
	},
	deselectDisabledThroughInstance(engine: 'octane' | 'react') {
		if (engine === 'octane') {
			flushSync(() => {
				octaneMultiRoot.render(MultiSelectFixture, multiProps('octane', true) as never);
			});
			if (!octaneMultiInstance) throw new Error('missing Octane multi Select instance');
			flushSync(() => octaneMultiInstance!.selectOption(browserSelectOptions[0]!));
			return;
		}
		flushReact(() => {
			reactMultiRoot.render(
				React.createElement(
					ReactSelect<BrowserSelectOption, true>,
					multiProps('react', true) as never,
				),
			);
		});
		if (!reactMultiInstance) throw new Error('missing React multi Select instance');
		flushReact(() => reactMultiInstance!.selectOption(browserSelectOptions[0]!));
	},
};

const octaneAnimatedElement = document.getElementById('octane-animated-root');
const reactAnimatedElement = document.getElementById('react-animated-root');
if (!octaneAnimatedElement || !reactAnimatedElement) throw new Error('missing animated roots');
const animatedProps = {
	defaultValue: multiDefaults,
	instanceId: 'animated-browser',
	isMulti: true as const,
	name: 'animated-choice',
	options: browserSelectOptions,
};
const octaneAnimatedRoot = createRoot(octaneAnimatedElement);
const reactAnimatedRoot = createReactRoot(reactAnimatedElement);
flushSync(() => {
	octaneAnimatedRoot.render(
		MultiSelectFixture,
		{
			...animatedProps,
			components: makeAnimated(),
		} as never,
	);
});
flushReact(() => {
	reactAnimatedRoot.render(
		React.createElement(ReactSelect<BrowserSelectOption, true>, {
			...animatedProps,
			components: makeReactAnimated(),
		}),
	);
});

function animatedSnapshot(rootId: string) {
	const root = document.getElementById(rootId)!;
	const labels = Array.from(root.querySelectorAll('[aria-label^="Remove "]')).map(
		(element) => element.getAttribute('aria-label')?.slice('Remove '.length),
	).filter((value): value is string => Boolean(value));
	const collapse = root.querySelector('[aria-label="Remove One"]')?.parentElement?.parentElement;
	return {
		labels,
		width: collapse instanceof HTMLElement ? collapse.style.width : '',
		transition: collapse instanceof HTMLElement ? collapse.style.transition : '',
	};
}

window.__reactSelectAnimated = {
	snapshot(engine: 'octane' | 'react') {
		return animatedSnapshot(`${engine}-animated-root`);
	},
};

const octanePlacementElement = document.getElementById('octane-placement-root');
const reactPlacementElement = document.getElementById('react-placement-root');
if (!octanePlacementElement || !reactPlacementElement) throw new Error('missing placement roots');
const placementScrollLogs = { octane: [] as string[], react: [] as string[] };
function makePlacementProps(engine: 'octane' | 'react') {
	return {
		...browserSelectProps(engine),
		captureMenuScroll: true,
		menuIsOpen: true,
		menuPlacement: 'auto' as const,
		menuShouldBlockScroll: true,
		menuShouldScrollIntoView: false,
		onMenuScrollToBottom() {
			placementScrollLogs[engine].push('bottom');
		},
		onMenuScrollToTop() {
			placementScrollLogs[engine].push('top');
		},
	};
}
const octanePlacementRoot = createRoot(octanePlacementElement);
const reactPlacementRoot = createReactRoot(reactPlacementElement);
flushSync(() => {
	octanePlacementRoot.render(BrowserSelectFixture, makePlacementProps('octane') as never);
});
flushReact(() => {
	reactPlacementRoot.render(
		React.createElement(ReactSelect<BrowserSelectOption>, {
			...makePlacementProps('react'),
		}),
	);
});

window.__reactSelectPlacement = {
	snapshot(rootId: string) {
		const listbox = document.querySelector(`#${rootId} [role="listbox"]`);
		const menu = listbox?.parentElement;
		if (!listbox || !menu) return null;
		const menuStyle = getComputedStyle(menu);
		const listStyle = getComputedStyle(listbox);
		return {
			bottom: menuStyle.bottom,
			maxHeight: listStyle.maxHeight,
			top: menuStyle.top,
		};
	},
	wheel(rootId: string) {
		const listbox = document.querySelector(`#${rootId} [role="listbox"]`)!;
		listbox.dispatchEvent(
			new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }),
		);
		return {
			body: {
				height: document.body.style.height,
				overflow: document.body.style.overflow,
				position: document.body.style.position,
			},
			logs: {
				octane: [...placementScrollLogs.octane],
				react: [...placementScrollLogs.react],
			},
		};
	},
};

declare global {
	interface Window {
		__reactSelectFull: {
			logs(): { octane: Array<Record<string, unknown>>; react: Array<Record<string, unknown>> };
			instanceMethods(engine: 'octane' | 'react'): string[];
			selectThroughInstance(engine: 'octane' | 'react'): void;
			clearThroughInstance(engine: 'octane' | 'react'): void;
			setThroughInstance(engine: 'octane' | 'react'): void;
			renderRequired(): void;
			renderAutoFocus(engine: 'octane' | 'react'): void;
		};
		__reactSelectPlacement: {
			snapshot(rootId: string): { bottom: string; maxHeight: string; top: string } | null;
			wheel(rootId: string): {
				body: { height: string; overflow: string; position: string };
				logs: { octane: string[]; react: string[] };
			};
		};
		__reactSelectMulti: {
			logs(): { octane: unknown[]; react: unknown[] };
			deselectDisabledThroughInstance(engine: 'octane' | 'react'): void;
		};
		__reactSelectAnimated: {
			snapshot(engine: 'octane' | 'react'): {
				labels: string[];
				width: string;
				transition: string;
			};
		};
	}
}

const octaneAsyncElement = document.getElementById('octane-async-root');
const reactAsyncElement = document.getElementById('react-async-root');
if (!octaneAsyncElement || !reactAsyncElement) throw new Error('missing async roots');

type PendingRequest = {
	inputValue: string;
	resolve: (options: readonly AsyncOption[]) => void;
	reject: (error: Error) => void;
};
const requests = { octane: [] as PendingRequest[], react: [] as PendingRequest[] };
let octaneAsync!: AsyncResult;
let reactAsync!: AsyncResult;

function asyncProps(engine: 'octane' | 'react') {
	return {
		cacheOptions: true,
		defaultOptions: [
			{ label: 'Default', value: 'default' },
		],
		loadOptions(inputValue: string) {
			return new Promise<readonly AsyncOption[]>((resolve, reject) => {
				requests[engine].push({ inputValue, reject, resolve });
			});
		},
	};
}

const octaneAsyncProps = asyncProps('octane');
const reactAsyncProps = asyncProps('react');

function ReactAsyncFixture() {
	reactAsync = useReactAsync<AsyncOption, false, never, Record<string, unknown>>(
		reactAsyncProps as never,
	) as AsyncResult;
	return null;
}

const octaneAsyncRoot = createRoot(octaneAsyncElement);
const reactAsyncRoot = createReactRoot(reactAsyncElement);
flushSync(() => {
	octaneAsyncRoot.render(AsyncFixture, {
		asyncProps: octaneAsyncProps,
		bind: (result) => {
			octaneAsync = result;
		},
	});
});
flushReact(() => reactAsyncRoot.render(React.createElement(ReactAsyncFixture)));

function asyncSnapshot(result: AsyncResult) {
	return { isLoading: result.isLoading, options: result.options };
}

function snapshotAsync() {
	return {
		octane: asyncSnapshot(octaneAsync),
		react: asyncSnapshot(reactAsync),
		requests: {
			octane: requests.octane.map((request) => request.inputValue),
			react: requests.react.map((request) => request.inputValue),
		},
	};
}

async function settleAsync() {
	await Promise.resolve();
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

window.__reactSelectAsync = {
	snapshot: snapshotAsync,
	async input(value: string) {
		const meta = { action: 'input-change' as const, prevInputValue: '' };
		flushSync(() => octaneAsync.onInputChange(value, meta));
		flushReact(() => reactAsync.onInputChange(value, meta));
		await settleAsync();
		return snapshotAsync();
	},
	async resolve(inputValue: string, options: readonly AsyncOption[]) {
		const octaneRequest = requests.octane.findLast((request) => request.inputValue === inputValue);
		const reactRequest = requests.react.findLast((request) => request.inputValue === inputValue);
		if (!octaneRequest || !reactRequest) throw new Error(`missing request for ${inputValue}`);
		octaneRequest.resolve(options);
		reactRequest.resolve(options);
		await settleAsync();
		return snapshotAsync();
	},
	async reject(inputValue: string) {
		const octaneRequest = requests.octane.findLast((request) => request.inputValue === inputValue);
		const reactRequest = requests.react.findLast((request) => request.inputValue === inputValue);
		if (!octaneRequest || !reactRequest) throw new Error(`missing request for ${inputValue}`);
		octaneRequest.reject(new Error(`rejected ${inputValue}`));
		reactRequest.reject(new Error(`rejected ${inputValue}`));
		await settleAsync();
		return snapshotAsync();
	},
};

declare global {
	interface Window {
		__reactSelectAsync: {
			snapshot: typeof snapshotAsync;
			input(value: string): Promise<ReturnType<typeof snapshotAsync>>;
			resolve(inputValue: string, options: readonly AsyncOption[]): Promise<
				ReturnType<typeof snapshotAsync>
			>;
			reject(inputValue: string): Promise<ReturnType<typeof snapshotAsync>>;
		};
	}
}

const octaneStateElement = document.getElementById('octane-state-root');
const reactStateElement = document.getElementById('react-state-root');
if (!octaneStateElement || !reactStateElement) throw new Error('missing state manager roots');

type Option = { label: string; value: string };
type ManagerResult = StateManagerResult & Record<string, unknown>;
const logs = { octane: [] as string[], react: [] as string[] };
let octaneManager!: ManagerResult;
let reactManager!: ManagerResult;

function managerProps(engine: 'octane' | 'react', controlled = false) {
	return {
		defaultInputValue: 'initial',
		defaultMenuIsOpen: false,
		defaultValue: { label: 'Default', value: 'default' },
		...(controlled
			? {
					inputValue: 'controlled',
					menuIsOpen: false,
					value: { label: 'Controlled', value: 'controlled' },
				}
			: {}),
		onChange() {
			logs[engine].push('change');
		},
		onInputChange(value: string) {
			logs[engine].push(`input:${value}`);
			return value.toUpperCase();
		},
		onMenuOpen() {
			logs[engine].push('open');
		},
		onMenuClose() {
			logs[engine].push('close');
		},
		consumerProp: 'preserved',
	};
}

function ReactStateManagerFixture(props: { controlled: boolean }) {
	reactManager = useReactStateManager<Option, false, never, Record<string, unknown>>(
		managerProps('react', props.controlled) as never,
	) as ManagerResult;
	return null;
}

const octaneStateRoot = createRoot(octaneStateElement);
const reactStateRoot = createReactRoot(reactStateElement);

function renderManagers(controlled = false) {
	flushSync(() => {
		octaneStateRoot.render(StateManagerFixture, {
			bind: (result) => {
				octaneManager = result as ManagerResult;
			},
			managerProps: managerProps('octane', controlled),
		});
	});
	flushReact(() => {
		reactStateRoot.render(React.createElement(ReactStateManagerFixture, { controlled }));
	});
}

function managerSnapshot(result: ManagerResult) {
	return {
		consumerProp: result.consumerProp,
		inputValue: result.inputValue,
		menuIsOpen: result.menuIsOpen,
		value: result.value,
	};
}

function snapshotManagers() {
	return {
		octane: managerSnapshot(octaneManager),
		react: managerSnapshot(reactManager),
		logs: { octane: [...logs.octane], react: [...logs.react] },
	};
}

renderManagers();

window.__reactSelectStateManager = {
	snapshot: snapshotManagers,
	async exerciseUncontrolled() {
		const option = { label: 'Next', value: 'next' };
		flushSync(() => {
			octaneManager.onInputChange?.('typed', {
				action: 'input-change',
				prevInputValue: 'initial',
			});
			octaneManager.onMenuOpen?.();
			octaneManager.onChange?.(option, { action: 'select-option', option });
		});
		flushReact(() => {
			reactManager.onInputChange?.('typed', {
				action: 'input-change',
				prevInputValue: 'initial',
			});
			reactManager.onMenuOpen?.();
			reactManager.onChange?.(option, { action: 'select-option', option });
		});
		await Promise.resolve();
		return snapshotManagers();
	},
	async exerciseControlled() {
		renderManagers(true);
		const option = { label: 'Ignored', value: 'ignored' };
		flushSync(() => {
			octaneManager.onInputChange?.('ignored', {
				action: 'input-change',
				prevInputValue: 'controlled',
			});
			octaneManager.onMenuOpen?.();
			octaneManager.onChange?.(option, { action: 'select-option', option });
		});
		flushReact(() => {
			reactManager.onInputChange?.('ignored', {
				action: 'input-change',
				prevInputValue: 'controlled',
			});
			reactManager.onMenuOpen?.();
			reactManager.onChange?.(option, { action: 'select-option', option });
		});
		await Promise.resolve();
		return snapshotManagers();
	},
};

declare global {
	interface Window {
		__reactSelectStateManager: {
			snapshot: typeof snapshotManagers;
			exerciseUncontrolled(): Promise<ReturnType<typeof snapshotManagers>>;
			exerciseControlled(): Promise<ReturnType<typeof snapshotManagers>>;
		};
	}
}
