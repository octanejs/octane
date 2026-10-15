import { createRoot, flushSync, hydrateRoot } from '../../../src/index.js';
import {
	MountedScripts,
	NestedExecutingScripts,
	PendingExecutingScript,
	PendingDescriptorScript,
	OwnedAsyncScripts,
	RawStyle,
	StaticExecutingScript,
	StaticInertScript,
	type MountedScript,
} from '../../_fixtures/script-innerhtml.tsrx';
import { RAW_STYLE_SOURCE, UPDATED_RAW_STYLE_SOURCE } from '../../_fixtures/raw-style-content.js';

const container = document.querySelector('#root') as HTMLElement;
const serverStyle = container.querySelector('#raw-style-sheet') as HTMLStyleElement;
const serverTarget = container.querySelector('#raw-style-target') as HTMLElement;
const props = { tag: 'style', source: RAW_STYLE_SOURCE };
const root = hydrateRoot(container, RawStyle, props);
flushSync(() => {});

function snapshot() {
	const style = container.querySelector('#raw-style-sheet') as HTMLStyleElement;
	const target = container.querySelector('#raw-style-target') as HTMLElement;
	return {
		color: getComputedStyle(target).color,
		content: getComputedStyle(target, '::before').content,
		cssRuleCount: style.sheet?.cssRules.length ?? -1,
		styleCount: container.querySelectorAll('style').length,
		styleSame: style === serverStyle,
		styleText: style.textContent ?? '',
		targetSame: target === serverTarget,
		unexpectedElementCount: container.querySelectorAll('[data-pwn]').length,
	};
}

const initial = snapshot();
flushSync(() =>
	root.render(RawStyle, {
		tag: 'style',
		source: UPDATED_RAW_STYLE_SOURCE,
	}),
);
const updated = snapshot();

window.__rawStyleHydration = {
	initial,
	updated,
	unmount() {
		root.unmount();
	},
};

const scriptsContainer = document.querySelector<HTMLElement>('#scripts-root');
if (scriptsContainer) {
	const original = {
		input: scriptsContainer.querySelector('input'),
		script: scriptsContainer.querySelector('script'),
	};
	const failures: string[] = [];
	const initialScripts = [
		{ id: 'server', source: '(window.scriptExecutions ??= []).push("server")' },
	];
	const scriptsRoot = hydrateRoot(
		scriptsContainer,
		MountedScripts,
		{ scripts: initialScripts, revision: 0 },
		{ onRecoverableError: (error) => failures.push(String(error)) },
	);
	flushSync(() => {});
	window.__scriptExecution = {
		adopted: {
			input: original.input === scriptsContainer.querySelector('input'),
			script: original.script === scriptsContainer.querySelector('script'),
		},
		failures,
		render(scripts: MountedScript[], revision = 0) {
			flushSync(() => scriptsRoot.render(MountedScripts, { scripts, revision }));
		},
		mountStatic() {
			for (const Component of [
				StaticInertScript,
				StaticExecutingScript,
				StaticExecutingScript,
				NestedExecutingScripts,
				NestedExecutingScripts,
			]) {
				const target = document.createElement('div');
				document.body.append(target);
				const instance = createRoot(target);
				instance.render(Component);
				instance.unmount();
				target.remove();
			}
		},
		mountAsync() {
			const target = document.createElement('div');
			target.id = 'async-scripts';
			document.body.append(target);
			const instance = createRoot(target);
			instance.render(OwnedAsyncScripts);
			return {
				unmount() {
					instance.unmount();
					target.remove();
				},
			};
		},
		mountPending(descriptor = false) {
			let resolve!: () => void;
			const pending = new Promise<void>((done) => {
				resolve = done;
			});
			const target = document.createElement('div');
			target.id = 'pending-script';
			document.body.append(target);
			const instance = createRoot(target);
			instance.render(descriptor ? PendingDescriptorScript : PendingExecutingScript, { pending });
			return {
				resolve,
				unmount() {
					instance.unmount();
					target.remove();
				},
			};
		},
		unmount() {
			scriptsRoot.unmount();
		},
	};
}

declare global {
	interface Window {
		scriptExecutions?: string[];
		__scriptExecution: {
			adopted: { input: boolean; script: boolean };
			failures: string[];
			render(scripts: MountedScript[], revision?: number): void;
			mountStatic(): void;
			mountAsync(): { unmount(): void };
			mountPending(descriptor?: boolean): { resolve(): void; unmount(): void };
			unmount(): void;
		};
		__rawStyleHydration: {
			initial: ReturnType<typeof snapshot>;
			updated: ReturnType<typeof snapshot>;
			unmount(): void;
		};
	}
}
