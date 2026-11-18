/** @jsxImportSource octane */
import { afterEach, describe, expect, it } from 'vitest';
import * as React from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { Dialog as ReactDialog } from 'radix-ui';
import { createElement, createRoot as createOctaneRoot } from 'octane';
import { OctaneCompat, ReactCompat, type OctaneCompatComponentProps } from 'octane/react';
import { flushEffects } from '../../octane/tests/_helpers';
import { createEscapeLayerBridge, Dialog } from '../src/index';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
type Log = string[];
type LayerProps = {
	id: string;
	log: Log;
	veto?: boolean;
	throwEscape?: boolean;
	bridge?: ReturnType<typeof createEscapeLayerBridge>;
};
const keepFocus = (event: Event) => event.preventDefault();

function recordEscape(props: LayerProps, event: KeyboardEvent): void {
	props.log.push(`${props.id}:escape`);
	if (props.veto) event.preventDefault();
	if (props.throwEscape) throw new Error('escape callback failed');
}

function NativeLayer(props: LayerProps & { reactChild?: LayerProps; nativeChild?: LayerProps }) {
	return (
		<Dialog.Root
			defaultOpen
			modal={false}
			onOpenChange={(open: boolean) => props.log.push(`${props.id}:${open}`)}
		>
			<Dialog.Content
				id={props.id}
				onOpenAutoFocus={keepFocus}
				onCloseAutoFocus={keepFocus}
				onEscapeKeyDown={(event: KeyboardEvent) => recordEscape(props, event)}
			>
				<Dialog.Title>{props.id}</Dialog.Title>
				<Dialog.Description>Native</Dialog.Description>
				<button id={`${props.id}-target`}>Target</button>
				{props.reactChild ? <ReactCompat component={ReactLayer} props={props.reactChild} /> : null}
				{props.nativeChild ? <NativeLayer {...props.nativeChild} /> : null}
			</Dialog.Content>
		</Dialog.Root>
	);
}

function ReactLayer(
	props: LayerProps & { children?: React.ReactNode; cooperate?: boolean; refs?: string[] },
) {
	const bridge = React.useMemo(() => props.bridge ?? createEscapeLayerBridge(), [props.bridge]);
	const ref = React.useCallback(
		(node: HTMLElement | null) => {
			bridge.ref(node);
			props.refs?.push(node ? 'attach' : 'detach');
		},
		[bridge, props.refs],
	);
	const escape = (event: KeyboardEvent) => {
		if (props.cooperate === false) recordEscape(props, event);
		else bridge.onEscapeKeyDown(event, (current) => recordEscape(props, current));
	};
	return React.createElement(
		ReactDialog.Root,
		{
			defaultOpen: true,
			modal: false,
			onOpenChange: (open) => props.log.push(`${props.id}:${open}`),
		},
		React.createElement(
			ReactDialog.Content,
			{
				id: props.id,
				ref: props.cooperate === false ? undefined : ref,
				onOpenAutoFocus: keepFocus,
				onCloseAutoFocus: keepFocus,
				onEscapeKeyDown: escape,
			},
			React.createElement(ReactDialog.Title, null, props.id),
			React.createElement(ReactDialog.Description, null, 'React'),
			React.createElement('button', { id: `${props.id}-target` }, 'Target'),
			props.children,
		),
	);
}

function ReactOuter(props: {
	log: Log;
	inner?: LayerProps & { reactChild?: LayerProps };
	refs?: string[];
	bridge?: ReturnType<typeof createEscapeLayerBridge>;
}) {
	return React.createElement(
		ReactLayer,
		{ id: 'outer', log: props.log, refs: props.refs, bridge: props.bridge },
		props.inner &&
			React.createElement<OctaneCompatComponentProps<Parameters<typeof NativeLayer>[0]>>(
				OctaneCompat,
				{
					key: props.inner.id,
					component: NativeLayer,
					props: props.inner,
				},
			),
	);
}

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

function escape(id: string): KeyboardEvent {
	const target = document.getElementById(`${id}-target`)!;
	target.focus();
	const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	return event;
}

describe('cooperative mixed Radix Dialog Escape', () => {
	let unmount: (() => void) | undefined;
	let reactRoot: ReturnType<typeof createReactRoot> | undefined;
	let nativeRoot: ReturnType<typeof createOctaneRoot> | undefined;
	async function renderReact(element: React.ReactNode) {
		if (!reactRoot) {
			const container = document.createElement('div');
			document.body.append(container);
			reactRoot = createReactRoot(container);
			unmount = () => reactRoot!.unmount();
		}
		await React.act(async () => {
			reactRoot!.render(element);
			await settle();
		});
		await settle();
	}
	async function renderNative(props: Parameters<typeof NativeLayer>[0]) {
		if (!nativeRoot) {
			const container = document.createElement('div');
			document.body.append(container);
			nativeRoot = createOctaneRoot(container);
			unmount = () => nativeRoot!.unmount();
		}
		await React.act(async () => {
			nativeRoot!.render(createElement(NativeLayer, props));
			await settle();
		});
		await settle();
	}
	async function press(id: string) {
		let event!: KeyboardEvent;
		await React.act(async () => {
			event = escape(id);
			await settle();
		});
		return event;
	}
	afterEach(async () => {
		if (unmount) await React.act(async () => unmount!());
		unmount = undefined;
		reactRoot = undefined;
		nativeRoot = undefined;
		document.body.innerHTML = '';
		await settle();
	});

	it('dismisses native inner then React outer, composing the React ref and preserving propagation', async () => {
		const log: Log = [],
			refs: string[] = [],
			propagation: string[] = [];
		await renderReact(React.createElement(ReactOuter, { log, refs, inner: { id: 'inner', log } }));
		document
			.getElementById('inner-target')!
			.addEventListener('keydown', () => propagation.push('target'));
		const bubble = () => propagation.push('document');
		document.addEventListener('keydown', bubble);
		try {
			const event = await press('inner');
			expect(event.defaultPrevented).toBe(true);
			expect(propagation).toEqual(['target', 'document']);
		} finally {
			document.removeEventListener('keydown', bubble);
		}
		expect(log).toEqual(['inner:escape', 'inner:false']);
		expect(document.getElementById('outer')).not.toBeNull();
		expect(document.getElementById('inner')).toBeNull();
		await press('outer');
		expect(log).toEqual(['inner:escape', 'inner:false', 'outer:escape', 'outer:false']);
		expect(refs).toEqual(['attach', 'detach']);
	});

	it('dismisses React inner before native outer on an initial in-place mount', async () => {
		const log: Log = [];
		await renderNative({ id: 'outer', log, reactChild: { id: 'inner', log } });
		await press('inner');
		expect(log).toEqual(['inner:escape', 'inner:false']);
		expect(document.getElementById('outer')).not.toBeNull();
		await press('outer');
		expect(log).toEqual(['inner:escape', 'inner:false', 'outer:escape', 'outer:false']);
	});

	it.each(['native', 'react'] as const)(
		'honors a %s top-layer veto without notifying the parent',
		async (renderer) => {
			const log: Log = [];
			if (renderer === 'native')
				await renderReact(
					React.createElement(ReactOuter, { log, inner: { id: 'inner', log, veto: true } }),
				);
			else await renderNative({ id: 'outer', log, reactChild: { id: 'inner', log, veto: true } });
			const event = await press('inner');
			expect(event.defaultPrevented).toBe(true);
			expect(log).toEqual(['inner:escape']);
			expect(document.getElementById('outer')).not.toBeNull();
			expect(document.getElementById('inner')).not.toBeNull();
		},
	);

	it('retains earlier cancellation and calls the native top callback only once', async () => {
		const log: Log = [];
		await renderReact(React.createElement(ReactOuter, { log, inner: { id: 'inner', log } }));
		const cancel = (event: Event) => event.preventDefault();
		window.addEventListener('keydown', cancel, { capture: true });
		try {
			await press('inner');
		} finally {
			window.removeEventListener('keydown', cancel, { capture: true });
		}
		expect(log).toEqual(['inner:escape']);
		expect(document.getElementById('outer')).not.toBeNull();
		expect(document.getElementById('inner')).not.toBeNull();
	});

	it('suppresses the parent and duplicate native dispatch when the top callback throws', async () => {
		const log: Log = [];
		await renderReact(
			React.createElement(ReactOuter, { log, inner: { id: 'inner', log, throwEscape: true } }),
		);
		const errors: string[] = [];
		const capture = (event: ErrorEvent) => {
			errors.push(event.message);
			event.preventDefault();
		};
		window.addEventListener('error', capture);
		try {
			const event = await press('inner');
			expect(event.defaultPrevented).toBe(true);
		} finally {
			window.removeEventListener('error', capture);
		}
		expect(errors).toEqual(['escape callback failed']);
		expect(log).toEqual(['inner:escape']);
		expect(document.getElementById('outer')).not.toBeNull();
	});

	it('orders three mixed layers and a reopened sibling by activation', async () => {
		const log: Log = [];
		await renderReact(
			React.createElement(ReactOuter, {
				log,
				inner: { id: 'middle', log, reactChild: { id: 'leaf', log } },
			}),
		);
		await press('leaf');
		await press('middle');
		expect(log).toEqual(['leaf:escape', 'leaf:false', 'middle:escape', 'middle:false']);
		await renderReact(React.createElement(ReactOuter, { log, inner: { id: 'reopened', log } }));
		await press('reopened');
		expect(log.slice(-2)).toEqual(['reopened:escape', 'reopened:false']);
		expect(document.getElementById('outer')).not.toBeNull();
	});

	it('routes native Escape before independent capture listeners registered between the two layers', async () => {
		const log: Log = [];
		await renderReact(React.createElement(ReactOuter, { log }));
		const observer = () => log.push('independent:capture');
		document.addEventListener('keydown', observer, { capture: true });
		try {
			await renderReact(React.createElement(ReactOuter, { log, inner: { id: 'inner', log } }));
			await press('inner');
		} finally {
			document.removeEventListener('keydown', observer, { capture: true });
		}
		expect(log).toEqual(['inner:escape', 'independent:capture', 'inner:false']);
	});

	it('preserves React Escape behavior when opted nested React layers mount together', async () => {
		const run = async (cooperate: boolean) => {
			const log: Log = [];
			await renderReact(
				React.createElement(
					ReactLayer,
					{ id: 'outer', log, cooperate },
					React.createElement(ReactLayer, { id: 'inner', log, cooperate }),
				),
			);
			await press('inner');
			await React.act(async () => unmount!());
			unmount = undefined;
			reactRoot = undefined;
			document.body.innerHTML = '';
			await settle();
			return log;
		};
		const original = await run(false);
		expect(original).not.toEqual([]);
		expect(await run(true)).toEqual(original);
	});

	it('routes a native top through two React layers mounted together', async () => {
		const log: Log = [];
		await renderReact(
			React.createElement(
				ReactLayer,
				{ id: 'outer', log },
				React.createElement(
					ReactLayer,
					{ id: 'middle', log },
					React.createElement<OctaneCompatComponentProps<Parameters<typeof NativeLayer>[0]>>(
						OctaneCompat,
						{ component: NativeLayer, props: { id: 'inner', log } },
					),
				),
			),
		);
		await press('inner');
		expect(log).toEqual(['inner:escape', 'inner:false']);
		expect(document.getElementById('middle')).not.toBeNull();
		expect(document.getElementById('outer')).not.toBeNull();
	});

	it('suppresses a React parent whose private stack disagrees across a native layer', async () => {
		const log: Log = [],
			bridge = createEscapeLayerBridge();
		await renderReact(
			React.createElement(ReactOuter, {
				log,
				bridge,
				inner: { id: 'middle', log, reactChild: { id: 'leaf', log } },
			}),
		);
		const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
		bridge.onEscapeKeyDown(event, () => log.push('outer:escape'));
		expect(event.defaultPrevented).toBe(true);
		expect(log).toEqual([]);
		expect(document.getElementById('outer')).not.toBeNull();
		expect(document.getElementById('middle')).not.toBeNull();
		expect(document.getElementById('leaf')).not.toBeNull();
	});

	it('leaves same-renderer React and native stacks unchanged', async () => {
		const log: Log = [];
		await renderReact(React.createElement(ReactLayer, { id: 'outer', log, cooperate: false }));
		await renderReact(
			React.createElement(
				ReactLayer,
				{ id: 'outer', log, cooperate: false },
				React.createElement(ReactLayer, { id: 'inner', log, cooperate: false }),
			),
		);
		await press('inner');
		expect(log).toEqual(['inner:escape', 'inner:false']);
		await React.act(async () => unmount!());
		unmount = undefined;
		reactRoot = undefined;
		document.body.innerHTML = '';
		await settle();
		log.length = 0;
		await renderNative({ id: 'outer', log });
		await renderNative({ id: 'outer', log, nativeChild: { id: 'inner', log } });
		await press('inner');
		expect(log).toEqual(['inner:escape', 'inner:false']);
	});
});
