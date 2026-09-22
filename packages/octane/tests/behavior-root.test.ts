import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	act,
	addTransitionType,
	attachBehaviorRoot,
	createRoot,
	flushSync,
	hydrateRoot,
	startTransition,
} from 'octane';
import { condition, interaction, never } from 'octane/hydration';
import { renderToReadableStream, renderToString } from 'octane/server';
import { flushEffects } from './_helpers.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import { installViewTransitionMocks } from './conformance/_helpers/view-transition-mocks.js';
import * as DomBindings from '../src/dom-bindings.js';
import * as DomBindingPrograms from '../src/dom-binding-program.js';
import * as DomBindingClasses from '../src/dom-binding-classes.js';
import * as DomBindingSignals from '../src/dom-binding-signals.js';
import * as DomBindingControls from '../src/dom-binding-controls.js';
import * as DomBindingStyles from '../src/dom-binding-styles.js';
import * as DomBindingProjections from '../src/dom-binding-projections.js';
import * as SignalReads from '../src/signals/read-protocol.js';
import * as Stylex from '../../stylex/src/index.js';
import {
	applyHydrationControlCandidate,
	captureHydrationControlCandidate,
} from '../src/hydration/control-capture.js';
import { setStyle } from '../src/runtime.js';
import {
	createScope,
	__signalAt,
	runWithSignalOwner,
	SIGNAL_BINDING_SUBSCRIBE,
	createResource,
	isSignalHandle,
	query,
	bindSignalControl,
} from '../src/signals/index.js';
import type {
	ActionPresentationProps,
	AttachmentPresentationProps,
	ControlPresentationProps,
	NativeControlPresentationProps,
	SafetyPresentationProps,
} from './_fixtures/dom-presentation.tsrx';
import * as staticClient from './hydration/_fixtures/deferred-hydration-static.tsrx';

const STATIC_FIXTURE = 'packages/octane/tests/hydration/_fixtures/deferred-hydration-static.tsrx';
const staticServer = loadServerFixture<typeof staticClient>(STATIC_FIXTURE);
const fixedButtonSource = readFileSync(
	'packages/octane/tests/_fixtures/dom-presentation-fixed-child.tsrx',
	'utf8',
);

const presentationSource = readFileSync(
	'packages/octane/tests/_fixtures/dom-presentation.tsrx',
	'utf8',
);

function authoredPresentation<Props extends object>(
	view: string,
	initial: Props,
	dev = false,
	source = presentationSource,
	modules: Readonly<Record<string, Record<string, unknown>>> = {},
	compileOptions: Record<string, unknown> = {},
	bindingProps?: readonly string[],
	fixedProps?: readonly (readonly unknown[])[],
) {
	const id = '/src/dom-presentation.tsrx';
	const options = {
		compileOptions: { dev, hmr: false, ...compileOptions },
		runtimeModules: {
			'octane/behavior': DomBindings,
			'octane/dom-bindings': DomBindings,
			'octane/dom-binding-program': DomBindingPrograms,
			'octane/dom-binding-classes': DomBindingClasses,
			'octane/dom-binding-signals': DomBindingSignals,
			'octane/dom-binding-controls': DomBindingControls,
			'octane/dom-binding-styles': DomBindingStyles,
			'octane/dom-binding-projections': DomBindingProjections,
			'octane/internal/signal-read': SignalReads,
			'@stylexjs/stylex': Stylex,
			...modules,
		},
	};
	const server = loadCompiledFixtureSource(source, { ...options, id, mode: 'server' });
	const artifact = (mount: boolean) =>
		loadCompiledFixtureSource(source, {
			...options,
			id:
				id +
				'?octane-bindings=' +
				view +
				(mount ? '&octane-mount=1' : '') +
				(bindingProps === undefined
					? ''
					: '&octane-props=' +
						encodeURIComponent(
							JSON.stringify(fixedProps ? [2, bindingProps, fixedProps] : [1, bindingProps]),
						)),
			mode: 'client',
		});
	const client = loadCompiledFixtureSource(
		`import { adoptBindings, mountBindings } from 'octane/behavior';
import { ${view} } from './dom-presentation.tsrx';
export function attach(root, source, options) { return adoptBindings(root, ${view}, source, options); }
export function mount(target, source, options) { return mountBindings(target, ${view}, source, options); }`,
		{
			...options,
			id: '/src/presentation-activation.tsrx',
			mode: 'client',
			runtimeModules: {
				...options.runtimeModules,
				['./dom-presentation.tsrx?octane-bindings=' + view + '&octane-mount=1']: artifact(true),
			},
		},
	);
	let snapshot = initial;
	const subscriptions = new Set<() => void>();
	const cleanup = vi.fn();
	const state: DomBindings.BindingSource<Props> = {
		getSnapshot: () => snapshot,
		subscribe(notify) {
			subscriptions.add(notify);
			return () => {
				subscriptions.delete(notify);
				cleanup();
			};
		},
	};
	return {
		html: renderToString(server[view], initial).html,
		server,
		loadClient: () => loadCompiledFixtureSource(source, { ...options, id, mode: 'client' }),
		state,
		cleanup,
		attach: client.attach as (
			root: Element | DomBindingPrograms.BindingRange,
			source: typeof state,
			options?: DomBindings.BindingOptions,
		) => DomBindings.BindingHandle,
		mount: client.mount as (
			target: DomBindingPrograms.BindingMountTarget,
			source: typeof state,
			options?: DomBindings.BindingOptions,
		) => DomBindings.BindingHandle,
		publish(next: Partial<Props>, notify = true) {
			snapshot = { ...snapshot, ...next };
			if (notify) for (const callback of subscriptions) callback();
		},
	};
}

function authoredBindings(dev = false) {
	const id = '/src/behavior-action.tsrx';
	const source = `import { unbound } from 'octane/behavior';
export function Action(props) @{
  'use dom bindings';
  <button hidden={unbound(props.hidden)} type={props.type} disabled={props.disabled} aria-disabled={props.disabled}
    aria-label={props.label} data-active={props.active ? '' : null} class={props.classes}
    style={{ opacity: props.opacity, width: props.width, '--tone': props.tone }}>
    <span hidden={props.active}><svg viewBox="0 0 24 24"><path d="M1 1h5" /></svg></span>
    <span hidden={!props.active}><svg viewBox="0 0 24 24"><path d="M2 2h4" /></svg></span>
  </button>
}`;
	const options = {
		compileOptions: { dev, hmr: false },
		runtimeModules: {
			'octane/behavior': DomBindings,
			'octane/dom-bindings': DomBindings,
			'octane/dom-binding-signals': DomBindingSignals,
		},
	};
	const server = loadCompiledFixtureSource(source, { ...options, id, mode: 'server' });
	const descriptor = loadCompiledFixtureSource(source, {
		...options,
		id: id + '?octane-bindings=Action',
		mode: 'client',
	});
	const client = loadCompiledFixtureSource(
		`
import { adoptBindings } from 'octane/behavior';
import { Action } from './behavior-action.tsrx';
export function attach(root, source, options) { return adoptBindings(root, Action, source, options); }
export function attachOrdered(root, source, options) {
  return adoptBindings(root(), Action, source(), options());
}
export function attachPair(first, second, source) {
  let inner;
  const outer = adoptBindings(first, Action, {
    getSnapshot: source.getSnapshot,
    subscribe(notify) {
      inner = adoptBindings(second, Action, source);
      return source.subscribe(notify);
    },
  });
  return { outer, inner };
}
`,
		{
			...options,
			id: '/src/behavior-activation.tsrx',
			mode: 'client',
			runtimeModules: {
				'octane/behavior': DomBindings,
				'octane/dom-bindings': DomBindings,
				'./behavior-action.tsrx?octane-bindings=Action': descriptor,
			},
		},
	);
	let snapshot: Record<string, unknown> = {
		type: 'submit',
		disabled: false,
		active: false,
		label: 'Send',
		classes: ['action', { ready: true }],
		hidden: true,
		opacity: 1,
		width: 0,
		tone: 'black',
	};
	const subscriptions = new Set<() => void>();
	const cleanup = vi.fn();
	const state = {
		getSnapshot: () => snapshot,
		subscribe(notify: () => void) {
			subscriptions.add(notify);
			return () => {
				subscriptions.delete(notify);
				cleanup();
			};
		},
	};
	return {
		html: renderToString(server.Action, snapshot).html,
		state,
		cleanup,
		attach: client.attach as (
			root: Element,
			source: typeof state,
			options?: DomBindings.BindingOptions,
		) => DomBindings.BindingHandle,
		attachPair: client.attachPair as (
			first: Element,
			second: Element,
			source: typeof state,
		) => { outer: DomBindings.BindingHandle; inner: DomBindings.BindingHandle },
		attachOrdered: client.attachOrdered as (
			root: () => Element,
			source: () => typeof state,
			options: () => DomBindings.BindingOptions | undefined,
		) => DomBindings.BindingHandle,
		publish(next: Record<string, unknown>, notify = true) {
			snapshot = { ...snapshot, ...next };
			if (notify) for (const callback of subscriptions) callback();
		},
	};
}

function authoredControlBindings(dev = false) {
	const id = '/src/behavior-composer.tsrx';
	const source = `import { unbound } from 'octane/behavior';
export function Composer(props) @{
  'use dom bindings';
  <form action={unbound('/send')} data-mode={props.mode}
    class={[unbound(props.externalClass), props.expanded ? 'expanded atom-shared' : 'compact']}>
    <label for={unbound('draft')}>{unbound(props.label)}</label>
    <textarea id={unbound('draft')} name={unbound('draft')} value={unbound(props.draft)}
      aria-invalid={props.invalid} disabled={props.disabled} class={{ 'composer-large': props.expanded }} />
    <input type="hidden" name="token" value={unbound(props.token)} />
    <span aria-live="polite">{unbound(props.status)}</span>
    {unbound(props.children)}
  </form>
}`;
	const options = {
		compileOptions: { dev, hmr: false },
		runtimeModules: {
			'octane/behavior': DomBindings,
			'octane/dom-binding-classes': DomBindingClasses,
			'octane/dom-bindings': DomBindings,
			'octane/dom-binding-signals': DomBindingSignals,
		},
	};
	const server = loadCompiledFixtureSource(source, { ...options, id, mode: 'server' });
	const descriptor = loadCompiledFixtureSource(source, {
		...options,
		id: id + '?octane-bindings=Composer',
		mode: 'client',
	});
	const client = loadCompiledFixtureSource(
		`import { adoptBindings } from 'octane/behavior';
import { Composer } from './behavior-composer.tsrx';
export function attach(root, source, options) { return adoptBindings(root, Composer, source, options); }`,
		{
			...options,
			id: '/src/behavior-composer-activation.tsrx',
			mode: 'client',
			runtimeModules: {
				'octane/behavior': DomBindings,
				'octane/dom-bindings': DomBindings,
				'./behavior-composer.tsrx?octane-bindings=Composer': descriptor,
			},
		},
	);
	let snapshot = {
		mode: 'idle',
		externalClass: 'theme atom-shared',
		expanded: true,
		label: 'Message',
		draft: 'Server draft',
		invalid: false,
		disabled: false,
		token: 'server-token',
		status: 'Ready',
		children: null,
	};
	const subscriptions = new Set<() => void>();
	const cleanup = vi.fn();
	const state = {
		getSnapshot: () => snapshot,
		subscribe(notify: () => void) {
			subscriptions.add(notify);
			return () => {
				subscriptions.delete(notify);
				cleanup();
			};
		},
	};
	return {
		html: renderToString(server.Composer, snapshot).html,
		state,
		cleanup,
		attach: client.attach as (
			root: Element,
			source: typeof state,
			options?: DomBindings.BindingOptions,
		) => DomBindings.BindingHandle,
		publish(next: Partial<typeof snapshot>) {
			snapshot = { ...snapshot, ...next };
			for (const callback of subscriptions) callback();
		},
	};
}

function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
} {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((complete, fail) => {
		resolve = complete;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe('behavior-only roots', () => {
	let container: HTMLElement;
	let roots: Array<ReturnType<typeof attachBehaviorRoot>>;
	let hydratedRoot: ReturnType<typeof hydrateRoot> | undefined;

	function attach(
		target: Element = container,
		options?: Parameters<typeof attachBehaviorRoot>[1],
	): ReturnType<typeof attachBehaviorRoot> {
		const root = attachBehaviorRoot(target, options);
		roots.push(root);
		return root;
	}

	beforeEach(() => {
		container = document.createElement('main');
		document.body.appendChild(container);
		roots = [];
		hydratedRoot = undefined;
	});

	afterEach(() => {
		for (const root of roots) root.dispose();
		hydratedRoot?.unmount();
		container.remove();
	});

	for (const dev of [false, true]) {
		it(`preserves native renderer event policy for explicitly unbound lowercase props (${dev ? 'dev' : 'prod'})`, () => {
			const source = `import { unbound } from 'octane/behavior';
export function EventHost(props) @{ 'use dom bindings';
 <button class={props.className} online={unbound(props.networkState)} onload={unbound(props.inlineText)} onkeydown={unbound(props.lowercaseHandler)} onClick={unbound(props.onClick)}>{unbound(props.children)}</button>
}`;
			const onClick = vi.fn();
			const lowercaseHandler = vi.fn();
			const props = {
				className: 'early',
				onClick,
				lowercaseHandler,
				networkState: 'connected',
				inlineText: 'throw new Error("inline handler must not run")',
				children: 'Action',
			};
			expect(() =>
				authoredPresentation(
					'EventHost',
					props,
					dev,
					source.replace(
						'onkeydown={unbound(props.lowercaseHandler)}',
						'onkeydown={props.lowercaseHandler}',
					),
				),
			).toThrow(/attribute "onkeydown" is not supported in binding views/);
			const fixture = authoredPresentation('EventHost', props, dev, source);
			container.innerHTML = fixture.html;
			const button = container.querySelector('button')!;
			const binding = fixture.attach(button, fixture.state);
			expect(button.hasAttribute('online')).toBe(false);
			expect(button.hasAttribute('onload')).toBe(false);
			button.click();
			expect(onClick).not.toHaveBeenCalled();
			expect(lowercaseHandler).not.toHaveBeenCalled();
			hydratedRoot = hydrateRoot(container, fixture.loadClient().EventHost, props, {
				bindingLeases: [binding],
			});
			const event = new MouseEvent('click', { bubbles: true });
			flushSync(() => button.dispatchEvent(event));
			expect(container.querySelector('button')).toBe(button);
			expect(onClick).toHaveBeenCalledOnce();
			expect(onClick.mock.calls[0][0]).toBe(event);
			button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
			expect(lowercaseHandler).not.toHaveBeenCalled();
			expect(button.hasAttribute('onkeydown')).toBe(false);
			expect(button.hasAttribute('online')).toBe(false);
			expect(button.hasAttribute('onload')).toBe(false);
			expect(fixture.cleanup).toHaveBeenCalledOnce();
			hydratedRoot.unmount();
			hydratedRoot = undefined;
			button.click();
			expect(onClick).toHaveBeenCalledOnce();
			expect(lowercaseHandler).not.toHaveBeenCalled();
		});

		it(`hydrates a native textarea signal value without rendering its handle (${dev ? 'dev' : 'prod'})`, async () => {
			const scope = createScope({ scopeKey: `native-textarea-${dev}` });
			const draft = scope.signal$('draft', 'server draft');
			const props: NativeControlPresentationProps = {
				draft,
				readOnly: scope.signal$('readonly', false),
				disabled: scope.signal$('disabled', false),
				required: scope.signal$('required', true),
				placeholder: scope.signal$('placeholder', 'Search'),
			};
			const fixture = authoredPresentation('NativeControlPresentation', props, dev);
			container.innerHTML = fixture.html;
			const textarea = container.querySelector('textarea')!;
			try {
				expect(textarea.value).toBe('server draft');
				textarea.value = 'restored draft';
				const client = fixture.loadClient();
				hydratedRoot = hydrateRoot(container, client.NativeControlPresentation, props, {
					signalOwner: scope,
				});
				await act(() => {});
				expect(container.querySelector('textarea')).toBe(textarea);
				expect(textarea.value).toBe('restored draft');
				expect(draft.get()).toBe('restored draft');
				await act(() => draft.set('model update'));
				expect(textarea.value).toBe('model update');
				textarea.value = 'native edit';
				await act(() => textarea.dispatchEvent(new InputEvent('input', { bubbles: true })));
				expect(draft.get()).toBe('native edit');
			} finally {
				hydratedRoot?.unmount();
				hydratedRoot = undefined;
				scope.dispose();
			}
		});

		for (const spread of [
			undefined,
			'unbound(stylex.attrs(sx))',
			'(unbound as typeof unbound)((stylex.attrs(sx) as Record<string, unknown>))',
			'unbound!(stylex.attrs(sx))',
			'unbound((stylex.attrs as typeof stylex.attrs)(sx))',
			'unbound(stylex.attrs!(sx))',
			'unbound((stylex as typeof stylex).attrs(sx))',
			'unbound(stylex!.attrs(sx))',
			'unbound((stylex satisfies typeof stylex).attrs(sx))',
		]) {
			const styled = spread !== undefined;
			it(`hands an early native textarea control and presentation to hydration (${dev ? 'dev' : 'prod'}, ${spread ?? 'native'})`, async () => {
				const scope = createScope({ scopeKey: `native-textarea-handoff-${dev}` });
				const draft = scope.signal$('draft', 'server draft');
				const readOnly = scope.signal$('readonly', false);
				const disabled = scope.signal$('disabled', false);
				const required = scope.signal$('required', false);
				const placeholder = scope.signal$('placeholder', 'Message');
				const onReady = vi.fn();
				const onKeyDown = vi.fn();
				const earlyReady = vi.fn();
				const earlyKeyDown = vi.fn();
				const props = {
					action: '/server-submit',
					inert: false,
					layoutMode: 'server-mode',
					stateLabel: 'server-state',
					tabIndex: 0,
					onReady,
					onKeyDown,
					draft,
					readOnly,
					disabled,
					required,
					placeholder,
					styles: { $$css: true as const, color: 'early-color' },
				};
				const attrs = vi.fn(Stylex.attrs);
				const view = styled ? 'NativeStylexControlPresentation' : 'NativeControlPresentation';
				const source = styled
					? `${presentationSource}
import * as stylex from '@stylexjs/stylex';
export function NativeStylexControlPresentation({
  draft: draft$, readOnly, disabled, required, placeholder, styles: sx,
}: NativeControlPresentationProps & { styles: stylex.CompiledStyles }) @{
  'use dom bindings';
  <textarea {...${spread}} value={unbound(draft$)}
    readOnly={readOnly} disabled={disabled} required={required} placeholder={placeholder} />
}
export function NativeStylexControlHost(props: NativeControlHostProps) @{
  'use dom bindings';
  <form {...stylex.attrs({ $$css: true, layout: props.className })}
    data-layout-mode={props.layoutMode} aria-label={props.stateLabel} tabIndex={props.tabIndex}
    action={unbound(props.action)} inert={unbound(props.inert)}
    ref={unbound(props.onReady)} onKeyDown={unbound(props.onKeyDown)}>{unbound(props.children)}</form>
}
export function NativeStylexControlLayout(props: NativeControlPresentationProps & NativeControlHostProps & { styles: stylex.CompiledStyles }) @{
  <NativeStylexControlHost className={props.className}
    layoutMode={props.layoutMode} stateLabel={props.stateLabel} tabIndex={props.tabIndex}
    action={props.action} inert={props.inert}
    onReady={props.onReady} onKeyDown={props.onKeyDown}>
    <NativeStylexControlPresentation draft={props.draft} readOnly={props.readOnly}
      disabled={props.disabled} required={props.required} placeholder={props.placeholder} styles={props.styles} />
    <p>{'Message'}</p>
  </NativeStylexControlHost>
}`
					: presentationSource;
				const modules = { '@stylexjs/stylex': { ...Stylex, attrs } };
				const compileOptions = {
					knownAttributeSpreads: [
						{
							source: '@stylexjs/stylex',
							imported: '*',
							members: ['attrs'],
							fields: ['class', 'style', 'data-style-src'],
						},
					],
				};
				const fixture = authoredPresentation(view, props, dev, source, modules, compileOptions);
				const layout =
					!styled || spread === 'unbound(stylex.attrs(sx))'
						? authoredPresentation(
								styled ? 'NativeStylexControlHost' : 'NativeControlHost',
								{
									className: 'compact',
									layoutMode: 'early-mode',
									stateLabel: 'early-state',
									tabIndex: -1,
									action: '/ignored-early',
									inert: true,
									onReady: earlyReady,
									onKeyDown: earlyKeyDown,
								},
								dev,
								source,
								modules,
								compileOptions,
							)
						: undefined;
				const layoutView = styled ? 'NativeStylexControlLayout' : 'NativeControlLayout';
				container.innerHTML = layout
					? renderToString(fixture.server[layoutView], { ...props, className: 'compact' }).html
					: fixture.html;
				const form = container.querySelector('form');
				const description = container.querySelector('p');
				const textarea = container.querySelector('textarea')!;
				textarea.value = 'restored before activation';
				const control = runWithSignalOwner(scope, () =>
					bindSignalControl(textarea, 'value', draft),
				);
				let binding: DomBindings.BindingHandle | undefined;
				let layoutBinding: DomBindings.BindingHandle | undefined;
				try {
					expect(draft.get()).toBe('restored before activation');
					expect(textarea.value).toBe('restored before activation');
					if (layout) {
						layoutBinding = layout.attach(form!, layout.state);
						layout.publish({
							className: 'expanded has-status',
							layoutMode: 'expanded-mode',
							stateLabel: 'expanded-state',
							tabIndex: -1,
						});
						expect(form!.className).toBe('expanded has-status');
						expect([
							form!.getAttribute('data-layout-mode'),
							form!.getAttribute('aria-label'),
							form!.tabIndex,
						]).toEqual(['expanded-mode', 'expanded-state', -1]);
						expect(form!.querySelector('textarea')).toBe(textarea);
						expect(form!.querySelector('p')).toBe(description);
						expect(form!.getAttribute('action')).toBe('/server-submit');
						expect(form!.hasAttribute('inert')).toBe(false);
						form!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
						expect(earlyReady).not.toHaveBeenCalled();
						expect(earlyKeyDown).not.toHaveBeenCalled();
						expect(onReady).not.toHaveBeenCalled();
						expect(onKeyDown).not.toHaveBeenCalled();
					}
					attrs.mockClear();
					binding = runWithSignalOwner(scope, () => fixture.attach(textarea, fixture.state));
					expect(attrs).not.toHaveBeenCalled();
					if (styled) expect(textarea.className).toBe('early-color');
					placeholder.set('Search');
					readOnly.set(true);
					disabled.set(true);
					required.set(true);
					expect([
						textarea.readOnly,
						textarea.disabled,
						textarea.required,
						textarea.placeholder,
					]).toEqual([true, true, true, 'Search']);
					readOnly.set(false);
					disabled.set(false);
					textarea.focus();
					textarea.value = 'early draft';
					textarea.setSelectionRange(2, 7, 'backward');
					textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
					textarea.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
					expect(draft.get()).toBe('early draft');
					const client = fixture.loadClient();
					const options = {
						signalOwner: scope,
						bindingLeases: layoutBinding ? [layoutBinding, binding] : [binding],
						controlLeases: [control],
					};
					hydratedRoot = hydrateRoot(
						container,
						client[layout ? layoutView : view],
						layout
							? {
									...props,
									className: 'expanded has-status',
									layoutMode: 'accepted-mode',
									stateLabel: null,
									tabIndex: 0,
									action: '/accepted-submit',
								}
							: props,
						options,
					);
					await act(() => {});
					if (layout) {
						expect(container.querySelector('form')).toBe(form);
						expect(form!.querySelector('p')).toBe(description);
						expect(form!.className).toBe('expanded has-status');
						expect([
							form!.getAttribute('data-layout-mode'),
							form!.getAttribute('aria-label'),
							form!.tabIndex,
						]).toEqual(['accepted-mode', null, 0]);
						expect(layout.cleanup).toHaveBeenCalledOnce();
						expect(form!.getAttribute('action')).toBe('/accepted-submit');
						expect(form!.hasAttribute('inert')).toBe(false);
						expect(onReady).toHaveBeenCalledExactlyOnceWith(form);
						form!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
						expect(onKeyDown).toHaveBeenCalledOnce();
						expect(onKeyDown.mock.calls[0][0]).toBeInstanceOf(KeyboardEvent);
						expect(earlyReady).not.toHaveBeenCalled();
						expect(earlyKeyDown).not.toHaveBeenCalled();
						layout.publish({
							className: 'stale early layout',
							layoutMode: 'stale-mode',
							stateLabel: 'stale-state',
							tabIndex: -1,
						});
						layoutBinding!.refresh();
						expect(form!.className).toBe('expanded has-status');
						expect([
							form!.getAttribute('data-layout-mode'),
							form!.getAttribute('aria-label'),
							form!.tabIndex,
						]).toEqual(['accepted-mode', null, 0]);
					}
					expect(container.querySelector('textarea')).toBe(textarea);
					expect(document.activeElement).toBe(textarea);
					expect(textarea.value).toBe('early draft');
					expect([
						textarea.selectionStart,
						textarea.selectionEnd,
						textarea.selectionDirection,
					]).toEqual([2, 7, 'backward']);
					expect(textarea.placeholder).toBe('Search');
					expect(fixture.cleanup).toHaveBeenCalledOnce();
					expect(() => bindSignalControl(textarea, 'value', draft)).toThrow(
						/already has a signal binding/,
					);
					control();
					await act(() => {
						draft.set('early draft');
						placeholder.set('Typing');
						required.set(false);
					});
					expect(textarea.value).toBe('early draft');
					expect(textarea.placeholder).toBe('Typing');
					expect(textarea.required).toBe(false);
					expect([
						textarea.selectionStart,
						textarea.selectionEnd,
						textarea.selectionDirection,
					]).toEqual([2, 7, 'backward']);
					textarea.value = 'early draft composed';
					textarea.setSelectionRange(3, 8, 'backward');
					await act(() =>
						textarea.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true })),
					);
					expect(draft.get()).toBe('early draft composed');
					expect(document.activeElement).toBe(textarea);
					if (styled) {
						textarea.value = 'uncommitted composition';
						textarea.blur();
						await new Promise((resolve) => setTimeout(resolve, 0));
						expect(textarea.value).toBe('early draft composed');
						expect(draft.get()).toBe('early draft composed');
					} else textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
					await act(() => {});
					await act(() => draft.set('hydrated model'));
					expect(textarea.value).toBe('hydrated model');
					textarea.value = 'hydrated edit';
					await act(() => textarea.dispatchEvent(new InputEvent('input', { bubbles: true })));
					expect(draft.get()).toBe('hydrated edit');
					if (layout) {
						await act(() =>
							hydratedRoot!.render(client[layoutView], {
								...props,
								className: 'renderer compact',
								layoutMode: null,
								stateLabel: 'renderer-state',
								tabIndex: undefined,
								action: '/renderer-submit',
							}),
						);
						expect(container.querySelector('form')).toBe(form);
						expect(form!.className).toBe('renderer compact');
						expect([
							form!.getAttribute('data-layout-mode'),
							form!.getAttribute('aria-label'),
							form!.tabIndex,
						]).toEqual([null, 'renderer-state', -1]);
						expect(form!.hasAttribute('tabindex')).toBe(false);
						expect(form!.getAttribute('action')).toBe('/renderer-submit');
						form!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
						expect(onKeyDown).toHaveBeenCalledTimes(2);
						expect(earlyKeyDown).not.toHaveBeenCalled();
						expect(form!.querySelector('textarea')).toBe(textarea);
						expect(form!.querySelector('p')).toBe(description);
						expect(textarea.value).toBe('hydrated edit');
						layout.publish({ className: 'stale again' });
						layoutBinding!.refresh();
						expect(form!.className).toBe('renderer compact');
						expect([
							form!.getAttribute('data-layout-mode'),
							form!.getAttribute('aria-label'),
							form!.tabIndex,
						]).toEqual([null, 'renderer-state', -1]);
						expect(form!.hasAttribute('tabindex')).toBe(false);
					}
					hydratedRoot.unmount();
					hydratedRoot = undefined;
					expect(fixture.cleanup).toHaveBeenCalledOnce();
					if (layout) {
						expect(layout.cleanup).toHaveBeenCalledOnce();
						expect(onReady).toHaveBeenCalledTimes(2);
						expect(onReady).toHaveBeenLastCalledWith(null);
						expect(earlyReady).not.toHaveBeenCalled();
					}
				} finally {
					hydratedRoot?.unmount();
					hydratedRoot = undefined;
					binding?.dispose();
					layoutBinding?.dispose();
					control();
					scope.dispose();
				}
			});
		}

		it(`preserves an early textarea edit back to its server value against stale restoration (${dev ? 'dev' : 'prod'})`, async () => {
			const scope = createScope({ scopeKey: `native-textarea-restoration-${dev}` });
			const draft = scope.signal$('draft', 'server draft');
			const props = {
				draft,
				readOnly: scope.signal$('readonly', false),
				disabled: scope.signal$('disabled', false),
				required: scope.signal$('required', true),
				placeholder: scope.signal$('placeholder', 'Search'),
			};
			const fixture = authoredPresentation('NativeControlPresentation', props, dev);
			container.innerHTML = fixture.html;
			const textarea = container.querySelector('textarea')!;
			const control = runWithSignalOwner(scope, () => bindSignalControl(textarea, 'value', draft));
			const binding = runWithSignalOwner(scope, () => fixture.attach(textarea, fixture.state));
			try {
				const stale = captureHydrationControlCandidate(textarea)!;
				textarea.value = 'early edit';
				textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
				textarea.value = 'server draft';
				textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
				expect(draft.get()).toBe('server draft');
				hydratedRoot = hydrateRoot(
					container,
					fixture.loadClient().NativeControlPresentation,
					props,
					{
						signalOwner: scope,
						bindingLeases: [binding],
						controlLeases: [control],
					},
				);
				await act(() => {});
				expect(applyHydrationControlCandidate(stale, { value: 'stale restored draft' })).toBe(
					false,
				);
				expect(container.querySelector('textarea')).toBe(textarea);
				expect(textarea.value).toBe('server draft');
				expect(draft.get()).toBe('server draft');
			} finally {
				hydratedRoot?.unmount();
				hydratedRoot = undefined;
				binding.dispose();
				control();
				scope.dispose();
			}
		});

		for (const outcome of ['resume', 'abort'] as const) {
			it(`keeps the early textarea owner active through ${outcome} of suspended hydration (${dev ? 'dev' : 'prod'})`, async () => {
				const scope = createScope({ scopeKey: `native-textarea-${outcome}-${dev}` });
				const draft = scope.signal$('draft', 'server draft');
				const placeholder = scope.signal$('placeholder', 'Message');
				const props = {
					draft,
					placeholder,
					readOnly: scope.signal$('readonly', false),
					disabled: scope.signal$('disabled', false),
					required: scope.signal$('required', true),
				};
				const source = `${presentationSource}
import { useEffect } from 'octane';
import 'octane/signals';
type NativeRetryProps = {
 draft: SignalHandle<string>;
 label: string;
 log(entry: string): void;
};
function NativeRetryChild(props: NativeRetryProps) @{
 const value = props.draft.get();
 useEffect(() => {
  props.log('setup:' + props.label);
  return () => props.log('cleanup:' + props.label);
 }, [123]);
 <output>{(props.label + ':' + value) as string}</output>
}
function NativeRetryBridge(props: NativeRetryProps) @{
 <section><NativeRetryChild draft={props.draft} label={props.label} log={props.log} /></section>
}
export function NativeRetryApp(props: NativeRetryProps) @{
 <div><NativeRetryBridge draft={props.draft} label={props.label} log={props.log} /></div>
}`;
				const fixture = authoredPresentation('NativeControlPresentation', props, dev, source);
				const layout = authoredPresentation(
					'NativeControlHost',
					{ className: 'compact' },
					dev,
					source,
				);
				const pending = deferred<void>();
				const onHydrated = vi.fn();
				const onUncaughtError = vi.fn();
				const application = {
					...props,
					className: 'compact',
					when: never(),
					suspend: false,
					promise: pending.promise,
					onHydrated,
				};
				container.innerHTML = renderToString(
					fixture.server.NativeControlHydration,
					application,
				).html;
				const form = container.querySelector('form')!;
				const textarea = container.querySelector('textarea')!;
				const suffix = container.querySelector('span')!;
				const layoutBinding = layout.attach(form, layout.state);
				const control = runWithSignalOwner(scope, () =>
					bindSignalControl(textarea, 'value', draft),
				);
				const binding = runWithSignalOwner(scope, () => fixture.attach(textarea, fixture.state));
				const client = fixture.loadClient();
				const subscriptions: ReturnType<typeof vi.fn>[] = [];
				const subscribe = draft[SIGNAL_BINDING_SUBSCRIBE].bind(draft);
				const subscription = vi
					.spyOn(draft, SIGNAL_BINDING_SUBSCRIBE)
					.mockImplementation((notify, onRetire) => {
						const stop = vi.fn(subscribe(notify, onRetire));
						subscriptions.push(stop);
						return stop;
					});
				try {
					hydratedRoot = hydrateRoot(container, client.NativeControlHydration, application, {
						signalOwner: scope,
						bindingLeases: [layoutBinding, binding],
						controlLeases: [control],
						onUncaughtError,
					});
					await act(() =>
						hydratedRoot!.render(client.NativeControlHydration, {
							...application,
							when: condition(true),
							suspend: true,
						}),
					);
					expect(onHydrated).not.toHaveBeenCalled();
					expect(fixture.cleanup).not.toHaveBeenCalled();
					expect(layout.cleanup).not.toHaveBeenCalled();
					// A separate native consumer can retry while this island keeps its
					// early owners. Only the surviving presentation may connect effects.
					const retryContainer = document.createElement('div');
					document.body.appendChild(retryContainer);
					const retryErrors = vi.fn();
					const retryRoot = createRoot(retryContainer, { onUncaughtError: retryErrors });
					const retryLog: string[] = [];
					const retryProps = {
						draft,
						label: 'A',
						log: (entry: string) => retryLog.push(entry),
					};
					try {
						retryRoot.render(client.NativeRetryApp, retryProps);
						retryRoot.render(client.NativeRetryApp, { ...retryProps, label: 'B' });
						await act(() => {});
						expect(retryContainer.textContent).toBe('B:server draft');
						expect(retryLog).toEqual(['setup:B']);
						expect(retryErrors).not.toHaveBeenCalled();
						expect(container.querySelector('textarea')).toBe(textarea);
						expect(container.querySelector('form')).toBe(form);
						expect(textarea.value).toBe('server draft');
						expect(fixture.cleanup).not.toHaveBeenCalled();
						expect(layout.cleanup).not.toHaveBeenCalled();
						await act(() => retryRoot.unmount());
						expect(retryLog).toEqual(['setup:B', 'cleanup:B']);
					} finally {
						retryRoot.unmount();
						retryContainer.remove();
					}
					for (let index = 0; index < 4; index++) {
						await act(() => draft.set('pending model ' + index));
						expect(textarea.value).toBe('pending model ' + index);
						expect(fixture.cleanup).not.toHaveBeenCalled();
						expect(layout.cleanup).not.toHaveBeenCalled();
					}
					layout.publish({ className: 'expanded has-status' });
					expect(form.className).toBe('expanded has-status');
					expect(form.querySelector('textarea')).toBe(textarea);
					expect(form.querySelector('span')).toBe(suffix);
					expect(layout.cleanup).not.toHaveBeenCalled();
					placeholder.set('Search');
					textarea.value = 'edit while suspended';
					textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
					expect(draft.get()).toBe('edit while suspended');
					expect(textarea.placeholder).toBe('Search');
					if (outcome === 'abort')
						await act(() => hydratedRoot!.render(client.NativeControlHydration, application));
					await act(() => pending.resolve());
					expect(container.querySelector('form')).toBe(form);
					expect(form.querySelector('span')).toBe(suffix);
					expect(container.querySelector('textarea')).toBe(textarea);
					expect(textarea.value).toBe('edit while suspended');
					if (outcome === 'resume') {
						expect(onHydrated).toHaveBeenCalledOnce();
						expect(fixture.cleanup).toHaveBeenCalledOnce();
						expect(layout.cleanup).toHaveBeenCalledOnce();
						expect(form.className).toBe('compact');
						layout.publish({ className: 'stale layout' });
						layoutBinding.refresh();
						expect(form.className).toBe('compact');
						control();
					} else {
						expect(onHydrated).not.toHaveBeenCalled();
						expect(fixture.cleanup).not.toHaveBeenCalled();
						expect(layout.cleanup).not.toHaveBeenCalled();
						layout.publish({ className: 'early after abort' });
						expect(form.className).toBe('early after abort');
					}
					expect(onUncaughtError).not.toHaveBeenCalled();
					await act(() => placeholder.set('Still live'));
					textarea.value = 'next native edit';
					await act(() => textarea.dispatchEvent(new InputEvent('input', { bubbles: true })));
					expect(draft.get()).toBe('next native edit');
					expect(textarea.placeholder).toBe('Still live');
					hydratedRoot.unmount();
					hydratedRoot = undefined;
					for (const stop of subscriptions) expect(stop).toHaveBeenCalledOnce();
				} finally {
					subscription.mockRestore();
					hydratedRoot?.unmount();
					hydratedRoot = undefined;
					binding.dispose();
					layoutBinding.dispose();
					control();
					scope.dispose();
				}
			});
		}

		for (const refusal of [
			'missing',
			'stale',
			'foreign',
			'mismatched',
			'readonly',
			'replaced during preparation',
			'opaque sibling during preparation',
		] as const) {
			it(`retains the early textarea after a ${refusal} control handoff is declined (${dev ? 'dev' : 'prod'})`, async () => {
				const scope = createScope({ scopeKey: `native-textarea-${refusal}-${dev}` });
				const draft = scope.signal$('draft', 'server draft');
				const placeholder = scope.signal$('placeholder', 'Message');
				const props = {
					draft,
					placeholder,
					readOnly: scope.signal$('readonly', false),
					disabled: scope.signal$('disabled', false),
					required: scope.signal$('required', true),
				};
				const view =
					refusal === 'opaque sibling during preparation'
						? 'NativeControlSiblingPresentation'
						: 'NativeControlPresentation';
				const fixture = authoredPresentation(view, props, dev);
				const layout =
					refusal === 'opaque sibling during preparation'
						? undefined
						: authoredPresentation('NativeControlHost', { className: 'compact' }, dev);
				container.innerHTML = layout
					? renderToString(fixture.server.NativeControlLayout, { ...props, className: 'compact' })
							.html
					: fixture.html;
				const form = container.querySelector('form');
				const layoutBinding = layout?.attach(form!, layout.state);
				const textarea = container.querySelector('textarea')!;
				let control = runWithSignalOwner(scope, () => bindSignalControl(textarea, 'value', draft));
				const binding = runWithSignalOwner(scope, () =>
					fixture.attach(layout ? textarea : container.firstElementChild!, fixture.state),
				);
				let offered = control;
				let foreign: HTMLTextAreaElement | undefined;
				let opaque: HTMLElement | undefined;
				if (refusal === 'stale') {
					control();
					control = runWithSignalOwner(scope, () => bindSignalControl(textarea, 'value', draft));
				} else if (refusal === 'foreign') {
					foreign = document.createElement('textarea');
					document.body.append(foreign);
					offered = runWithSignalOwner(scope, () => bindSignalControl(foreign!, 'value', draft));
				}
				const nextDraft =
					refusal === 'readonly'
						? scope.derived$('readonly-draft', () => draft.get())
						: refusal === 'mismatched'
							? scope.signal$('other-draft', 'different model')
							: draft;
				const client = fixture.loadClient();
				const readPlaceholder = placeholder.get.bind(placeholder);
				const preparation = vi.spyOn(placeholder, 'get');
				const onUncaughtError = vi.fn();
				if (refusal === 'replaced during preparation')
					preparation.mockImplementationOnce(() => {
						control();
						control = runWithSignalOwner(scope, () => bindSignalControl(textarea, 'value', draft));
						return readPlaceholder();
					});
				else if (refusal === 'opaque sibling during preparation')
					preparation.mockImplementationOnce(() => {
						opaque = document.createElement('strong');
						container.querySelector('span')!.append(opaque);
						return readPlaceholder();
					});
				try {
					const takeOver = () => {
						hydratedRoot = hydrateRoot(
							container,
							client[layout ? 'NativeControlLayout' : view],
							{ ...props, draft: nextDraft, className: 'renderer layout' },
							{
								signalOwner: scope,
								bindingLeases: layoutBinding ? [layoutBinding, binding] : [binding],
								...(refusal === 'missing' ? {} : { controlLeases: [offered] }),
								onUncaughtError,
							},
						);
					};
					if (refusal.endsWith('during preparation')) {
						takeOver();
						await act(() => {});
						expect(preparation).toHaveBeenCalled();
						expect(onUncaughtError).toHaveBeenCalledOnce();
						expect(onUncaughtError).toHaveBeenCalledWith(
							expect.objectContaining({
								message: expect.stringMatching(
									/supported fixed native view|Minified Octane error #75;/,
								),
							}),
						);
					} else
						expect(takeOver).toThrow(
							refusal === 'stale' || refusal === 'foreign'
								? /active fixed native views|Minified Octane error #77;/
								: /supported fixed native view|Minified Octane error #75;/,
						);
					preparation.mockRestore();
					expect(container.querySelector('textarea')).toBe(textarea);
					expect(fixture.cleanup).not.toHaveBeenCalled();
					if (layout) {
						expect(container.querySelector('form')).toBe(form);
						expect(form!.className).toBe('compact');
						expect(layout.cleanup).not.toHaveBeenCalled();
						layout.publish({ className: 'early after refusal' });
						expect(form!.className).toBe('early after refusal');
					}
					placeholder.set('Search');
					textarea.value = 'early owner survived';
					textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
					expect(draft.get()).toBe('early owner survived');
					expect(textarea.placeholder).toBe('Search');
					if (opaque !== undefined) {
						expect(container.querySelector('span')!.firstElementChild).toBe(opaque);
						opaque.remove();
					}
					hydratedRoot = hydrateRoot(
						container,
						client[layout ? 'NativeControlLayout' : view],
						{ ...props, className: 'renderer layout' },
						{
							signalOwner: scope,
							bindingLeases: layoutBinding ? [layoutBinding, binding] : [binding],
							controlLeases: [control],
						},
					);
					await act(() => {});
					expect(container.querySelector('textarea')).toBe(textarea);
					expect(textarea.value).toBe('early owner survived');
					expect(fixture.cleanup).toHaveBeenCalledOnce();
					if (layout) {
						expect(layout.cleanup).toHaveBeenCalledOnce();
						expect(container.querySelector('form')).toBe(form);
						expect(form!.className).toBe('renderer layout');
						layout.publish({ className: 'stale after retry' });
						layoutBinding!.refresh();
						expect(form!.className).toBe('renderer layout');
					}
				} finally {
					hydratedRoot?.unmount();
					hydratedRoot = undefined;
					binding.dispose();
					layoutBinding?.dispose();
					offered();
					control();
					preparation.mockRestore();
					foreign?.remove();
					scope.dispose();
				}
			});
		}

		for (const spread of [false, true]) {
			it(`rejects early presentation over unmatched normal textarea ${spread ? 'spread' : 'value'} SSR without retiring the native control (${dev ? 'dev' : 'prod'})`, () => {
				const scope = createScope({ scopeKey: `native-textarea-unmatched-${spread}-${dev}` });
				const draft = scope.signal$('draft', 'server draft');
				const props = {
					draft,
					readOnly: scope.signal$('readonly', false),
					disabled: scope.signal$('disabled', false),
					required: scope.signal$('required', true),
					placeholder: scope.signal$('placeholder', 'Search'),
				};
				const fixture = authoredPresentation('NativeControlPresentation', props, dev);
				container.innerHTML = renderToString(
					spread
						? fixture.server.UnmatchedNativeControlSpread
						: fixture.server.UnmatchedNativeControl,
					{ ...props, fields: { value: draft } },
				).html;
				const textarea = container.querySelector('textarea')!;
				const control = runWithSignalOwner(scope, () =>
					bindSignalControl(textarea, 'value', draft),
				);
				try {
					textarea.value = 'server draft';
					textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
					expect(() =>
						runWithSignalOwner(scope, () => fixture.attach(textarea, fixture.state)),
					).toThrow(/mismatched compiler-owned ranges or nodes/);
					expect(container.querySelector('textarea')).toBe(textarea);
					expect(fixture.cleanup).not.toHaveBeenCalled();
					draft.set('still active model');
					expect(textarea.value).toBe('still active model');
					textarea.value = 'still active input';
					textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
					expect(draft.get()).toBe('still active input');
				} finally {
					control();
					scope.dispose();
				}
			});
		}

		for (const replacement of [false, true]) {
			it(`does not claim a textarea ${replacement ? 'replaced' : 'disposed'} by a sibling owner retirement (${dev ? 'dev' : 'prod'})`, async () => {
				const scope = createScope({
					scopeKey: `native-textarea-sibling-retirement-${replacement}-${dev}`,
				});
				const first = scope.signal$('first', 'first draft');
				const second = scope.signal$('second', 'second draft');
				const successor = scope.signal$('successor', 'replacement draft');
				const publication: string[] = [];
				const props = {
					first,
					second,
					onReady: (element: HTMLElement | null) => {
						if (element !== null)
							publication.push('ref:' + element.querySelectorAll('textarea')[1].value);
					},
				};
				const fixture = authoredPresentation('NativeControlPairPresentation', props, dev);
				container.innerHTML = fixture.html;
				const [firstTextarea, secondTextarea] = container.querySelectorAll('textarea');
				let secondControl: ReturnType<typeof bindSignalControl>;
				let replacementControl: ReturnType<typeof bindSignalControl> | undefined;
				const onUncaughtError = vi.fn((_error: unknown) => {
					publication.push('refusal');
				});
				const cleanup = vi.fn(() => {
					publication.push('retire');
					secondControl();
					if (replacement)
						replacementControl = runWithSignalOwner(scope, () =>
							bindSignalControl(secondTextarea, 'value', successor),
						);
				});
				const subscribe = first[SIGNAL_BINDING_SUBSCRIBE].bind(first);
				const subscription = vi
					.spyOn(first, SIGNAL_BINDING_SUBSCRIBE)
					.mockImplementationOnce((notify, onRetire) => {
						const stop = subscribe(notify, onRetire);
						return () => {
							stop();
							cleanup();
						};
					});
				const firstControl = runWithSignalOwner(scope, () =>
					bindSignalControl(firstTextarea, 'value', first),
				);
				subscription.mockRestore();
				secondControl = runWithSignalOwner(scope, () =>
					bindSignalControl(secondTextarea, 'value', second),
				);
				const binding = runWithSignalOwner(scope, () =>
					fixture.attach(container.firstElementChild!, fixture.state),
				);
				try {
					publication.length = 0;
					hydratedRoot = hydrateRoot(
						container,
						fixture.loadClient().NativeControlPairPresentation,
						props,
						{
							signalOwner: scope,
							bindingLeases: [binding],
							controlLeases: [firstControl, secondControl],
							onUncaughtError,
						},
					);
					expect(cleanup).toHaveBeenCalledOnce();
					expect(secondTextarea.value).toBe(replacement ? 'replacement draft' : 'second draft');
					expect(onUncaughtError).toHaveBeenCalledOnce();
					expect(onUncaughtError.mock.calls[0][0]).toBeInstanceOf(Error);
					expect((onUncaughtError.mock.calls[0][0] as Error).message).toMatch(
						/active fixed native views|errors\/77/,
					);
					expect(publication).toEqual(['retire', 'refusal']);
					await act(() => {
						first.set('first hydrated');
						second.set('stale owner update');
					});
					// A distinct whole-view retry still cannot acquire the revoked channel.
					expect(onUncaughtError).toHaveBeenCalledTimes(2);
					expect(onUncaughtError.mock.calls[1][0]).toBeInstanceOf(Error);
					expect((onUncaughtError.mock.calls[1][0] as Error).message).toMatch(
						/supported fixed native view|errors\/75/,
					);
					expect(publication).toEqual(['retire', 'refusal', 'refusal']);
					expect([...container.querySelectorAll('textarea')]).toEqual([
						firstTextarea,
						secondTextarea,
					]);
					expect(firstTextarea.value).toBe('first draft');
					expect(secondTextarea.value).toBe(replacement ? 'replacement draft' : 'second draft');
					if (replacement) {
						await act(() => successor.set('replacement model update'));
						expect(secondTextarea.value).toBe('replacement model update');
					}
					secondTextarea.value = 'replacement native edit';
					await act(() => secondTextarea.dispatchEvent(new InputEvent('input', { bubbles: true })));
					expect(second.get()).toBe('stale owner update');
					expect(secondTextarea.value).toBe('replacement native edit');
					if (replacement) expect(successor.get()).toBe('replacement native edit');
					expect(onUncaughtError).toHaveBeenCalledTimes(2);
					expect(publication).toEqual(['retire', 'refusal', 'refusal']);
					hydratedRoot.unmount();
					hydratedRoot = undefined;
					firstControl();
					secondControl();
					if (!replacement)
						replacementControl = runWithSignalOwner(scope, () =>
							bindSignalControl(secondTextarea, 'value', successor),
						);
					successor.set('independent after unmount');
					expect(secondTextarea.value).toBe('independent after unmount');
				} finally {
					hydratedRoot?.unmount();
					hydratedRoot = undefined;
					binding.dispose();
					firstControl();
					secondControl();
					replacementControl?.();
					subscription.mockRestore();
					scope.dispose();
				}
			});
		}

		for (const mutation of [
			'removed',
			'replaced',
			'reparented',
			'ancestor reparented',
			'throwing replacement',
		] as const) {
			it(`does not claim a textarea ${mutation} by its own retirement cleanup (${dev ? 'dev' : 'prod'})`, async () => {
				for (const retirement of ['own', 'later', 'mixed', 'owner disposed'] as const) {
					const laterRetirement = retirement !== 'own';
					const scope = createScope({
						scopeKey: `native-textarea-own-retirement-${mutation}-${dev}-${retirement}`,
					});
					const draft = scope.signal$('draft', 'server draft');
					const secondScope =
						retirement === 'owner disposed' ? createScope({ scopeKey: 'retiring-second' }) : scope;
					const props = {
						draft,
						first: draft,
						second: secondScope.signal$('second', 'second draft'),
						readOnly: scope.signal$('readonly', false),
						disabled: scope.signal$('disabled', false),
						required: scope.signal$('required', true),
						placeholder: scope.signal$('placeholder', 'Search'),
					};
					const view =
						laterRetirement || mutation === 'ancestor reparented'
							? 'NativeControlPairPresentation'
							: 'NativeControlPresentation';
					const fixture = authoredPresentation(view, props, dev);
					container.innerHTML = fixture.html;
					const textarea = container.querySelector('textarea')!;
					const destination = document.createElement('div');
					const replacement = document.createElement('textarea');
					const failure = new Error('retirement moved the control');
					const cleanup = vi.fn(() => {
						if (secondScope !== scope) secondScope.dispose();
						if (mutation === 'removed') textarea.remove();
						else if (mutation === 'reparented' || mutation === 'ancestor reparented') {
							container.append(destination);
							destination.append(mutation === 'reparented' ? textarea : textarea.parentElement!);
						} else textarea.replaceWith(replacement);
						if (mutation === 'throwing replacement') throw failure;
					});
					const retiringSignal = laterRetirement ? props.second : draft;
					const subscribe = retiringSignal[SIGNAL_BINDING_SUBSCRIBE].bind(retiringSignal);
					const subscription = vi
						.spyOn(retiringSignal, SIGNAL_BINDING_SUBSCRIBE)
						.mockImplementationOnce((notify, onRetire) => {
							const stop = subscribe(notify, onRetire);
							return () => {
								stop();
								cleanup();
							};
						});
					const control =
						retirement === 'mixed'
							? undefined
							: runWithSignalOwner(scope, () => bindSignalControl(textarea, 'value', draft));
					const laterControl = laterRetirement
						? runWithSignalOwner(scope, () =>
								bindSignalControl(container.querySelectorAll('textarea')[1], 'value', props.second),
							)
						: undefined;
					const binding = runWithSignalOwner(scope, () =>
						fixture.attach(container.firstElementChild!, fixture.state),
					);
					const successorCleanup = vi.fn();
					subscription.mockImplementation((notify, onRetire) => {
						const stop = subscribe(notify, onRetire);
						return () => {
							stop();
							successorCleanup();
						};
					});
					const earlierCleanup = vi.fn(() => {
						if (mutation === 'throwing replacement') throw new Error('earlier successor cleanup');
					});
					const earlierSubscribe = draft[SIGNAL_BINDING_SUBSCRIBE].bind(draft);
					const earlierSubscription = laterRetirement
						? vi.spyOn(draft, SIGNAL_BINDING_SUBSCRIBE).mockImplementation((notify, onRetire) => {
								const stop = earlierSubscribe(notify, onRetire);
								return () => {
									stop();
									earlierCleanup();
								};
							})
						: undefined;
					const onUncaughtError = vi.fn();
					const next = scope.signal$('next', 'independent draft');
					let nextControl: ReturnType<typeof bindSignalControl> | undefined;
					let replacementControl: ReturnType<typeof bindSignalControl> | undefined;
					try {
						hydratedRoot = hydrateRoot(container, fixture.loadClient()[view], props, {
							signalOwner: scope,
							bindingLeases: [binding],
							controlLeases:
								control === undefined
									? [laterControl!]
									: laterControl === undefined
										? [control]
										: [control, laterControl],
							onUncaughtError,
						});
						expect(cleanup).toHaveBeenCalledOnce();
						expect(fixture.cleanup).toHaveBeenCalledOnce();
						expect(successorCleanup).toHaveBeenCalledOnce();
						expect(onUncaughtError).toHaveBeenCalledOnce();
						if (mutation === 'throwing replacement')
							expect(onUncaughtError).toHaveBeenCalledWith(failure);
						else
							expect(onUncaughtError.mock.calls[0][0].message).toMatch(
								/active fixed native views|errors\/77/,
							);
						if (mutation === 'ancestor reparented')
							expect(textarea.parentElement!.parentNode).toBe(destination);
						else expect(textarea.parentNode).toBe(mutation === 'reparented' ? destination : null);
						await act(() => draft.set('stale model update'));
						expect(textarea.value).toBe('server draft');
						textarea.value = 'unowned native edit';
						await act(() => textarea.dispatchEvent(new InputEvent('input', { bubbles: true })));
						expect(draft.get()).toBe('stale model update');
						expect(textarea.value).toBe('unowned native edit');
						if (laterRetirement) expect(earlierCleanup).toHaveBeenCalledOnce();
						for (let retry = 0; retry < 2; retry++) {
							try {
								await act(() => hydratedRoot!.render(fixture.loadClient()[view], props));
							} catch (error) {
								expect((error as Error).message).toMatch(/unmounted root|errors\/29/);
							}
							expect(textarea.value).toBe('unowned native edit');
							expect(draft.get()).toBe('stale model update');
						}
						for (const [error] of onUncaughtError.mock.calls.slice(1))
							expect(error.message).toMatch(
								/supported fixed native view|active fixed native views|errors\/(75|77)/,
							);
						const reports = onUncaughtError.mock.calls.length;
						nextControl = runWithSignalOwner(scope, () =>
							bindSignalControl(textarea, 'value', next),
						);
						if (replacement.parentNode !== null)
							replacementControl = runWithSignalOwner(scope, () =>
								bindSignalControl(replacement, 'value', next),
							);
						textarea.value = 'independent native edit';
						await act(() => textarea.dispatchEvent(new InputEvent('input', { bubbles: true })));
						expect(next.get()).toBe('independent native edit');
						expect(draft.get()).toBe('stale model update');
						await act(() => textarea.dispatchEvent(new FocusEvent('blur', { bubbles: true })));
						expect(textarea.value).toBe('independent native edit');
						expect(onUncaughtError).toHaveBeenCalledTimes(reports);
						hydratedRoot.unmount();
						hydratedRoot = undefined;
						next.set('independent after unmount');
						expect(textarea.value).toBe('independent after unmount');
						if (replacementControl !== undefined)
							expect(replacement.value).toBe('independent after unmount');
						expect(successorCleanup).toHaveBeenCalledOnce();
					} finally {
						hydratedRoot?.unmount();
						hydratedRoot = undefined;
						binding.dispose();
						control?.();
						laterControl?.();
						nextControl?.();
						replacementControl?.();
						earlierSubscription?.mockRestore();
						subscription.mockRestore();
						if (secondScope !== scope) secondScope.dispose();
						scope.dispose();
					}
				}
				for (const knownStylex of [false, true]) {
					for (const nextComponent of ['same', 'different'] as const) {
						const layoutScope = createScope({
							scopeKey: `host-source-retirement-${mutation}-${dev}-${knownStylex}-${nextComponent}`,
						});
						const classes = layoutScope.signal$('classes', 'renderer-layout');
						const onReady = vi.fn<(element: HTMLFormElement | null) => void>();
						const source = knownStylex
							? `import * as stylex from '@stylexjs/stylex';\n${presentationSource}`
									.replace('children?: OctaneNode;', 'children?: OctaneNode; styleValue?: string;')
									.replace(
										/<form\s+class=\{props\.className\}/,
										() =>
											'<form {...stylex.attrs([{ $$css: true, layout: props.className }, { "--layout-size": props.styleValue }])}',
									)
									.replace(
										/(<NativeControlHost\s+className=\{props\.className\})(\s+action=)/,
										'$1 styleValue={props.styleValue}$2',
									)
									.replace(
										/(<NativeControlLayout\s+className=\{props\.className\})/,
										'$1 styleValue={props.styleValue}',
									)
							: presentationSource;
						const layout = authoredPresentation(
							'NativeControlHost',
							{ className: 'early-layout', styleValue: '12px' },
							dev,
							source,
							{ '@stylexjs/stylex': Stylex },
							{
								knownAttributeSpreads: [
									{
										source: '@stylexjs/stylex',
										imported: '*',
										members: ['attrs'],
										fields: ['class', 'style', 'data-style-src'],
									},
								],
							},
						);
						const layoutProps = {
							onReady,
							className: 'early-layout',
							styleValue: '12px',
							draft: layoutScope.signal$('draft', 'host child draft'),
							placeholder: layoutScope.signal$('placeholder', 'Message'),
							readOnly: layoutScope.signal$('readonly', false),
							disabled: layoutScope.signal$('disabled', false),
							required: layoutScope.signal$('required', false),
						};
						container.innerHTML = renderToString(
							layout.server.NativeControlLayoutContainer,
							layoutProps,
						).html;
						const layoutForm = container.querySelector('form')!;
						const textarea = layoutForm.querySelector('textarea')!;
						expect(layoutForm.className).toBe('early-layout');
						expect(layoutForm.style.getPropertyValue('--layout-size')).toBe(
							knownStylex ? '12px' : '',
						);
						const ancestor = layoutForm.parentElement!;
						const destination = document.createElement('aside');
						const replacement = layoutForm.cloneNode(true) as HTMLFormElement;
						const failure = new Error('early layout cleanup replaced its host');
						const cleanup = vi.fn(() => {
							if (mutation === 'removed') layoutForm.remove();
							else if (mutation === 'reparented' || mutation === 'ancestor reparented') {
								container.append(destination);
								destination.append(mutation === 'reparented' ? layoutForm : ancestor);
							} else layoutForm.replaceWith(replacement);
							if (mutation === 'throwing replacement') throw failure;
						});
						const layoutBinding = layout.attach(layoutForm, {
							getSnapshot: layout.state.getSnapshot,
							subscribe(notify) {
								const stop = layout.state.subscribe(notify);
								return () => {
									stop();
									cleanup();
								};
							},
						});
						const onUncaughtError = vi.fn();
						const layoutClient = layout.loadClient();
						try {
							hydratedRoot = hydrateRoot(
								container,
								layoutClient.NativeControlLayoutContainer,
								{
									...layoutProps,
									className: knownStylex ? 'renderer-layout' : classes,
									styleValue: '24px',
								},
								{ signalOwner: layoutScope, bindingLeases: [layoutBinding], onUncaughtError },
							);
							await act(() => {});
							expect(cleanup).toHaveBeenCalledOnce();
							expect(layout.cleanup).toHaveBeenCalledOnce();
							expect(onUncaughtError).toHaveBeenCalledOnce();
							if (mutation === 'throwing replacement')
								expect(onUncaughtError).toHaveBeenCalledWith(failure);
							else
								expect(onUncaughtError.mock.calls[0][0].message).toMatch(
									/active fixed native views|errors\/77/,
								);
							if (mutation === 'ancestor reparented') expect(ancestor.parentNode).toBe(destination);
							else
								expect(layoutForm.parentNode).toBe(mutation === 'reparented' ? destination : null);
							expect(layoutForm.querySelector('textarea')).toBe(textarea);
							expect(onReady).not.toHaveBeenCalledWith(layoutForm);
							const failedClass = layoutForm.className;
							const replacementClass = replacement.className;
							const failedStyle = layoutForm.getAttribute('style');
							const replacementStyle = replacement.getAttribute('style');

							await act(() => classes.set('stale successor must not paint'));
							expect(layoutForm.className).toBe(failedClass);
							expect(replacement.className).toBe(replacementClass);
							layout.publish({ className: 'stale early must not paint', styleValue: '36px' });
							layoutBinding.refresh();
							expect(layoutForm.className).toBe(failedClass);
							expect(layoutForm.getAttribute('style')).toBe(failedStyle);
							let successorTextarea: HTMLTextAreaElement | null = null;
							if (nextComponent === 'different') {
								await act(() =>
									hydratedRoot!.render(layoutClient.NativeControlPresentation, {
										...layoutProps,
										placeholder: layoutScope.signal$(
											'successor-placeholder',
											'Replacement composer',
										),
									}),
								);
								successorTextarea = container.querySelector<HTMLTextAreaElement>(
									'textarea[placeholder="Replacement composer"]',
								);
								expect(successorTextarea).not.toBeNull();
								expect(successorTextarea).not.toBe(textarea);
								expect(successorTextarea!.isConnected).toBe(true);
								await act(() => layoutProps.draft.set('replacement model update'));
								expect(successorTextarea!.value).toBe('replacement model update');
								successorTextarea!.value = 'replacement native edit';
								await act(() =>
									successorTextarea!.dispatchEvent(new InputEvent('input', { bubbles: true })),
								);
								expect(layoutProps.draft.get()).toBe('replacement native edit');
								expect(onUncaughtError).toHaveBeenCalledOnce();
							} else {
								// A new normal render is a separate attempt against the invalid site.
								for (let retry = 0; retry < 2; retry++) {
									try {
										await act(() =>
											hydratedRoot!.render(layoutClient.NativeControlLayoutContainer, {
												...layoutProps,
												className: `explicit stale render ${retry}`,
												styleValue: `${48 + retry}px`,
											}),
										);
									} catch (error) {
										expect((error as Error).message).toMatch(/unmounted root|errors\/29/);
									}
									expect(layoutForm.className).toBe(failedClass);
									expect(replacement.className).toBe(replacementClass);
									expect(layoutForm.getAttribute('style')).toBe(failedStyle);
									expect(replacement.getAttribute('style')).toBe(replacementStyle);
									expect(onReady).not.toHaveBeenCalledWith(layoutForm);
								}
								expect(onUncaughtError.mock.calls.length).toBeGreaterThan(1);
								for (const [error] of onUncaughtError.mock.calls.slice(1))
									expect(error.message).toMatch(
										/supported fixed native view|active fixed native views|errors\/(75|77)/,
									);
							}
							expect(layoutForm.className).toBe(failedClass);
							expect(replacement.className).toBe(replacementClass);
							expect(layoutForm.getAttribute('style')).toBe(failedStyle);
							expect(replacement.getAttribute('style')).toBe(replacementStyle);
							expect(onReady).not.toHaveBeenCalledWith(layoutForm);
							const reports = onUncaughtError.mock.calls.length;
							hydratedRoot.unmount();
							hydratedRoot = undefined;
							await act(() => classes.set('retired successor must not paint'));
							if (successorTextarea) {
								await act(() => layoutProps.draft.set('after replacement unmount'));
								expect(successorTextarea.value).toBe('replacement native edit');
							}
							expect(layoutForm.className).toBe(failedClass);
							expect(replacement.className).toBe(replacementClass);
							expect(cleanup).toHaveBeenCalledOnce();
							expect(onUncaughtError).toHaveBeenCalledTimes(reports);
							expect(onReady).not.toHaveBeenCalledWith(layoutForm);
						} finally {
							hydratedRoot?.unmount();
							hydratedRoot = undefined;
							layoutBinding.dispose();
							layoutScope.dispose();
						}
					}
				}
			});
		}

		for (const failing of ['first', 'second'] as const) {
			it(`keeps early controls and presentation live when the ${failing} successor subscription fails (${dev ? 'dev' : 'prod'})`, async () => {
				const scope = createScope({
					scopeKey: `native-control-subscribe-failure-${failing}-${dev}`,
				});
				const first = scope.signal$('first', 'first draft');
				const second = scope.signal$('second', 'second draft');
				const props = { first, second };
				const fixture = authoredPresentation('NativeControlPairPresentation', props, dev);
				container.innerHTML = fixture.html;
				const section = container.firstElementChild!;
				const [firstTextarea, secondTextarea] = section.querySelectorAll('textarea');
				const controls = runWithSignalOwner(scope, () => [
					bindSignalControl(firstTextarea, 'value', first),
					bindSignalControl(secondTextarea, 'value', second),
				]);
				const binding = runWithSignalOwner(scope, () => fixture.attach(section, fixture.state));
				const failure = new Error('successor subscription failed');
				const onUncaughtError = vi.fn();
				const subscription = vi
					.spyOn(props[failing], SIGNAL_BINDING_SUBSCRIBE)
					.mockImplementationOnce(() => {
						throw failure;
					});
				try {
					let thrown: unknown;
					try {
						hydratedRoot = hydrateRoot(
							container,
							fixture.loadClient().NativeControlPairPresentation,
							props,
							{
								signalOwner: scope,
								bindingLeases: [binding],
								controlLeases: controls,
								onUncaughtError,
							},
						);
					} catch (error) {
						thrown = error;
					}
					expect(container.firstElementChild).toBe(section);
					expect(fixture.cleanup).not.toHaveBeenCalled();
					expect(thrown).toBeUndefined();
					expect(onUncaughtError).toHaveBeenCalledExactlyOnceWith(failure);
					await act(() => {
						first.set('first still early');
						second.set('second still early');
					});
					expect(firstTextarea.value).toBe('first still early');
					expect(secondTextarea.value).toBe('second still early');
					firstTextarea.value = 'first native edit';
					secondTextarea.value = 'second native edit';
					firstTextarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
					secondTextarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
					expect([first.get(), second.get()]).toEqual(['first native edit', 'second native edit']);
					expect(onUncaughtError).toHaveBeenCalledOnce();
				} finally {
					hydratedRoot?.unmount();
					hydratedRoot = undefined;
					subscription.mockRestore();
					binding.dispose();
					for (const control of controls) control();
					scope.dispose();
				}
			});
		}

		it(`does not install a dead control when retirement disposes its signal owner (${dev ? 'dev' : 'prod'})`, async () => {
			const scope = createScope({ scopeKey: `native-control-retired-owner-${dev}` });
			const draft = scope.signal$('draft', 'server draft');
			const props = {
				draft,
				readOnly: scope.signal$('readonly', false),
				disabled: scope.signal$('disabled', false),
				required: scope.signal$('required', true),
				placeholder: scope.signal$('placeholder', 'Search'),
			};
			const fixture = authoredPresentation('NativeControlPresentation', props, dev);
			container.innerHTML = fixture.html;
			const textarea = container.querySelector('textarea')!;
			const subscribe = draft[SIGNAL_BINDING_SUBSCRIBE].bind(draft);
			const cleanup = vi.fn(() => scope.dispose());
			const subscription = vi
				.spyOn(draft, SIGNAL_BINDING_SUBSCRIBE)
				.mockImplementationOnce((notify, onRetire) => {
					const stop = subscribe(notify, onRetire);
					return () => {
						stop();
						cleanup();
					};
				});
			const control = runWithSignalOwner(scope, () => bindSignalControl(textarea, 'value', draft));
			subscription.mockRestore();
			const binding = runWithSignalOwner(scope, () => fixture.attach(textarea, fixture.state));
			const onUncaughtError = vi.fn();
			const replacementScope = createScope({ scopeKey: `native-control-replacement-owner-${dev}` });
			const replacement = replacementScope.signal$('draft', 'replacement draft');
			let replacementControl: ReturnType<typeof bindSignalControl> | undefined;
			try {
				let thrown: unknown;
				try {
					hydratedRoot = hydrateRoot(
						container,
						fixture.loadClient().NativeControlPresentation,
						props,
						{
							signalOwner: scope,
							bindingLeases: [binding],
							controlLeases: [control],
							onUncaughtError,
						},
					);
				} catch (error) {
					thrown = error;
				}
				expect(cleanup).toHaveBeenCalledOnce();
				expect(() => draft.get()).toThrow(/disposed|retired/i);
				expect(thrown).toBeUndefined();
				await act(() => {});
				expect(onUncaughtError).toHaveBeenCalled();
				for (const [error] of onUncaughtError.mock.calls)
					expect(error).toMatchObject({ name: 'ScopeDisposedError' });
				const reports = onUncaughtError.mock.calls.length;
				replacementControl = runWithSignalOwner(replacementScope, () =>
					bindSignalControl(textarea, 'value', replacement),
				);
				replacement.set('live replacement');
				expect(textarea.value).toBe('live replacement');
				textarea.value = 'replacement input';
				textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
				expect(replacement.get()).toBe('replacement input');
				await act(() => {});
				expect(onUncaughtError).toHaveBeenCalledTimes(reports);
			} finally {
				hydratedRoot?.unmount();
				hydratedRoot = undefined;
				binding.dispose();
				control();
				replacementControl?.();
				subscription.mockRestore();
				scope.dispose();
				replacementScope.dispose();
			}
		});

		it(`releases an adopted textarea when its successor cleanup throws (${dev ? 'dev' : 'prod'})`, async () => {
			const scope = createScope({ scopeKey: `native-control-successor-cleanup-${dev}` });
			const first = scope.signal$('first', 'first draft');
			const second = scope.signal$('second', 'second draft');
			const props = { first, second };
			const fixture = authoredPresentation('NativeControlPairPresentation', props, dev);
			container.innerHTML = fixture.html;
			const section = container.firstElementChild!;
			const [textarea, otherTextarea] = section.querySelectorAll('textarea');
			const controls = runWithSignalOwner(scope, () => [
				bindSignalControl(textarea, 'value', first),
				bindSignalControl(otherTextarea, 'value', second),
			]);
			const binding = runWithSignalOwner(scope, () => fixture.attach(section, fixture.state));
			const failure = new Error('successor cleanup failed');
			const cleanup = vi.fn(() => {
				throw failure;
			});
			const subscribe = first[SIGNAL_BINDING_SUBSCRIBE].bind(first);
			const subscription = vi
				.spyOn(first, SIGNAL_BINDING_SUBSCRIBE)
				.mockImplementationOnce((notify, onRetire) => {
					const stop = subscribe(notify, onRetire);
					return () => {
						stop();
						cleanup();
					};
				});
			const replacementScope = createScope({ scopeKey: `native-successor-replacement-${dev}` });
			const replacement = replacementScope.signal$('draft', 'replacement draft');
			const onUncaughtError = vi.fn();
			let replacementControl: ReturnType<typeof bindSignalControl> | undefined;
			try {
				hydratedRoot = hydrateRoot(
					container,
					fixture.loadClient().NativeControlPairPresentation,
					props,
					{
						signalOwner: scope,
						bindingLeases: [binding],
						controlLeases: controls,
						onUncaughtError,
					},
				);
				await act(() => {});
				expect(fixture.cleanup).toHaveBeenCalledOnce();
				expect(container.firstElementChild).toBe(section);
				expect(() => scope.dispose()).toThrow(failure);
				expect(cleanup).toHaveBeenCalledOnce();
				await act(() => {});
				for (const [error] of onUncaughtError.mock.calls)
					expect(error).toMatchObject({ name: 'ScopeDisposedError' });
				const reports = onUncaughtError.mock.calls.length;
				replacementControl = runWithSignalOwner(replacementScope, () =>
					bindSignalControl(textarea, 'value', replacement),
				);
				replacement.set('replacement model');
				expect(textarea.value).toBe('replacement model');
				textarea.value = 'replacement input';
				await act(() => textarea.dispatchEvent(new InputEvent('input', { bubbles: true })));
				expect(replacement.get()).toBe('replacement input');
				expect(textarea.value).toBe('replacement input');
				expect(onUncaughtError).toHaveBeenCalledTimes(reports);
				expect(cleanup).toHaveBeenCalledOnce();
			} finally {
				hydratedRoot?.unmount();
				hydratedRoot = undefined;
				binding.dispose();
				for (const control of controls) control();
				replacementControl?.();
				subscription.mockRestore();
				scope.dispose();
				replacementScope.dispose();
			}
		});

		it(`adopts captured textarea input without an early control lease (${dev ? 'dev' : 'prod'})`, async () => {
			const scope = createScope({ scopeKey: `native-textarea-unowned-input-${dev}` });
			const draft = scope.signal$('draft', 'server draft');
			const props = {
				draft,
				readOnly: scope.signal$('readonly', false),
				disabled: scope.signal$('disabled', false),
				required: scope.signal$('required', true),
				placeholder: scope.signal$('placeholder', 'Search'),
			};
			const fixture = authoredPresentation('NativeControlPresentation', props, dev);
			container.innerHTML = fixture.html;
			const textarea = container.querySelector('textarea')!;
			const binding = runWithSignalOwner(scope, () => fixture.attach(textarea, fixture.state));
			try {
				captureHydrationControlCandidate(textarea);
				textarea.value = 'captured input';
				textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
				expect(draft.get()).toBe('server draft');
				hydratedRoot = hydrateRoot(
					container,
					fixture.loadClient().NativeControlPresentation,
					props,
					{
						signalOwner: scope,
						bindingLeases: [binding],
					},
				);
				await act(() => {});
				expect(container.querySelector('textarea')).toBe(textarea);
				expect(textarea.value).toBe('captured input');
				expect(draft.get()).toBe('captured input');
			} finally {
				hydratedRoot?.unmount();
				hydratedRoot = undefined;
				binding.dispose();
				scope.dispose();
			}
		});

		for (const retirement of [
			'input',
			'model',
			'edited model',
			'throwing input',
			'throwing model',
			'unchanged model',
			'edited unchanged model',
			'self replacement',
		] as const) {
			it(`retains a reentrant early textarea ${retirement} during owner retirement (${dev ? 'dev' : 'prod'})`, async () => {
				const scope = createScope({ scopeKey: `native-textarea-retirement-${retirement}-${dev}` });
				const draft = scope.signal$('draft', 'server draft');
				const props = {
					draft,
					readOnly: scope.signal$('readonly', false),
					disabled: scope.signal$('disabled', false),
					required: scope.signal$('required', true),
					placeholder: scope.signal$('placeholder', 'Search'),
				};
				const fixture = authoredPresentation('NativeControlPresentation', props, dev);
				const form = document.createElement('form');
				container.append(form);
				form.innerHTML = fixture.html;
				const textarea = form.querySelector('textarea')!;
				const failure = new Error('early control cleanup failed');
				const onUncaughtError = vi.fn();
				const cleanup = vi.fn(() => {
					if (retirement === 'self replacement') {
						bindSignalControl(textarea, 'value', scope.signal$('replacement', 'replacement draft'));
					} else if (retirement.endsWith('input')) {
						textarea.value = 'newer retirement edit';
						textarea.setSelectionRange(3, 8, 'backward');
						textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
					} else
						draft.set(
							retirement.includes('unchanged model') ? draft.get() : 'newer retirement edit',
						);
					if (retirement.startsWith('throwing')) throw failure;
				});
				const subscribe = draft[SIGNAL_BINDING_SUBSCRIBE].bind(draft);
				const subscription = vi
					.spyOn(draft, SIGNAL_BINDING_SUBSCRIBE)
					.mockImplementationOnce((notify, onRetire) => {
						const stop = subscribe(notify, onRetire);
						return () => {
							stop();
							cleanup();
						};
					});
				const control = runWithSignalOwner(scope, () =>
					bindSignalControl(textarea, 'value', draft),
				);
				subscription.mockRestore();
				const binding = runWithSignalOwner(scope, () => fixture.attach(textarea, fixture.state));
				const expectedModel =
					retirement === 'edited unchanged model'
						? 'earlier native edit'
						: retirement === 'unchanged model' || retirement === 'self replacement'
							? 'server draft'
							: 'newer retirement edit';
				const expectedValue = retirement.includes('unchanged model')
					? 'in-progress composition'
					: expectedModel;
				try {
					textarea.focus();
					if (retirement.startsWith('edited')) {
						textarea.value = 'earlier native edit';
						textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
						expect(draft.get()).toBe('earlier native edit');
					}
					if (retirement.endsWith('model')) {
						textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
						textarea.value = 'in-progress composition';
					}
					hydratedRoot = hydrateRoot(form, fixture.loadClient().NativeControlPresentation, props, {
						signalOwner: scope,
						bindingLeases: [binding],
						controlLeases: [control],
						onUncaughtError,
					});
					if (retirement.endsWith('model')) {
						expect(cleanup).toHaveBeenCalledOnce();
						expect(textarea.value).toBe(expectedValue);
						expect(draft.get()).toBe(expectedModel);
					}
					await act(() => {});
					expect(cleanup).toHaveBeenCalledOnce();
					if (retirement.startsWith('throwing'))
						expect(onUncaughtError).toHaveBeenCalledExactlyOnceWith(failure);
					else if (retirement === 'self replacement') {
						expect(onUncaughtError).toHaveBeenCalledOnce();
						expect(onUncaughtError.mock.calls[0][0].message).toMatch(
							/already has a signal binding/,
						);
					} else expect(onUncaughtError).not.toHaveBeenCalled();
					expect(container.querySelector('textarea')).toBe(textarea);
					expect(textarea.value).toBe(expectedValue);
					expect(draft.get()).toBe(expectedModel);
					if (retirement.endsWith('model')) {
						const resetDefault = textarea.defaultValue;
						form.reset();
						expect([resetDefault, textarea.value]).toEqual([expectedModel, expectedModel]);
						expect(draft.get()).toBe(expectedModel);
					}
					if (retirement.endsWith('input'))
						expect([
							textarea.selectionStart,
							textarea.selectionEnd,
							textarea.selectionDirection,
						]).toEqual([3, 8, 'backward']);
					else textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
					await act(() => draft.set('successor model'));
					expect(textarea.value).toBe('successor model');
					textarea.value = 'successor input';
					await act(() => textarea.dispatchEvent(new InputEvent('input', { bubbles: true })));
					expect(draft.get()).toBe('successor input');
				} finally {
					hydratedRoot?.unmount();
					hydratedRoot = undefined;
					binding.dispose();
					control();
					subscription.mockRestore();
					scope.dispose();
				}
			});
		}
	}

	it('attaches to existing DOM without replacing nodes or mutating protected attributes', async () => {
		container.setAttribute('data-external-owner', 'stream');
		container.innerHTML =
			'<article id="existing" data-owned="server" aria-live="polite"><button>Action</button></article>';
		const article = container.firstElementChild!;
		const button = article.firstElementChild!;
		const initialMarkup = container.innerHTML;
		const initialAttributes = [...container.attributes].map(({ name, value }) => [name, value]);

		const root = attach();
		await root.ready;

		expect(root.container).toBe(container);
		expect(root.signal.aborted).toBe(false);
		expect(container.innerHTML).toBe(initialMarkup);
		expect([...container.attributes].map(({ name, value }) => [name, value])).toEqual(
			initialAttributes,
		);
		expect(container.firstElementChild).toBe(article);
		expect(article.firstElementChild).toBe(button);
		expect(article.getAttribute('data-owned')).toBe('server');
		expect(article.getAttribute('aria-live')).toBe('polite');
		for (const dev of [false, true]) {
			const fixture = authoredBindings(dev);
			article.innerHTML = fixture.html;
			const action = article.querySelector('button')!;
			const nodes = [action, ...action.querySelectorAll('*')];
			expect(action.hidden).toBe(true);
			action.hidden = false;
			action.style.marginLeft = '7px';
			const evaluationOrder: string[] = [];
			const binding = fixture.attachOrdered(
				() => {
					evaluationOrder.push('root');
					return action;
				},
				() => {
					evaluationOrder.push('source');
					return fixture.state;
				},
				() => {
					evaluationOrder.push('options');
					return undefined;
				},
			);
			try {
				expect(evaluationOrder).toEqual(['root', 'source', 'options']);
				fixture.publish({
					type: 'button',
					disabled: true,
					active: true,
					label: 'Stop',
					classes: ['action', ['active'], { busy: true }],
					opacity: 0.5,
					width: 12,
					tone: 'red',
				});
				expect(action.type).toBe('button');
				expect(action.disabled).toBe(true);
				expect(action.getAttribute('aria-disabled')).toBe('true');
				expect(action.getAttribute('aria-label')).toBe('Stop');
				expect(action.getAttribute('data-active')).toBe('');
				expect(action.className).toBe('action active busy');
				expect(action.style.opacity).toBe('0.5');
				expect(action.style.width).toBe('12px');
				expect(action.style.getPropertyValue('--tone')).toBe('red');
				expect([...action.querySelectorAll('span')].map((node) => node.hidden)).toEqual([
					true,
					false,
				]);
				fixture.publish(
					{
						type: 'submit',
						disabled: false,
						active: false,
						label: 'Send',
						classes: '',
						opacity: null,
						width: 0,
						tone: null,
					},
					false,
				);
				binding.refresh();
				expect(action.type).toBe('submit');
				expect(action.disabled).toBe(false);
				expect(action.getAttribute('aria-disabled')).toBe('false');
				expect(action.hasAttribute('data-active')).toBe(false);
				expect(action.getAttribute('class')).toBe('');
				expect(action.style.opacity).toBe('');
				expect(action.style.width).toBe('0px');
				expect(action.style.getPropertyValue('--tone')).toBe('');
				expect(action.hidden).toBe(false);
				expect(action.style.marginLeft).toBe('7px');
				expect([action, ...action.querySelectorAll('*')]).toEqual(nodes);
			} finally {
				binding.dispose();
			}
		}
		for (const dev of [false, true]) {
			const fixture = authoredControlBindings(dev);
			article.innerHTML = fixture.html;
			const form = article.querySelector('form')!;
			const textarea = form.querySelector('textarea')!;
			const hidden = form.querySelector('input')!;
			const label = form.querySelector('label')!;
			const status = form.querySelector('span')!;
			textarea.value = 'User draft before activation';
			textarea.setSelectionRange(4, 9, 'backward');
			hidden.value = 'native-token';
			const external = document.createElement('canvas');
			form.insertBefore(external, textarea);
			form.classList.add('native-measured');
			textarea.classList.add('external-height');
			fixture.publish({ expanded: false, mode: 'sending', invalid: true });
			const binding = fixture.attach(form, fixture.state);
			try {
				expect(form.classList.contains('expanded')).toBe(false);
				expect(form.classList.contains('compact')).toBe(true);
				expect(form.classList.contains('atom-shared')).toBe(true);
				expect(form.classList.contains('theme')).toBe(true);
				expect(form.classList.contains('native-measured')).toBe(true);
				expect(textarea.classList.contains('composer-large')).toBe(false);
				expect(textarea.classList.contains('external-height')).toBe(true);
				expect(form.getAttribute('data-mode')).toBe('sending');
				expect(textarea.getAttribute('aria-invalid')).toBe('true');
				expect(textarea.value).toBe('User draft before activation');
				expect([
					textarea.selectionStart,
					textarea.selectionEnd,
					textarea.selectionDirection,
				]).toEqual([4, 9, 'backward']);
				expect(hidden.value).toBe('native-token');
				fixture.publish({
					expanded: true,
					disabled: true,
					draft: 'Late draft',
					status: 'Late status',
				});
				expect(form.classList.contains('expanded')).toBe(true);
				expect(textarea.disabled).toBe(true);
				expect(textarea.value).toBe('User draft before activation');
				expect(status.textContent).toBe('Ready');
				expect(label.textContent).toBe('Message');
				expect(form.querySelector('textarea')).toBe(textarea);
				expect(form.querySelector('canvas')).toBe(external);
			} finally {
				binding.dispose();
			}
			expect(form.classList.contains('expanded')).toBe(false);
			expect(form.classList.contains('compact')).toBe(false);
			expect(form.classList.contains('atom-shared')).toBe(true);
			expect(form.classList.contains('native-measured')).toBe(true);
			expect(textarea.classList.contains('composer-large')).toBe(false);
			expect(textarea.classList.contains('external-height')).toBe(true);
			expect(fixture.cleanup).toHaveBeenCalledOnce();
			const replacement = fixture.attach(form, fixture.state);
			expect(form.classList.contains('expanded')).toBe(true);
			expect(form.querySelector('textarea')).toBe(textarea);
			replacement.dispose();
		}
		for (const dev of [false, true]) {
			const fixture = authoredPresentation(
				'LoginPresentation',
				{
					label: 'Email',
					error: '',
					pending: false,
					submitLabel: 'Continue',
				},
				dev,
			);
			article.innerHTML = fixture.html;
			const form = article.querySelector('form')!;
			const input = form.querySelector('input')!;
			const button = form.querySelector('button')!;
			input.value = 'typed@example.com';
			fixture.publish({ error: 'Check this address', submitLabel: 'Try again' });
			const binding = fixture.attach(form, fixture.state);
			try {
				expect(form.querySelector('input')).toBe(input);
				expect(input.value).toBe('typed@example.com');
				expect(form.querySelector('p')!.textContent).toBe('Check this address');
				expect(button.textContent).toBe('Try again');
				fixture.publish({ pending: true, error: '', submitLabel: 'Signing in…' });
				expect(form.querySelector('button')).toBe(button);
				expect(button.disabled).toBe(true);
				expect(input.disabled).toBe(true);
				expect(button.querySelector('svg')).not.toBeNull();
				expect(button.querySelector('span')!.textContent).toBe('Signing in…');
				fixture.publish({ pending: false, submitLabel: 'Continue' });
				expect(button.querySelector('svg')).toBeNull();
				expect(input.value).toBe('typed@example.com');
			} finally {
				binding.dispose();
			}
			const adjacent = authoredPresentation('AdjacentPresentation', { first: '', last: '' }, dev);
			article.innerHTML = adjacent.html;
			const paragraph = article.querySelector('p')!;
			const text = adjacent.attach(paragraph, adjacent.state);
			try {
				adjacent.publish({ first: '<one>', last: '&two' });
				expect(paragraph.textContent).toBe('Before <one>&two after');
				expect(paragraph.children).toHaveLength(0);
				adjacent.publish({ first: '', last: '' });
				expect(paragraph.textContent).toBe('Before  after');
			} finally {
				text.dispose();
			}
		}
		for (const dev of [false, true]) {
			for (const destructured of [false, true]) {
				for (const tag of ['button', 'svg']) {
					for (const classes of [
						"['base', props.active && 'active']",
						'{ base: true, active: props.active }',
					]) {
						const fixture = authoredPresentation(
							'FreshClass',
							{ title: 'server', active: false },
							dev,
							`export function FreshClass(${destructured ? '{ title: header = "default title", ...props }' : 'props'}) @{ 'use dom bindings';
 const title = ${destructured ? 'header' : 'props.title'};
 const activate = () => props.onAction?.(title);
 const click = activate;
 const ready = (node) => props.onReady?.(node);
 <${tag} title={title} className={${classes}} ref={ready} onClick={click}/>
}`,
						);
						article.innerHTML = fixture.html;
						const element = article.querySelector(tag)!;
						fixture.publish({ title: 'early', active: true });
						const binding = fixture.attach(element, fixture.state);
						const readyViews: Array<[string | null, string | null]> = [];
						const onAction = vi.fn();
						const onReady = vi.fn((node: Element | null) => {
							if (node) readyViews.push([node.getAttribute('class'), node.getAttribute('title')]);
						});
						try {
							expect(element.getAttribute('class')).toBe('base active');
							const client = fixture.loadClient();
							hydratedRoot = hydrateRoot(
								article,
								client.FreshClass,
								{ title: 'early', active: true, onReady, onAction },
								{ bindingLeases: [binding] },
							);
							flushSync(() => {});
							flushEffects();
							expect(article.querySelector(tag)).toBe(element);
							expect(onReady).toHaveBeenCalledExactlyOnceWith(element);
							expect(readyViews).toEqual([['base active', 'early']]);
							element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
							expect(onAction).toHaveBeenCalledExactlyOnceWith('early');
							expect(fixture.cleanup).toHaveBeenCalledOnce();
							fixture.publish({ title: 'stale', active: false });
							binding.refresh();
							expect(element.getAttribute('class')).toBe('base active');
							expect(element.getAttribute('title')).toBe('early');
							hydratedRoot.render(client.FreshClass, {
								title: 'live',
								active: false,
								onReady,
								onAction,
							});
							flushSync(() => {});
							expect(element.getAttribute('class')).toBe('base');
							expect(element.getAttribute('title')).toBe('live');
							onAction.mockClear();
							element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
							expect(onAction).toHaveBeenCalledExactlyOnceWith('live');
							if (destructured) {
								hydratedRoot.render(client.FreshClass, { active: false, onReady, onAction });
								flushSync(() => {});
								expect(element.getAttribute('title')).toBe('default title');
								onAction.mockClear();
								element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
								expect(onAction).toHaveBeenCalledExactlyOnceWith('default title');
							}
						} finally {
							hydratedRoot?.unmount();
							hydratedRoot = undefined;
							binding.dispose();
						}
						expect(fixture.cleanup).toHaveBeenCalledOnce();
					}
				}
				for (const failure of [null, 'read', 'coercion']) {
					const scope = createScope({ scopeKey: `projected-handoff-${dev}-${failure}` });
					const height$ = scope.signal$<unknown>('height', 2);
					const projected = authoredPresentation(
						'ProjectedAction',
						{ height$, title: 'early', onReady: (_element: Element | null) => {} },
						dev,
						`import 'octane/signals'; import * as stylex from 'binding-styles';
const styles = stylex.create({ height: height => ({ className: 'sized', style: { height } }) });
export function ProjectedAction(${destructured ? '{ title: header = "default title", ...props }' : 'props'}) @{ 'use dom bindings';
 <button aria-label="Action" title={${destructured ? 'header' : 'props.title'}} sx={styles.height(props.height$)} ref={props.onReady}/>
}`,
						{
							'binding-styles': {
								create: (config: unknown) => config,
								props: (value: unknown) => value,
							},
						},
						{
							knownAttributeSpreads: [
								{
									source: 'binding-styles',
									imported: '*',
									members: ['props'],
									fields: ['className', 'style'],
									style: 'object',
									jsxAttribute: 'sx',
								},
							],
						},
					);
					article.innerHTML = projected.html;
					const action = article.querySelector('button')!;
					const binding = runWithSignalOwner(scope, () =>
						projected.attach(action, projected.state),
					);
					try {
						height$.set(3);
						expect(action.style.height).toBe('3px');
						const error = new Error(`Failed ${failure} during presentation preparation`);
						const onUncaughtError = vi.fn();
						const readyViews: string[][] = [];
						const onReady = vi.fn((element: Element | null) => {
							if (element instanceof HTMLButtonElement)
								readyViews.push([element.title, element.className, element.style.height]);
						});
						hydratedRoot = hydrateRoot(
							article,
							projected.loadClient().ProjectedAction,
							{
								title: 'prepared',
								onReady,
								height$:
									failure === 'read'
										? scope.derived$<unknown>('failure', () => {
												throw error;
											})
										: failure === 'coercion'
											? scope.signal$('failure', {
													toString() {
														throw error;
													},
												})
											: height$,
							},
							{ signalOwner: scope, bindingLeases: [binding], onUncaughtError },
						);
						flushSync(() => {});
						flushEffects();
						if (failure === null) {
							expect(onUncaughtError).not.toHaveBeenCalled();
							expect(onReady).toHaveBeenCalledOnce();
							expect(onReady).toHaveBeenCalledWith(action);
							expect(readyViews).toEqual([['prepared', 'sized', '3px']]);
							height$.set(4);
							flushSync(() => {});
							expect(action.style.height).toBe('4px');
						} else {
							expect(onUncaughtError).toHaveBeenCalledExactlyOnceWith(error);
							expect(onReady).not.toHaveBeenCalled();
							expect(action.title).toBe('early');
						}
					} finally {
						hydratedRoot?.unmount();
						hydratedRoot = undefined;
						binding.dispose();
						scope.dispose();
					}
				}
			}
			for (const outcome of [
				'replace',
				'replace-staged',
				'replace-staged-superseded',
				'accept',
				'retry',
			]) {
				const discard = outcome === 'retry';
				const scope = createScope({ scopeKey: `early-action-hydration-${dev}-${outcome}` });
				const draft = scope.signal$('draft', '');
				const generating = scope.signal$('generating', false);
				const accent = scope.signal$('accent', 'red');
				let request = new AbortController();
				const cancel = vi.fn(() => {
					request.abort();
					generating.set(false);
				});
				const send = vi.fn();
				const props: ActionPresentationProps = {
					type: scope.derived$('type', () => (generating.get() ? 'button' : 'submit')),
					disabled: scope.derived$('disabled', () => !generating.get() && draft.get() === ''),
					label: scope.derived$('label', () => (generating.get() ? 'Stop' : 'Send')),
					sendHidden: generating,
					stopHidden: scope.derived$('stop-hidden', () => !generating.get()),
					classes: scope.derived$('classes', () =>
						generating.get() ? 'is-generating' : 'is-idle',
					),
					height$: scope.derived$('height', () => (generating.get() ? 24 : 16)),
					opacity$: scope.derived$('opacity', () => (generating.get() ? 0.5 : 1)),
					accent$: accent,
					onAction(event) {
						event.preventDefault();
						if (generating.get()) cancel();
						else send();
					},
				};
				const fixture = authoredPresentation(
					'ActionPresentation',
					props,
					dev,
					`import 'octane/signals';\n${presentationSource}`,
				);
				fixture.cleanup.mockImplementation(() => accent.set('blue'));
				const pending = deferred<void>();
				const onHydrated = vi.fn();
				const readyViews: Array<{
					type: string;
					label: string | null;
					disabled: boolean;
					classes: string;
					height: string;
					opacity: string;
					color: string;
				}> = [];
				const onReady = vi.fn((element: Element | null) => {
					if (element instanceof HTMLButtonElement) {
						readyViews.push({
							type: element.type,
							label: element.getAttribute('aria-label'),
							disabled: element.disabled,
							classes: element.className,
							height: element.style.height,
							opacity: element.style.opacity,
							color: element.style.color,
						});
					}
				});
				const applicationProps = {
					...props,
					when: interaction({ events: 'click' }),
					suspend: false,
					promise: pending.promise,
					onHydrated,
					onReady,
				};
				article.innerHTML = renderToString(fixture.server.ActionHydration, applicationProps).html;
				const action = article.querySelector('button')!;
				const icons = [...action.querySelectorAll('span')];
				const binding = runWithSignalOwner(scope, () => fixture.attach(action, fixture.state));
				const viewTransitions = outcome.startsWith('replace-staged')
					? installViewTransitionMocks()
					: undefined;
				const nativeUpdates: Array<{
					update: () => void | Promise<void>;
					ready: ReturnType<typeof deferred<void>>;
					finished: ReturnType<typeof deferred<void>>;
				}> = [];
				if (viewTransitions !== undefined)
					Object.defineProperty(document, 'startViewTransition', {
						configurable: true,
						value(input: { update: () => void | Promise<void> }) {
							const ready = deferred<void>();
							const finished = deferred<void>();
							nativeUpdates.push({ update: input.update, ready, finished });
							return { ready: ready.promise, finished: finished.promise, skipTransition() {} };
						},
					});
				try {
					expect(action.disabled).toBe(true);
					expect([action.className, action.style.height, action.style.opacity]).toEqual([
						'is-idle',
						'16px',
						'1',
					]);
					draft.set('Early draft');
					expect(action.disabled).toBe(false);
					generating.set(true);
					expect(action.type).toBe('button');
					expect(action.getAttribute('aria-disabled')).toBe('false');
					expect(action.getAttribute('aria-label')).toBe('Stop');
					expect([action.className, action.style.height, action.style.opacity]).toEqual([
						'is-generating',
						'24px',
						'0.5',
					]);
					expect(icons.map((icon) => icon.hidden)).toEqual([true, false]);
					const client = fixture.loadClient();
					hydratedRoot = hydrateRoot(
						article,
						client.ActionHydration,
						{ ...applicationProps, suspend: true },
						{ signalOwner: scope, bindingLeases: [binding] },
					);
					flushSync(() => {});
					flushEffects();
					expect(action.getAttribute('aria-label')).toBe('Stop');
					expect(action.disabled).toBe(false);
					action.click();
					flushSync(() => {});
					flushEffects();
					await act(() => {});
					expect(onHydrated).not.toHaveBeenCalled();
					expect(onReady).not.toHaveBeenCalled();
					expect(fixture.cleanup).not.toHaveBeenCalled();
					expect(article.querySelector('#action-fallback')).toBeNull();
					expect(request.signal.aborted).toBe(true);
					expect(cancel).toHaveBeenCalledOnce();
					expect(send).not.toHaveBeenCalled();
					expect(action.type).toBe('submit');
					expect(action.getAttribute('aria-label')).toBe('Send');
					expect(icons.map((icon) => icon.hidden)).toEqual([false, true]);
					if (outcome === 'replace' || viewTransitions !== undefined) {
						const replace = (label = 'Account') =>
							hydratedRoot!.render(client.LoginPresentation, {
								label,
								error: '',
								pending: false,
								submitLabel: 'Continue',
							});
						if (viewTransitions !== undefined) {
							startTransition(() => {
								addTransitionType('replace');
								replace();
							});
							await vi.waitFor(() => expect(nativeUpdates).toHaveLength(1));
							expect(article.querySelector('button')).toBe(action);
							expect(article.querySelector('form')).toBeNull();
							expect(fixture.cleanup).not.toHaveBeenCalled();
							action.click();
							expect(send).toHaveBeenCalledOnce();
							if (outcome === 'replace-staged-superseded') {
								replace('Newest account');
								flushSync(() => {});
								expect(article.querySelector('label')?.textContent).toBe('Newest account');
								expect(fixture.cleanup).toHaveBeenCalledOnce();
							}
							await nativeUpdates[0].update();
							nativeUpdates[0].ready.resolve();
							nativeUpdates[0].finished.resolve();
						} else replace();
						flushSync(() => {});
						flushEffects();
						expect(article.querySelector('form')).not.toBeNull();
						expect(article.querySelector('label')?.textContent).toBe(
							outcome === 'replace-staged-superseded' ? 'Newest account' : 'Account',
						);
						expect(action.isConnected).toBe(false);
						expect(fixture.cleanup).toHaveBeenCalledOnce();
						const retiredMarkup = action.outerHTML;
						generating.set(true);
						accent.set('green');
						fixture.publish({ label: scope.signal$('replacement-label', 'Late early label') });
						binding.refresh();
						flushSync(() => {});
						expect(action.outerHTML).toBe(retiredMarkup);
						expect(fixture.cleanup).toHaveBeenCalledOnce();
						action.click();
						expect(cancel).toHaveBeenCalledOnce();
						expect(send).toHaveBeenCalledTimes(viewTransitions !== undefined ? 1 : 0);
						await act(() => pending.resolve());
						expect(article.querySelector('form')).not.toBeNull();
						expect(onHydrated).not.toHaveBeenCalled();
						expect(onReady).not.toHaveBeenCalled();
						binding.dispose();
						expect(fixture.cleanup).toHaveBeenCalledOnce();
						continue;
					}
					let accepted = pending;
					if (discard) {
						hydratedRoot.render(client.ActionHydration, {
							...applicationProps,
							when: never(),
							suspend: true,
						});
						flushSync(() => {});
						flushEffects();
						await act(() => pending.resolve());
						expect(onHydrated).not.toHaveBeenCalled();
						expect(onReady).not.toHaveBeenCalled();
						expect(fixture.cleanup).not.toHaveBeenCalled();
						request = new AbortController();
						generating.set(true);
						expect(action.getAttribute('aria-label')).toBe('Stop');
						action.click();
						expect(request.signal.aborted).toBe(true);
						expect(cancel).toHaveBeenCalledTimes(2);
						expect(send).not.toHaveBeenCalled();
						accepted = deferred<void>();
						hydratedRoot.render(client.ActionHydration, {
							...applicationProps,
							when: condition(true),
							suspend: true,
							promise: accepted.promise,
						});
						flushSync(() => {});
						flushEffects();
					}
					request = new AbortController();
					generating.set(true);
					expect(action.getAttribute('aria-label')).toBe('Stop');
					await act(() => accepted.resolve());
					expect(onHydrated).toHaveBeenCalledOnce();
					expect(readyViews).toEqual([
						{
							type: 'button',
							label: 'Stop',
							disabled: false,
							classes: 'is-generating',
							height: '24px',
							opacity: '0.5',
							color: 'blue',
						},
					]);
					expect(article.querySelector('button')).toBe(action);
					expect([...action.querySelectorAll('span')]).toEqual(icons);
					expect(draft.get()).toBe('Early draft');
					expect(generating.get()).toBe(true);
					expect(action.disabled).toBe(false);
					expect(action.getAttribute('aria-label')).toBe('Stop');
					expect(icons.map((icon) => icon.hidden)).toEqual([true, false]);
					expect(cancel).toHaveBeenCalledTimes(discard ? 2 : 1);
					expect(send).not.toHaveBeenCalled();
					fixture.publish({ label: scope.signal$('retired-label', 'Stale early label') });
					binding.refresh();
					expect(action.getAttribute('aria-label')).toBe('Stop');
					accent.set('green');
					flushSync(() => {});
					expect(action.style.color).toBe('green');
					action.click();
					expect(request.signal.aborted).toBe(true);
					expect(cancel).toHaveBeenCalledTimes(discard ? 3 : 2);
					expect(send).not.toHaveBeenCalled();
					flushSync(() => {});
					expect(action.getAttribute('aria-label')).toBe('Send');
					expect([action.className, action.style.height, action.style.opacity]).toEqual([
						'is-idle',
						'16px',
						'1',
					]);
					hydratedRoot.unmount();
					hydratedRoot = undefined;
					const retiredMarkup = action.outerHTML;
					generating.set(true);
					expect(action.outerHTML).toBe(retiredMarkup);
					action.click();
					expect(cancel).toHaveBeenCalledTimes(discard ? 3 : 2);
					expect(send).not.toHaveBeenCalled();
				} finally {
					binding.dispose();
					hydratedRoot?.unmount();
					hydratedRoot = undefined;
					scope.dispose();
					for (const update of nativeUpdates) {
						update.ready.resolve();
						update.finished.resolve();
					}
					viewTransitions?.restore();
				}
			}
			for (const [delayed, failureKind, handled] of [
				[true, 'read', true],
				[true, 'coercion', true],
				[true, 'coercion', false],
				[true, 'null', true],
				[true, 'undefined', true],
				[false, 'read', true],
				[false, 'coercion', true],
				[false, 'coercion', false],
				[false, 'null', true],
				[false, 'undefined', true],
			] as const) {
				const failure =
					failureKind === 'null'
						? null
						: failureKind === 'undefined'
							? undefined
							: new Error(
									`Authored ${failureKind} during ${delayed ? 'delayed' : 'sync'} preparation`,
								);
				const earlyAction = vi.fn();
				const earlyRef = vi.fn();
				const normalAction = vi.fn();
				const normalRef = vi.fn();
				const onUncaughtError = vi.fn();
				const fixture = authoredPresentation(
					'ErrorPresentation',
					{
						model: { title: 'Early' },
						label: 'Body',
						onAction: earlyAction,
						onReady: earlyRef,
					},
					dev,
					`import { Hydrate } from 'octane';
export function ErrorPresentation(props) @{ 'use dom bindings';
 <button title={props.model.title} onClick={props.onAction} ref={props.onReady}><b>{props.label as string}</b></button>
}
export function ErrorHydration(props) @{
 <Hydrate when={props.when} split={false}>
  <ErrorPresentation model={props.model} label={props.label} onAction={props.onAction} onReady={props.onReady}/>
 </Hydrate>
}`,
				);
				const props = { ...fixture.state.getSnapshot(), when: never() };
				article.innerHTML = delayed
					? renderToString(fixture.server.ErrorHydration, props).html
					: fixture.html;
				const button = article.querySelector('button')!;
				const child = button.firstElementChild;
				const binding = fixture.attach(button, fixture.state);
				const model =
					failureKind === 'read'
						? {
								get title(): string {
									throw failure;
								},
							}
						: {
								title: {
									toString() {
										throw failure;
									},
								},
							};
				const normal = { ...props, model, onAction: normalAction, onReady: normalRef };
				const options = { bindingLeases: [binding], ...(handled ? { onUncaughtError } : {}) };
				try {
					const client = fixture.loadClient();
					if (delayed) {
						hydratedRoot = hydrateRoot(article, client.ErrorHydration, normal, options);
						await act(() => {});
						const activate = () =>
							act(() => {
								hydratedRoot!.render(client.ErrorHydration, { ...normal, when: condition(true) });
							});
						if (handled) await activate();
						else await expect(activate()).rejects.toBe(failure);
					} else {
						const activate = () => {
							hydratedRoot = hydrateRoot(article, client.ErrorPresentation, normal, options);
						};
						if (handled) expect(activate).not.toThrow();
						else {
							let caught: unknown;
							try {
								activate();
							} catch (error) {
								caught = error;
							}
							expect(caught).toBe(failure);
						}
					}
					if (handled) expect(onUncaughtError).toHaveBeenCalledExactlyOnceWith(failure);
					expect(article.querySelector('button')).toBe(button);
					expect(button.firstElementChild).toBe(child);
					expect(button.title).toBe('Early');
					expect(normalRef).not.toHaveBeenCalled();
					expect(earlyRef.mock.calls).toEqual([[button]]);
					expect(fixture.cleanup).not.toHaveBeenCalled();
					fixture.publish({ model: { title: 'Still early' } });
					expect(button.title).toBe('Still early');
					button.click();
					expect(earlyAction).toHaveBeenCalledOnce();
					expect(normalAction).not.toHaveBeenCalled();
				} finally {
					hydratedRoot?.unmount();
					hydratedRoot = undefined;
					binding.dispose();
				}
				expect(fixture.cleanup).toHaveBeenCalledOnce();
				expect(earlyRef.mock.calls).toEqual([[button], [null]]);
			}
			const refusedRest = authoredPresentation(
				'RefusedRestTree',
				{ label: 'Early', onAction: vi.fn(), onReady: vi.fn() },
				dev,
				`export function GenericRest({ label, ...rest }) @{ 'use dom bindings';
 <button title={label} {...rest} />
}
export function RefusedRestTree(props) @{ 'use dom bindings';
 <section><GenericRest label={props.label} onClick={props.onAction} ref={props.onReady} /></section>
}`,
			);
			article.innerHTML = refusedRest.html;
			const refusedButton = article.querySelector('button')!;
			const refusedBinding = refusedRest.attach(article.firstElementChild!, refusedRest.state);
			try {
				const markup = article.innerHTML;
				// The generic spread can supply children in normal rendering. Its
				// bindSignalChild writer has no strict-adoption proof even though this
				// extracted callsite has a closed, safe native-rest key set.
				expect(() =>
					hydrateRoot(
						article,
						refusedRest.loadClient().RefusedRestTree,
						refusedRest.state.getSnapshot(),
						{ bindingLeases: [refusedBinding] },
					),
				).toThrow(/binding lease|presentation|handoff/i);
				expect(article.innerHTML).toBe(markup);
				expect(article.querySelector('button')).toBe(refusedButton);
				expect(refusedRest.cleanup).not.toHaveBeenCalled();
				expect(refusedRest.state.getSnapshot().onReady.mock.calls).toEqual([[refusedButton]]);
				refusedRest.publish({ label: 'Still early' });
				expect(refusedButton.title).toBe('Still early');
				refusedButton.click();
				expect(refusedRest.state.getSnapshot().onAction).toHaveBeenCalledOnce();
			} finally {
				refusedBinding.dispose();
			}
			for (const shape of ['same', 'extra', 'missing', 'order', 'symbol']) {
				const scope = createScope({ scopeKey: `rest-handoff-${dev}-${shape}` });
				const aria = scope.signal$('aria', 'Early aria');
				const onAction = vi.fn((event: Event) => event.preventDefault());
				const onReady = vi.fn();
				const initial = {
					classes: 'early',
					style: { color: 'red', width: 10 },
					title: 'Early',
					label: 'Label',
					'aria-label': aria,
					onClick: onAction,
					ref: onReady,
				};
				const fixture = authoredPresentation(
					'ClosedRest',
					initial,
					dev,
					`export function ClosedRest({ classes, style, title, label, ...rest }) @{ 'use dom bindings';
 <button class={classes} style={style} title={title} {...rest}><b>{label as string}</b></button>
}`,
					{},
					{},
					Object.keys(initial),
				);
				article.innerHTML = fixture.html;
				const button = article.querySelector('button')!;
				const child = button.querySelector('b')!;
				const binding = fixture.attach(button, fixture.state);
				const next: Record<string | symbol, unknown> = {
					...initial,
					classes: 'normal',
					style: { height: 20 },
					title: 'Normal',
				};
				if (shape === 'extra') next['data-extra'] = 'unexpected';
				if (shape === 'missing') delete next['aria-label'];
				if (shape === 'order') {
					delete next.title;
					next.title = 'Normal';
				}
				if (shape === 'symbol') next[Symbol('unexpected')] = true;
				try {
					const takeOver = () =>
						hydrateRoot(article, fixture.loadClient().ClosedRest, next, {
							bindingLeases: [binding],
						});
					if (shape === 'same') {
						hydratedRoot = takeOver();
						flushSync(() => {});
						flushEffects();
						expect(fixture.cleanup).toHaveBeenCalledOnce();
						expect(button.className).toBe('normal');
						expect(button.style.height).toBe('20px');
						expect(button.style.color).toBe('');
						expect(button.style.width).toBe('');
						expect(button.title).toBe('Normal');
						expect(onReady.mock.calls).toEqual([[button], [null], [button]]);
						aria.set('Normal aria');
						flushSync(() => {});
						expect(button.getAttribute('aria-label')).toBe('Normal aria');
						fixture.publish({ title: 'Retired' });
						binding.refresh();
						expect(button.title).toBe('Normal');
					} else {
						const before = button.outerHTML;
						expect(takeOver).toThrow(/binding lease|presentation|handoff/i);
						expect(button.outerHTML).toBe(before);
						expect(fixture.cleanup).not.toHaveBeenCalled();
						expect(onReady.mock.calls).toEqual([[button]]);
						fixture.publish({ title: 'Still early' });
						expect(button.title).toBe('Still early');
					}
					expect(article.querySelector('button')).toBe(button);
					expect(button.querySelector('b')).toBe(child);
					expect(
						button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
					).toBe(false);
					expect(onAction).toHaveBeenCalledOnce();
				} finally {
					hydratedRoot?.unmount();
					hydratedRoot = undefined;
					binding.dispose();
					scope.dispose();
				}
				expect(onReady.mock.calls).toEqual(
					shape === 'same' ? [[button], [null], [button], [null]] : [[button], [null]],
				);
			}
			for (const outcome of [
				'pending',
				'pending-unmount',
				'staged',
				'staged-unmount',
				'staged-signal',
				'staged-signal-aba',
			]) {
				const staged = outcome.startsWith('staged');
				const changedSignal = outcome.startsWith('staged-signal');
				const signalABA = outcome.endsWith('aba');
				const unmount = outcome.endsWith('unmount');
				const scope = createScope({ scopeKey: `rest-pending-${dev}-${outcome}` });
				const earlyAria = scope.signal$('early', 'Early aria');
				const normalAria = scope.signal$('normal', 'Prepared aria');
				const earlyAction = vi.fn((event: Event) => event.preventDefault());
				const normalAction = vi.fn((event: Event) => event.preventDefault());
				const earlyRef = vi.fn();
				const refLabels: Array<string | null> = [];
				const normalRef = vi.fn((node: Element | null) => {
					if (node !== null) refLabels.push(node.getAttribute('aria-label'));
				});
				const onHydrated = vi.fn();
				const pending = deferred<void>();
				let publication = false;
				let coercions = 0;
				const fixture = authoredPresentation(
					'RestTree',
					{
						classes: 'early',
						style: { color: 'red', width: 10 },
						title: 'Early',
						aria: earlyAria,
						onAction: earlyAction,
						onReady: earlyRef,
					},
					dev,
					`import { Hydrate, use } from 'octane';
export function RestChild({ classes, style, title, ...rest }) @{ 'use dom bindings';
 <button class={classes} style={style} title={title} {...rest}><b>Action</b></button>
}
export function RestTree(props) @{ 'use dom bindings';
 <section><RestChild classes={props.classes} style={props.style} title={props.title}
  aria-label={props.aria} onClick={props.onAction} ref={props.onReady}/></section>
}
function Wait(props) @{ if (props.suspend) use(props.promise); <i/> }
export function RestHydration(props) @{
 <Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
  <RestTree classes={props.classes} style={props.style} title={props.title}
   aria={props.aria} onAction={props.onAction} onReady={props.onReady}/>
  <Wait suspend={props.suspend} promise={props.promise}/>
 </Hydrate>
}`,
				);
				const guard = (value: string) => ({
					toString() {
						if (publication) throw new Error('authored coercion during publication');
						coercions++;
						return value;
					},
				});
				const classes = [
					Object.defineProperty({}, 'normal', {
						enumerable: true,
						get() {
							if (publication) throw new Error('authored class getter during publication');
							return true;
						},
					}),
				];
				const props = {
					...fixture.state.getSnapshot(),
					when: staged ? never() : condition(true),
					suspend: false,
					promise: pending.promise,
					onHydrated,
				};
				article.innerHTML = renderToString(fixture.server.RestHydration, props).html;
				const button = article.querySelector('button')!;
				const child = button.firstElementChild;
				const binding = fixture.attach(article.querySelector('section')!, fixture.state);
				const normal = {
					...props,
					classes,
					style: { height: guard('20px') },
					title: guard('Normal'),
					aria: normalAria,
					onAction: normalAction,
					onReady: normalRef,
				};
				const transitions = staged ? installViewTransitionMocks() : undefined;
				const updates: Array<{
					update: () => void | Promise<void>;
					ready: ReturnType<typeof deferred<void>>;
					finished: ReturnType<typeof deferred<void>>;
				}> = [];
				if (staged)
					Object.defineProperty(document, 'startViewTransition', {
						configurable: true,
						value(input: { update: () => void | Promise<void> }) {
							const ready = deferred<void>();
							const finished = deferred<void>();
							updates.push({ update: input.update, ready, finished });
							return { ready: ready.promise, finished: finished.promise, skipTransition() {} };
						},
					});
				try {
					const client = fixture.loadClient();
					hydratedRoot = hydrateRoot(
						article,
						client.RestHydration,
						{ ...normal, suspend: !staged },
						{ bindingLeases: [binding] },
					);
					flushSync(() => {});
					flushEffects();
					await act(() => {});
					if (staged) {
						startTransition(() => {
							addTransitionType('adopt-rest');
							hydratedRoot!.render(client.RestHydration, { ...normal, when: condition(true) });
						});
						await vi.waitFor(() => expect(updates).toHaveLength(1));
					}
					expect(button.title).toBe('Early');
					expect(button.style.color).toBe('red');
					expect(button.getAttribute('aria-label')).toBe('Early aria');
					expect(earlyRef.mock.calls).toEqual([[button]]);
					expect(normalRef).not.toHaveBeenCalled();
					expect(fixture.cleanup).not.toHaveBeenCalled();
					expect(
						button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
					).toBe(false);
					expect(earlyAction).toHaveBeenCalledOnce();
					expect(normalAction).not.toHaveBeenCalled();
					const preparedCoercions = coercions;
					if (changedSignal) {
						normalAria.set('Changed while staged');
						if (signalABA) normalAria.set('Prepared aria');
					} else if (staged) publication = true;
					if (unmount) {
						hydratedRoot.unmount();
						hydratedRoot = undefined;
					}
					if (staged) {
						await updates[0].update();
						updates[0].ready.resolve();
						updates[0].finished.resolve();
						await act(() => {});
					} else await act(() => pending.resolve());
					if (unmount) {
						expect(article.querySelector('button')).toBeNull();
						expect(normalRef).not.toHaveBeenCalled();
						expect(onHydrated).not.toHaveBeenCalled();
					} else {
						expect(article.querySelector('button')).toBe(button);
						expect(button.firstElementChild).toBe(child);
						expect(button.title).toBe('Normal');
						expect(button.className).toBe('normal');
						expect(button.style.height).toBe('20px');
						expect(button.style.color).toBe('');
						expect(button.style.width).toBe('');
						expect(button.getAttribute('aria-label')).toBe(
							changedSignal && !signalABA ? 'Changed while staged' : 'Prepared aria',
						);
						expect(earlyRef.mock.calls).toEqual([[button], [null]]);
						expect(normalRef).toHaveBeenCalledExactlyOnceWith(button);
						expect(refLabels).toEqual([
							changedSignal && !signalABA ? 'Changed while staged' : 'Prepared aria',
						]);
						if (changedSignal) expect(coercions).toBeGreaterThan(preparedCoercions);
						expect(fixture.cleanup).toHaveBeenCalledOnce();
						expect(onHydrated).toHaveBeenCalledOnce();
						expect(
							button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
						).toBe(false);
						expect(normalAction).toHaveBeenCalledOnce();
						expect(earlyAction).toHaveBeenCalledOnce();
						publication = false;
						normalAria.set('Accepted update');
						flushSync(() => {});
						expect(button.getAttribute('aria-label')).toBe('Accepted update');
					}
				} finally {
					publication = false;
					hydratedRoot?.unmount();
					hydratedRoot = undefined;
					binding.dispose();
					scope.dispose();
					for (const update of updates) {
						update.ready.resolve();
						update.finished.resolve();
					}
					transitions?.restore();
				}
			}
			for (const outcome of [
				'ready',
				'empty',
				'empty resume',
				'retire',
				'resume',
				'abort',
				'scalar retry',
				'object',
				'function',
				'function handle',
				'duck',
				'read-error',
			]) {
				const scope = createScope({ scopeKey: `scalar-text-handoff-${dev}-${outcome}` });
				const value = scope.signal$('value', outcome.startsWith('empty') ? '' : 'server');
				const pending = deferred<void>();
				const onReady = vi.fn();
				const onHydrated = vi.fn();
				const fixture = authoredPresentation(
					'ScalarTextPresentation',
					{ value: value.get() as unknown, onReady },
					dev,
					`import { Hydrate, use } from 'octane';
export function ScalarTextPresentation(props) @{ 'use dom bindings';
 <p ref={props.onReady}>{props.value as string}</p>
}
function TextSuffix(props) @{ if (props.suspend) use(props.promise); <i /> }
export function ScalarTextHydration(props) @{
 <Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
  <ScalarTextPresentation value={props.value} onReady={props.onReady} />
  <TextSuffix suspend={props.suspend} promise={props.promise} />
 </Hydrate>
}`,
				);
				const application = {
					...fixture.state.getSnapshot(),
					when: never(),
					suspend: false,
					promise: pending.promise,
					onHydrated,
				};
				const refused = ['object', 'function', 'function handle', 'duck', 'read-error'].includes(
					outcome,
				);
				article.innerHTML = refused
					? fixture.html
					: renderToString(fixture.server.ScalarTextHydration, application).html;
				const paragraph = article.querySelector('p')!;
				fixture.publish({ value }, false);
				const binding = runWithSignalOwner(scope, () =>
					fixture.attach(paragraph, {
						getSnapshot: fixture.state.getSnapshot,
						subscribe(notify) {
							const stop = fixture.state.subscribe(notify);
							return () => {
								stop();
								if (outcome === 'retire') value.set('during retirement');
							};
						},
					}),
				);
				const client = fixture.loadClient();
				try {
					if (!outcome.startsWith('empty')) value.set('before hydration');
					expect(paragraph.textContent).toBe(value.get());
					const text = [...paragraph.childNodes].find((node) => node.nodeType === 3);
					onReady.mockClear();
					if (refused) {
						const failure = new Error('scalar signal read failed');
						const duck = { get: vi.fn(() => 'not a signal') };
						const invalid =
							outcome === 'object'
								? scope.signal$('invalid', { unsupported: true })
								: outcome === 'function'
									? () => 'not scalar'
									: outcome === 'function handle'
										? scope.signal$('invalid', () => 'not scalar')
										: outcome === 'duck'
											? duck
											: scope.derived$('invalid', () => {
													throw failure;
												});
						expect(() =>
							hydrateRoot(
								article,
								client.ScalarTextPresentation,
								{ value: invalid, onReady },
								{ signalOwner: scope, bindingLeases: [binding] },
							),
						).toThrow(outcome === 'read-error' ? failure : /binding leases/);
						expect(duck.get).not.toHaveBeenCalled();
						expect(onReady).not.toHaveBeenCalled();
						expect(fixture.cleanup).not.toHaveBeenCalled();
						value.set('early owner survives refusal');
						expect(article.querySelector('p')).toBe(paragraph);
						expect(paragraph.textContent).toBe('early owner survives refusal');
						continue;
					}
					hydratedRoot = hydrateRoot(
						article,
						client.ScalarTextHydration,
						{ ...application, value },
						{ signalOwner: scope, bindingLeases: [binding] },
					);
					const suspended =
						outcome.endsWith('resume') || outcome === 'abort' || outcome === 'scalar retry';
					await act(() =>
						hydratedRoot!.render(client.ScalarTextHydration, {
							...application,
							value,
							when: condition(true),
							suspend: suspended,
						}),
					);
					if (suspended) {
						expect(fixture.cleanup).not.toHaveBeenCalled();
						expect(onHydrated).not.toHaveBeenCalled();
						expect(onReady).not.toHaveBeenCalled();
						await act(() => value.set('during suspension'));
						expect(paragraph.textContent).toBe('during suspension');
						if (outcome === 'abort')
							await act(() =>
								hydratedRoot!.render(client.ScalarTextHydration, { ...application, value }),
							);
						if (outcome === 'scalar retry')
							await act(() =>
								hydratedRoot!.render(client.ScalarTextHydration, {
									...application,
									value: 'scalar retry',
									when: condition(true),
									suspend: true,
								}),
							);
						await act(() => pending.resolve());
					}
					expect(article.querySelector('p')).toBe(paragraph);
					if (text) expect([...paragraph.childNodes]).toContain(text);
					if (outcome === 'abort') {
						expect(fixture.cleanup).not.toHaveBeenCalled();
						expect(onHydrated).not.toHaveBeenCalled();
						value.set('early owner remains active');
						expect(paragraph.textContent).toBe('early owner remains active');
						continue;
					}
					expect(fixture.cleanup).toHaveBeenCalledOnce();
					expect(onHydrated).toHaveBeenCalledOnce();
					expect(paragraph.textContent).toBe(
						outcome === 'scalar retry' ? 'scalar retry' : value.get(),
					);
					value.set('accepted direct update');
					expect(paragraph.textContent).toBe(
						outcome === 'scalar retry' ? 'scalar retry' : 'accepted direct update',
					);
					await act(() =>
						hydratedRoot!.render(client.ScalarTextHydration, {
							...application,
							when: condition(true),
							value: 'scalar replacement',
						}),
					);
					value.set('retired original');
					expect(paragraph.textContent).toBe('scalar replacement');
					const replacement = scope.signal$('replacement', 'new handle');
					await act(() =>
						hydratedRoot!.render(client.ScalarTextHydration, {
							...application,
							when: condition(true),
							value: replacement,
						}),
					);
					replacement.set('new direct update');
					expect(paragraph.textContent).toBe('new direct update');
					hydratedRoot.unmount();
					hydratedRoot = undefined;
					replacement.set('after unmount');
					expect(paragraph.textContent).toBe('new direct update');
				} finally {
					hydratedRoot?.unmount();
					hydratedRoot = undefined;
					binding.dispose();
					scope.dispose();
				}
			}
			const duringPreparation = authoredPresentation(
				'RefreshDuringPreparation',
				{ title: 'Early', label: 'Initial', onAction: vi.fn(), onReady: vi.fn() },
				dev,
				`function PreparationButton(props) @{
 <button title={props.title} onClick={props.onAction} ref={props.onReady}><b>{props.label as string}</b></button>
}
export function RefreshDuringPreparation(props) @{ 'use dom bindings';
 <PreparationButton title={props.title} label={props.label} onAction={props.onAction} onReady={props.onReady}/>
}`,
			);
			article.innerHTML = duringPreparation.html;
			const preparationButton = article.querySelector('button')!;
			const preparationLabel = preparationButton.querySelector('b')!;
			const preparationRange = {
				start: article.firstChild as Comment,
				end: article.lastChild as Comment,
			};
			const preparationBinding = duringPreparation.attach(
				preparationRange,
				duringPreparation.state,
			);
			let refreshedDuringPreparation = false;
			try {
				preparationButton.focus();
				hydratedRoot = hydrateRoot(
					article,
					duringPreparation.loadClient().RefreshDuringPreparation,
					{
						...duringPreparation.state.getSnapshot(),
						title: {
							toString() {
								if (!refreshedDuringPreparation) {
									refreshedDuringPreparation = true;
									duringPreparation.publish({ title: 'Current early', label: 'Current early' });
								}
								return 'Accepted';
							},
						},
					},
					{ bindingLeases: [preparationBinding] },
				);
				expect(article.querySelector('button')).toBe(preparationButton);
				expect(preparationButton.querySelector('b')).toBe(preparationLabel);
				expect(article.firstChild).toBe(preparationRange.start);
				expect(article.lastChild).toBe(preparationRange.end);
				expect(preparationButton.title).toBe('Current early');
				expect(duringPreparation.cleanup).not.toHaveBeenCalled();
				expect(duringPreparation.state.getSnapshot().onReady.mock.calls).toEqual([
					[preparationButton],
				]);
				preparationButton.click();
				expect(duringPreparation.state.getSnapshot().onAction).toHaveBeenCalledOnce();
				await act(() => {});
				expect(article.querySelector('button')).toBe(preparationButton);
				expect(preparationButton.querySelector('b')).toBe(preparationLabel);
				expect(article.firstChild).toBe(preparationRange.start);
				expect(article.lastChild).toBe(preparationRange.end);
				expect(document.activeElement).toBe(preparationButton);
				expect(preparationButton.title).toBe('Accepted');
				expect(duringPreparation.cleanup).toHaveBeenCalledOnce();
				expect(duringPreparation.state.getSnapshot().onReady.mock.calls).toEqual([
					[preparationButton],
					[null],
					[preparationButton],
				]);
			} finally {
				hydratedRoot?.unmount();
				hydratedRoot = undefined;
				preparationBinding.dispose();
			}
			const busyScope = createScope({ scopeKey: `host-publication-retry-${dev}` });
			const busyHost = authoredPresentation('NativeControlHost', { className: 'early' }, dev);
			const busyProps = {
				className: 'early',
				draft: busyScope.signal$('draft', 'preserved child draft'),
				placeholder: busyScope.signal$('placeholder', 'Message'),
				readOnly: busyScope.signal$('readonly', false),
				disabled: busyScope.signal$('disabled', false),
				required: busyScope.signal$('required', false),
			};
			article.innerHTML = renderToString(busyHost.server.NativeControlLayout, busyProps).html;
			const busyForm = article.querySelector('form')!;
			const busyTextarea = busyForm.querySelector('textarea')!;
			const busyParagraph = busyForm.querySelector('p')!;
			const busyClient = busyHost.loadClient();
			const busyReady = vi.fn();
			const busyError = vi.fn();
			let beginDuringSnapshot = false;
			let busyBinding: DomBindings.BindingHandle;
			busyBinding = busyHost.attach(busyForm, {
				getSnapshot() {
					if (beginDuringSnapshot) {
						beginDuringSnapshot = false;
						hydratedRoot = hydrateRoot(
							article,
							busyClient.NativeControlLayout,
							{
								...busyProps,
								className: 'accepted after publication',
								onReady: busyReady,
							},
							{ signalOwner: busyScope, bindingLeases: [busyBinding], onUncaughtError: busyError },
						);
					}
					return busyHost.state.getSnapshot();
				},
				subscribe: busyHost.state.subscribe,
			});
			try {
				beginDuringSnapshot = true;
				busyHost.publish({ className: 'early publication in progress' });
				expect(busyForm.className).toBe('early publication in progress');
				expect(busyHost.cleanup).not.toHaveBeenCalled();
				expect(busyReady).not.toHaveBeenCalled();
				await act(() => {});
				expect(busyError).not.toHaveBeenCalled();
				expect(article.querySelector('form')).toBe(busyForm);
				expect(busyForm.querySelector('textarea')).toBe(busyTextarea);
				expect(busyForm.querySelector('p')).toBe(busyParagraph);
				expect(busyTextarea.value).toBe('preserved child draft');
				expect(busyForm.className).toBe('accepted after publication');
				expect(busyHost.cleanup).toHaveBeenCalledOnce();
				expect(busyReady).toHaveBeenCalledExactlyOnceWith(busyForm);
				busyHost.publish({ className: 'retired publication' });
				busyBinding.refresh();
				expect(busyForm.className).toBe('accepted after publication');
			} finally {
				hydratedRoot?.unmount();
				hydratedRoot = undefined;
				busyBinding.dispose();
				busyScope.dispose();
			}
			const tree = authoredPresentation(
				'TreePresentation',
				{ active: false, label: 'Server', detail: ' detail', onAction: vi.fn() },
				dev,
				`function TreeLabel(props) @{
 <span>{props.label as string}{props.children}</span>
}
export function TreePresentation(props) @{ 'use dom bindings';
 <button type="button" onClick={props.onAction} ref={props.onReady}>
  @if (props.active) {
   <TreeLabel label={props.label}><em>{props.detail as string}</em></TreeLabel>
  } @else {
   <b>{props.label as string}</b>
  }
 </button>
}`,
			);
			article.innerHTML = tree.html;
			const treeButton = article.querySelector('button')!;
			const treeBinding = tree.attach(treeButton, tree.state);
			try {
				tree.publish({ active: true, label: 'Early' });
				const label = treeButton.querySelector('span')!;
				const detail = treeButton.querySelector('em')!;
				const text = label.childNodes[1];
				expect(treeButton.textContent).toBe('Early detail');
				treeButton.focus();
				const onReady = vi.fn();
				const client = tree.loadClient();
				hydratedRoot = hydrateRoot(
					article,
					client.TreePresentation,
					{ ...tree.state.getSnapshot(), onReady },
					{ bindingLeases: [treeBinding] },
				);
				flushSync(() => {});
				flushEffects();
				expect(article.querySelector('button')).toBe(treeButton);
				expect(treeButton.querySelector('span')).toBe(label);
				expect(treeButton.querySelector('em')).toBe(detail);
				expect(label.childNodes[1]).toBe(text);
				expect(document.activeElement).toBe(treeButton);
				expect(onReady).toHaveBeenCalledExactlyOnceWith(treeButton);
				expect(tree.cleanup).toHaveBeenCalledOnce();
				tree.publish({ active: false, label: 'Retired' });
				treeBinding.refresh();
				expect(treeButton.textContent).toBe('Early detail');
				treeButton.click();
				expect(tree.state.getSnapshot().onAction).toHaveBeenCalledOnce();
			} finally {
				hydratedRoot?.unmount();
				hydratedRoot = undefined;
				treeBinding.dispose();
			}
			const importedChild = `export function ImportedLabel(props) @{ 'use dom bindings';
 @if (props.active) { <span>{props.label as string}</span> }
 @else { <b>{props.label as string}</b> }
}`;
			const importedParent = `import { ImportedLabel } from './imported-label.tsrx';
export function ImportedTree(props) @{ 'use dom bindings';
 <button type="button" onClick={props.onAction} ref={props.onReady}>
  <ImportedLabel active={props.active} label={props.label} />
  <ImportedLabel active={!props.active} label={props.detail} />
 </button>
}`;
			const importedRequest = `./imported-label.tsrx?octane-bindings=ImportedLabel&octane-mount=1&octane-props=${encodeURIComponent(JSON.stringify([1, ['active', 'label']]))}`;
			const importedOptions = { compileOptions: { dev, hmr: false } };
			const imported = authoredPresentation(
				'ImportedTree',
				{ active: false, label: 'Server', detail: ' Other', onAction: vi.fn() },
				dev,
				importedParent,
				{
					'./imported-label.tsrx': loadCompiledFixtureSource(importedChild, {
						...importedOptions,
						id: '/src/imported-label.tsrx',
						mode: 'server',
					}),
					[importedRequest]: loadCompiledFixtureSource(importedChild, {
						...importedOptions,
						id: '/src/' + importedRequest.slice(2),
						mode: 'client',
						runtimeModules: {
							'octane/dom-binding-program': DomBindingPrograms,
							'octane/dom-binding-signals': DomBindingSignals,
						},
					}),
				},
			);
			article.innerHTML = imported.html;
			const importedButton = article.querySelector('button')!;
			const importedBinding = imported.attach(importedButton, imported.state);
			try {
				imported.publish({ active: true, label: 'Early' });
				const labels = [...importedButton.children];
				const client = loadCompiledFixtureSource(importedParent, {
					...importedOptions,
					id: '/src/dom-presentation.tsrx',
					mode: 'client',
					runtimeModules: {
						'./imported-label.tsrx': loadCompiledFixtureSource(importedChild, {
							...importedOptions,
							id: '/src/imported-label.tsrx',
							mode: 'client',
						}),
					},
				});
				const onReady = vi.fn();
				hydratedRoot = hydrateRoot(
					article,
					client.ImportedTree,
					{ ...imported.state.getSnapshot(), onReady },
					{ bindingLeases: [importedBinding] },
				);
				flushSync(() => {});
				flushEffects();
				expect(article.querySelector('button')).toBe(importedButton);
				expect([...importedButton.children]).toEqual(labels);
				expect(importedButton.textContent).toBe('Early Other');
				expect(onReady).toHaveBeenCalledExactlyOnceWith(importedButton);
				expect(imported.cleanup).toHaveBeenCalledOnce();
				importedButton.click();
				expect(imported.state.getSnapshot().onAction).toHaveBeenCalledOnce();
			} finally {
				hydratedRoot?.unmount();
				hydratedRoot = undefined;
				importedBinding.dispose();
			}
			for (const outcome of [
				'changed',
				'aba',
				'unmount',
				'staged',
				'staged-aba',
				'staged-unmount',
				'lag',
				'lag-unmount',
				'unsupported',
			]) {
				const staged = outcome.startsWith('staged');
				const lag = outcome.startsWith('lag');
				const aba = outcome.endsWith('aba');
				const unmount = outcome.endsWith('unmount');
				const model = {
					active: outcome === 'unsupported',
					label: outcome === 'unsupported' ? '' : 'Server',
				};
				const pending = deferred<void>();
				const onAction = vi.fn();
				const onReady = vi.fn();
				const onHydrated = vi.fn();
				const onUncaughtError = vi.fn();
				const fixture = authoredPresentation(
					'PendingTree',
					{ model, onAction },
					dev,
					`import { Hydrate, use } from 'octane';
${
	outcome === 'unsupported'
		? `function Label(props) @{
 @if (props.label) { <span>{props.label}</span> } @else { <>{props.children}</> }
}
function Contents(props) @{ <Label label={props.label}>{props.children}</Label> }`
		: 'function Label(props) @{ <span>{props.label as string}</span> }'
}
export function PendingTree(props) @{ 'use dom bindings';
 <button type="button" onClick={props.onAction} ref={props.onReady}>
  @if (props.model.active) { ${outcome === 'unsupported' ? '<Contents label={props.model.label}>{props.children}</Contents>' : '<Label label={props.model.label} />'} }
  @else { <b>{props.model.label as string}</b> }
 </button>
}
function Wait(props) @{ if (props.suspend) use(props.promise); <i /> }
export function TreeHydration(props) @{
 <Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
  <PendingTree model={props.model} onAction={props.onAction} onReady={props.onReady}/>
  <Wait suspend={props.suspend} promise={props.promise}/>
 </Hydrate>
}`,
				);
				const props = {
					model,
					onAction,
					onReady,
					onHydrated,
					when: staged ? never() : condition(true),
					suspend: false,
					promise: pending.promise,
				};
				article.innerHTML = renderToString(fixture.server.TreeHydration, props).html;
				const button = article.querySelector('button')!;
				const binding = fixture.attach(button, fixture.state);
				const viewTransitions = staged ? installViewTransitionMocks() : undefined;
				const nativeUpdates: Array<{
					update: () => void | Promise<void>;
					ready: ReturnType<typeof deferred<void>>;
					finished: ReturnType<typeof deferred<void>>;
				}> = [];
				if (staged)
					Object.defineProperty(document, 'startViewTransition', {
						configurable: true,
						value(input: { update: () => void | Promise<void> }) {
							const ready = deferred<void>();
							const finished = deferred<void>();
							nativeUpdates.push({ update: input.update, ready, finished });
							return { ready: ready.promise, finished: finished.promise, skipTransition() {} };
						},
					});
				try {
					const client = fixture.loadClient();
					hydratedRoot = hydrateRoot(
						article,
						client.TreeHydration,
						{ ...props, suspend: !staged },
						{ bindingLeases: [binding], onUncaughtError },
					);
					flushSync(() => {});
					flushEffects();
					await act(() => {});
					if (staged) {
						startTransition(() => {
							addTransitionType('adopt-tree');
							hydratedRoot!.render(client.TreeHydration, { ...props, when: condition(true) });
						});
						await vi.waitFor(() => expect(nativeUpdates).toHaveLength(1));
					}
					expect(onReady).not.toHaveBeenCalled();
					expect(fixture.cleanup).not.toHaveBeenCalled();
					model.active = true;
					model.label = 'Early';
					if (lag) {
						const before = button.innerHTML;
						await act(() => pending.resolve());
						expect(article.querySelector('button')).toBe(button);
						expect(button.innerHTML).toBe(before);
						expect(onReady).not.toHaveBeenCalled();
						expect(fixture.cleanup).not.toHaveBeenCalled();
						button.click();
						expect(onAction).toHaveBeenCalledOnce();
						if (unmount) {
							hydratedRoot.unmount();
							hydratedRoot = undefined;
							fixture.publish({ model });
							await act(() => {});
							expect(article.querySelector('button')).toBeNull();
							expect(onReady).not.toHaveBeenCalled();
							expect(onHydrated).not.toHaveBeenCalled();
							continue;
						}
						onAction.mockClear();
					}
					fixture.publish({ model });
					if (aba) {
						model.active = false;
						fixture.publish({ model });
					}
					const label = button.querySelector(aba ? 'b' : 'span')!;
					expect(label.textContent).toBe('Early');
					button.focus();
					button.click();
					expect(onAction).toHaveBeenCalledOnce();
					if (unmount) {
						hydratedRoot.unmount();
						hydratedRoot = undefined;
					}
					if (staged) {
						await nativeUpdates[0].update();
						nativeUpdates[0].ready.resolve();
						nativeUpdates[0].finished.resolve();
						await act(() => {});
					} else await act(() => pending.resolve());
					if (outcome === 'unsupported') {
						expect(onUncaughtError).toHaveBeenCalledOnce();
						expect(article.querySelector('button')).toBe(button);
						expect(button.querySelector('span')).toBe(label);
						expect(onReady).not.toHaveBeenCalled();
						expect(onHydrated).not.toHaveBeenCalled();
						expect(fixture.cleanup).not.toHaveBeenCalled();
						model.label = 'Still early';
						fixture.publish({ model });
						expect(button.textContent).toBe('Still early');
						button.click();
						expect(onAction).toHaveBeenCalledTimes(2);
						continue;
					}
					if (unmount) {
						expect(article.querySelector('button')).toBeNull();
						expect(onReady).not.toHaveBeenCalled();
						expect(onHydrated).not.toHaveBeenCalled();
					} else {
						expect(article.querySelector('button')).toBe(button);
						expect(button.querySelector(aba ? 'b' : 'span')).toBe(label);
						expect(document.activeElement).toBe(button);
						expect(onReady, outcome).toHaveBeenCalledExactlyOnceWith(button);
						expect(onHydrated).toHaveBeenCalledOnce();
						expect(fixture.cleanup).toHaveBeenCalledOnce();
						button.click();
						expect(onAction).toHaveBeenCalledTimes(2);
						// A later commit must not publish a discarded scope's deferred deletion.
						hydratedRoot!.render(client.TreeHydration, { ...props, when: condition(true) });
						await act(() => {});
						expect(article.querySelector('button')).toBe(button);
						expect(button.querySelector(aba ? 'b' : 'span')).toBe(label);
						expect(onReady).toHaveBeenCalledExactlyOnceWith(button);
					}
				} finally {
					hydratedRoot?.unmount();
					hydratedRoot = undefined;
					binding.dispose();
					for (const update of nativeUpdates) {
						update.ready.resolve();
						update.finished.resolve();
					}
					viewTransitions?.restore();
				}
			}
			const login = authoredPresentation(
				'LoginPresentation',
				{
					label: 'Email',
					error: '',
					pending: false,
					submitLabel: 'Continue',
				},
				dev,
			);
			article.innerHTML = login.html;
			const loginForm = article.querySelector('form')!;
			const loginInput = article.querySelector('input')!;
			loginInput.value = 'Uncontrolled draft';
			const loginBinding = login.attach(loginForm, login.state);
			try {
				hydratedRoot = hydrateRoot(
					article,
					login.loadClient().LoginPresentation,
					login.state.getSnapshot(),
					{ bindingLeases: [loginBinding] },
				);
				flushSync(() => {});
				flushEffects();
				expect(article.querySelector('form')).toBe(loginForm);
				expect(article.querySelector('input')).toBe(loginInput);
				expect(loginInput.value).toBe('Uncontrolled draft');
				expect(login.cleanup).toHaveBeenCalledOnce();
			} finally {
				hydratedRoot?.unmount();
				hydratedRoot = undefined;
				loginBinding.dispose();
			}
			// Native controlled-value ownership is excluded from the structural proof.
			const structural = authoredPresentation(
				'LoginPresentation',
				{ label: 'Email', error: '', pending: false, submitLabel: 'Continue', draft: '' },
				dev,
				presentationSource.replace(
					'<input name="email"',
					'<input value={props.draft} name="email"',
				),
			);
			article.innerHTML = structural.html;
			const form = article.querySelector('form')!;
			const structuralBinding = structural.attach(form, structural.state);
			try {
				const before = form.outerHTML;
				expect(() =>
					hydrateRoot(
						article,
						structural.loadClient().LoginPresentation,
						structural.state.getSnapshot(),
						{
							bindingLeases: [structuralBinding],
						},
					),
				).toThrow(/structural|fixed native/i);
				expect(article.querySelector('form')).toBe(form);
				expect(form.outerHTML).toBe(before);
				structural.publish({ pending: true });
				expect(form.querySelector('button')!.disabled).toBe(true);
				expect(form.querySelector('svg')).not.toBeNull();
			} finally {
				structuralBinding.dispose();
			}
		}
		// This dev/prod matrix compiles and exercises hundreds of fresh fixtures.
	}, 15_000);

	it('preserves externally owned DOM when disposed by default', async () => {
		container.innerHTML = '<section data-owner="stream"><button>Action</button></section>';
		const section = container.firstElementChild!;
		const button = section.firstElementChild!;
		const root = attach();
		const cleanup = vi.fn(() => root.dispose());
		const registration = root.registerBehavior({
			target: 'button',
			adopt: () => cleanup,
		});
		await registration.ready;

		root.dispose();
		root.dispose();
		registration.dispose();

		expect(root.signal.aborted).toBe(true);
		expect(registration.signal.aborted).toBe(true);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.firstElementChild).toBe(section);
		expect(section.firstElementChild).toBe(button);
		expect(section.getAttribute('data-owner')).toBe('stream');
		const fixture = authoredBindings();
		section.innerHTML = fixture.html;
		const action = section.querySelector('button')!;
		const binding = fixture.attach(action, fixture.state);
		binding.dispose();
		binding.dispose();
		const retained = action.outerHTML;
		fixture.publish({ label: 'Disposed' });
		binding.refresh();
		expect(fixture.cleanup).toHaveBeenCalledOnce();
		expect(action.outerHTML).toBe(retained);
		expect(section.firstElementChild).toBe(action);
		const replacement = fixture.attach(action, fixture.state);
		expect(action.getAttribute('aria-label')).toBe('Disposed');
		replacement.dispose();
		section.innerHTML = fixture.html + fixture.html;
		const [first, second] = section.querySelectorAll('button');
		const pair = fixture.attachPair(first, second, fixture.state);
		try {
			fixture.publish({ label: 'Both live' });
			expect(first.getAttribute('aria-label')).toBe('Both live');
			expect(second.getAttribute('aria-label')).toBe('Both live');
			pair.outer.dispose();
			fixture.publish({ label: 'Independent survivor' });
			expect(first.getAttribute('aria-label')).toBe('Both live');
			expect(second.getAttribute('aria-label')).toBe('Independent survivor');
		} finally {
			pair.outer.dispose();
			pair.inner.dispose();
		}
		section.innerHTML = fixture.html;
		const measured = section.querySelector('button')!;
		measured.style.setProperty('width', '45px', 'important');
		measured.style.setProperty('opacity', '0.7');
		measured.style.setProperty('margin-left', '9px');
		const restoring = fixture.attach(measured, fixture.state, { restoreStyles: true });
		fixture.publish({ width: 80, opacity: 0.2 });
		expect(measured.style.width).toBe('80px');
		measured.style.setProperty('opacity', '0.9', 'important');
		restoring.dispose();
		expect(measured.style.width).toBe('45px');
		expect(measured.style.getPropertyPriority('width')).toBe('important');
		expect(measured.style.opacity).toBe('0.9');
		expect(measured.style.getPropertyPriority('opacity')).toBe('important');
		expect(measured.style.marginLeft).toBe('9px');
	});

	it('removes externally managed descendants only when explicitly requested', () => {
		container.innerHTML = '<article><button>Action</button></article>';
		const root = attach();

		root.dispose({ preserveDOM: false });

		expect(root.signal.aborted).toBe(true);
		expect(container.isConnected).toBe(true);
		expect(container.childNodes).toHaveLength(0);
		const before = document.createElement('input');
		const after = document.createElement('button');
		container.append(before, after);
		const onAction = vi.fn();
		const fixture = authoredPresentation<SafetyPresentationProps>('SafetyPresentation', {
			visible: false,
			title: '',
			message: '',
			actions: [],
			onAction,
		});
		const binding = fixture.mount({ parent: container, before: after }, fixture.state);
		try {
			expect([...container.children]).toEqual([before, after]);
			fixture.publish({
				visible: true,
				title: 'Review required',
				message: 'Please continue.',
				actions: [
					{ id: 'continue', label: 'Continue', href: null },
					{ id: 'help', label: 'Help', href: '/help' },
				],
			});
			const gate = container.querySelector('section')!;
			expect([...container.children]).toEqual([before, gate, after]);
			gate.querySelector('button')!.click();
			expect(onAction).toHaveBeenCalledWith('continue');
			expect(gate.querySelector('a')!.getAttribute('href')).toBe('/help');
			fixture.publish({ visible: false });
			expect([...container.children]).toEqual([before, after]);
			fixture.publish({ visible: true, title: 'Try again' });
			expect(container.querySelector('strong')!.textContent).toBe('Try again');
		} finally {
			binding.dispose({ preserveDOM: false });
		}
		expect([...container.childNodes]).toEqual([before, after]);
		expect(fixture.cleanup).toHaveBeenCalledOnce();
	});

	it('adopts selector targets and an explicitly supplied element without rendering', async () => {
		container.innerHTML =
			'<button id="first" data-action>First</button><button id="second" data-action>Second</button>';
		const first = container.querySelector('#first')!;
		const second = container.querySelector('#second')!;
		const adopted = vi.fn();
		const explicitlyAdopted = vi.fn();
		const root = attach();
		const selected = root.registerBehavior({
			id: 'selector',
			target: '[data-action]',
			adopt: adopted,
		});
		const explicit = root.registerBehavior({
			id: 'explicit',
			target: second,
			adopt: explicitlyAdopted,
		});

		await Promise.all([selected.ready, explicit.ready, root.ready]);

		expect(adopted.mock.calls.map(([element]) => element)).toEqual([first, second]);
		expect(explicitlyAdopted.mock.calls.map(([element]) => element)).toEqual([second]);
		expect(container.children).toHaveLength(2);
		expect(container.children[0]).toBe(first);
		expect(container.children[1]).toBe(second);
	});

	it('adopts streamed insertions and cleans up removed nodes exactly once', async () => {
		container.innerHTML = '<section><button id="initial" data-action>Initial</button></section>';
		const section = container.firstElementChild!;
		const initial = section.firstElementChild!;
		const adopted: Element[] = [];
		const cleaned: Element[] = [];
		const root = attach();
		const registration = root.registerBehavior({
			target: '[data-action]',
			adopt(element) {
				adopted.push(element);
				return () => cleaned.push(element);
			},
		});
		await registration.ready;

		const streamed = document.createElement('button');
		streamed.id = 'streamed';
		streamed.setAttribute('data-action', '');
		streamed.textContent = 'Streamed';
		section.appendChild(streamed);
		await vi.waitFor(() => expect(adopted).toEqual([initial, streamed]));

		initial.remove();
		await vi.waitFor(() => expect(cleaned).toEqual([initial]));
		registration.dispose();
		registration.dispose();

		expect(cleaned).toEqual([initial, streamed]);
		expect(section.firstElementChild).toBe(streamed);
	});

	it('adopts existing elements when externally patched attributes toggle selector eligibility', async () => {
		container.innerHTML =
			'<section data-owner="stream"><button id="action" aria-label="Original">Action</button></section>';
		const section = container.firstElementChild!;
		const button = section.firstElementChild!;
		const originalMarkup = container.innerHTML;
		const cleaned: Element[] = [];
		const adopted = vi.fn((element: Element) => () => cleaned.push(element));
		const root = attach();
		const registration = root.registerBehavior({ target: '[data-action]', adopt: adopted });
		await registration.ready;
		expect(adopted).not.toHaveBeenCalled();

		button.setAttribute('data-action', 'annotation');
		await vi.waitFor(() => expect(adopted).toHaveBeenCalledOnce());
		expect(adopted.mock.calls[0]?.[0]).toBe(button);

		button.removeAttribute('data-action');
		await vi.waitFor(() => expect(cleaned).toEqual([button]));

		button.setAttribute('data-action', 'annotation');
		await vi.waitFor(() => expect(adopted).toHaveBeenCalledTimes(2));
		button.removeAttribute('data-action');
		await vi.waitFor(() => expect(cleaned).toEqual([button, button]));
		registration.dispose();

		expect(cleaned).toEqual([button, button]);
		expect(container.innerHTML).toBe(originalMarkup);
		expect(container.firstElementChild).toBe(section);
		expect(section.firstElementChild).toBe(button);
	});

	it.each([
		{
			change: 'an existing element changes class',
			selector: '.is-interactive',
			mutateAncestor: false,
			className: 'is-interactive',
		},
		{
			change: 'an unchanged descendant gains an attribute-selected ancestor',
			selector: '[data-enabled] [data-action]',
			mutateAncestor: true,
			attribute: 'data-enabled',
		},
		{
			change: 'an unchanged descendant gains a class-selected ancestor',
			selector: '.is-enabled [data-action]',
			mutateAncestor: true,
			className: 'is-enabled',
		},
	])(
		'updates existing behavior when $change',
		async ({ selector, mutateAncestor, attribute, className }) => {
			container.innerHTML =
				'<section class="external" data-owner="stream"><button id="action" class="stable" data-action>Action</button></section>';
			const section = container.firstElementChild!;
			const button = section.firstElementChild!;
			const originalMarkup = container.innerHTML;
			const owner = Symbol('external stream');
			const cleaned: Element[] = [];
			const adopted = vi.fn((element: Element) => () => cleaned.push(element));
			const root = attach();
			root.registerExternalRange(section, { owner });
			const behavior = root.registerBehavior({ owner, target: selector, adopt: adopted });
			await behavior.ready;
			expect(adopted).not.toHaveBeenCalled();

			const patched = mutateAncestor ? section : button;
			const enable = () => {
				if (attribute) patched.setAttribute(attribute, '');
				else patched.classList.add(className!);
			};
			const disable = () => {
				if (attribute) patched.removeAttribute(attribute);
				else patched.classList.remove(className!);
			};

			enable();
			await vi.waitFor(() => expect(adopted).toHaveBeenCalledOnce());
			expect(adopted.mock.calls[0]?.[0]).toBe(button);

			disable();
			await vi.waitFor(() => expect(cleaned).toEqual([button]));

			enable();
			await vi.waitFor(() => expect(adopted).toHaveBeenCalledTimes(2));
			disable();
			await vi.waitFor(() => expect(cleaned).toEqual([button, button]));
			behavior.dispose();

			expect(cleaned).toEqual([button, button]);
			expect(container.innerHTML).toBe(originalMarkup);
			expect(container.firstElementChild).toBe(section);
			expect(section.firstElementChild).toBe(button);
		},
	);

	it('updates :empty behavior when streamed mutations add or remove only text nodes', async () => {
		container.innerHTML = '<section id="streamed-text"></section>';
		const range = container.firstElementChild!;
		const adopted: Element[] = [];
		const cleaned: Element[] = [];
		const root = attach();
		const behavior = root.registerBehavior({
			target: '#streamed-text:empty',
			adopt(element) {
				adopted.push(element);
				return () => cleaned.push(element);
			},
		});
		await behavior.ready;
		expect(adopted).toEqual([range]);

		const streamedText = document.createTextNode('Progressively streamed text');
		range.appendChild(streamedText);
		await vi.waitFor(() => expect(cleaned).toEqual([range]));
		expect(range.firstChild).toBe(streamedText);
		expect(range.textContent).toBe('Progressively streamed text');

		streamedText.remove();
		await vi.waitFor(() => expect(adopted).toEqual([range, range]));
		expect(range.matches(':empty')).toBe(true);
	});

	it('keeps an existing adoption when its node moves inside the same ownership range', async () => {
		container.innerHTML =
			'<section id="left"><button data-action>Move</button></section><section id="right"></section>';
		const button = container.querySelector('button')!;
		const right = container.querySelector('#right')!;
		const cleanup = vi.fn();
		const adopt = vi.fn(() => cleanup);
		const root = attach();
		const registration = root.registerBehavior({ target: '[data-action]', adopt });
		await registration.ready;

		right.appendChild(button);
		await Promise.resolve();
		await Promise.resolve();

		expect(right.firstElementChild).toBe(button);
		expect(adopt).toHaveBeenCalledOnce();
		expect(cleanup).not.toHaveBeenCalled();

		root.dispose();
		expect(cleanup).toHaveBeenCalledOnce();
		for (const dev of [false, true]) {
			const releases = new Map<Element, ReturnType<typeof vi.fn>>();
			const onInput = (element: Element | null) => {
				if (element === null) return;
				const release = vi.fn();
				releases.set(element, release);
				return release;
			};
			const onRemove = vi.fn();
			const onRetry = vi.fn();
			const items: AttachmentPresentationProps['items'] = [
				{ id: 'a', name: 'First', preview: null, state: 'uploading', error: '' },
				{ id: 'b--<', name: 'Second', preview: null, state: 'ready', error: '' },
				{ id: 'c', name: 'Third', preview: '/preview.png', state: 'error', error: 'Retry this' },
			];
			const fixture = authoredPresentation<AttachmentPresentationProps>(
				'AttachmentPresentation',
				{
					items,
					locked: false,
					onInput,
					onRemove,
					onRetry,
				},
				dev,
			);
			container.innerHTML = fixture.html;
			const original = [...container.querySelectorAll('figure')];
			const inputs = original.map((figure) => figure.querySelector('input')!);
			inputs[1]!.value = 'User editing';
			inputs[1]!.focus();
			inputs[1]!.setSelectionRange(2, 7, 'backward');
			fixture.publish({ items: [items[1]!, items[0]!, items[2]!] });
			const range = { start: container.firstChild as Comment, end: container.lastChild as Comment };
			const binding = fixture.attach(range, fixture.state);
			try {
				expect([...container.querySelectorAll('figure')]).toEqual([
					original[1],
					original[0],
					original[2],
				]);
				expect(document.activeElement).toBe(inputs[1]);
				expect(inputs[1]!.value).toBe('User editing');
				expect([
					inputs[1]!.selectionStart,
					inputs[1]!.selectionEnd,
					inputs[1]!.selectionDirection,
				]).toEqual([2, 7, 'backward']);
				expect(releases.size).toBe(3);
				fixture.publish({
					items: [
						{ ...items[2]!, name: 'Updated third', state: 'ready', preview: null },
						{ ...items[1]!, name: 'Renamed second' },
					],
				});
				expect([...container.querySelectorAll('figure')]).toEqual([original[2], original[1]]);
				expect(original[2]!.querySelector('figcaption')!.textContent).toBe('Updated third');
				expect(original[2]!.querySelector('img')).toBeNull();
				expect(inputs[1]!.value).toBe('User editing');
				expect(releases.get(inputs[0]!)!).toHaveBeenCalledOnce();
				expect(releases.get(inputs[1]!)!).not.toHaveBeenCalled();
				original[1]!.querySelector('button')!.click();
				expect(onRemove).toHaveBeenLastCalledWith('b--<');
				fixture.publish({ locked: true }, false);
				binding.refresh();
				expect(original[1]!.querySelector('button')!.disabled).toBe(true);
				fixture.publish({ items: [] });
				expect(container.querySelectorAll('figure')).toHaveLength(0);
				expect(container.textContent).toBe('No attachments');
				for (const release of releases.values()) expect(release).toHaveBeenCalledOnce();
			} finally {
				binding.dispose();
			}
			expect(fixture.cleanup).toHaveBeenCalledOnce();
			const replacement = fixture.attach(range, fixture.state);
			fixture.publish({ items: [items[0]!] });
			expect(container.querySelector('input')!.value).toBe('First');
			expect(container.querySelector('figcaption')!.textContent).toBe('First');
			replacement.dispose({ preserveDOM: false });
			expect(container.childNodes).toHaveLength(0);
		}
	});

	it('waits for an external range while preserving mutations before and during readiness', async () => {
		container.innerHTML =
			'<section data-stream><button id="stale" data-action>Stale</button></section>';
		const range = container.firstElementChild!;
		const owner = { name: 'stream' };
		const streamSettled = deferred<void>();
		const adopted = vi.fn();
		const root = attach();
		const ownership = root.registerExternalRange(range, {
			owner,
			ready: streamSettled.promise,
		});
		const behavior = root.registerBehavior({
			id: 'stream-action',
			owner,
			target: '[data-action]',
			adopt: adopted,
		});

		const inserted = document.createElement('button');
		inserted.id = 'streamed';
		inserted.setAttribute('data-action', '');
		inserted.textContent = 'Inserted while pending';
		range.replaceChildren(inserted);
		await Promise.resolve();
		expect(adopted).not.toHaveBeenCalled();
		expect(range.firstElementChild).toBe(inserted);

		streamSettled.resolve(undefined);
		await Promise.all([ownership.ready, behavior.ready, root.ready]);

		expect(adopted.mock.calls.map(([element]) => element)).toEqual([inserted]);
		expect(range.firstElementChild).toBe(inserted);
		expect(inserted.textContent).toBe('Inserted while pending');
	});

	it('adopts matching nodes when an owner range is registered after its behavior', async () => {
		container.innerHTML = '<section><button data-action>Late range</button></section>';
		const range = container.firstElementChild!;
		const button = range.firstElementChild!;
		const owner = { name: 'late-owner' };
		const adopted = vi.fn();
		const root = attach();
		const behavior = root.registerBehavior({ owner, target: '[data-action]', adopt: adopted });

		await Promise.resolve();
		expect(adopted).not.toHaveBeenCalled();

		const ownership = root.registerExternalRange(range, { owner });
		await Promise.all([ownership.ready, behavior.ready]);
		await vi.waitFor(() =>
			expect(adopted.mock.calls.map(([element]) => element)).toEqual([button]),
		);
	});

	it('gives a late nested range ownership over the closest matching descendants', async () => {
		container.innerHTML =
			'<section id="outer"><button id="outer-action" data-action>Outer</button><article id="inner"><button id="inner-action" data-action>Inner</button></article></section>';
		const outer = container.querySelector('#outer')!;
		const inner = container.querySelector('#inner')!;
		const outerButton = container.querySelector('#outer-action')!;
		const innerButton = container.querySelector('#inner-action')!;
		const outerOwner = { name: 'outer' };
		const innerOwner = { name: 'inner' };
		const outerAdoptions: Element[] = [];
		const outerCleanups: Element[] = [];
		const innerAdoptions: Element[] = [];
		const root = attach();
		root.registerExternalRange(outer, { owner: outerOwner });
		const outerBehavior = root.registerBehavior({
			id: 'outer-actions',
			owner: outerOwner,
			target: '[data-action]',
			adopt(element) {
				outerAdoptions.push(element);
				return () => outerCleanups.push(element);
			},
		});
		await outerBehavior.ready;
		expect(outerAdoptions).toEqual([outerButton, innerButton]);

		root.registerExternalRange(inner, { owner: innerOwner });
		const innerBehavior = root.registerBehavior({
			id: 'inner-actions',
			owner: innerOwner,
			target: '[data-action]',
			adopt(element) {
				innerAdoptions.push(element);
			},
		});
		await innerBehavior.ready;

		expect(outerCleanups).toEqual([innerButton]);
		expect(innerAdoptions).toEqual([innerButton]);
		expect(inner.firstElementChild).toBe(innerButton);
		expect(outer.firstElementChild).toBe(outerButton);
	});

	it('hands an adopted node between nested owners as external updates move it', async () => {
		container.innerHTML =
			'<section id="outer"><button id="moving" data-action>Move</button><article id="inner"></article></section>';
		const outer = container.querySelector('#outer')!;
		const inner = container.querySelector('#inner')!;
		const moving = container.querySelector('#moving')!;
		const outerOwner = { name: 'outer-owner' };
		const innerOwner = { name: 'inner-owner' };
		const outerAdoptions: Element[] = [];
		const innerAdoptions: Element[] = [];
		const outerCleanups: Element[] = [];
		const innerCleanups: Element[] = [];
		const root = attach();
		root.registerExternalRange(outer, { owner: outerOwner });
		root.registerExternalRange(inner, { owner: innerOwner });
		const outerBehavior = root.registerBehavior({
			owner: outerOwner,
			target: '[data-action]',
			adopt(element) {
				outerAdoptions.push(element);
				return () => outerCleanups.push(element);
			},
		});
		const innerBehavior = root.registerBehavior({
			owner: innerOwner,
			target: '[data-action]',
			adopt(element) {
				innerAdoptions.push(element);
				return () => innerCleanups.push(element);
			},
		});
		await Promise.all([outerBehavior.ready, innerBehavior.ready]);
		expect(outerAdoptions).toEqual([moving]);

		inner.appendChild(moving);
		await vi.waitFor(() => {
			expect(outerCleanups).toEqual([moving]);
			expect(innerAdoptions).toEqual([moving]);
		});

		outer.insertBefore(moving, inner);
		await vi.waitFor(() => {
			expect(innerCleanups).toEqual([moving]);
			expect(outerAdoptions).toEqual([moving, moving]);
		});
		expect(outer.firstElementChild).toBe(moving);
	});

	it('restores enclosing ownership when a nested behavior root is disposed without replacing DOM', async () => {
		container.innerHTML =
			'<section id="outer-range"><article id="nested-root"><button data-action>Nested</button></article></section>';
		const outerRange = container.querySelector('#outer-range')!;
		const nestedContainer = container.querySelector('#nested-root')!;
		const button = nestedContainer.firstElementChild!;
		const outerOwner = { name: 'enclosing-owner' };
		const nestedOwner = { name: 'nested-owner' };
		const outerAdoptions: Element[] = [];
		const outerCleanups: Element[] = [];
		const nestedCleanup = vi.fn();
		const outerRoot = attach();
		outerRoot.registerExternalRange(outerRange, { owner: outerOwner });
		const enclosingBehavior = outerRoot.registerBehavior({
			owner: outerOwner,
			target: '[data-action]',
			adopt(element) {
				outerAdoptions.push(element);
				return () => outerCleanups.push(element);
			},
		});
		await enclosingBehavior.ready;
		expect(outerAdoptions).toEqual([button]);

		const nestedRoot = attach(nestedContainer);
		nestedRoot.registerExternalRange(nestedContainer, { owner: nestedOwner });
		const nestedBehavior = nestedRoot.registerBehavior({
			owner: nestedOwner,
			target: '[data-action]',
			adopt: () => nestedCleanup,
		});
		await nestedBehavior.ready;
		expect(outerCleanups).toEqual([button]);

		nestedRoot.dispose();

		expect(nestedCleanup).toHaveBeenCalledOnce();
		expect(outerRoot.signal.aborted).toBe(false);
		expect(nestedContainer.firstElementChild).toBe(button);
		await vi.waitFor(() => expect(outerAdoptions).toEqual([button, button]));
	});

	it('rejects conflicting owners and hands a range off only when replacement is explicit', async () => {
		container.innerHTML = '<section><button data-action>Owned</button></section>';
		const range = container.firstElementChild!;
		const button = range.firstElementChild!;
		const initialOwner = { name: 'initial' };
		const nextOwner = { name: 'replacement' };
		const cleanup = vi.fn();
		const root = attach();
		const initialRange = root.registerExternalRange(range, { owner: initialOwner });
		const initialBehavior = root.registerBehavior({
			owner: initialOwner,
			target: '[data-action]',
			adopt: () => cleanup,
		});
		await initialBehavior.ready;

		expect(() => root.registerExternalRange(range, { owner: nextOwner })).toThrow(
			/conflict|own|replace/i,
		);
		const replacement = root.registerExternalRange(range, {
			owner: nextOwner,
			replace: true,
		});
		const adopted = vi.fn();
		const replacementBehavior = root.registerBehavior({
			owner: nextOwner,
			target: '[data-action]',
			adopt: adopted,
		});
		await Promise.all([replacement.ready, replacementBehavior.ready]);

		expect(initialRange.signal.aborted).toBe(true);
		expect(replacement.signal.aborted).toBe(false);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(adopted.mock.calls.map(([element]) => element)).toEqual([button]);
		expect(range.firstElementChild).toBe(button);
	});

	it('ignores a superseded owner readiness promise after a range handoff', async () => {
		container.innerHTML = '<section><button data-action>Owned</button></section>';
		const range = container.firstElementChild!;
		const previousOwner = { name: 'previous' };
		const nextOwner = { name: 'next' };
		const staleReadiness = deferred<void>();
		const staleAdoption = vi.fn();
		const currentAdoption = vi.fn();
		const root = attach();
		const staleRange = root.registerExternalRange(range, {
			owner: previousOwner,
			ready: staleReadiness.promise,
		});
		root.registerBehavior({ owner: previousOwner, target: '[data-action]', adopt: staleAdoption });

		const currentRange = root.registerExternalRange(range, {
			owner: nextOwner,
			replace: true,
		});
		const currentBehavior = root.registerBehavior({
			owner: nextOwner,
			target: '[data-action]',
			adopt: currentAdoption,
		});
		await Promise.all([currentRange.ready, currentBehavior.ready]);

		staleReadiness.resolve(undefined);
		await staleRange.ready.catch(() => {});
		await Promise.resolve();

		expect(staleRange.signal.aborted).toBe(true);
		expect(staleAdoption).not.toHaveBeenCalled();
		expect(currentAdoption).toHaveBeenCalledOnce();
	});

	it('drops queued interactions from an owner generation replaced before its behavior loads', async () => {
		container.innerHTML = '<section><button data-action>Owned</button></section>';
		const rangeElement = container.firstElementChild!;
		const button = rangeElement.firstElementChild!;
		const owner = { name: 'replaced-owner' };
		const oldRangeReady = deferred<void>();
		const moduleReady = deferred<void>();
		const handled = vi.fn();
		const root = attach();
		const oldRange = root.registerExternalRange(rangeElement, {
			owner,
			ready: oldRangeReady.promise,
		});
		const behavior = root.registerBehavior({
			owner,
			target: '[data-action]',
			events: ['click'],
			ready: moduleReady.promise,
			captureEvent(_event, element) {
				return element.textContent;
			},
			adopt() {},
			handleEvent: handled,
		});
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(handled).not.toHaveBeenCalled();

		const replacement = root.registerExternalRange(rangeElement, { owner, replace: true });
		moduleReady.resolve(undefined);
		await Promise.all([replacement.ready, behavior.ready]);
		oldRangeReady.resolve(undefined);
		await oldRange.ready;

		expect(oldRange.signal.aborted).toBe(true);
		expect(replacement.signal.aborted).toBe(false);
		expect(handled).not.toHaveBeenCalled();
		expect(rangeElement.firstElementChild).toBe(button);
		button.textContent = 'Current owner';
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(handled).toHaveBeenCalledOnce();
		expect(handled.mock.calls[0][3]).toBe('Current owner');
	});

	it('passes the exact queued interaction to a late behavior without redispatching it', async () => {
		container.innerHTML = '<button data-action><span>Action</span></button>';
		const button = container.querySelector('button')!;
		const label = container.querySelector('span')!;
		const moduleReady = deferred<void>();
		const nativeListener = vi.fn();
		const handled = vi.fn();
		button.addEventListener('click', nativeListener);
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			events: ['click'],
			ready: moduleReady.promise,
			adopt() {},
			handleEvent: handled,
		});
		const original = new MouseEvent('click', { bubbles: true, cancelable: true });

		expect(label.dispatchEvent(original)).toBe(true);
		expect(nativeListener).toHaveBeenCalledOnce();
		expect(nativeListener.mock.calls[0][0]).toBe(original);
		expect(original.defaultPrevented).toBe(false);
		expect(handled).not.toHaveBeenCalled();

		moduleReady.resolve(undefined);
		await behavior.ready;

		expect(handled).toHaveBeenCalledOnce();
		expect(handled.mock.calls[0][0]).toBe(original);
		expect(handled.mock.calls[0][1]).toBe(button);
		expect(handled.mock.calls[0][2].signal.aborted).toBe(false);
		expect(nativeListener).toHaveBeenCalledOnce();
		expect(original.defaultPrevented).toBe(false);

		behavior.dispose();
		for (const finalValue of ['B', '']) {
			container.innerHTML =
				'<form><input name="selectedId" value="first"><textarea name="text">server</textarea><button>Save</button></form>';
			const form = container.querySelector('form')!;
			const selected = form.elements.namedItem('selectedId') as HTMLInputElement;
			const editor = form.elements.namedItem('text') as HTMLTextAreaElement;
			const ready = deferred<void>();
			const submitted: Array<{ selectedId: string; text: string }> = [];
			const nativeEvents: Event[] = [];
			const deliveredEvents: Event[] = [];
			form.addEventListener('submit', (event) => {
				nativeEvents.push(event);
				event.preventDefault();
			});
			const save = root.registerBehavior({
				target: form,
				events: ['submit'],
				ready: ready.promise,
				captureEvent(event, element) {
					event.preventDefault();
					const data = new FormData(element as HTMLFormElement);
					return Object.freeze({
						selectedId: String(data.get('selectedId')),
						text: String(data.get('text')),
					});
				},
				adopt() {},
				handleEvent(event, _element, _context, payload) {
					deliveredEvents.push(event);
					submitted.push(payload);
				},
			});
			editor.value = 'A';
			form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
			editor.value = finalValue;
			selected.value = 'second';
			if (finalValue === 'B') {
				form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
			}
			expect(submitted).toEqual([]);
			ready.resolve(undefined);
			await save.ready;
			expect(submitted).toEqual(
				finalValue === 'B'
					? [
							{ selectedId: 'first', text: 'A' },
							{ selectedId: 'second', text: 'B' },
						]
					: [{ selectedId: 'first', text: 'A' }],
			);
			expect(editor.value).toBe(finalValue);
			expect(selected.value).toBe('second');
			expect(deliveredEvents).toEqual(nativeEvents);
			save.dispose();
		}
	});

	it('preserves synchronous FIFO delivery when a queued handler dispatches another event', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const button = container.querySelector('button')!;
		const moduleReady = deferred<void>();
		const order: string[] = [];
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			events: ['probe'],
			ready: moduleReady.promise,
			adopt() {},
			handleEvent(event) {
				const detail = (event as CustomEvent<string>).detail;
				order.push(`start:${detail}`);
				if (detail === 'first') {
					button.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'nested' }));
					order.push('after:nested-dispatch');
				}
				order.push(`end:${detail}`);
			},
		});

		button.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'first' }));
		button.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'second' }));
		moduleReady.resolve(undefined);
		await behavior.ready;

		expect(order).toEqual([
			'start:first',
			'start:second',
			'end:second',
			'start:nested',
			'end:nested',
			'after:nested-dispatch',
			'end:first',
		]);

		behavior.dispose();
		const captures: string[] = [];
		const deliveries: string[] = [];
		for (const delay of [true, false]) {
			captures.length = deliveries.length = 0;
			const ready = deferred<void>();
			const captured = root.registerBehavior({
				target: button,
				events: ['probe'],
				...(delay ? { ready: ready.promise } : {}),
				captureEvent(event) {
					const payload = (event as CustomEvent<string>).detail;
					captures.push(payload);
					if (payload === 'A') {
						button.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'B' }));
					}
					return payload;
				},
				adopt() {},
				handleEvent(_event, _element, _context, payload) {
					deliveries.push(payload);
				},
			});
			button.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'A' }));
			expect(captures).toEqual(['A', 'B']);
			if (delay) expect(deliveries).toEqual([]);
			ready.resolve(undefined);
			await captured.ready;
			expect(deliveries).toEqual(['A', 'B']);
			captured.dispose();
		}
	});

	it('preserves FIFO delivery while asynchronous adoptions resume the queue', async () => {
		container.innerHTML = [
			'<button data-action="first">First</button>',
			'<button data-action="second">Second</button>',
			'<button data-action="third">Third</button>',
		].join('');
		const first = container.querySelector<HTMLButtonElement>('[data-action="first"]')!;
		const second = container.querySelector<HTMLButtonElement>('[data-action="second"]')!;
		const third = container.querySelector<HTMLButtonElement>('[data-action="third"]')!;
		const moduleReady = deferred<void>();
		const firstReady = deferred<void>();
		const secondReady = deferred<void>();
		const thirdReady = deferred<void>();
		const order: string[] = [];
		const root = attach();
		const adopt = vi.fn((element: Element) => {
			if (element === first) return firstReady.promise;
			if (element === second) return secondReady.promise;
			if (element === third) return thirdReady.promise;
			throw new Error('Unexpected behavior target');
		});
		const behavior = root.registerBehavior({
			target: '[data-action]',
			events: ['probe'],
			ready: moduleReady.promise,
			adopt,
			handleEvent(event) {
				const detail = (event as CustomEvent<string>).detail;
				order.push(`start:${detail}`);
				if (detail === 'first') {
					first.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'nested' }));
					order.push('after:nested-dispatch');
				}
				order.push(`end:${detail}`);
			},
		});

		first.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'first' }));
		second.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'second' }));
		third.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'third' }));
		moduleReady.resolve(undefined);
		await vi.waitFor(() => expect(adopt).toHaveBeenCalledTimes(3));

		firstReady.resolve(undefined);
		await firstReady.promise;
		await Promise.resolve();
		expect(order).toEqual(['start:first', 'after:nested-dispatch', 'end:first']);

		thirdReady.resolve(undefined);
		await thirdReady.promise;
		await Promise.resolve();
		expect(order).toEqual(['start:first', 'after:nested-dispatch', 'end:first']);

		secondReady.resolve(undefined);
		await behavior.ready;
		expect(order).toEqual([
			'start:first',
			'after:nested-dispatch',
			'end:first',
			'start:second',
			'end:second',
			'start:third',
			'end:third',
			'start:nested',
			'end:nested',
		]);
	});

	it('handles delegated behavior on descendants inserted after registration', async () => {
		container.innerHTML = '<section data-stream></section>';
		const stream = container.firstElementChild!;
		const handled = vi.fn();
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			events: ['click'],
			adopt() {},
			handleEvent: handled,
		});
		await behavior.ready;

		const inserted = document.createElement('button');
		inserted.setAttribute('data-action', '');
		stream.appendChild(inserted);
		const event = new MouseEvent('click', { bubbles: true });
		inserted.dispatchEvent(event);

		expect(handled).toHaveBeenCalledOnce();
		expect(handled.mock.calls[0][0]).toBe(event);
		expect(handled.mock.calls[0][1]).toBe(inserted);
		expect(stream.firstElementChild).toBe(inserted);
	});

	it('never activates native form submission twice for queued or repeated clicks', async () => {
		container.innerHTML = '<form><button type="submit" data-action>Send</button></form>';
		const form = container.querySelector('form')!;
		const button = container.querySelector('button')!;
		const moduleReady = deferred<void>();
		const nativeClicks: Event[] = [];
		const nativeSubmits: Event[] = [];
		const handled = vi.fn();
		button.addEventListener('click', (event) => nativeClicks.push(event));
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			nativeSubmits.push(event);
		});
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			events: ['click'],
			ready: moduleReady.promise,
			adopt() {},
			handleEvent: handled,
		});

		button.click();
		button.click();
		expect(nativeClicks).toHaveLength(2);
		expect(nativeSubmits).toHaveLength(2);
		expect(handled).not.toHaveBeenCalled();

		moduleReady.resolve(undefined);
		await behavior.ready;

		expect(handled.mock.calls.map(([event]) => event)).toEqual(nativeClicks);
		expect(nativeSubmits).toHaveLength(2);

		button.click();
		expect(nativeClicks).toHaveLength(3);
		expect(nativeSubmits).toHaveLength(3);
		expect(handled.mock.calls.map(([event]) => event)).toEqual(nativeClicks);
	});

	it('honors behavior dependency readiness before adopting a dependent entry', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const foundationReady = deferred<void>();
		const order: string[] = [];
		const root = attach();
		const foundation = root.registerBehavior({
			id: 'foundation',
			target: '[data-action]',
			ready: foundationReady.promise,
			adopt() {
				order.push('foundation');
			},
		});
		const widget = root.registerBehavior({
			id: 'widget',
			target: '[data-action]',
			dependencies: ['foundation'],
			adopt() {
				order.push('widget');
			},
		});
		await Promise.resolve();
		expect(order).toEqual([]);

		foundationReady.resolve(undefined);
		await Promise.all([foundation.ready, widget.ready, root.ready]);

		expect(order).toEqual(['foundation', 'widget']);
	});

	it('rejects a behavior dependency that was never registered', () => {
		container.innerHTML = '<button data-action>Action</button>';
		const root = attach();

		expect(() =>
			root.registerBehavior({
				id: 'widget',
				target: '[data-action]',
				dependencies: ['missing-foundation'],
				adopt() {},
			}),
		).toThrow(/depend|unknown|missing/i);
	});

	it('rejects conflicting behavior entries and duplicate behavior identities', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const root = attach();
		const first = root.registerBehavior({
			id: 'annotations',
			target: '[data-action]',
			conflicts: ['widgets'],
			adopt() {},
		});
		await first.ready;

		expect(() =>
			root.registerBehavior({ id: 'widgets', target: '[data-action]', adopt() {} }),
		).toThrow(/conflict/i);
		expect(() =>
			root.registerBehavior({ id: 'annotations', target: '[data-action]', adopt() {} }),
		).toThrow(/conflict|duplicate|already/i);

		root.registerBehavior({ id: 'existing', target: '[data-action]', adopt() {} });
		expect(() =>
			root.registerBehavior({
				id: 'declared-later',
				target: '[data-action]',
				conflicts: ['existing'],
				adopt() {},
			}),
		).toThrow(/conflict/i);
		const fixture = authoredBindings();
		const target = document.createElement('section');
		target.innerHTML = fixture.html;
		container.append(target);
		const action = target.querySelector('button')!;
		const binding = fixture.attach(action, fixture.state);
		try {
			expect(() => fixture.attach(action, fixture.state)).toThrow(/already.*binding/i);
			fixture.publish({ label: 'Original owner still works' });
			expect(action.getAttribute('aria-label')).toBe('Original owner still works');
		} finally {
			binding.dispose();
		}
		const text = authoredPresentation('AdjacentPresentation', { first: 'one', last: 'two' });
		const textHost = document.createElement('section');
		container.append(textHost);
		textHost.innerHTML = text.html;
		const textNode = textHost.querySelector('p')!;
		const textBinding = text.attach(textNode, text.state);
		try {
			expect(() => text.attach(textNode, text.state)).toThrow(/already.*binding/i);
			text.publish({ first: 'Still owned' });
			expect(textNode.textContent).toContain('Still owned');
		} finally {
			textBinding.dispose();
		}
		text.attach(textNode, text.state).dispose({ preserveDOM: false });
	});

	it('propagates a rejected external range readiness without adopting protected descendants', async () => {
		container.innerHTML = '<section><button data-action>Unavailable</button></section>';
		const range = container.firstElementChild!;
		const owner = { name: 'failed-stream' };
		const streamReady = deferred<void>();
		const failure = new Error('stream failed before ownership settled');
		const adopted = vi.fn();
		const root = attach();
		const ownership = root.registerExternalRange(range, { owner, ready: streamReady.promise });
		const behavior = root.registerBehavior({ owner, target: '[data-action]', adopt: adopted });
		const ownershipFailure = expect(ownership.ready).rejects.toBe(failure);
		const behaviorFailure = expect(behavior.ready).rejects.toBe(failure);
		const rootFailure = expect(root.ready).rejects.toBe(failure);

		streamReady.reject(failure);
		await Promise.all([ownershipFailure, behaviorFailure, rootFailure]);

		expect(adopted).not.toHaveBeenCalled();
		expect(container.firstElementChild).toBe(range);
		const fixture = authoredBindings();
		range.innerHTML = fixture.html;
		const action = range.querySelector('button')!;
		const tail = action.lastElementChild!.firstElementChild!;
		const original = tail.firstElementChild!;
		const wrong = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		tail.replaceChild(wrong, original);
		const retained = action.outerHTML;
		fixture.publish({ label: 'Must not partially apply', disabled: true });
		expect(() => fixture.attach(action, fixture.state)).toThrow(/topology|mismatch/i);
		expect(action.outerHTML).toBe(retained);
		expect(fixture.cleanup).not.toHaveBeenCalled();
		tail.replaceChild(original, wrong);
		const binding = fixture.attach(action, fixture.state);
		expect(action.getAttribute('aria-label')).toBe('Must not partially apply');
		binding.dispose();
		const failedSnapshot = {
			...fixture.state.getSnapshot(),
			label: {
				toString() {
					throw failure;
				},
			},
		};
		const cleanup = vi.fn();
		const source = { getSnapshot: () => failedSnapshot, subscribe: () => cleanup };
		const before = action.outerHTML;
		expect(() => fixture.attach(action, source)).toThrow(failure);
		expect(action.outerHTML).toBe(before);
		expect(cleanup).toHaveBeenCalledOnce();
		fixture.attach(action, fixture.state).dispose();
		const asyncCleanup = vi.fn();
		expect(() =>
			fixture.attach(action, {
				getSnapshot: () => Promise.resolve(fixture.state.getSnapshot()),
				subscribe: () => asyncCleanup,
			} as unknown as typeof fixture.state),
		).toThrow(/synchronous.*snapshot/i);
		expect(asyncCleanup).toHaveBeenCalledOnce();
		fixture.attach(action, fixture.state).dispose();
		for (const markup of ['<svg><span /></svg>', '<svg><desc><g /></desc></svg>']) {
			const source = `export function Invalid(props) @{ 'use dom bindings'; ${markup} }`;
			for (const mode of ['server', 'client'] as const) {
				expect(() =>
					loadCompiledFixtureSource(source, {
						id: '/src/invalid-svg.tsrx' + (mode === 'client' ? '?octane-bindings=Invalid' : ''),
						mode,
					}),
				).toThrow(/SVG|static DOM bindings/i);
			}
		}
		const controls = authoredControlBindings();
		range.innerHTML = controls.html;
		const form = range.querySelector('form')!;
		const textarea = form.querySelector('textarea')!;
		const duplicate = textarea.cloneNode(true);
		form.appendChild(duplicate);
		controls.publish({ mode: 'must-not-publish', expanded: false });
		const duplicated = form.outerHTML;
		expect(() => controls.attach(form, controls.state)).toThrow(
			/topology|mismatch|duplicate|unique/i,
		);
		expect(form.outerHTML).toBe(duplicated);
		form.removeChild(duplicate);
		const originalParent = textarea.parentElement!;
		const nextSibling = textarea.nextSibling;
		const foreignParent = document.createElement('div');
		form.appendChild(foreignParent);
		foreignParent.appendChild(textarea);
		const misplaced = form.outerHTML;
		expect(() => controls.attach(form, controls.state)).toThrow(/topology|mismatch/i);
		expect(form.outerHTML).toBe(misplaced);
		originalParent.insertBefore(textarea, nextSibling);
		foreignParent.remove();
		const canceled = new AbortController();
		canceled.abort();
		const canceledMarkup = form.outerHTML;
		controls.attach(form, controls.state, { signal: canceled.signal }).dispose();
		expect(form.outerHTML).toBe(canceledMarkup);
		const controlBinding = controls.attach(form, controls.state);
		expect(form.getAttribute('data-mode')).toBe('must-not-publish');
		controlBinding.dispose();
		const layoutScope = createScope({ scopeKey: 'host-layout-topology' });
		const layout = authoredPresentation('NativeControlHost', { className: 'compact' });
		const layoutProps = {
			className: 'compact',
			draft: layoutScope.signal$('draft', 'preserved draft'),
			placeholder: layoutScope.signal$('placeholder', 'Message'),
			readOnly: layoutScope.signal$('readonly', false),
			disabled: layoutScope.signal$('disabled', false),
			required: layoutScope.signal$('required', true),
		};
		range.innerHTML = renderToString(layout.server.NativeControlLayoutContainer, layoutProps).html;
		const layoutForm = range.querySelector('form')!;
		const layoutTextarea = range.querySelector('textarea')!;
		const wrongHost = document.createElement('section');
		expect(() => layout.attach(wrongHost, layout.state)).toThrow(/topology|mismatch/i);
		expect(layout.cleanup).not.toHaveBeenCalled();
		const sibling = range.querySelector('aside')!;
		const layoutNextSibling = layoutForm.nextSibling;
		const layoutBinding = layout.attach(layoutForm, layout.state);
		const replacement = layoutForm.cloneNode(true) as HTMLFormElement;
		layoutForm.replaceWith(replacement);
		try {
			expect(() =>
				hydrateRoot(range, layout.loadClient().NativeControlLayoutContainer, layoutProps, {
					signalOwner: layoutScope,
					bindingLeases: [layoutBinding],
				}),
			).toThrow(/active fixed native views|Minified Octane error #77;/);
			expect(range.querySelector('form')).toBe(replacement);
			expect(replacement.className).toBe('compact');
			expect(layout.cleanup).not.toHaveBeenCalled();
			replacement.replaceWith(layoutForm);
			layout.publish({ className: 'early after replacement refusal' });
			expect(layoutForm.className).toBe('early after replacement refusal');
			expect(layoutForm.querySelector('textarea')).toBe(layoutTextarea);
			layoutForm.parentElement!.append(layoutForm);
			expect(() =>
				hydrateRoot(range, layout.loadClient().NativeControlLayoutContainer, layoutProps, {
					signalOwner: layoutScope,
					bindingLeases: [layoutBinding],
				}),
			).toThrow(/active fixed native views|Minified Octane error #77;/);
			expect(sibling.parentElement!.lastElementChild).toBe(layoutForm);
			expect(layout.cleanup).not.toHaveBeenCalled();
			layout.publish({ className: 'early after movement refusal' });
			expect(layoutForm.className).toBe('early after movement refusal');
			sibling.parentElement!.insertBefore(layoutForm, layoutNextSibling);
			// A child's content is outside the host receipt; normal hydration owns it.
			captureHydrationControlCandidate(layoutTextarea);
			layoutTextarea.value = 'native child edit';
			layoutTextarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
			const paragraph = layoutForm.querySelector('p')!;
			hydratedRoot = hydrateRoot(
				range,
				layout.loadClient().NativeControlLayoutContainer,
				layoutProps,
				{
					signalOwner: layoutScope,
					bindingLeases: [layoutBinding],
				},
			);
			await act(() => {});
			expect(range.querySelector('form')).toBe(layoutForm);
			expect(layoutForm.querySelector('textarea')).toBe(layoutTextarea);
			expect(layoutTextarea.value).toBe('native child edit');
			expect(layoutForm.querySelector('p')).toBe(paragraph);
			expect(layoutForm.className).toBe('compact');
			expect(layout.cleanup).toHaveBeenCalledOnce();
		} finally {
			hydratedRoot?.unmount();
			hydratedRoot = undefined;
			layoutBinding.dispose();
			layoutScope.dispose();
		}

		for (const dev of [false, true]) {
			for (const field of ['data-octane-hydrate-id', 'data-octane-native-signals']) {
				const protocol = authoredPresentation(
					'ProtocolParent',
					{ className: 'early', marker: 'owned elsewhere' },
					dev,
					`import { unbound } from 'octane/behavior';
export function ProtocolParent(props) @{ 'use dom bindings';
 <form class={props.className} ${field}={props.marker}>{unbound(props.children)}</form>
}`,
				);
				range.innerHTML = protocol.html;
				const host = range.firstElementChild!;
				const binding = protocol.attach(host, protocol.state);
				try {
					const markup = range.innerHTML;
					expect(() =>
						hydrateRoot(range, protocol.loadClient().ProtocolParent, protocol.state.getSnapshot(), {
							bindingLeases: [binding],
						}),
					).toThrow(/active fixed native views|Minified Octane error #77;/);
					expect(range.innerHTML).toBe(markup);
					expect(range.firstElementChild).toBe(host);
					expect(protocol.cleanup).not.toHaveBeenCalled();
					protocol.publish({ className: 'still early' });
					expect(host.className).toBe('still early');
				} finally {
					binding.dispose();
				}
				expect(protocol.cleanup).toHaveBeenCalledOnce();
			}
		}

		for (const failureKind of ['duplicate', 'projection']) {
			const items: AttachmentPresentationProps['items'] = [
				{ id: 'a', name: 'First', preview: null, state: 'ready', error: '' },
				{ id: 'b', name: 'Second', preview: null, state: 'ready', error: '' },
			];
			const releases = [vi.fn(), vi.fn()];
			let attached = 0;
			const fixture = authoredPresentation<AttachmentPresentationProps>('AttachmentPresentation', {
				items,
				locked: false,
				onRemove() {},
				onRetry() {},
				onInput: () => releases[attached++],
			});
			const host = document.createElement('section');
			container.append(host);
			host.innerHTML = fixture.html;
			const range = { start: host.firstChild as Comment, end: host.lastChild as Comment };
			const handle = fixture.attach(range, fixture.state);
			const before = host.innerHTML;
			const inputs = [...host.querySelectorAll('input')];
			inputs[0]!.value = 'Preserve this edit';
			const failure = new Error('A later row text projection failed');
			const badName = {
				toString() {
					throw failure;
				},
			} as unknown as string;
			expect(() =>
				fixture.publish({
					locked: true,
					items: [
						{ ...items[0]!, name: 'Must not publish' },
						failureKind === 'duplicate'
							? { ...items[1]!, id: 'a' }
							: { ...items[1]!, name: badName },
					],
				}),
			).toThrow(failureKind === 'duplicate' ? /duplicate keys/ : failure);
			expect(host.innerHTML).toBe(before);
			expect([...host.querySelectorAll('input')]).toEqual(inputs);
			expect(inputs[0]!.value).toBe('Preserve this edit');
			for (const release of releases) expect(release).toHaveBeenCalledOnce();
			expect(fixture.cleanup).toHaveBeenCalledOnce();
			handle.refresh();
			handle.dispose();
			fixture.publish({ items, locked: false, onInput: undefined }, false);
			fixture.attach(range, fixture.state).dispose({ preserveDOM: false });
			expect(host.childNodes).toHaveLength(0);
		}
		for (const dev of [false, true]) {
			for (const invalid of [{ unexpected: true }, Symbol('invalid-text'), () => 'invalid']) {
				const scope = createScope({ scopeKey: `invalid-presentation-text-${dev}` });
				const value = scope.signal$<unknown>('value', 'ready');
				const fixture = authoredPresentation<{ value: unknown }>(
					'SignalTextPresentation',
					{ value: 'server' },
					dev,
				);
				const host = document.createElement('section');
				container.append(host);
				host.innerHTML = fixture.html;
				const paragraph = host.querySelector('p')!;
				fixture.publish({ value }, false);
				const handle = fixture.attach(paragraph, fixture.state);
				try {
					const before = paragraph.innerHTML;
					expect(() => value.set(() => invalid)).toThrow(/primitive value/);
					expect(paragraph.innerHTML).toBe(before);
					expect(fixture.cleanup).toHaveBeenCalledOnce();
					expect(scope.inspect().nodes.find((node) => node.key === 'value')?.subscribers).toBe(0);
					expect(value.get()).toBe(invalid);
				} finally {
					handle.dispose();
					scope.dispose();
				}
			}
			const scope = createScope({ scopeKey: `coherent-presentation-${dev}` });
			const label = scope.signal$('label', 'first');
			const fixture = authoredPresentation<{ first: unknown; last: unknown }>(
				'AdjacentPresentation',
				{ first: 'server', last: 'tail' },
				dev,
			);
			const host = document.createElement('section');
			container.append(host);
			host.innerHTML = fixture.html;
			const paragraph = host.querySelector('p')!;
			fixture.publish({ first: label }, false);
			const handle = fixture.attach(paragraph, fixture.state);
			try {
				fixture.publish({
					last: {
						toString() {
							label.set('settled during preparation');
							return 'tail';
						},
					},
				});
				expect(paragraph.textContent).toBe('Before settled during preparationtail after');
				const failure = new Error('connected text read failed');
				const failing = scope.derived$('failing', () => {
					if (label.get() === 'fail') throw failure;
					return 'healthy';
				});
				fixture.publish({ first: failing, last: 'tail' });
				const before = paragraph.innerHTML;
				expect(() =>
					fixture.publish({
						last: {
							toString() {
								label.set('fail');
								return 'must not publish';
							},
						},
					}),
				).toThrow(failure);
				expect(paragraph.innerHTML).toBe(before);
				expect(fixture.cleanup).toHaveBeenCalledOnce();
			} finally {
				handle.dispose();
				scope.dispose();
			}
			const abortScope = createScope({ scopeKey: `aborted-subscription-${dev}` });
			const abortValue = abortScope.signal$('value', 'must not write');
			const aborted = authoredPresentation<{ value: unknown }>(
				'SignalTextPresentation',
				{ value: 'server' },
				dev,
			);
			const abortHost = document.createElement('section');
			container.append(abortHost);
			abortHost.innerHTML = aborted.html;
			aborted.publish({ value: abortValue }, false);
			const abort = new AbortController();
			const subscribe = abortValue[SIGNAL_BINDING_SUBSCRIBE].bind(abortValue);
			const stopped = vi.fn();
			const subscription = vi
				.spyOn(abortValue, SIGNAL_BINDING_SUBSCRIBE)
				.mockImplementation((notify) => {
					const stop = subscribe(notify);
					abort.abort();
					return () => {
						stopped();
						stop();
					};
				});
			try {
				const before = abortHost.innerHTML;
				aborted
					.attach(abortHost.querySelector('p')!, aborted.state, { signal: abort.signal })
					.dispose();
				expect(abortHost.innerHTML).toBe(before);
				expect(stopped).toHaveBeenCalledOnce();
				expect(aborted.cleanup).toHaveBeenCalledOnce();
				expect(abortScope.inspect().nodes.find((node) => node.key === 'value')?.subscribers).toBe(
					0,
				);
			} finally {
				subscription.mockRestore();
				abortScope.dispose();
			}
			const failureScope = createScope({ scopeKey: `pending-presentation-${dev}` });
			const loadPending = query(
				'pending-presentation',
				(_argument: undefined) => new Promise<string>(() => {}),
			);
			const pendingValue = createResource(failureScope, 'pending', () => loadPending(undefined));
			const pending = authoredPresentation<{ value: unknown }>(
				'SignalTextPresentation',
				{ value: 'server' },
				dev,
			);
			const pendingHost = document.createElement('section');
			container.append(pendingHost);
			pendingHost.innerHTML = pending.html;
			pending.publish({ value: pendingValue }, false);
			try {
				const before = pendingHost.innerHTML;
				expect(
					failureScope.isPending(() =>
						pending.attach(pendingHost.querySelector('p')!, pending.state),
					),
				).toBe(true);
				expect(pendingHost.innerHTML).toBe(before);
				expect(pending.cleanup).toHaveBeenCalledOnce();
				expect(
					failureScope.inspect().nodes.find((node) => node.key === 'pending')?.subscribers,
				).toBe(0);
			} finally {
				failureScope.dispose();
			}
			const cleanupScope = createScope({ scopeKey: `throwing-signal-cleanup-${dev}` });
			const first = cleanupScope.signal$('first', 'first');
			const second = cleanupScope.signal$('second', 'second');
			const cleanupFailure = new Error('signal cleanup failed');
			const firstSubscribe = first[SIGNAL_BINDING_SUBSCRIBE].bind(first);
			const throwingSubscription = vi
				.spyOn(first, SIGNAL_BINDING_SUBSCRIBE)
				.mockImplementation((notify) => {
					const stop = firstSubscribe(notify);
					return () => {
						stop();
						throw cleanupFailure;
					};
				});
			const cleanupFixture = authoredPresentation<{ first: unknown; last: unknown }>(
				'AdjacentPresentation',
				{ first: 'server', last: 'server' },
				dev,
			);
			const cleanupHost = document.createElement('section');
			container.append(cleanupHost);
			cleanupHost.innerHTML = cleanupFixture.html;
			cleanupFixture.publish({ first, last: second }, false);
			const cleanupHandle = cleanupFixture.attach(
				cleanupHost.querySelector('p')!,
				cleanupFixture.state,
			);
			try {
				expect(() => cleanupHandle.dispose()).toThrow(cleanupFailure);
				expect(cleanupFixture.cleanup).toHaveBeenCalledOnce();
				expect(cleanupScope.inspect().nodes.map((node) => node.subscribers)).toEqual([0, 0]);
			} finally {
				cleanupHandle.dispose();
				throwingSubscription.mockRestore();
				cleanupScope.dispose();
			}
		}
	});

	it('finalizes a rejected external range when an affected behavior cleanup throws', async () => {
		container.innerHTML =
			'<section id="healthy"><button id="shared-action" data-action>Healthy action</button>' +
			'<button id="independent-action" data-independent>Independent</button></section>' +
			'<section id="failed"><button id="pending-action" data-action>Pending action</button></section>';
		const healthyElement = container.querySelector('#healthy')!;
		const failedElement = container.querySelector('#failed')!;
		const healthyAction = container.querySelector('#shared-action')!;
		const independentAction = container.querySelector('#independent-action')!;
		const owner = { name: 'partially-failed-stream' };
		const ready = deferred<void>();
		const failure = new Error('external stream failed');
		const throwingCleanup = vi.fn(() => {
			throw new Error('an adopted cleanup also failed');
		});
		const followingCleanup = vi.fn();
		const independentCleanup = vi.fn();
		const root = attach();
		const healthyRange = root.registerExternalRange(healthyElement, { owner });
		const failedRange = root.registerExternalRange(failedElement, {
			owner,
			ready: ready.promise,
		});
		const firstBehavior = root.registerBehavior({
			id: 'throws-while-cleaning',
			owner,
			target: '[data-action]',
			adopt: () => throwingCleanup,
		});
		const followingBehavior = root.registerBehavior({
			id: 'still-cleans',
			owner,
			target: '[data-action]',
			adopt: () => followingCleanup,
		});
		const independentBehavior = root.registerBehavior({
			id: 'independent',
			owner,
			target: '[data-independent]',
			adopt: () => independentCleanup,
		});
		await independentBehavior.ready;
		const failedRangeOutcome = expect(failedRange.ready).rejects.toBe(failure);
		const firstBehaviorOutcome = expect(firstBehavior.ready).rejects.toBe(failure);
		const followingBehaviorOutcome = expect(followingBehavior.ready).rejects.toBe(failure);
		const rootOutcome = expect(root.ready).rejects.toBe(failure);

		ready.reject(failure);
		await Promise.all([
			failedRangeOutcome,
			firstBehaviorOutcome,
			followingBehaviorOutcome,
			rootOutcome,
		]);

		expect(throwingCleanup).toHaveBeenCalledOnce();
		expect(followingCleanup).toHaveBeenCalledOnce();
		expect(independentCleanup).not.toHaveBeenCalled();
		expect(failedRange.signal.aborted).toBe(true);
		expect(firstBehavior.signal.aborted).toBe(true);
		expect(followingBehavior.signal.aborted).toBe(true);
		expect(healthyRange.signal.aborted).toBe(false);
		expect(independentBehavior.signal.aborted).toBe(false);
		expect(healthyElement.querySelector('#shared-action')).toBe(healthyAction);
		expect(healthyElement.querySelector('#independent-action')).toBe(independentAction);
		expect(container.querySelector('#failed')).toBe(failedElement);

		const recovered = root.registerExternalRange(failedElement, {
			owner: { name: 'recovered-owner' },
		});
		await recovered.ready;
		expect(recovered.signal.aborted).toBe(false);
		const cleanupFailure = new Error('A row ref cleanup failed');
		const rowCleanups = [
			vi.fn(() => {
				throw cleanupFailure;
			}),
			vi.fn(),
		];
		let attachedRows = 0;
		const onRemove = vi.fn();
		const fixture = authoredPresentation<AttachmentPresentationProps>('AttachmentPresentation', {
			items: [
				{ id: 'a', name: 'First', preview: null, state: 'ready', error: '' },
				{ id: 'b', name: 'Second', preview: null, state: 'ready', error: '' },
			],
			locked: false,
			onRemove,
			onRetry() {},
			onInput: () => rowCleanups[attachedRows++],
		});
		const host = document.createElement('section');
		container.append(host);
		host.innerHTML = fixture.html;
		const range = { start: host.firstChild as Comment, end: host.lastChild as Comment };
		const rows = [...host.querySelectorAll('figure')];
		const handle = fixture.attach(range, fixture.state);
		expect(() => handle.dispose()).toThrow(cleanupFailure);
		for (const release of rowCleanups) expect(release).toHaveBeenCalledOnce();
		expect(fixture.cleanup).toHaveBeenCalledOnce();
		expect([...host.querySelectorAll('figure')]).toEqual(rows);
		rows[0]!.querySelector('button')!.click();
		expect(onRemove).not.toHaveBeenCalled();
		handle.dispose();
		fixture.publish({ onInput: undefined }, false);
		fixture.attach(range, fixture.state).dispose({ preserveDOM: false });
	});

	it('rejects an owner-constrained behavior when its range fails before its own module loads', async () => {
		container.innerHTML = '<section><button data-action>Unavailable</button></section>';
		const range = container.firstElementChild!;
		const owner = { name: 'failed-before-load' };
		const streamReady = deferred<void>();
		const moduleReady = deferred<void>();
		const failure = new Error('stream failed while the behavior module was pending');
		const adopted = vi.fn();
		const root = attach();
		const ownership = root.registerExternalRange(range, { owner, ready: streamReady.promise });
		const behavior = root.registerBehavior({
			owner,
			target: '[data-action]',
			ready: moduleReady.promise,
			adopt: adopted,
		});
		const ownershipFailure = expect(ownership.ready).rejects.toBe(failure);
		const behaviorFailure = expect(behavior.ready).rejects.toBe(failure);
		const rootFailure = expect(root.ready).rejects.toBe(failure);

		streamReady.reject(failure);
		await Promise.all([ownershipFailure, rootFailure]);
		moduleReady.resolve(undefined);
		await behaviorFailure;

		expect(adopted).not.toHaveBeenCalled();
		expect(behavior.signal.aborted).toBe(true);
		expect(container.firstElementChild).toBe(range);
	});

	it('keeps a same-owner behavior in a disjoint root alive when another external range fails', async () => {
		container.innerHTML =
			'<section><button id="failed-action" data-action>Failed</button></section>';
		const independentContainer = document.createElement('main');
		independentContainer.innerHTML =
			'<section><button id="healthy-action" data-action>Healthy</button></section>';
		document.body.appendChild(independentContainer);
		try {
			const owner = { name: 'shared-external-owner' };
			const failedReady = deferred<void>();
			const healthyModule = deferred<void>();
			const failure = new Error('only the first independently owned range failed');
			const adopted = vi.fn();
			const failedRoot = attach();
			const healthyRoot = attach(independentContainer);
			const failedRange = failedRoot.registerExternalRange(container.firstElementChild!, {
				owner,
				ready: failedReady.promise,
			});
			healthyRoot.registerExternalRange(independentContainer.firstElementChild!, { owner });
			const healthyBehavior = healthyRoot.registerBehavior({
				owner,
				target: '#healthy-action',
				ready: healthyModule.promise,
				adopt: adopted,
			});
			const rangeFailure = expect(failedRange.ready).rejects.toBe(failure);
			const rootFailure = expect(failedRoot.ready).rejects.toBe(failure);

			failedReady.reject(failure);
			await Promise.all([rangeFailure, rootFailure]);

			expect(healthyRoot.signal.aborted).toBe(false);
			expect(healthyBehavior.signal.aborted).toBe(false);
			healthyModule.resolve(undefined);
			await Promise.all([healthyBehavior.ready, healthyRoot.ready]);
			expect(adopted.mock.calls[0][0]).toBe(independentContainer.querySelector('#healthy-action'));
		} finally {
			independentContainer.remove();
		}
	});

	it('propagates a rejected behavior readiness without running stale adoption', async () => {
		container.innerHTML = '<button data-action>Unavailable</button>';
		const moduleReady = deferred<void>();
		const failure = new Error('behavior module failed to load');
		const adopted = vi.fn();
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			ready: moduleReady.promise,
			adopt: adopted,
		});
		const behaviorFailure = expect(behavior.ready).rejects.toBe(failure);
		const rootFailure = expect(root.ready).rejects.toBe(failure);

		moduleReady.reject(failure);
		await Promise.all([behaviorFailure, rootFailure]);

		expect(adopted).not.toHaveBeenCalled();
		expect(container.querySelector('[data-action]')).not.toBeNull();

		const captureFailure = new Error('cannot capture this command');
		const nativeErrors: unknown[] = [];
		const report = (event: ErrorEvent) => {
			if (event.error === captureFailure) {
				nativeErrors.push(event.error);
				event.preventDefault();
			}
		};
		const handled = vi.fn();
		const button = container.querySelector('button')!;
		const pending = deferred<void>();
		const captured = root.registerBehavior({
			target: button,
			events: ['click'],
			ready: pending.promise,
			captureEvent(_event, element) {
				if (element.textContent === 'Fail') throw captureFailure;
				return element.textContent;
			},
			adopt: adopted,
			handleEvent: handled,
		});
		const rejected = expect(captured.ready).rejects.toBe(captureFailure);
		window.addEventListener('error', report);
		try {
			button.click();
			button.textContent = 'Fail';
			button.click();
			await rejected;
			await root.ready;
			expect(nativeErrors).toEqual([captureFailure]);
			expect(captured.signal.aborted).toBe(true);
			pending.resolve(undefined);
			await Promise.resolve();
			button.click();
			expect(adopted).not.toHaveBeenCalled();
			expect(handled).not.toHaveBeenCalled();
		} finally {
			window.removeEventListener('error', report);
		}
	});

	it('aborts adopted behavior and keeps preserved DOM when its source signal is canceled', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const button = container.firstElementChild!;
		const lifetime = new AbortController();
		const cleanup = vi.fn();
		const root = attach(container, { signal: lifetime.signal });
		const behavior = root.registerBehavior({ target: '[data-action]', adopt: () => cleanup });
		await behavior.ready;

		lifetime.abort();
		lifetime.abort();

		expect(root.signal.aborted).toBe(true);
		expect(behavior.signal.aborted).toBe(true);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.firstElementChild).toBe(button);
		const items: AttachmentPresentationProps['items'] = [
			{ id: 'a', name: 'First', preview: null, state: 'ready', error: '' },
			{ id: 'b', name: 'Second', preview: null, state: 'ready', error: '' },
		];
		const canceledProjection = new AbortController();
		const rowCleanup = vi.fn();
		const fixture = authoredPresentation<AttachmentPresentationProps>('AttachmentPresentation', {
			items,
			locked: false,
			onRemove() {},
			onRetry() {},
			onInput: () => rowCleanup,
		});
		const host = document.createElement('section');
		container.append(host);
		host.innerHTML = fixture.html;
		const range = { start: host.firstChild as Comment, end: host.lastChild as Comment };
		const handle = fixture.attach(range, fixture.state, { signal: canceledProjection.signal });
		const before = host.innerHTML;
		const abortingText = {
			toString() {
				canceledProjection.abort();
				return 'Canceled';
			},
		} as unknown as string;
		expect(() =>
			fixture.publish({
				items: [
					{ ...items[0]!, name: 'Must not publish' },
					{ ...items[1]!, name: abortingText },
				],
			}),
		).not.toThrow();
		expect(host.innerHTML).toBe(before);
		expect(rowCleanup).toHaveBeenCalledTimes(2);
		expect(fixture.cleanup).toHaveBeenCalledOnce();
		handle.refresh();
		handle.dispose();
		expect(host.innerHTML).toBe(before);
		fixture.publish({ items, onInput: undefined }, false);
		fixture.attach(range, fixture.state).dispose({ preserveDOM: false });
	});

	it('returns a settled disposed root for a pre-aborted signal without retaining container ownership', async () => {
		container.innerHTML = '<button data-action>Preserved</button>';
		const button = container.firstElementChild!;
		const canceled = new AbortController();
		canceled.abort();
		const disposed = attach(container, { signal: canceled.signal });
		let settled = false;
		void disposed.ready.then(
			() => (settled = true),
			() => (settled = true),
		);

		await vi.waitFor(() => expect(settled).toBe(true));
		expect(disposed.signal.aborted).toBe(true);
		expect(container.firstElementChild).toBe(button);

		const replacement = attach();
		expect(replacement.signal.aborted).toBe(false);
		expect(container.firstElementChild).toBe(button);
		const fixture = authoredBindings();
		container.innerHTML = fixture.html;
		const action = container.querySelector('button')!;
		fixture.publish({ label: 'Not activated' });
		const subscribe = vi.spyOn(fixture.state, 'subscribe');
		const canceledBinding = fixture.attach(action, fixture.state, { signal: canceled.signal });
		canceledBinding.refresh();
		canceledBinding.dispose();
		expect(action.getAttribute('aria-label')).toBe('Send');
		expect(subscribe).not.toHaveBeenCalled();
		const lifetime = new AbortController();
		const binding = fixture.attach(action, fixture.state, { signal: lifetime.signal });
		lifetime.abort();
		fixture.publish({ label: 'Aborted' });
		binding.refresh();
		expect(action.getAttribute('aria-label')).toBe('Not activated');
		expect(fixture.cleanup).toHaveBeenCalledOnce();
		fixture.attach(action, fixture.state).dispose();
		const duringSubscribe = new AbortController();
		const subscribeCleanup = vi.fn();
		const readSnapshot = vi.fn(() => fixture.state.getSnapshot());
		fixture
			.attach(
				action,
				{
					getSnapshot: readSnapshot,
					subscribe() {
						duringSubscribe.abort();
						return subscribeCleanup;
					},
				},
				{ signal: duringSubscribe.signal },
			)
			.dispose();
		expect(subscribeCleanup).toHaveBeenCalledOnce();
		expect(readSnapshot).not.toHaveBeenCalled();
		fixture.attach(action, fixture.state).dispose();
		const mountedRefs = vi.fn(() => vi.fn());
		const acceptedItem = {
			id: 'accepted',
			name: 'Accepted snapshot',
			preview: null,
			state: 'ready' as const,
			error: '',
		};
		const fresh = authoredPresentation<AttachmentPresentationProps>('AttachmentPresentation', {
			items: [],
			locked: false,
			onInput: mountedRefs,
			onRemove() {},
			onRetry() {},
		});
		const staleName = {
			toString() {
				fresh.publish({ items: [acceptedItem] });
				return 'Discarded snapshot';
			},
		} as unknown as string;
		fresh.publish({ items: [{ ...acceptedItem, id: 'stale', name: staleName }] }, false);
		const mountHost = document.createElement('section');
		container.append(mountHost);
		const mounted = fresh.mount({ parent: mountHost }, fresh.state);
		expect(mountHost.querySelector('figure')!.getAttribute('data-file')).toBe('accepted');
		const mountedInput = mountHost.querySelector('input')!;
		expect(mountedInput.value).toBe('Accepted snapshot');
		expect(mountedInput.defaultValue).toBe('Accepted snapshot');
		expect(mountHost.textContent).not.toContain('Discarded snapshot');
		expect(mountedRefs).toHaveBeenCalledOnce();
		mountedInput.value = 'User edit';
		fresh.publish({ items: [{ ...acceptedItem, name: 'Later snapshot' }] });
		expect(mountHost.querySelector('input')).toBe(mountedInput);
		expect(mountedInput.value).toBe('User edit');
		expect(mountedInput.defaultValue).toBe('Accepted snapshot');
		expect(mountHost.querySelector('figcaption')!.textContent).toBe('Later snapshot');
		expect(mountedRefs).toHaveBeenCalledOnce();
		mounted.dispose({ preserveDOM: false });
		expect(mountedRefs.mock.results[0]!.value).toHaveBeenCalledOnce();
		expect(fresh.cleanup).toHaveBeenCalledOnce();
		expect(mountHost.childNodes).toHaveLength(0);

		// Older mount entries supply the full capability as an override rather
		// than selected descriptor fields. Keep their native initialization live.
		const legacy = authoredPresentation<AttachmentPresentationProps>(
			'AttachmentPresentation',
			{ items: [acceptedItem], locked: false, onRemove() {}, onRetry() {} },
			false,
			presentationSource,
			{
				'octane/dom-binding-program': {
					...DomBindingPrograms,
					__mountLeanBindingProgram(
						target: DomBindingPrograms.BindingMountTarget,
						descriptor: DomBindingPrograms.CompiledBindingProgram<AttachmentPresentationProps>,
						source: DomBindings.BindingSource<AttachmentPresentationProps>,
						options?: DomBindings.BindingOptions,
					) {
						return DomBindingPrograms.__mountBindingProgram(
							target,
							{ ...descriptor, initialOperations: undefined, hostOperations: undefined },
							source,
							options,
						);
					},
				},
			},
		);
		const legacyMount = legacy.mount({ parent: mountHost }, legacy.state);
		const legacyInput = mountHost.querySelector('input')!;
		expect(legacyInput.value).toBe('Accepted snapshot');
		expect(legacyInput.defaultValue).toBe('Accepted snapshot');
		legacyInput.value = 'Legacy user edit';
		legacy.publish({ items: [{ ...acceptedItem, name: 'Later legacy snapshot' }] });
		expect(mountHost.querySelector('input')).toBe(legacyInput);
		expect(legacyInput.value).toBe('Legacy user edit');
		expect(legacyInput.defaultValue).toBe('Accepted snapshot');
		expect(mountHost.querySelector('figcaption')!.textContent).toBe('Later legacy snapshot');
		legacyMount.dispose({ preserveDOM: false });
		expect(legacy.cleanup).toHaveBeenCalledOnce();
		expect(mountHost.childNodes).toHaveLength(0);
	});

	it('does not evict a healthy root when its explicitly requested replacement is already canceled', async () => {
		container.innerHTML = '<button data-action>Still active</button>';
		const cleanup = vi.fn();
		const current = attach();
		const activeBehavior = current.registerBehavior({
			target: '[data-action]',
			adopt: () => cleanup,
		});
		await activeBehavior.ready;
		const canceled = new AbortController();
		canceled.abort();

		const abandoned = attach(container, { replace: true, signal: canceled.signal });
		await abandoned.ready;

		expect(abandoned.signal.aborted).toBe(true);
		expect(current.signal.aborted).toBe(false);
		expect(activeBehavior.signal.aborted).toBe(false);
		expect(cleanup).not.toHaveBeenCalled();
		expect(container.querySelector('[data-action]')).not.toBeNull();
	});

	it('returns a settled canceled range for a pre-aborted owner without retaining its claim', async () => {
		container.innerHTML = '<section><button data-action>Preserved</button></section>';
		const range = container.firstElementChild!;
		const owner = { name: 'pre-aborted-owner' };
		const canceled = new AbortController();
		canceled.abort();
		const neverReady = new Promise<void>(() => {});
		const root = attach();
		const inactive = root.registerExternalRange(range, {
			owner,
			signal: canceled.signal,
			ready: neverReady,
		});
		let settled = false;
		void inactive.ready.then(
			() => (settled = true),
			() => (settled = true),
		);

		await vi.waitFor(() => expect(settled).toBe(true));
		expect(inactive.signal.aborted).toBe(true);
		expect(root.signal.aborted).toBe(false);

		const active = root.registerExternalRange(range, { owner });
		await active.ready;
		expect(active.signal.aborted).toBe(false);
		expect(container.firstElementChild).toBe(range);
	});

	it('does not evict a healthy external owner when its replacement is already canceled', async () => {
		container.innerHTML = '<section><button data-action>Still owned</button></section>';
		const rangeElement = container.firstElementChild!;
		const currentOwner = { name: 'active-owner' };
		const abandonedOwner = { name: 'abandoned-owner' };
		const cleanup = vi.fn();
		const root = attach();
		const current = root.registerExternalRange(rangeElement, { owner: currentOwner });
		const activeBehavior = root.registerBehavior({
			owner: currentOwner,
			target: '[data-action]',
			adopt: () => cleanup,
		});
		await activeBehavior.ready;
		const canceled = new AbortController();
		canceled.abort();

		const abandoned = root.registerExternalRange(rangeElement, {
			owner: abandonedOwner,
			replace: true,
			signal: canceled.signal,
		});
		await abandoned.ready;

		expect(abandoned.signal.aborted).toBe(true);
		expect(current.signal.aborted).toBe(false);
		expect(activeBehavior.signal.aborted).toBe(false);
		expect(cleanup).not.toHaveBeenCalled();
		expect(container.firstElementChild).toBe(rangeElement);
	});

	it('returns a settled canceled behavior for a pre-aborted entry without adopting or retaining its ID', async () => {
		container.innerHTML = '<button data-action>Preserved</button>';
		const canceled = new AbortController();
		canceled.abort();
		const neverReady = new Promise<void>(() => {});
		const staleAdoption = vi.fn();
		const currentAdoption = vi.fn();
		const root = attach();
		const inactive = root.registerBehavior({
			id: 'replaceable',
			target: '[data-action]',
			signal: canceled.signal,
			ready: neverReady,
			adopt: staleAdoption,
		});
		let settled = false;
		void inactive.ready.then(
			() => (settled = true),
			() => (settled = true),
		);

		await vi.waitFor(() => expect(settled).toBe(true));
		expect(inactive.signal.aborted).toBe(true);
		expect(staleAdoption).not.toHaveBeenCalled();
		expect(root.signal.aborted).toBe(false);

		const active = root.registerBehavior({
			id: 'replaceable',
			target: '[data-action]',
			adopt: currentAdoption,
		});
		await active.ready;
		expect(currentAdoption).toHaveBeenCalledOnce();
	});

	it('settles all canceled readiness promises even when external readiness never resolves', async () => {
		container.innerHTML = '<section><button data-action>Waiting</button></section>';
		const range = container.firstElementChild!;
		const owner = { name: 'pending-owner' };
		const neverReady = new Promise<void>(() => {});
		const root = attach();
		const ownership = root.registerExternalRange(range, { owner, ready: neverReady });
		const behavior = root.registerBehavior({
			owner,
			target: '[data-action]',
			ready: neverReady,
			adopt() {},
		});
		const settled = { root: false, ownership: false, behavior: false };
		void root.ready.then(
			() => (settled.root = true),
			() => (settled.root = true),
		);
		void ownership.ready.then(
			() => (settled.ownership = true),
			() => (settled.ownership = true),
		);
		void behavior.ready.then(
			() => (settled.behavior = true),
			() => (settled.behavior = true),
		);

		root.dispose();

		await vi.waitFor(() =>
			expect(settled).toEqual({ root: true, ownership: true, behavior: true }),
		);
		expect(range.isConnected).toBe(true);
	});

	it('cancels a behavior registration without disposing its root or removing its target', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const button = container.firstElementChild!;
		const lifetime = new AbortController();
		const cleanup = vi.fn();
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			signal: lifetime.signal,
			adopt: () => cleanup,
		});
		await behavior.ready;

		lifetime.abort();

		expect(behavior.signal.aborted).toBe(true);
		expect(root.signal.aborted).toBe(false);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.firstElementChild).toBe(button);
	});

	it('cancels external ownership without disposing independently owned root behavior', async () => {
		container.innerHTML = '<section><button data-action>Owned</button></section>';
		const range = container.firstElementChild!;
		const owner = { name: 'stream' };
		const lifetime = new AbortController();
		const cleanup = vi.fn();
		const root = attach();
		const ownership = root.registerExternalRange(range, { owner, signal: lifetime.signal });
		const behavior = root.registerBehavior({
			owner,
			target: '[data-action]',
			adopt: () => cleanup,
		});
		await behavior.ready;

		lifetime.abort();

		expect(ownership.signal.aborted).toBe(true);
		expect(root.signal.aborted).toBe(false);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.firstElementChild).toBe(range);
	});

	it('runs an asynchronously returned cleanup once when adoption settles after disposal', async () => {
		container.innerHTML = '<button data-action>Pending</button>';
		const pendingAdoption = deferred<() => void>();
		const cleanup = vi.fn();
		const adopt = vi.fn(() => pendingAdoption.promise);
		const root = attach();
		const behavior = root.registerBehavior({ target: '[data-action]', adopt });
		await vi.waitFor(() => expect(adopt).toHaveBeenCalledOnce());
		const readiness = behavior.ready.catch(() => {});

		root.dispose();
		pendingAdoption.resolve(cleanup);
		await readiness;
		await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());

		behavior.dispose();
		root.dispose();
		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.querySelector('[data-action]')).not.toBeNull();
		const fixture = authoredBindings();
		container.innerHTML = fixture.html;
		const action = container.querySelector('button')!;
		let raced = false;
		fixture.publish({
			label: {
				toString() {
					if (!raced) {
						raced = true;
						fixture.publish({ label: 'Newest', disabled: false });
					}
					return 'Obsolete';
				},
			},
			disabled: true,
		});
		const binding = fixture.attach(action, fixture.state);
		expect(raced).toBe(true);
		expect(action.getAttribute('aria-label')).toBe('Newest');
		expect(action.disabled).toBe(false);
		binding.dispose();
		const lifetime = new AbortController();
		fixture.publish({
			label: {
				toString() {
					lifetime.abort();
					return 'Canceled';
				},
			},
		});
		const retained = action.outerHTML;
		fixture.attach(action, fixture.state, { signal: lifetime.signal }).dispose();
		expect(action.outerHTML).toBe(retained);
		expect(fixture.cleanup).toHaveBeenCalledTimes(2);
	});

	it('does not let a removed pending adoption delay behavior readiness', async () => {
		container.innerHTML =
			'<button data-action="removed">Removed</button><button data-action="live">Live</button>';
		const removed = container.querySelector<HTMLButtonElement>('[data-action="removed"]')!;
		const live = container.querySelector<HTMLButtonElement>('[data-action="live"]')!;
		const removedReady = deferred<() => void>();
		const liveReady = deferred<void>();
		const removedCleanup = vi.fn();
		let removedSignal: AbortSignal | undefined;
		const adopt = vi.fn((element: Element, context: { signal: AbortSignal }) => {
			if (element === removed) {
				removedSignal = context.signal;
				return removedReady.promise;
			}
			if (element === live) return liveReady.promise;
			throw new Error('Unexpected behavior target');
		});
		const root = attach();
		const behavior = root.registerBehavior({ target: '[data-action]', adopt });
		await vi.waitFor(() => expect(adopt).toHaveBeenCalledTimes(2));

		removed.remove();
		await vi.waitFor(() => expect(removedSignal?.aborted).toBe(true));
		liveReady.resolve(undefined);
		await behavior.ready;

		removedReady.resolve(removedCleanup);
		await vi.waitFor(() => expect(removedCleanup).toHaveBeenCalledOnce());
		expect(container.firstElementChild).toBe(live);
	});

	it('does not adopt a stale asynchronously loaded behavior after its root is disposed', async () => {
		container.innerHTML = '<button data-action>Pending</button>';
		const moduleReady = deferred<void>();
		const adopted = vi.fn();
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			ready: moduleReady.promise,
			adopt: adopted,
		});

		root.dispose();
		moduleReady.resolve(undefined);
		await behavior.ready.catch(() => {});
		await Promise.resolve();

		expect(adopted).not.toHaveBeenCalled();
		expect(behavior.signal.aborted).toBe(true);
	});

	it('runs cleanup once when disposal reenters the root lifecycle', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const root = attach();
		const cleanup = vi.fn(() => root.dispose());
		const behavior = root.registerBehavior({ target: '[data-action]', adopt: () => cleanup });
		await behavior.ready;

		root.dispose();
		behavior.dispose();

		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.querySelector('[data-action]')).not.toBeNull();
	});

	for (const dev of [false, true]) {
		it(`preserves native adapters when hydration enters child views (${dev ? 'dev' : 'prod'})`, () => {
			for (const showLabel of [true, false]) {
				const onAction = vi.fn();
				const onReady = vi.fn();
				const entered = authoredPresentation(
					'EnteredTree',
					{ showLabel, label: 'Server', onAction, onReady },
					dev,
					`function GenericLabel(props) @{ <span>{props.label}</span> }
export function EnteredTree(props) @{ 'use dom bindings';
 <button type="button" title={props.label} onClick={props.onAction} ref={props.onReady}>
  @if (props.showLabel) { <GenericLabel label={props.label} /> }
  @else { <b>Icon</b> }
 </button>
}`,
				);
				const host = document.createElement('div');
				container.append(host);
				host.innerHTML = entered.html;
				const button = host.querySelector('button')!;
				const child = button.firstElementChild;
				const binding = entered.attach(button, entered.state);
				let hydrated: ReturnType<typeof hydrateRoot> | undefined;
				try {
					entered.publish({ label: 'Early' });
					const takeOver = () =>
						hydrateRoot(
							host,
							entered.loadClient().EnteredTree as never,
							entered.state.getSnapshot(),
							{ bindingLeases: [binding] },
						);
					if (showLabel) {
						expect(takeOver).toThrow(/supported child view/);
						expect(entered.cleanup).not.toHaveBeenCalled();
					} else {
						hydrated = takeOver();
						flushSync(() => {});
						flushEffects();
						expect(entered.cleanup).toHaveBeenCalledOnce();
						entered.publish({ label: 'Retired', showLabel: true });
						binding.refresh();
					}
					expect(host.querySelector('button')).toBe(button);
					expect(button.firstElementChild).toBe(child);
					expect(button.title).toBe('Early');
					expect(button.textContent).toBe(showLabel ? 'Early' : 'Icon');
					expect(onReady.mock.calls).toEqual(showLabel ? [[button]] : [[button], [null], [button]]);
					button.click();
					expect(onAction).toHaveBeenCalledOnce();
				} finally {
					hydrated?.unmount();
					binding.dispose();
				}
				expect(onReady.mock.calls).toEqual(
					showLabel ? [[button], [null]] : [[button], [null], [button], [null]],
				);
				button.click();
				expect(onAction).toHaveBeenCalledOnce();
				expect(entered.cleanup).toHaveBeenCalledOnce();
			}
		});

		it(`preserves nested child adapters and range boundaries (${dev ? 'dev' : 'prod'})`, () => {
			const nestedSource = `function GenericLabel(props) @{
 @if (props.showLabel) { <span>{props.label}</span> }
 @else { <>{props.children}</> }
}
function FixedIcon() @{ <b>Icon</b> }
function Contents(props) @{
 <><FixedIcon /><GenericLabel label={props.label} showLabel={props.showLabel}>{props.children}</GenericLabel></>
}
export function NativeRest({ label, showLabel, children, ...rest }) @{ 'use dom bindings';
 <button type="button" title={label} {...rest}><Contents label={label} showLabel={showLabel}>{children}</Contents></button>
}`;
			const nestedQuery = `?octane-bindings=NativeRest&octane-mount=1&octane-props=${encodeURIComponent(JSON.stringify([1, ['label', 'showLabel', 'onClick', 'ref']]))}`;
			const nestedOptions = { compileOptions: { dev, hmr: false } };
			const nestedServer = loadCompiledFixtureSource(nestedSource, {
				...nestedOptions,
				id: '/src/nested-rest.tsrx',
				mode: 'server',
			});
			const nestedArtifact = loadCompiledFixtureSource(nestedSource, {
				...nestedOptions,
				id: '/src/nested-rest.tsrx' + nestedQuery,
				mode: 'client',
				runtimeModules: {
					'octane/dom-binding-program': DomBindingPrograms,
					'octane/dom-binding-signals': DomBindingSignals,
				},
			});
			for (const nativeRoot of [true, false]) {
				const nestedParent = `import { NativeRest } from './nested-rest.tsrx';
export function NestedParent(props) @{ 'use dom bindings';
 ${nativeRoot ? '<section>' : ''}<NativeRest label={props.label} showLabel={props.showLabel} onClick={props.onAction} ref={props.onReady} />${nativeRoot ? '</section>' : ''}
}`;
				const nestedClient = loadCompiledFixtureSource(nestedParent, {
					...nestedOptions,
					id: '/src/dom-presentation.tsrx',
					mode: 'client',
					runtimeModules: {
						'./nested-rest.tsrx': loadCompiledFixtureSource(nestedSource, {
							...nestedOptions,
							id: '/src/nested-rest.tsrx',
							mode: 'client',
						}),
					},
				});
				for (const showLabel of [true, false]) {
					const onAction = vi.fn();
					const onReady = vi.fn();
					const nested = authoredPresentation(
						'NestedParent',
						{
							label: 'Server',
							showLabel,
							onAction,
							onReady,
						},
						dev,
						nestedParent,
						{
							'./nested-rest.tsrx': nestedServer,
							['./nested-rest.tsrx' + nestedQuery]: nestedArtifact,
						},
					);
					const host = document.createElement('div');
					container.append(host);
					host.innerHTML = nested.html;
					const button = host.querySelector('button')!;
					const child = button.firstElementChild;
					const binding = nested.attach(host.firstElementChild!, nested.state);
					let hydrated: ReturnType<typeof hydrateRoot> | undefined;
					try {
						nested.publish({ label: 'Early' });
						const takeOver = () =>
							hydrateRoot(host, nestedClient.NestedParent as never, nested.state.getSnapshot(), {
								bindingLeases: [binding],
							});
						if (showLabel) {
							expect(takeOver).toThrow(/supported child view|primitive text/);
							expect(nested.cleanup).not.toHaveBeenCalled();
						} else {
							hydrated = takeOver();
							flushSync(() => {});
							flushEffects();
							expect(nested.cleanup).toHaveBeenCalledOnce();
						}
						expect(host.querySelector('button')).toBe(button);
						expect(button.firstElementChild).toBe(child);
						expect(button.title).toBe('Early');
						expect(button.textContent).toBe(showLabel ? 'IconEarly' : 'Icon');
						expect(onReady.mock.calls).toEqual(
							showLabel ? [[button]] : [[button], [null], [button]],
						);
						button.click();
						expect(onAction).toHaveBeenCalledOnce();
					} finally {
						hydrated?.unmount();
						binding.dispose();
					}
					expect(nested.cleanup).toHaveBeenCalledOnce();
					expect(onReady.mock.calls).toEqual(
						showLabel ? [[button], [null]] : [[button], [null], [button], [null]],
					);
					button.click();
					expect(onAction).toHaveBeenCalledOnce();
				}
				if (!nativeRoot) {
					for (const mode of [
						'element',
						'range',
						'missing-close',
						'duplicate',
						'sibling-before',
						'sibling-after',
						'mismatched',
					]) {
						const onAction = vi.fn();
						const onReady = vi.fn();
						const nested = authoredPresentation(
							'NestedParent',
							{
								label: 'Server',
								showLabel: false,
								onAction,
								onReady,
							},
							dev,
							nestedParent,
							{
								'./nested-rest.tsrx': nestedServer,
								['./nested-rest.tsrx' + nestedQuery]: nestedArtifact,
							},
						);
						const host = document.createElement('div');
						container.append(host);
						host.innerHTML = nested.html;
						const button = host.querySelector('button')!;
						const child = button.firstElementChild;
						const range = { start: host.firstChild as Comment, end: host.lastChild as Comment };
						if (mode === 'missing-close') range.end.remove();
						else if (mode === 'duplicate') {
							host.prepend(range.start.cloneNode());
							host.append(range.end.cloneNode());
						} else if (mode === 'sibling-before')
							range.start.after(document.createTextNode('outside'));
						else if (mode === 'sibling-after') range.end.before(document.createElement('span'));
						else if (mode === 'mismatched')
							range.start.replaceWith(button.previousSibling!.cloneNode());
						if (mode !== 'element' && mode !== 'range') {
							const before = host.innerHTML;
							expect(() => nested.attach(button, nested.state)).toThrow(
								/mismatched compiler-owned/,
							);
							nested.publish({ label: 'Rejected' });
							button.click();
							expect(onAction).not.toHaveBeenCalled();
							expect(onReady).not.toHaveBeenCalled();
							expect(nested.cleanup).not.toHaveBeenCalled();
							expect(host.innerHTML).toBe(before);
							continue;
						}
						// Neighbors outside the selected view are not part of its ownership.
						const sibling = document.createElement('button');
						sibling.textContent = 'Sibling';
						host.append(sibling);
						const controller = new AbortController();
						const binding = nested.attach(mode === 'range' ? range : button, nested.state, {
							signal: controller.signal,
						});
						nested.publish({ label: 'Early' });
						button.click();
						expect(onAction).toHaveBeenCalledOnce();
						expect(button.title).toBe('Early');
						controller.abort();
						binding.dispose();
						nested.publish({ label: 'After abort' });
						button.click();
						expect(button.title).toBe('Early');
						expect(onAction).toHaveBeenCalledOnce();
						expect(onReady.mock.calls).toEqual([[button], [null]]);
						expect(nested.cleanup).toHaveBeenCalledOnce();
						const again = nested.attach(button, nested.state);
						expect(button.title).toBe('After abort');
						expect(host.querySelector('button')).toBe(button);
						expect(button.firstElementChild).toBe(child);
						button.click();
						expect(onAction).toHaveBeenCalledTimes(2);
						again.dispose();
						again.dispose();
						expect(nested.cleanup).toHaveBeenCalledTimes(2);
						expect(onReady.mock.calls).toEqual([[button], [null], [button], [null]]);
						expect(sibling.textContent).toBe('Sibling');
						expect(sibling.parentNode).toBe(host);
					}
				}
			}
		});

		it(`preserves fixed child primitives and live neighbours through ownership changes (${dev ? 'dev' : 'prod'})`, () => {
			const fixedKeys = ['variant', 'radius', 'label', 'title', 'active', 'onClick', 'ref'];
			const dynamicKeys = ['variant', 'radius', 'label', 'title', 'active', 'onClick', 'ref'];
			const fixed = [
				['variant', 'ghost'],
				['radius', 'full'],
				['label', 'Go'],
			];
			const runtimeModules = {
				'octane/dom-binding-program': DomBindingPrograms,
				'octane/dom-binding-signals': DomBindingSignals,
				'octane/dom-binding-classes': DomBindingClasses,
			};
			const childOptions = { compileOptions: { dev, hmr: false } };
			const fixedQuery =
				'?octane-bindings=FixedChild&octane-mount=1&octane-props=' +
				encodeURIComponent(JSON.stringify([2, fixedKeys, fixed]));
			const dynamicQuery =
				'?octane-bindings=FixedChild&octane-mount=1&octane-props=' +
				encodeURIComponent(JSON.stringify([1, dynamicKeys]));
			const modules = {
				'./fixed-child.tsrx': loadCompiledFixtureSource(fixedButtonSource, {
					...childOptions,
					id: '/src/fixed-child.tsrx',
					mode: 'server',
				}),
				['./fixed-child.tsrx' + fixedQuery]: loadCompiledFixtureSource(fixedButtonSource, {
					...childOptions,
					id: '/src/fixed-child.tsrx' + fixedQuery,
					mode: 'client',
					runtimeModules,
				}),
				['./fixed-child.tsrx' + dynamicQuery]: loadCompiledFixtureSource(fixedButtonSource, {
					...childOptions,
					id: '/src/fixed-child.tsrx' + dynamicQuery,
					mode: 'client',
					runtimeModules,
				}),
			};
			const source = `import { FixedChild } from './fixed-child.tsrx';
export function FixedParent(props) @{ 'use dom bindings';
<section><FixedChild variant="ghost" radius="full" label="Go" title={props.title} active={props.active} onClick={props.onClick} ref={props.ref} /><FixedChild variant={props.variant} radius={props.radius} label={props.label} title={props.title} active={props.active} onClick={props.onClick} ref={props.dynamicRef} /></section> }`;
			for (const mount of [false, true]) {
				const click = vi.fn(),
					ref = vi.fn(),
					dynamicRef = vi.fn();
				const fixture = authoredPresentation(
					'FixedParent',
					{
						title: 'Initial',
						active: false,
						variant: 'primary',
						radius: 'square',
						label: 'Dynamic',
						onClick: click,
						ref,
						dynamicRef,
					},
					dev,
					source,
					modules,
					{ domBindingFixedProps: ['variant', 'radius', 'label'] },
				);
				const host = document.createElement('div');
				container.append(host);
				host.innerHTML = mount ? '' : fixture.html;
				const serverButtons = [...host.querySelectorAll('button')];
				const binding = mount
					? fixture.mount({ parent: host }, fixture.state)
					: fixture.attach(host.firstElementChild!, fixture.state);
				const [button, dynamic] = [...host.querySelectorAll('button')];
				if (!mount) expect([button, dynamic]).toEqual(serverButtons);
				expect([
					button.textContent,
					button.className,
					dynamic.textContent,
					dynamic.className,
				]).toEqual(['Go', 'base ghost rounded', 'Dynamic', 'base primary square']);
				fixture.publish({
					title: 'Changed',
					active: true,
					variant: 'secondary',
					radius: 'full',
					label: 'Next',
				});
				expect([button.title, button.className, dynamic.textContent, dynamic.className]).toEqual([
					'Changed',
					'base ghost rounded active',
					'Next',
					'base secondary rounded active',
				]);
				button.click();
				dynamic.click();
				expect(click).toHaveBeenCalledTimes(2);
				expect(ref).toHaveBeenCalledExactlyOnceWith(button);
				expect(dynamicRef).toHaveBeenCalledExactlyOnceWith(dynamic);
				if (!mount) {
					const renderedChild = loadCompiledFixtureSource(fixedButtonSource, {
						...childOptions,
						id: '/src/fixed-child.tsrx',
						mode: 'client',
					});
					const renderedParent = loadCompiledFixtureSource(source, {
						...childOptions,
						id: '/src/dom-presentation.tsrx',
						mode: 'client',
						runtimeModules: { './fixed-child.tsrx': renderedChild },
					});
					button.focus();
					hydratedRoot = hydrateRoot(
						host,
						renderedParent.FixedParent,
						fixture.state.getSnapshot(),
						{ bindingLeases: [binding] },
					);
					flushSync(() => {});
					flushEffects();
					expect([...host.querySelectorAll('button')]).toEqual([button, dynamic]);
					expect(document.activeElement).toBe(button);
					flushSync(() =>
						hydratedRoot!.render(renderedParent.FixedParent, {
							...fixture.state.getSnapshot(),
							label: 'Hydrated',
							active: false,
						}),
					);
					expect([button.textContent, button.className, dynamic.textContent]).toEqual([
						'Go',
						'base ghost rounded',
						'Hydrated',
					]);
					hydratedRoot.unmount();
					hydratedRoot = undefined;
				}
				binding.dispose();
				fixture.publish({ title: 'Disposed' });
				button.click();
				expect(click).toHaveBeenCalledTimes(2);
				host.remove();
			}
		});

		for (const specialize of [false, true]) {
			for (const mount of [false, true]) {
				it(`preserves shorthand prototype-named data properties (${dev ? 'dev' : 'prod'}, fixed=${specialize}, mount=${mount})`, () => {
					const fixture = authoredPresentation(
						'View',
						{ suffix: '' },
						dev,
						`function Child({ label: __proto__, suffix }) @{
 const bag = { __proto__ };
 <span title={bag.__proto__ + suffix}>{bag.__proto__ as string}</span>
}
export function View(props) @{ 'use dom bindings';
 <section><Child label="Expected" suffix={props.suffix} /></section>
}`,
						{},
						specialize ? { domBindingFixedProps: ['label'] } : {},
					);
					const host = document.createElement('div');
					container.append(host);
					host.innerHTML = fixture.html;
					const serverSpan = host.querySelector('span')!;
					expect([serverSpan.textContent, serverSpan.title]).toEqual(['Expected', 'Expected']);
					if (mount) host.innerHTML = '';
					const handle = mount
						? fixture.mount({ parent: host }, fixture.state)
						: fixture.attach(host.firstElementChild!, fixture.state);
					try {
						const span = host.querySelector('span')!;
						if (!mount) expect(span).toBe(serverSpan);
						expect([span.textContent, span.title]).toEqual(['Expected', 'Expected']);
						fixture.publish({ suffix: ':Changed' });
						expect([span.textContent, span.title]).toEqual(['Expected', 'Expected:Changed']);
					} finally {
						handle.dispose();
					}
					fixture.publish({ suffix: ':Disposed' });
					expect(host.querySelector('span')!.title).toBe('Expected:Changed');
					expect(fixture.cleanup).toHaveBeenCalledOnce();
					host.remove();
				});
			}
		}

		it(`distinguishes prototype-named data properties from authored prototype setters (${dev ? 'dev' : 'prod'})`, () => {
			const source = `function Child({ label: __proto__ }) @{
 const value = __proto__;
 const shorthand = { __proto__ };
 const computed = { ['__proto__']: __proto__ };
 const setter = { __proto__: value };
 const quotedSetter = { '__proto__': value };
 const mixed = { __proto__: null, __proto__ };
 const nested = { bag: { __proto__ } };
 <div>
  <span title={shorthand.__proto__ === null ? 'null' : 'wrong'}>{(shorthand.__proto__ === null ? 'null' : 'wrong') as string}</span>
  <span title={computed.__proto__ === null ? 'null' : 'wrong'}>{(computed.__proto__ === null ? 'null' : 'wrong') as string}</span>
  <span title={setter.__proto__ === undefined ? 'undefined' : 'wrong'}>{(setter.__proto__ === undefined ? 'undefined' : 'wrong') as string}</span>
  <span title={quotedSetter.__proto__ === undefined ? 'undefined' : 'wrong'}>{(quotedSetter.__proto__ === undefined ? 'undefined' : 'wrong') as string}</span>
  <span title={mixed.__proto__ === null ? 'null' : 'wrong'}>{(mixed.__proto__ === null ? 'null' : 'wrong') as string}</span>
  <span title={nested.bag.__proto__ === null ? 'null' : 'wrong'}>{(nested.bag.__proto__ === null ? 'null' : 'wrong') as string}</span>
 </div>
}
export function View(props) @{ 'use dom bindings'; <section><Child label={null} /></section> }`;
			const expected = ['null', 'null', 'undefined', 'undefined', 'null', 'null'];
			for (const specialize of [false, true]) {
				for (const mount of [false, true]) {
					const fixture = authoredPresentation(
						'View',
						{},
						dev,
						source,
						{},
						specialize ? { domBindingFixedProps: ['label'] } : {},
					);
					const host = document.createElement('div');
					container.append(host);
					host.innerHTML = fixture.html;
					const rendered = () =>
						[...host.querySelectorAll('span')].map((span) => [span.textContent, span.title]);
					expect(rendered()).toEqual(expected.map((label) => [label, label]));
					if (mount) host.innerHTML = '';
					const handle = mount
						? fixture.mount({ parent: host }, fixture.state)
						: fixture.attach(host.firstElementChild!, fixture.state);
					try {
						expect(rendered()).toEqual(expected.map((label) => [label, label]));
						handle.refresh();
						expect(rendered()).toEqual(expected.map((label) => [label, label]));
					} finally {
						handle.dispose();
					}
					host.remove();
				}
			}
		});

		it(`retains live prototype values and callback shadows beside fixed literals (${dev ? 'dev' : 'prod'})`, () => {
			const calls = vi.fn();
			let inherited = 'Initial';
			const props = Object.create({
				get inherited() {
					return inherited;
				},
			});
			props.fixed = 'Fixed';
			props.onAction = calls;
			const fixture = authoredPresentation(
				'Shadowed',
				props,
				dev,
				`export function Shadowed({ fixed, inherited, onAction }) @{ 'use dom bindings'; const bag = { fixed }; const ready = (fixed) => onAction(fixed.type); <button title={bag.fixed + ':' + inherited} onClick={ready}>{fixed as string}</button> }`,
				{},
				{},
				['fixed', 'onAction'],
				[['fixed', 'Fixed']],
			);
			const host = document.createElement('div');
			container.append(host);
			host.innerHTML = fixture.html;
			const handle = fixture.attach(host.firstElementChild!, fixture.state);
			const button = host.querySelector('button')!;
			expect(button.title).toBe('Fixed:Initial');
			inherited = 'Changed';
			handle.refresh();
			expect(button.title).toBe('Fixed:Changed');
			button.click();
			expect(calls).toHaveBeenCalledExactlyOnceWith('click');
			handle.dispose();
			host.remove();
		});

		it(`preserves native adapter writes and callback execution order beside fixed props (${dev ? 'dev' : 'prod'})`, () => {
			const calls = vi.fn();
			const fixture = authoredPresentation(
				'WritableAdapters',
				{ variant: 'ghost', count: 1, onAction: calls },
				dev,
				`export function WritableAdapters({ variant, count, onAction }) @{ 'use dom bindings';
 const ordered = function () {
  try { onAction(alias); const alias = variant; }
  catch (error) { onAction(error.name); }
 };
 <div>
  <button onClick={() => { variant = 'changed'; count++; onAction(variant, count); }}>Write</button>
  <button onClick={ordered}>Order</button>
 </div>
}`,
				{},
				{},
				['variant', 'count', 'onAction'],
				[
					['variant', 'ghost'],
					['count', 1],
				],
			);
			const host = document.createElement('div');
			container.append(host);
			host.innerHTML = fixture.html;
			const handle = fixture.attach(host.firstElementChild!, fixture.state);
			const [write, order] = [...host.querySelectorAll('button')];
			write.click();
			order.click();
			expect(calls.mock.calls).toEqual([['changed', 2], ['ReferenceError']]);
			handle.dispose();
			host.remove();
		});

		it(`retains non-finite literal defaults for explicit undefined props (${dev ? 'dev' : 'prod'})`, () => {
			const fixture = authoredPresentation(
				'InfiniteDefault',
				{ value: undefined },
				dev,
				`export function InfiniteDefault({ value = 1e999 }) @{ 'use dom bindings'; <span title={'n:' + value}>{(value > 0 ? 'positive' : 'other') as string}</span> }`,
				{},
				{},
				['value'],
				[['value']],
			);
			const host = document.createElement('div');
			container.append(host);
			host.innerHTML = fixture.html;
			const handle = fixture.attach(host.firstElementChild!, fixture.state);
			expect([host.firstElementChild!.getAttribute('title'), host.textContent]).toEqual([
				'n:Infinity',
				'positive',
			]);
			handle.dispose();
			host.remove();
		});

		it(`reads fixed destructured defaults once and retains uncertain getters (${dev ? 'dev' : 'prod'})`, () => {
			for (const supplied of [undefined, false, null, '']) {
				let reads = 0,
					live = 'Initial';
				const click = vi.fn();
				const props = {
					supplied,
					onClick: click,
					get live() {
						reads++;
						return live;
					},
				};
				const fixed = supplied === undefined ? [['supplied']] : [['supplied', supplied]];
				const fixture = authoredPresentation(
					'Defaults',
					props,
					dev,
					`export function Defaults({ supplied: value = 'Fallback', live, onClick }) @{ 'use dom bindings'; const label = value == null ? 'Null' : value === false ? 'False' : value; <button onClick={onClick} title={live}>{label as string}</button> }`,
					{},
					{},
					['supplied', 'live', 'onClick'],
					fixed,
				);
				const host = document.createElement('div');
				container.append(host);
				host.innerHTML = fixture.html;
				reads = 0;
				const handle = fixture.attach(host.firstElementChild!, fixture.state);
				const button = host.querySelector('button')!;
				expect(reads).toBe(1);
				expect(button.textContent).toBe(
					supplied === undefined
						? 'Fallback'
						: supplied === null
							? 'Null'
							: supplied === false
								? 'False'
								: '',
				);
				live = 'Changed';
				handle.refresh();
				expect(button.title).toBe('Changed');
				expect(reads).toBe(2);
				button.click();
				expect(click).toHaveBeenCalledOnce();
				fixture.publish({ supplied: 'Wrong' }, false);
				expect(() => handle.refresh()).toThrow(/fixed primitive props/);
				expect(button.title).toBe('Changed');
				handle.dispose();
				host.remove();
			}
		});

		it(`preserves closed child rest props across placement and ownership changes (${dev ? 'dev' : 'prod'})`, () => {
			for (const reversed of [false, true]) {
				for (const imported of [false, true]) {
					const childSource = `export function ClosedChild({ children, label, active, title: heading = 'Default', ...rest }) @{
 'use dom bindings';
 <div>prefix{label as string}<button class={['base', { marker: true }, active && 'active']} title={heading} {...rest}>{label as string}{children}</button></div>
}`;
					const firstKeys = [
						'label',
						'active',
						'title',
						'data-first',
						'aria-label',
						'onClick',
						'ref',
					];
					const secondKeys = ['label', 'active', 'data-second', 'onPointerDown', 'ref', 'children'];
					const modules: Record<string, Record<string, unknown>> = {
						'./closed-child.tsrx': loadCompiledFixtureSource(childSource, {
							id: '/src/closed-child.tsrx',
							mode: 'server',
							compileOptions: { dev, hmr: false },
						}),
					};
					expect(
						renderToString(modules['./closed-child.tsrx'].ClosedChild as never, {
							label: 'Generic',
							'data-unseen': 'preserved',
						}).html,
					).toContain('data-unseen="preserved"');
					for (const keys of reversed ? [secondKeys, firstKeys] : [firstKeys, secondKeys]) {
						const query = `?octane-bindings=ClosedChild&octane-mount=1&octane-props=${encodeURIComponent(JSON.stringify([1, keys]))}`;
						modules['./closed-child.tsrx' + query] = loadCompiledFixtureSource(childSource, {
							id: '/src/closed-child.tsrx' + query,
							mode: 'client',
							compileOptions: { dev, hmr: false },
							runtimeModules: {
								'octane/dom-binding-program': DomBindingPrograms,
								'octane/dom-binding-signals': DomBindingSignals,
								'octane/dom-binding-classes': DomBindingClasses,
							},
						});
					}
					const repeatedQuery = `?octane-bindings=ClosedChild&octane-mount=1&octane-props=${encodeURIComponent(
						JSON.stringify([
							2,
							firstKeys,
							[
								['active', false],
								['data-first', 'repeated'],
							],
						]),
					)}`;
					modules['./closed-child.tsrx' + repeatedQuery] = loadCompiledFixtureSource(childSource, {
						id: '/src/closed-child.tsrx' + repeatedQuery,
						mode: 'client',
						compileOptions: { dev, hmr: false },
						runtimeModules: {
							'octane/dom-binding-program': DomBindingPrograms,
							'octane/dom-binding-signals': DomBindingSignals,
							'octane/dom-binding-classes': DomBindingClasses,
						},
					});
					const calls = vi.fn();
					const firstRef = vi.fn();
					const secondRef = vi.fn();
					const repeatedCalls = vi.fn();
					const repeatedRef = vi.fn();
					const children = [
						'<ClosedChild label={props.label} active={props.active} title={props.title} data-first={props.first} aria-label={props.title} onClick={props.onClick} ref={props.firstRef} />',
						'<ClosedChild label={props.label} active={props.active} data-second={props.second} onPointerDown={props.onPointerDown} ref={props.secondRef}><span>{props.detail as string}</span></ClosedChild>',
					];
					if (reversed) children.reverse();
					const closed = authoredPresentation(
						'ClosedParent',
						{
							label: 'Initial',
							active: true,
							title: 'First',
							first: 'A',
							second: 'B',
							detail: ' detail',
							onClick: calls,
							onPointerDown: calls,
							firstRef,
							secondRef,
							showRepeated: true,
							repeatedLabel: 'Independent',
							repeatedTitle: 'Repeated',
							repeatedCalls,
							repeatedRef,
						},
						dev,
						`${imported ? "import { ClosedChild } from './closed-child.tsrx';" : childSource}
function RepeatedChild(props) @{
 <ClosedChild label={props.label} active={false} title={props.title} data-first="repeated" aria-label={props.title} onClick={props.onClick} ref={props.ref} />
}
export function ClosedParent(props) @{ 'use dom bindings';
 <section>${children.join('')}
  @if (props.showRepeated) {
   <RepeatedChild label={props.repeatedLabel} title={props.repeatedTitle} onClick={props.repeatedCalls} ref={props.repeatedRef} />
  }
 </section>
}`,
						modules,
					);
					for (const mount of [false, true]) {
						closed.publish({
							label: 'Initial',
							active: true,
							title: 'First',
							first: 'A',
							second: 'B',
							detail: ' detail',
							onClick: calls,
							onPointerDown: calls,
							showRepeated: true,
							repeatedLabel: 'Independent',
							repeatedTitle: 'Repeated',
						});
						calls.mockClear();
						firstRef.mockClear();
						secondRef.mockClear();
						repeatedCalls.mockClear();
						repeatedRef.mockClear();
						const host = document.createElement('div');
						container.append(host);
						if (!mount) host.innerHTML = closed.html;
						const original = host.querySelector('[data-first]');
						original?.classList.add('external');
						const abort = new AbortController();
						const handle = mount
							? closed.mount({ parent: host }, closed.state, { signal: abort.signal })
							: closed.attach(host.firstElementChild!, closed.state, { signal: abort.signal });
						const first = host.querySelector('[data-first]') as HTMLButtonElement;
						const second = host.querySelector('[data-second]') as HTMLButtonElement;
						if (!mount) expect(first).toBe(original);
						expect(first.title).toBe('First');
						expect(first.classList.contains('active')).toBe(true);
						if (!mount) expect(first.classList.contains('external')).toBe(true);
						expect(first.getAttribute('aria-label')).toBe('First');
						expect(first.textContent).toBe('Initial');
						expect(second.title).toBe('Default');
						expect(second.textContent).toBe('Initial detail');
						expect(first.hasAttribute('data-second')).toBe(false);
						expect(second.hasAttribute('data-first')).toBe(false);
						expect(firstRef).toHaveBeenCalledExactlyOnceWith(first);
						expect(secondRef).toHaveBeenCalledExactlyOnceWith(second);
						const repeated = host.querySelector('[data-first="repeated"]') as HTMLButtonElement;
						expect(repeated.textContent).toBe('Independent');
						expect(repeated.title).toBe('Repeated');
						expect(repeated.classList.contains('active')).toBe(false);
						expect(repeated.hasAttribute('data-second')).toBe(false);
						expect(repeatedRef).toHaveBeenCalledExactlyOnceWith(repeated);
						repeated.click();
						expect(repeatedCalls).toHaveBeenCalledOnce();
						first.click();
						second.dispatchEvent(new Event('pointerdown', { bubbles: true }));
						expect(calls).toHaveBeenCalledTimes(2);
						closed.publish({
							label: 'Updated',
							active: false,
							title: 'Latest',
							first: 'C',
							second: 'D',
							detail: ' changed',
						});
						expect(first.title).toBe('Latest');
						expect(first.classList.contains('active')).toBe(false);
						expect(first.classList.contains('base')).toBe(true);
						if (!mount) expect(first.classList.contains('external')).toBe(true);
						expect(first.dataset.first).toBe('C');
						expect(second.dataset.second).toBe('D');
						expect(second.textContent).toBe('Updated changed');
						expect(firstRef).toHaveBeenCalledOnce();
						expect(secondRef).toHaveBeenCalledOnce();
						expect(repeated.textContent).toBe('Independent');
						expect(repeated.title).toBe('Repeated');
						closed.publish({ showRepeated: false });
						expect(repeated.isConnected).toBe(false);
						expect(repeatedRef.mock.calls).toEqual([[repeated], [null]]);
						repeated.click();
						expect(repeatedCalls).toHaveBeenCalledOnce();
						closed.publish({
							showRepeated: true,
							repeatedLabel: 'Restored',
							repeatedTitle: 'Other',
						});
						const restored = host.querySelector('[data-first="repeated"]') as HTMLButtonElement;
						expect(restored).not.toBe(repeated);
						expect(restored.textContent).toBe('Restored');
						expect(restored.title).toBe('Other');
						expect(first.textContent).toBe('Updated');
						expect(first.title).toBe('Latest');
						expect(second.textContent).toBe('Updated changed');
						restored.click();
						expect(repeatedCalls).toHaveBeenCalledTimes(2);
						closed.publish({ showRepeated: false });
						expect(repeatedRef.mock.calls).toEqual([[repeated], [null], [restored], [null]]);
						const nextCalls = vi.fn();
						expect(() =>
							closed.publish({
								label: 'Rejected',
								onClick: nextCalls,
								second: {
									toString() {
										throw new Error('closed rest projection failed');
									},
								} as unknown as string,
							}),
						).toThrow('closed rest projection failed');
						expect(first.textContent).toBe('Updated');
						first.click();
						expect(calls).toHaveBeenCalledTimes(2);
						expect(nextCalls).not.toHaveBeenCalled();
						expect(firstRef.mock.calls).toEqual([[first], [null]]);
						expect(secondRef.mock.calls).toEqual([[second], [null]]);
						closed.publish({ label: 'Recovered', second: 'E' });
						expect(first.textContent).toBe('Updated');
						const retry = closed.attach(host.firstElementChild!, closed.state, {
							signal: abort.signal,
						});
						expect(first.textContent).toBe('Recovered');
						first.click();
						expect(nextCalls).toHaveBeenCalledOnce();
						expect(firstRef.mock.calls).toEqual([[first], [null], [first]]);
						expect(secondRef.mock.calls).toEqual([[second], [null], [second]]);
						if (mount) abort.abort();
						handle.dispose();
						retry.dispose();
						expect(firstRef.mock.calls).toEqual([[first], [null], [first], [null]]);
						expect(secondRef.mock.calls).toEqual([[second], [null], [second], [null]]);
						first.click();
						second.dispatchEvent(new Event('pointerdown', { bubbles: true }));
						expect(calls).toHaveBeenCalledTimes(2);
						expect(nextCalls).toHaveBeenCalledOnce();
					}
				}
			}
			for (const [parameter, setup, output, keys] of [
				['{ ...rest }', '', '<button {...rest} />', null],
				['props', '', '<button {...props} />', ['title']],
				['{ ...rest }', 'const alias = rest;', '<button {...alias} />', ['title']],
				['{ ...rest }', '', '<button title="authored" {...rest} />', ['title']],
				['{ ...rest }', '', '<button {...rest} title="authored" />', ['title']],
				['{ ...rest }', '', '<button {...rest} />', ['className']],
				['{ ...rest }', '', '<button onFocusIn={() => {}} {...rest} />', ['onFocus']],
				[
					'{ ...rest }',
					'',
					'<button {...rest} onDblClickCapture={() => {}} />',
					['onDoubleClickCapture'],
				],
				['{ ...rest }', '', '<button onBlur={() => {}} {...rest} />', ['onFocusOut']],
			] as const) {
				const query =
					'?octane-bindings=Invalid' +
					(keys === null ? '' : `&octane-props=${encodeURIComponent(JSON.stringify([1, keys]))}`);
				expect(() =>
					loadCompiledFixtureSource(
						`export function Invalid(${parameter}) @{ 'use dom bindings'; ${setup} ${output} }`,
						{
							id: '/src/closed-rest-invalid.tsrx' + query,
							mode: 'client',
							compileOptions: { dev, hmr: false },
						},
					),
				).toThrow(/spreads must be explicitly unbound|closed binding rest/);
			}
			for (const mode of ['client', 'server'] as const) {
				expect(() =>
					loadCompiledFixtureSource(
						`import { attrs } from 'styles'; export function Invalid({ ...rest }) @{ 'use dom bindings'; <button class={['base', rest.active && 'active']} {...attrs(rest.styles)} {...rest} /> }`,
						{
							id: '/src/closed-rest-class.tsrx',
							mode,
							compileOptions: {
								dev,
								hmr: false,
								knownAttributeSpreads: [
									{ source: 'styles', imported: 'attrs', fields: ['className', 'style'] },
								],
							},
						},
					),
				).toThrow(
					/generic binding rest annotations cannot combine class attributes and known spreads/,
				);
			}
		});

		it(`preserves native setup callbacks and rejects unsupported projections (${dev ? 'dev' : 'prod'})`, () => {
			for (const adopt of [false, true]) {
				const scope = createScope({ scopeKey: `native-setup-${dev}-${adopt}` });
				const disabled = scope.signal$('disabled', false);
				const onAction = vi.fn();
				const onReady = vi.fn();
				const action = authoredPresentation(
					'NativeAction',
					{ width: 24, disabled, title: 'initial', onAction, onReady },
					dev,
					`import { isSignalHandle as signalValue } from 'octane/signals';
import { create } from 'binding-projections';
const SCALE = 16;
const layout = create({ position: (width) => width / 2 });
export function NativeAction({ width, disabled, title, onAction, onReady }) @{ 'use dom bindings';
 const size = (${adopt ? 'String as typeof String' : 'String'})((${adopt ? 'Math as typeof Math' : 'Math'}).min(width, 16) / 16) + 'rem';
 const units = width / SCALE;
 const offset = layout.position(width);
 const inactive = signalValue(disabled) ? disabled.get() : disabled;
 const activate = (event) => {
  if (signalValue(disabled) ? disabled.get() : disabled) {
   event.preventDefault(); event.stopPropagation();
  } else onAction(title, event.currentTarget, units, offset);
 };
 const relay = activate;
 const attach = (node) => onReady(node);
 const ready = attach;
 <button type="button" title={title} aria-disabled={inactive} style={{ width: size }} onClick={relay} ref={ready} />
}`,
					{
						'octane/signals': { isSignalHandle },
						'binding-projections': { create: (configuration: unknown) => configuration },
					},
				);
				const host = document.createElement('div');
				container.append(host);
				host.innerHTML = action.html;
				const serverButton = host.querySelector('button')!;
				expect(serverButton.style.width).toBe('1rem');
				expect(onAction).not.toHaveBeenCalled();
				expect(onReady).not.toHaveBeenCalled();
				if (!adopt) host.replaceChildren();
				const handle = adopt
					? action.attach(host.firstElementChild!, action.state)
					: action.mount({ parent: host }, action.state);
				const button = host.querySelector('button')!;
				if (adopt) expect(button).toBe(serverButton);
				expect(onReady).toHaveBeenCalledExactlyOnceWith(button);
				expect(onAction).not.toHaveBeenCalled();
				button.click();
				expect(onAction).toHaveBeenCalledExactlyOnceWith('initial', button, 1.5, 12);
				action.publish({ width: 8, title: 'updated' });
				expect(button.style.width).toBe('0.5rem');
				expect(onReady).toHaveBeenCalledExactlyOnceWith(button);
				onAction.mockClear();
				button.click();
				expect(onAction).toHaveBeenCalledExactlyOnceWith('updated', button, 0.5, 4);
				const ancestor = vi.fn();
				host.addEventListener('click', ancestor);
				disabled.set(true);
				const click = new MouseEvent('click', { bubbles: true, cancelable: true });
				expect(button.dispatchEvent(click)).toBe(false);
				expect(click.defaultPrevented).toBe(true);
				expect(ancestor).not.toHaveBeenCalled();
				expect(onAction).toHaveBeenCalledOnce();
				action.publish({});
				expect(button.getAttribute('aria-disabled')).toBe('true');
				expect(onReady).toHaveBeenCalledExactlyOnceWith(button);
				handle.dispose();
				expect(onReady.mock.calls).toEqual([[button], [null]]);
				disabled.set(false);
				button.click();
				expect(onAction).toHaveBeenCalledOnce();
				scope.dispose();
				const firstRef = vi.fn();
				const nextRef = vi.fn();
				const forwarded = authoredPresentation(
					'Forwarded',
					{ ref: firstRef, title: 'first', disabled: false },
					dev,
					`import * as signals from 'octane/signals';
function Child({ ref, title, disabled }) @{ <button ref={ref} title={title} disabled={disabled} /> }
export function Forwarded(props) @{ 'use dom bindings';
 const disabled = (${adopt ? 'signals as typeof signals' : 'signals'}).isSignalHandle(props.disabled) ? props.disabled.get() : props.disabled;
 <section><Child ref={props.ref} title={props.title} disabled={disabled} /></section>
}`,
					{ 'octane/signals': { isSignalHandle } },
				);
				const childHost = document.createElement('div');
				container.append(childHost);
				if (adopt) childHost.innerHTML = forwarded.html;
				const childHandle = adopt
					? forwarded.attach(childHost.firstElementChild!, forwarded.state)
					: forwarded.mount({ parent: childHost }, forwarded.state);
				const childButton = childHost.querySelector('button')!;
				expect(firstRef).toHaveBeenCalledExactlyOnceWith(childButton);
				forwarded.publish({ title: 'next' });
				expect(childButton.title).toBe('next');
				expect(firstRef).toHaveBeenCalledOnce();
				forwarded.publish({ ref: nextRef });
				expect(firstRef.mock.calls).toEqual([[childButton], [null]]);
				expect(nextRef).toHaveBeenCalledExactlyOnceWith(childButton);
				childHandle.dispose();
				expect(nextRef.mock.calls).toEqual([[childButton], [null]]);
			}
			for (const [parameter, setup, output, module = ''] of [
				['{ String, value }', 'const title = String(value);', '<button title={title} />'],
				['{ Math, value }', 'const title = Math.min(value, 16);', '<button title={title} />'],
				[
					'{ Math, value }',
					'const title = (Math as typeof globalThis.Math).min(value, 16);',
					'<button title={title} />',
				],
				[
					'{ signals, value }',
					'const title = (signals as typeof globalThis.signals).isSignalHandle(value);',
					'<button title={title} />',
					"import * as signals from 'octane/signals';",
				],
				[
					'props',
					'const convert = String; const title = convert(props.value);',
					'<button title={title} />',
				],
				['props', 'const title = Math.random();', '<button title={title} />'],
				['props', 'const title = Math["min"](props.value, 16);', '<button title={title} />'],
				[
					'{ signalValue, value }',
					'const title = signalValue(value);',
					'<button title={title} />',
					"import { isSignalHandle as signalValue } from 'octane/signals';",
				],
				[
					'props',
					'const predicate = signalValue; const title = predicate(props.value);',
					'<button title={title} />',
					"import { isSignalHandle as signalValue } from 'octane/signals';",
				],
				[
					'props',
					'const title = signalValue(props.value);',
					'<button title={title} />',
					"import { useSignal as signalValue } from 'octane/signals';",
				],
				['props', 'const callback = () => props.action();', '<button title={callback} />'],
				[
					'props',
					'const callback = () => props.action(); const value = callback();',
					'<button title={value} />',
				],
				[
					'props',
					'const callback = () => props.action(); const value = wrap(callback);',
					'<button title={value} />',
					"import { wrap } from 'pure-projections';",
				],
				[
					'props',
					'const callback = () => outside(); const alias = callback;',
					'<button onClick={alias} />',
					'function outside() {}',
				],
				[
					'props',
					'const callback = (node) => props.onRef(node); const ref = (node) => callback(node);',
					'<button ref={ref} />',
				],
				[
					'props',
					'const ref = (node) => props.onRef(node);',
					'<Child ref={ref} />',
					'function Child(props) @{ <button ref={props.ref} /> }',
				],
				[
					'props',
					'const callback = () => props.action();',
					'<button {...props} onClick={callback} />',
				],
			]) {
				for (const mode of ['client', 'server'] as const) {
					expect(() =>
						loadCompiledFixtureSource(
							`${module}\nexport function Invalid(${parameter}) @{ 'use dom bindings'; ${setup} ${output} }`,
							{ id: '/src/invalid-native-setup.tsrx', mode, compileOptions: { dev, hmr: false } },
						),
					).toThrow(/Octane DOM bindings/);
				}
			}
		});

		it(`preserves destructured props through getter reentry, abort and recovery (${dev ? 'dev' : 'prod'})`, () => {
			for (const adopt of [false, true]) {
				const reads: string[] = [];
				const events: unknown[] = [];
				const symbol = Symbol('enumerable rest');
				let label: string | null | undefined;
				let extra = 'initial';
				let onRead = () => {};
				let attachedRest: unknown;
				const snapshot = Object.create({ inherited: 'excluded' }) as Record<PropertyKey, unknown>;
				Object.defineProperties(snapshot, {
					label: {
						enumerable: true,
						get() {
							reads.push('label');
							const value = label;
							onRead();
							return value;
						},
					},
					'data-kind': {
						enumerable: true,
						get() {
							reads.push('kind');
							return 'primary';
						},
					},
					onAction: {
						enumerable: true,
						value: (value: unknown, rest: unknown) => {
							events.push([value, rest === attachedRest, rest]);
						},
					},
					onRef: {
						enumerable: true,
						value: (node: Element | null, rest: unknown) => {
							if (node) attachedRest = rest;
						},
					},
					extra: {
						enumerable: true,
						get() {
							reads.push('extra');
							return extra;
						},
					},
					hidden: { value: 'excluded' },
					[symbol]: { enumerable: true, value: 'symbol value' },
				});
				const destructured = authoredPresentation(
					'Destructured',
					snapshot,
					dev,
					`export function Destructured({ label: text = 'Fallback', 'data-kind': kind = 'base', onAction, onRef, ...rest }) @{
 'use dom bindings';
 const activate = () => onAction(text, rest);
 const relay = activate;
 const attach = (node) => onRef(node, rest);
 const ready = attach;
 <section title={text} data-kind={kind}>
  <button type="button" onClick={relay} ref={ready}>{text as string}</button>
  <span title={rest.extra}>{text as string}</span>
 </section>
}`,
				);
				const host = document.createElement('div');
				container.append(host);
				host.innerHTML = destructured.html;
				expect(host.querySelector('button')!.textContent).toBe('Fallback');
				expect(host.querySelector('section')!.getAttribute('data-kind')).toBe('primary');
				const serverButton = host.querySelector('button');
				if (!adopt) host.replaceChildren();
				const subscriptions = new Set<() => void>();
				const state = {
					getSnapshot: () => snapshot,
					subscribe(notify: () => void) {
						subscriptions.add(notify);
						return () => {
							subscriptions.delete(notify);
						};
					},
				};
				const publish = () => {
					for (const notify of subscriptions) notify();
				};
				const abort = new AbortController();
				reads.length = 0;
				const handle = adopt
					? destructured.attach(host.firstElementChild!, state, { signal: abort.signal })
					: destructured.mount({ parent: host }, state, { signal: abort.signal });
				const button = host.querySelector('button')!;
				if (adopt) expect(button).toBe(serverButton);
				expect(reads).toEqual(['label', 'kind', 'extra']);
				button.click();
				expect(events).toEqual([
					['Fallback', true, { extra: 'initial', [symbol]: 'symbol value' }],
				]);
				expect(reads).toEqual(['label', 'kind', 'extra']);
				label = null;
				extra = 'changed';
				publish();
				expect(button.textContent).toBe('');
				expect(host.querySelector('section')!.getAttribute('title')).toBeNull();
				expect(host.querySelector('span')!.title).toBe('changed');
				button.click();
				expect(events.at(-1)).toEqual([null, true, { extra: 'changed', [symbol]: 'symbol value' }]);
				label = 'discarded';
				onRead = () => {
					onRead = () => {};
					button.click();
					label = 'committed';
					publish();
				};
				publish();
				expect(events.at(-1)).toEqual([null, true, { extra: 'changed', [symbol]: 'symbol value' }]);
				expect(button.textContent).toBe('committed');
				button.click();
				expect(events.at(-1)).toEqual([
					'committed',
					true,
					{ extra: 'changed', [symbol]: 'symbol value' },
				]);
				label = 'aborted';
				onRead = () => abort.abort();
				publish();
				expect(button.textContent).toBe('committed');
				events.length = 0;
				button.click();
				expect(events).toEqual([]);
				handle.dispose();
				label = 'recovered';
				onRead = () => {};
				const recovered = destructured.attach(host.firstElementChild!, state);
				expect(button.textContent).toBe('recovered');
				onRead = () => {
					throw new Error('props getter failed');
				};
				expect(publish).toThrow('props getter failed');
				expect(button.textContent).toBe('recovered');
				button.click();
				expect(events).toEqual([]);
				recovered.dispose();
			}
		});

		it(`preserves child slots, defaults and keyed content (${dev ? 'dev' : 'prod'})`, () => {
			for (const restChildren of [false, true]) {
				const slotted = authoredPresentation(
					'Slotted',
					{ label: undefined as string | undefined, rows: ['first'], kind: 'nested' },
					dev,
					`function Child({ ${restChildren ? '' : 'children: content,'} label: caption = 'Default child', rows, ...rest }) @{
 <article title={caption} data-kind={rest.kind}>
  {${restChildren ? 'rest.children' : 'content'}}
  @for (const content of rows; key content) { <span>{content}</span> }
 </article>
}
export function Slotted({ label, rows, kind }) @{ 'use dom bindings';
 <section><Child label={label} rows={rows} kind={kind}><button type="button">{label as string}</button>@for (const row of rows; key row) { <i data-slot-row>{row}</i> }</Child></section>
}`,
				);
				for (const adopt of [false, true]) {
					const host = document.createElement('div');
					container.append(host);
					slotted.publish({ label: undefined, rows: ['first'], kind: 'nested' });
					host.innerHTML = slotted.html;
					expect(host.querySelector('article')!.title).toBe('Default child');
					expect(host.querySelector('span')!.textContent).toBe('first');
					const serverButton = host.querySelector('button');
					if (!adopt) host.replaceChildren();
					const handle = adopt
						? slotted.attach(host.firstElementChild!, slotted.state)
						: slotted.mount({ parent: host }, slotted.state);
					const button = host.querySelector('button')!;
					if (adopt) expect(button).toBe(serverButton);
					const firstRow = host.querySelector('span');
					const firstSlotRow = host.querySelector('[data-slot-row]');
					slotted.cleanup.mockClear();
					const beforeTakeover = host.innerHTML;
					expect(() =>
						hydrateRoot(host, slotted.loadClient().Slotted, slotted.state.getSnapshot(), {
							bindingLeases: [handle],
						}),
					).toThrow(/structural|fixed native|supported child view|lists/i);
					expect(host.innerHTML).toBe(beforeTakeover);
					expect(slotted.cleanup).not.toHaveBeenCalled();
					slotted.publish({ label: 'Updated child', rows: ['second', 'first'], kind: 'updated' });
					expect(host.querySelector('article')!.title).toBe('Updated child');
					expect(host.querySelector('article')!.getAttribute('data-kind')).toBe('updated');
					expect(button.textContent).toBe('Updated child');
					expect(host.querySelector('button')).toBe(button);
					expect([...host.querySelectorAll('span')].map((node) => node.textContent)).toEqual([
						'second',
						'first',
					]);
					expect(host.querySelectorAll('span')[1]).toBe(firstRow);
					expect(host.querySelectorAll('[data-slot-row]')[1]).toBe(firstSlotRow);
					slotted.publish({ rows: [] });
					expect(host.querySelectorAll('span')).toHaveLength(0);
					expect(host.querySelectorAll('[data-slot-row]')).toHaveLength(0);
					slotted.publish({ rows: ['third', 'first'] });
					expect([...host.querySelectorAll('span')].map((node) => node.textContent)).toEqual([
						'third',
						'first',
					]);
					expect(
						[...host.querySelectorAll('[data-slot-row]')].map((node) => node.textContent),
					).toEqual(['third', 'first']);
					expect(host.querySelectorAll('span')[1]).not.toBe(firstRow);
					expect(host.querySelectorAll('[data-slot-row]')[1]).not.toBe(firstSlotRow);
					expect(host.querySelector('button')).toBe(button);
					handle.dispose();
				}
			}
			for (const fallback of ['false', '0', '"fallback"']) {
				expect(() =>
					authoredPresentation(
						'UnsupportedChildren',
						{},
						dev,
						`export function UnsupportedChildren({ children: content = ${fallback} }) @{ 'use dom bindings'; <section>{content}</section> }`,
					),
				).toThrow(/child slot defaults/);
			}
			for (const parameter of [
				'{ label: { text } }',
				'{ ["label"]: label }',
				'{ label = globalThis.name }',
				'{ label = [] }',
				'[label]',
				'props = {}',
			]) {
				expect(() =>
					authoredPresentation(
						'Unsupported',
						{},
						dev,
						`export function Unsupported(${parameter}) @{ 'use dom bindings'; <section /> }`,
					),
				).toThrow(/binding props support only|ordinary props parameter/);
			}
		});

		it(`preserves presentation refs through replacement and cleanup failure (${dev ? 'dev' : 'prod'})`, () => {
			const refA = { current: null as HTMLInputElement | null };
			const refB = { current: null as HTMLInputElement | null };
			const order: string[] = [];
			const callbackA = vi.fn((element: Element | null) => {
				if (element === null) return;
				expect(refB.current).toBeNull();
				order.push('attach A');
				return () => {
					order.push('detach A');
				};
			});
			const callbackB = vi.fn((element: Element | null) => {
				order.push(element ? 'attach B' : 'detach B');
			});
			const onRemove = vi.fn();
			const fixture = authoredPresentation<AttachmentPresentationProps>(
				'AttachmentPresentation',
				{
					items: [{ id: 'row', name: 'First', preview: null, state: 'ready', error: '' }],
					locked: false,
					onInput: refA,
					onRemove,
					onRetry() {},
				},
				dev,
			);
			const host = document.createElement('section');
			container.append(host);
			host.innerHTML = fixture.html;
			const range = { start: host.firstChild as Comment, end: host.lastChild as Comment };
			const input = host.querySelector('input')!;
			input.value = 'Native edit';
			const handle = fixture.attach(range, fixture.state);
			try {
				expect(refA.current).toBe(input);
				fixture.publish({ onInput: refB });
				expect(refA.current).toBeNull();
				expect(refB.current).toBe(input);
				fixture.publish({ locked: true });
				expect(refB.current).toBe(input);
				fixture.publish({ onInput: callbackA, locked: false });
				expect(refB.current).toBeNull();
				expect(callbackA).toHaveBeenCalledOnce();
				fixture.publish({ locked: true });
				fixture.publish({ onInput: callbackA, locked: false });
				expect(callbackA).toHaveBeenCalledOnce();
				expect(order).toEqual(['attach A']);
				fixture.publish({ onInput: callbackB });
				expect(order).toEqual(['attach A', 'detach A', 'attach B']);
				fixture.publish({ onInput: null });
				expect(callbackB.mock.calls.map(([element]) => element)).toEqual([input, null]);
				fixture.publish({ onInput: undefined });
				expect(order).toEqual(['attach A', 'detach A', 'attach B', 'detach B']);
				expect(host.querySelector('input')).toBe(input);
				expect(input.value).toBe('Native edit');
				host.querySelector('button')!.click();
				expect(onRemove).toHaveBeenCalledExactlyOnceWith('row');
				fixture.publish({ onInput: refA });
			} finally {
				handle.dispose();
			}
			expect(refA.current).toBeNull();
			expect(fixture.cleanup).toHaveBeenCalledOnce();
			host.querySelector('button')!.click();
			expect(onRemove).toHaveBeenCalledOnce();
			const failure = new Error('Replaced ref cleanup failed');
			const oldCleanup = vi.fn(() => {
				throw failure;
			});
			const newRef = vi.fn();
			const failing = authoredPresentation<AttachmentPresentationProps>(
				'AttachmentPresentation',
				{
					items: [{ id: 'row', name: 'Retained', preview: null, state: 'ready', error: '' }],
					locked: false,
					onInput: () => oldCleanup,
					onRemove() {},
					onRetry() {},
				},
				dev,
			);
			const failedHost = document.createElement('section');
			container.append(failedHost);
			failedHost.innerHTML = failing.html;
			const failedRange = {
				start: failedHost.firstChild as Comment,
				end: failedHost.lastChild as Comment,
			};
			const failedInput = failedHost.querySelector('input');
			const failedHandle = failing.attach(failedRange, failing.state);
			expect(() => failing.publish({ onInput: newRef })).toThrow(failure);
			expect(oldCleanup).toHaveBeenCalledOnce();
			expect(newRef).not.toHaveBeenCalled();
			expect(failing.cleanup).toHaveBeenCalledOnce();
			expect(failedHost.querySelector('input')).toBe(failedInput);
			failedHandle.dispose();
			expect(oldCleanup).toHaveBeenCalledOnce();
			failing.publish({ onInput: null }, false);
			failing.attach(failedRange, failing.state).dispose({ preserveDOM: false });
			const inlineOrder: string[] = [];
			const inlineA = vi.fn((_element: Element | null) => {
				inlineOrder.push('attach A');
				return () => {
					inlineOrder.push('detach A');
				};
			});
			const inlineB = vi.fn((_element: Element | null) => {
				inlineOrder.push('attach B');
				return () => {
					inlineOrder.push('detach B');
				};
			});
			const inline = authoredPresentation(
				'InlineRefPresentation',
				{ title: 'First', onAttach: inlineA },
				dev,
			);
			const inlineHost = document.createElement('section');
			container.append(inlineHost);
			inlineHost.innerHTML = inline.html;
			const inlineInput = inlineHost.querySelector('input')!;
			const inlineHandle = inline.attach(inlineInput, inline.state);
			try {
				inline.publish({ title: 'Unrelated change' });
				expect(inlineA).toHaveBeenCalledOnce();
				expect(inlineOrder).toEqual(['attach A']);
				inline.publish({ onAttach: inlineB });
				expect(inlineOrder).toEqual(['attach A', 'detach A', 'attach B']);
				inline.publish({ title: 'Another unrelated change' });
				expect(inlineB).toHaveBeenCalledOnce();
				expect(inlineHost.querySelector('input')).toBe(inlineInput);
			} finally {
				inlineHandle.dispose();
			}
			expect(inlineOrder).toEqual(['attach A', 'detach A', 'attach B', 'detach B']);
		});

		it(`preserves signal text ownership and replacement (${dev ? 'dev' : 'prod'})`, () => {
			const scope = createScope({ scopeKey: `presentation-signal-ref-${dev}` });
			const other = createScope({ scopeKey: `presentation-signal-other-${dev}` });
			const label = __signalAt('presentation-label', 'initial label');
			const suffix = scope.signal$('suffix', 'initial suffix');
			const replacement = scope.signal$('replacement', 'replacement label');
			const textFixture = authoredPresentation<{ first: unknown; last: unknown }>(
				'AdjacentPresentation',
				{ first: 'server label', last: 'server suffix' },
				dev,
			);
			const textHost = document.createElement('section');
			container.append(textHost);
			textHost.innerHTML = textFixture.html;
			const paragraph = textHost.querySelector('p')!;
			textFixture.publish({ first: label, last: suffix }, false);
			const reads = vi.spyOn(textFixture.state, 'getSnapshot');
			const abort = new AbortController();
			const textHandle = runWithSignalOwner(scope, () =>
				textFixture.attach(paragraph, textFixture.state, { signal: abort.signal }),
			);
			try {
				const originalText = [...paragraph.childNodes].find(
					(node) => node.nodeValue === 'initial label',
				);
				expect(originalText).toBeDefined();
				reads.mockClear();
				runWithSignalOwner(other, () => label.set('other document label'));
				expect(originalText!.nodeValue).toBe('initial label');
				runWithSignalOwner(scope, () => label.set('connected label'));
				expect(originalText!.nodeValue).toBe('connected label');
				expect(reads).not.toHaveBeenCalled();
				textFixture.publish({ first: replacement });
				expect(originalText!.nodeValue).toBe('replacement label');
				reads.mockClear();
				runWithSignalOwner(scope, () => label.set('retired original'));
				expect(originalText!.nodeValue).toBe('replacement label');
				replacement.set('connected replacement');
				expect(originalText!.nodeValue).toBe('connected replacement');
				expect(reads).not.toHaveBeenCalled();
				textFixture.publish({ first: 'constant' });
				replacement.set('retired replacement');
				expect(originalText!.nodeValue).toBe('constant');
				textFixture.publish({ first: label });
				expect(originalText!.nodeValue).toBe('retired original');
				abort.abort();
				const before = paragraph.innerHTML;
				runWithSignalOwner(scope, () => label.set('owner remains alive'));
				suffix.set('after abort');
				expect(paragraph.innerHTML).toBe(before);
				expect(runWithSignalOwner(scope, () => label.get())).toBe('owner remains alive');
				expect(textFixture.cleanup).toHaveBeenCalledOnce();
			} finally {
				textHandle.dispose();
				scope.dispose();
				other.dispose();
			}
		});

		it(`preserves keyed signal rows and native edit state (${dev ? 'dev' : 'prod'})`, () => {
			const rowsOwner = createScope({ scopeKey: `presentation-rows-${dev}` });
			const foreignOwner = createScope({ scopeKey: `presentation-foreign-${dev}` });
			const rowLabel = __signalAt('presentation-row-label', 'owned label');
			const progress = rowsOwner.signal$('progress', 0);
			const active = rowsOwner.signal$('active', false);
			const computeClasses = vi.fn(() => (active.get() ? 'ready active' : 'ready'));
			const classes = rowsOwner.derived$('classes', computeClasses);
			const rowFixture = authoredPresentation<{
				items: Array<{ id: string; label: unknown; progress: unknown; classes: unknown }>;
			}>(
				'SignalRowPresentation',
				{ items: [{ id: 'a', label: 'server', progress: 0, classes: 'ready' }] },
				dev,
			);
			const rowHost = document.createElement('section');
			container.append(rowHost);
			rowHost.innerHTML = rowFixture.html;
			const rowRange = { start: rowHost.firstChild as Comment, end: rowHost.lastChild as Comment };
			const row = rowHost.querySelector('figure')!;
			const rowInput = row.querySelector('input')!;
			rowInput.value = 'native edit';
			rowInput.focus();
			rowInput.setSelectionRange(2, 7);
			const rowProps = { id: 'a', label: rowLabel, progress, classes };
			rowFixture.publish({ items: [rowProps] }, false);
			const rowReads = vi.spyOn(rowFixture.state, 'getSnapshot');
			const rowHandle = runWithSignalOwner(rowsOwner, () =>
				rowFixture.attach(rowRange, rowFixture.state),
			);
			try {
				computeClasses.mockClear();
				rowReads.mockClear();
				for (let index = 1; index <= 25; index++) progress.set(index);
				expect(row.style.getPropertyValue('--progress')).toBe('25');
				expect(computeClasses).not.toHaveBeenCalled();
				expect(rowReads).not.toHaveBeenCalled();
				expect(row.querySelector('input')).toBe(rowInput);
				expect(rowInput.value).toBe('native edit');
				expect(document.activeElement).toBe(rowInput);
				expect([rowInput.selectionStart, rowInput.selectionEnd]).toEqual([2, 7]);
				active.set(true);
				expect(row.className).toBe('ready active');
				expect(computeClasses).toHaveBeenCalledOnce();
				runWithSignalOwner(foreignOwner, () => rowLabel.set('wrong owner'));
				rowFixture.publish({ items: [rowProps, { ...rowProps, id: 'b' }] });
				expect([...rowHost.querySelectorAll('figcaption')].map((node) => node.textContent)).toEqual(
					['owned label', 'owned label'],
				);
				rowFixture.publish({ items: [{ ...rowProps, id: 'b' }, rowProps] });
				expect(rowHost.querySelectorAll('figure')[1]).toBe(row);
				expect(document.activeElement).toBe(rowInput);
				rowFixture.publish({ items: [{ ...rowProps, id: 'b' }] });
				expect(rowsOwner.inspect().nodes.find((node) => node.key === 'progress')?.subscribers).toBe(
					1,
				);
				const removed = row.outerHTML;
				progress.set(30);
				expect(row.outerHTML).toBe(removed);
				expect(rowHost.querySelector('figure')!.style.getPropertyValue('--progress')).toBe('30');
				rowFixture.publish({ items: [] });
				expect(rowsOwner.inspect().nodes.find((node) => node.key === 'progress')?.subscribers).toBe(
					0,
				);
				runWithSignalOwner(foreignOwner, () => rowFixture.publish({ items: [rowProps] }));
				expect(rowHost.querySelector('figcaption')!.textContent).toBe('owned label');
				rowHandle.dispose();
				expect(rowsOwner.inspect().nodes.find((node) => node.key === 'progress')?.subscribers).toBe(
					0,
				);
				expect(progress.get()).toBe(30);
			} finally {
				rowHandle.dispose();
				rowsOwner.dispose();
				foreignOwner.dispose();
			}
		});

		it(`preserves native controls, style projections and imported capabilities (${dev ? 'dev' : 'prod'})`, async () => {
			const host = document.createElement('section');
			container.append(host);
			const controlScope = createScope({ scopeKey: `authored-controls-${dev}` });
			const draft = controlScope.signal$('draft', 'server');
			const checked = controlScope.signal$('checked', false);
			const nextDraft = controlScope.signal$('replacement', 'replacement');
			const controls = authoredPresentation<ControlPresentationProps>(
				'ControlPresentation',
				{ draft, checked, title: 'initial' },
				dev,
			);
			const controlHost = document.createElement('div');
			container.append(controlHost);
			controlHost.innerHTML = controls.html;
			const controlRoot = controlHost.querySelector('section')!;
			const editor = controlRoot.querySelector('input')!;
			const checkable = controlRoot.querySelector<HTMLInputElement>('[type="checkbox"]')!;
			// Capture is initialized independently of this presentation's delayed activation.
			const capture = await import('../src/hydration/control-capture.js');
			capture.initializeHydrationControlCapture(document);
			editor.value = '';
			editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
			editor.focus();
			const controlled = controls.attach(controlRoot, controls.state);
			try {
				expect(draft.get()).toBe('');
				expect(controlRoot.querySelector('input')).toBe(editor);
				editor.value = 'native edit';
				editor.setSelectionRange(2, 5);
				editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
				expect(draft.get()).toBe('native edit');
				controls.publish({ title: 'unchanged handle' });
				expect(document.activeElement).toBe(editor);
				expect([editor.selectionStart, editor.selectionEnd]).toEqual([2, 5]);
				controls.publish({ draft: nextDraft });
				expect(editor.value).toBe('replacement');
				expect(nextDraft.get()).toBe('replacement');
				draft.set('old owner');
				expect(editor.value).toBe('replacement');
				checkable.click();
				expect(checked.get()).toBe(true);
				checked.set(false);
				expect(checkable.checked).toBe(false);
				const readonly = controlScope.derived$('readonly', () => nextDraft.get().toUpperCase());
				controls.publish({ draft: readonly });
				expect(editor.value).toBe('REPLACEMENT');
				editor.value = 'does not mutate readonly';
				editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
				expect(nextDraft.get()).toBe('replacement');
				nextDraft.set('author update');
				expect(editor.value).toBe('AUTHOR UPDATE');
				controlled.dispose();
				nextDraft.set('disposed');
				expect(editor.value).toBe('AUTHOR UPDATE');
				const mounted = controls.mount({ parent: controlHost }, controls.state);
				expect(controlHost.lastElementChild!.querySelector('input')!.value).toBe('DISPOSED');
				mounted.dispose({ preserveDOM: false });
			} finally {
				controlled.dispose();
			}
			const invalidDraft = controlScope.signal$<string | number>('invalid-draft', 1);
			controls.publish({ draft: invalidDraft as typeof draft, title: 'must not publish' }, false);
			const beforeInvalidControl = controlRoot.outerHTML;
			expect(() => controls.attach(controlRoot, controls.state)).toThrow(
				/value signal must contain a string/,
			);
			expect(controlRoot.outerHTML).toBe(beforeInvalidControl);
			controls.publish({ draft: nextDraft, title: 'abortable' }, false);
			const controlAbort = new AbortController();
			const abortableControl = controls.attach(controlRoot, controls.state, {
				signal: controlAbort.signal,
			});
			controlAbort.abort();
			const afterControlAbort = editor.value;
			nextDraft.set('after abort');
			expect(editor.value).toBe(afterControlAbort);
			abortableControl.dispose();
			const sampled = authoredPresentation(
				'SampledControlPresentation',
				{ draft, checked, plain: 'plain value' },
				dev,
			);
			const sampledHost = document.createElement('div');
			container.append(sampledHost);
			sampledHost.innerHTML = sampled.html;
			const sampledRoot = sampledHost.querySelector('section')!;
			const sampledInput = sampledRoot.querySelector('input')!;
			const sampledCheck = sampledRoot.querySelector<HTMLInputElement>('[type="checkbox"]')!;
			const sampledHandle = sampled.attach(sampledRoot, sampled.state);
			const initialSample = sampledInput.value;
			draft.set('not subscribed');
			checked.set(true);
			expect(sampledInput.value).toBe(initialSample);
			expect(sampledCheck.checked).toBe(false);
			sampledInput.value = 'unpublished native edit';
			sampledInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
			expect(draft.get()).toBe('not subscribed');
			sampled.publish({ plain: 'refreshed plain' });
			expect(sampledInput.value).toBe('not subscribed');
			expect(sampledCheck.checked).toBe(true);
			expect(sampledRoot.querySelector('textarea')!.value).toBe('refreshed plain');
			sampledHandle.dispose();
			for (const adopt of [false, true]) {
				const amount = controlScope.signal$<number | null | undefined>(
					`amount-${adopt}`,
					undefined,
				);
				const numeric = authoredPresentation(
					'NumericPresentation',
					{
						amount,
						plain: undefined as number | null | undefined,
						picked: undefined as readonly (number | string)[] | null | undefined,
						enabled: undefined as boolean | null | undefined,
					},
					dev,
					`import 'octane/signals';
export function NumericPresentation(props) @{ 'use dom bindings';
  <section><input type="number" value={props.amount.get()} />
    <input value={props.plain} /><textarea value={props.plain} />
    <input type="checkbox" checked={props.enabled} />
    <select multiple value={props.picked}><option value="42">Answer</option></select></section>
}`,
				);
				const numericHost = document.createElement('div');
				container.append(numericHost);
				if (adopt) {
					numericHost.innerHTML = numeric.html;
					numericHost.querySelector('input')!.value = '1.5';
					numericHost.querySelector('textarea')!.value = 'early edit';
				}
				const numericHandle = adopt
					? numeric.attach(numericHost.firstElementChild!, numeric.state)
					: numeric.mount({ parent: numericHost }, numeric.state);
				const numberInput = numericHost.querySelector('input')!;
				const plainInput = numericHost.querySelectorAll('input')[1]!;
				const textarea = numericHost.querySelector('textarea')!;
				const optionalCheck = numericHost.querySelector<HTMLInputElement>('[type="checkbox"]')!;
				const optionalSelect = numericHost.querySelector('select')!;
				expect(numberInput.value).toBe(adopt ? '1.5' : '');
				expect(textarea.value).toBe(adopt ? 'early edit' : '');
				amount.set(1);
				expect(numberInput.value).toBe(adopt ? '1.5' : '');
				numeric.publish({ plain: 42, picked: [42], enabled: true });
				expect([numberInput.value, plainInput.value, textarea.value]).toEqual(['1', '42', '42']);
				expect(optionalCheck.checked).toBe(true);
				expect([...optionalSelect.selectedOptions].map((option) => option.value)).toEqual(['42']);
				numberInput.value = '1.0';
				numberInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
				expect(amount.get()).toBe(1);
				numeric.publish({});
				expect(numberInput.value).toBe('1.0');
				amount.set(0);
				numberInput.value = '';
				numeric.publish({ plain: 0 });
				expect([numberInput.value, plainInput.value, textarea.value]).toEqual(['0', '0', '0']);
				for (const empty of [undefined, null]) {
					amount.set(empty);
					numberInput.value = '2';
					textarea.value = 'keep native edit';
					numeric.publish({ plain: empty, picked: empty, enabled: empty });
					expect([numberInput.value, plainInput.value, textarea.value]).toEqual([
						'2',
						'0',
						'keep native edit',
					]);
					expect(optionalCheck.checked).toBe(true);
					expect(optionalSelect.value).toBe('42');
				}
				numericHandle.dispose();
				amount.set(5);
				numeric.publish({ plain: 5 });
				expect(numberInput.value).toBe('2');
			}
			const firstRadio = controlScope.signal$('radio-first', true);
			const secondRadio = controlScope.signal$('radio-second', false);
			const radio = authoredPresentation(
				'RadioControlPresentation',
				{ first: firstRadio, second: secondRadio },
				dev,
			);
			host.innerHTML = radio.html;
			const radioRoot = host.firstElementChild!;
			const radioHandle = radio.attach(radioRoot, radio.state);
			// A whole-source observer can reenter after the selected control's own
			// signal subscription and project the not-yet-published old cousin.
			const stopRadioObserver = secondRadio.subscribe(() => radio.publish({}));
			const [secondNative, firstNative] = radioRoot.querySelectorAll('input');
			secondNative!.click();
			expect([firstRadio.get(), secondRadio.get()]).toEqual([false, true]);
			expect([firstNative!.checked, secondNative!.checked]).toEqual([false, true]);
			stopRadioObserver();
			radioHandle.dispose();

			const rows = authoredPresentation(
				'ControlRowsPresentation',
				{
					items: [
						{ id: 'a', draft },
						{ id: 'b', draft: nextDraft },
					],
				},
				dev,
			);
			const rowsHost = document.createElement('div');
			container.append(rowsHost);
			const rowsHandle = rows.mount({ parent: rowsHost }, rows.state);
			const retained = rowsHost.querySelector('input')!;
			retained.focus();
			rows.publish({
				items: [
					{ id: 'b', draft: nextDraft },
					{ id: 'a', draft },
				],
			});
			expect(rowsHost.querySelectorAll('input')[1]).toBe(retained);
			expect(document.activeElement).toBe(retained);
			rows.publish({ items: [{ id: 'b', draft: nextDraft }] });
			const retiredValue = retained.value;
			draft.set('removed row');
			expect(retained.value).toBe(retiredValue);
			rowsHandle.dispose();
			expect(nextDraft.get()).toBe('after abort');

			const selected = controlScope.signal$<readonly string[]>('selected', ['b']);
			const select = authoredPresentation(
				'ControlSelectPresentation',
				{ values: selected, options: ['a'] },
				dev,
			);
			const selectHost = document.createElement('div');
			container.append(selectHost);
			const selectHandle = select.mount({ parent: selectHost }, select.state);
			select.publish({ options: ['a', 'b'] });
			const selectNode = selectHost.querySelector('select')!;
			expect([...selectNode.selectedOptions].map((option) => option.value)).toEqual(['b']);
			selectNode.options[0]!.selected = true;
			selectNode.dispatchEvent(new Event('input', { bubbles: true }));
			expect(selected.get()).toEqual(['a', 'b']);
			selectHandle.dispose();

			const left = controlScope.signal$('left', 4);
			const map = controlScope.signal$('styles', { left, opacity: 0.5 });
			const style = authoredPresentation<{ styles: unknown }>(
				'WholeStylePresentation',
				{ styles: map },
				dev,
			);
			const styleHost = document.createElement('div');
			container.append(styleHost);
			styleHost.innerHTML = style.html;
			const styled = styleHost.querySelector('section')!;
			const styleInput = styled.querySelector('input')!;
			styleInput.value = 'native style edit';
			const styleHandle = style.attach(styled, style.state);
			left.set(9);
			expect(styled.style.left).toBe('9px');
			expect(styled.querySelector('input')).toBe(styleInput);
			expect(styleInput.value).toBe('native style edit');
			style.publish({ styles: { top: left } });
			expect(styled.style.left).toBe('');
			expect(styled.style.top).toBe('9px');
			left.set(12);
			expect(styled.style.top).toBe('12px');
			style.publish({ styles: 'color: red' });
			expect(styled.style.top).toBe('');
			expect(styled.style.color).toBe('red');
			styled.style.padding = '7px';
			style.publish({ styles: { left } });
			expect(styled.style.padding).toBe('');
			styled.style.marginLeft = '3px';
			left.set(13);
			expect(styled.style.marginLeft).toBe('3px');
			style.publish({ styles: null });
			expect(styled.style.left).toBe('');
			expect(styled.style.marginLeft).toBe('3px');
			styleHandle.dispose();
			const spread = authoredPresentation(
				'SpreadStylePresentation',
				{ base: { opacity: 0.5 }, left, extra: { top: 3 } },
				dev,
			);
			styleHost.innerHTML = spread.html;
			const spreadNode = styleHost.querySelector('section')!;
			const spreadHandle = spread.attach(spreadNode, spread.state);
			left.set(15);
			expect(spreadNode.style.left).toBe('15px');
			expect(spreadNode.style.top).toBe('3px');
			spreadHandle.dispose();
			for (const adopt of [false, true]) {
				const scale = controlScope.signal$<number | null>(`spread-scale-${adopt}`, 2);
				const replacement = controlScope.signal$<number | null>(`spread-next-scale-${adopt}`, 4);
				const projected = authoredPresentation(
					'SignalStyleProps',
					{ scale, enabled: true },
					dev,
					`import 'octane/signals';
import * as stylex from 'binding-styles';
const styles = stylex.create({ dy: (scale) => ({ className: 'scaled', style: { '--scale': scale } }) });
export function SignalStyleProps(props) @{ 'use dom bindings';
  <section {...stylex.props(props.enabled ? styles.dy(props.scale) : null)}><input /></section>
}`,
					{
						'binding-styles': {
							create: (config: unknown) => config,
							props: (value: unknown) => value,
						},
					},
					{
						knownAttributeSpreads: [
							{
								source: 'binding-styles',
								imported: '*',
								members: ['props'],
								fields: ['className', 'style'],
								style: 'object',
							},
						],
					},
				);
				const projectedHost = document.createElement('div');
				container.append(projectedHost);
				projectedHost.innerHTML = projected.html;
				const serverNode = projectedHost.querySelector('section')!;
				const serverInput = serverNode.querySelector('input')!;
				expect(serverNode.style.getPropertyValue('--scale')).toBe('2');
				serverInput.value = 'early native edit';
				scale.set(3);
				if (!adopt) projectedHost.replaceChildren();
				const projectedHandle = adopt
					? projected.attach(serverNode, projected.state)
					: projected.mount({ parent: projectedHost }, projected.state);
				const projectedNode = projectedHost.querySelector('section')!;
				const projectedInput = projectedNode.querySelector('input')!;
				if (adopt) {
					expect(projectedNode).toBe(serverNode);
					expect(projectedInput).toBe(serverInput);
					expect(projectedInput.value).toBe('early native edit');
				}
				expect(projectedNode.className).toBe('scaled');
				expect(projectedNode.style.getPropertyValue('--scale')).toBe('3');
				projectedNode.style.setProperty('--external', 'preserved');
				scale.set(5);
				expect(projectedNode.style.getPropertyValue('--scale')).toBe('5');
				projected.publish({ scale: replacement });
				expect(projectedNode.style.getPropertyValue('--scale')).toBe('4');
				scale.set(6);
				expect(projectedNode.style.getPropertyValue('--scale')).toBe('4');
				replacement.set(null);
				expect(projectedNode.style.getPropertyValue('--scale')).toBe('');
				replacement.set(7);
				expect(projectedNode.style.getPropertyValue('--scale')).toBe('7');
				projected.publish({ enabled: false });
				expect(projectedNode.className).toBe('');
				expect(projectedNode.style.getPropertyValue('--scale')).toBe('');
				expect(projectedNode.style.getPropertyValue('--external')).toBe('preserved');
				replacement.set(8);
				expect(projectedNode.style.getPropertyValue('--scale')).toBe('');
				projected.publish({ enabled: true });
				expect(projectedNode.style.getPropertyValue('--scale')).toBe('8');
				expect(projectedNode.querySelector('input')).toBe(projectedInput);
				projectedHandle.dispose();
				replacement.set(9);
				projected.publish({ enabled: false });
				expect(projectedNode.style.getPropertyValue('--scale')).toBe('8');
				expect(projectedNode.className).toBe('scaled');
				expect(projected.cleanup).toHaveBeenCalledOnce();
			}
			for (const structural of [false, true, 'local-child'] as const) {
				for (const adopt of [false, true]) {
					const height$ = controlScope.signal$<unknown>(`projection-${structural}-${adopt}`, 2);
					const variant$ = controlScope.signal$(`projection-variant-${structural}-${adopt}`, 'dy');
					const replacement$ = controlScope.signal$<unknown>(
						`projection-replacement-${structural}-${adopt}`,
						10,
					);
					const rows = [
						{ id: 'a', height$ },
						{ id: 'b', height$: replacement$ },
					];
					const projected = authoredPresentation(
						'Projection',
						{ height$, rows, variant$ },
						dev,
						`import * as stylex from 'binding-styles';
const styles = stylex.create({ dy: (height) => ({
 className: height == null ? 'empty' : 'sized',
 style: { height },
 'data-style-src': height == null ? null : 'sized-source'
}), doubled: height => ({ className: 'double', style: { height: height * 2 } }) });
function ProjectionLeaf(props) @{
 <div sx={props.variant$ === "dy" ? styles.dy(props.height$) : styles.doubled(props.height$)}><input /></div>
}
function ProjectionRow(props) @{
 <ProjectionLeaf height$={props.height$} variant$={props.variant$} />
}
export function Projection(props) @{ 'use dom bindings';
 ${structural === 'local-child' ? '<section>@for (const row of props.rows; key row.id) { <ProjectionRow height$={row.height$} variant$={props.variant$} /> }</section>' : structural ? '<section>@for (const row of props.rows; key row.id) { <div sx={props.variant$ === "dy" ? styles.dy(row.height$) : styles.doubled(row.height$)}><input /></div> }</section>' : '<div sx={props.variant$ === "dy" ? styles.dy(props.height$) : styles.doubled(props.height$)}><input /></div>'}
}`,
						{
							'binding-styles': {
								create: (config: unknown) => config,
								props: (value: unknown) => value,
							},
						},
						{
							knownAttributeSpreads: [
								{
									source: 'binding-styles',
									imported: '*',
									members: ['props'],
									fields: ['className', 'style', 'data-style-src'],
									style: 'object',
									jsxAttribute: 'sx',
								},
							],
						},
					);
					const projectionHost = document.createElement('div');
					container.append(projectionHost);
					projectionHost.innerHTML = projected.html;
					const serverNode = projectionHost.querySelector('div')!;
					expect(serverNode.style.height).toBe('2px');
					height$.set(3);
					if (!adopt) projectionHost.replaceChildren();
					const handle = adopt
						? projected.attach(projectionHost.firstElementChild!, projected.state)
						: projected.mount({ parent: projectionHost }, projected.state);
					const node = projectionHost.querySelector('div')!;
					const input = node.querySelector('input')!;
					const retiredNode = structural ? projectionHost.querySelectorAll('div')[1]! : null;
					if (adopt) expect(node).toBe(serverNode);
					expect(node.style.height).toBe('3px');
					height$.set(null);
					expect([node.className, node.style.height, node.getAttribute('data-style-src')]).toEqual([
						'empty',
						'',
						null,
					]);
					height$.set(4);
					expect([node.className, node.style.height, node.getAttribute('data-style-src')]).toEqual([
						'sized',
						'4px',
						'sized-source',
					]);
					variant$.set('doubled');
					expect([node.className, node.style.height]).toEqual(['double', '8px']);
					variant$.set('dy');
					expect([node.className, node.style.height]).toEqual(['sized', '4px']);
					if (structural) {
						projected.publish({ rows: [rows[1]!, rows[0]!] });
						expect(projectionHost.querySelectorAll('div')[1]).toBe(node);
						projected.publish({ rows: [{ id: 'a', height$: replacement$ }] });
					} else projected.publish({ height$: replacement$ });
					expect(node.style.height).toBe('10px');
					height$.set(99);
					expect(node.style.height).toBe('10px');
					expect(node.querySelector('input')).toBe(input);
					replacement$.set(null);
					if (retiredNode) expect(retiredNode.style.height).toBe('10px');
					const disposed = node.outerHTML;
					handle.dispose();
					replacement$.set(11);
					expect(node.outerHTML).toBe(disposed);
					const rebound = projected.attach(projectionHost.firstElementChild!, projected.state);
					expect(node.style.height).toBe('11px');
					replacement$.set(null);
					const accepted = node.outerHTML;
					expect(() =>
						replacement$.set({
							toString() {
								throw new Error('projection style rejected');
							},
						}),
					).toThrow('projection style rejected');
					// A later field failing must not publish the new class first.
					expect(node.outerHTML).toBe(accepted);
					replacement$.set(42);
					expect(node.outerHTML).toBe(accepted);
					rebound.dispose();
					expect(projected.cleanup).toHaveBeenCalledTimes(2);
				}
			}
			for (const reversed of [false, true]) {
				const projected = authoredPresentation(
					'DynamicStyles',
					{ inlineStart: '20px', blockStart: '30px', message: 'Uploading' },
					dev,
					`import * as styles from 'binding-styles';
export function DynamicStyles(props) @{ 'use dom bindings'; <section {...styles.attrs(${reversed ? 'noticeStyles.position(props.inlineStart, props.blockStart), noticeStyles.notice' : 'noticeStyles.notice, noticeStyles.position(props.inlineStart, props.blockStart)'})}>{props.message as string}</section> }
const noticeStyles = styles.create({
  notice: { class: 'notice', style: 'left:1px;top:2px' },
  position: (inlineStart, blockStart) => ({ class: 'position', style: 'left:' + inlineStart + ';top:' + blockStart }),
});`,
					{
						'binding-styles': {
							create: (config: unknown) => config,
							attrs: (...values: Array<{ class: string; style: string }>) => ({
								class: values.map((value) => value.class).join(' '),
								style: values.map((value) => value.style).join(';'),
							}),
						},
					},
					{
						knownAttributeSpreads: [
							{
								source: 'binding-styles',
								imported: '*',
								members: ['attrs'],
								fields: ['class', 'style'],
							},
						],
					},
				);
				for (const mount of [false, true]) {
					const projectedHost = document.createElement('div');
					container.append(projectedHost);
					projected.publish({ inlineStart: '20px', blockStart: '30px', message: 'Uploading' });
					if (!mount) projectedHost.innerHTML = projected.html;
					const serverNode = projectedHost.firstElementChild;
					const projectedHandle = mount
						? projected.mount({ parent: projectedHost }, projected.state)
						: projected.attach(serverNode!, projected.state);
					const projectedNode = projectedHost.querySelector('section')!;
					if (!mount) expect(projectedNode).toBe(serverNode);
					expect(projectedNode.className).toBe(reversed ? 'position notice' : 'notice position');
					expect(projectedNode.style.left).toBe(reversed ? '1px' : '20px');
					expect(projectedNode.style.top).toBe(reversed ? '2px' : '30px');
					projected.publish({ inlineStart: '40px', blockStart: '50px', message: 'Done' });
					expect(projectedNode.textContent).toBe('Done');
					expect(projectedNode.style.left).toBe(reversed ? '1px' : '40px');
					expect(projectedNode.style.top).toBe(reversed ? '2px' : '50px');
					expect(projectedHost.firstElementChild).toBe(projectedNode);
					projectedHandle.dispose();
					projected.publish({ inlineStart: '60px', blockStart: '70px', message: 'Disposed' });
					expect(projectedNode.textContent).toBe('Done');
				}
			}
			const viewport = authoredPresentation<{ height: string | undefined; message: string }>(
				'ViewportProperties',
				{ height: '20px', message: 'Initial' },
				dev,
				`import { viewportProperties } from 'binding-tokens';
export function ViewportProperties(props) @{ 'use dom bindings'; <section style={{ [viewportProperties.height.slice(4, -1)]: props.height }}>{props.message as string}</section> }`,
				{ 'binding-tokens': { viewportProperties: { height: 'var(--viewport-height)' } } },
			);
			for (const mount of [false, true]) {
				const viewportHost = document.createElement('div');
				container.append(viewportHost);
				viewport.publish({ height: '20px', message: 'Initial' });
				if (!mount) viewportHost.innerHTML = viewport.html;
				const serverNode = viewportHost.querySelector('section');
				serverNode?.style.setProperty('--external', 'preserved');
				const viewportHandle = mount
					? viewport.mount({ parent: viewportHost }, viewport.state)
					: viewport.attach(serverNode!, viewport.state);
				const viewportNode = viewportHost.querySelector('section')!;
				if (!mount) expect(viewportNode).toBe(serverNode);
				expect(viewportNode.style.getPropertyValue('--viewport-height')).toBe('20px');
				viewportNode.style.setProperty('--external', 'preserved');
				viewport.publish({ height: '40px', message: 'Updated' });
				expect(viewportNode.style.getPropertyValue('--viewport-height')).toBe('40px');
				expect(viewportNode.style.getPropertyValue('--external')).toBe('preserved');
				expect(viewportNode.textContent).toBe('Updated');
				viewport.publish({ height: undefined });
				expect(viewportNode.style.getPropertyValue('--viewport-height')).toBe('');
				expect(viewportNode.style.getPropertyValue('--external')).toBe('preserved');
				viewportHandle.dispose();
				viewport.publish({ height: '60px', message: 'Disposed' });
				expect(viewportNode.style.getPropertyValue('--viewport-height')).toBe('');
				expect(viewportNode.textContent).toBe('Updated');
			}
			for (const configuration of [
				'position: async (value) => ({ left: value })',
				'position: (value) => { return { left: value }; }',
				'position: (value) => ({ left: value++ })',
				'position: (value) => ({ left: (value.left = 1) })',
				'position: () => ({ left: document.title })',
				'position: () => ({ left: this.value })',
				'position: () => ({ left: import.meta.url })',
				"position: () => import('never-load-this-module')",
				'position: () => ({ left: useMemo(() => 1) })',
				'position: (value) => ({ left: value.save() })',
				'position: (value) => ({ get left() { return value; } })',
				'get position() { return (value) => ({ left: value }); }',
				'position: (value = 1) => ({ left: value })',
				'position: (...values) => ({ left: values[0] })',
				'position: styles.wrap((value) => ({ left: value }))',
				'__proto__: (value) => ({ left: value })',
				'position: { left: 1 }',
				'other: (value) => ({ left: value })',
			]) {
				for (const mode of ['client', 'server'] as const) {
					expect(() =>
						loadCompiledFixtureSource(
							`import * as styles from 'binding-styles'; import { useMemo } from 'octane';
const noticeStyles = styles.create({ ${configuration} });
export function Invalid(props) @{ 'use dom bindings'; <section style={noticeStyles.${configuration.startsWith('__proto__:') ? '__proto__' : 'position'}(props.value)} /> }`,
							{
								id: '/src/invalid-projection-factory.tsrx',
								mode,
								compileOptions: { dev, hmr: false },
							},
						),
					).toThrow(/Octane DOM bindings/);
				}
			}
			const aliases = { marginLeft: '2px', margin: '1px', 'margin-left': '3px' };
			const canonicalStyle = document.createElement('section');
			const margins = (element: HTMLElement) => [
				element.style.marginTop,
				element.style.marginRight,
				element.style.marginBottom,
				element.style.marginLeft,
			];
			setStyle(canonicalStyle, aliases, null);
			expect(canonicalStyle.style.marginLeft).toBe('3px');
			for (const view of ['WholeStylePresentation', 'SpreadStylePresentation']) {
				for (const mount of [false, true]) {
					const aliasFixture = authoredPresentation<Record<string, unknown>>(
						view,
						view === 'WholeStylePresentation'
							? { styles: aliases }
							: {
									base: { marginLeft: '2px' },
									left,
									extra: { margin: '1px', 'margin-left': '3px' },
								},
						dev,
					);
					const aliasHost = document.createElement('div');
					container.append(aliasHost);
					if (!mount) aliasHost.innerHTML = aliasFixture.html;
					const serverNode = aliasHost.querySelector('section');
					// Preserve actual SSR declaration order; jsdom's CSS text parser
					// collapses repeated longhands around a shorthand differently from
					// native setProperty, so compare the projected state below.
					if (serverNode)
						expect(serverNode.getAttribute('style')).toMatch(
							/margin-left:2px;.*margin:1px;margin-left:3px;/,
						);
					const aliasHandle = mount
						? aliasFixture.mount({ parent: aliasHost }, aliasFixture.state)
						: aliasFixture.attach(serverNode!, aliasFixture.state);
					const aliasNode = aliasHost.querySelector('section')!;
					expect(margins(aliasNode)).toEqual(margins(canonicalStyle));
					if (serverNode) expect(aliasNode).toBe(serverNode);
					if (view === 'WholeStylePresentation') {
						aliasFixture.publish({ styles: 'margin: 9px' });
						expect(aliasNode.style.marginLeft).toBe('9px');
						aliasFixture.publish({ styles: aliases });
						expect(margins(aliasNode)).toEqual(margins(canonicalStyle));
					}
					aliasHandle.dispose();
					aliasNode.style.cssText = 'margin: 7px !important';
					const restored = aliasFixture.attach(aliasNode, aliasFixture.state, {
						restoreStyles: true,
					});
					expect(margins(aliasNode)).toEqual(margins(canonicalStyle));
					aliasNode.style.color = 'red';
					restored.dispose();
					expect(margins(aliasNode)).toEqual(['7px', '7px', '7px', '7px']);
					expect(aliasNode.style.getPropertyPriority('margin')).toBe('important');
					expect(aliasNode.style.color).toBe('red');
					const throwingRestore = aliasFixture.attach(aliasNode, aliasFixture.state, {
						restoreStyles: true,
					});
					const restoreFailure = new Error('first style restoration failed');
					const setProperty = aliasNode.style.setProperty.bind(aliasNode.style);
					const failFirstRestore = vi
						.spyOn(aliasNode.style, 'setProperty')
						.mockImplementation((name, value, priority) => {
							if (name === 'margin-left') throw restoreFailure;
							setProperty(name, value, priority);
						});
					try {
						expect(() => throwingRestore.dispose()).toThrow(restoreFailure);
						expect(aliasNode.style.marginTop).toBe('7px');
						expect(aliasNode.style.color).toBe('red');
					} finally {
						failFirstRestore.mockRestore();
					}
				}
			}
			styled.style.cssText = 'left: 5px !important; opacity: 0.8';
			style.publish({ styles: { left, opacity: 0.4 } }, false);
			const restoringStyle = style.attach(styled, style.state, { restoreStyles: true });
			expect(styled.style.left).toBe('15px');
			styled.style.opacity = '0.9';
			restoringStyle.dispose();
			expect(styled.style.left).toBe('5px');
			expect(styled.style.getPropertyPriority('left')).toBe('important');
			expect(styled.style.opacity).toBe('0.9');
			const failedStyle = controlScope.signal$<unknown>('failed-style', { left: 17 });
			style.publish({ styles: failedStyle }, false);
			const failingStyle = style.attach(styled, style.state);
			const beforeStyle = styled.getAttribute('style');
			expect(() =>
				failedStyle.set({
					get left() {
						throw new Error('style read failed');
					},
				}),
			).toThrow('style read failed');
			expect(styled.getAttribute('style')).toBe(beforeStyle);
			failedStyle.set({ left: 99 });
			expect(styled.getAttribute('style')).toBe(beforeStyle);
			failingStyle.dispose();

			const string = authoredPresentation(
				'StringProjectionPresentation',
				{ account: { name: '  alice  ' }, identifier: 'bob' },
				dev,
			);
			styleHost.innerHTML = string.html;
			const initial = styleHost.querySelector('span')!;
			expect(initial.title).toBe('A');
			const stringHandle = string.attach(initial, string.state);
			string.publish({ account: { name: '   ' } });
			expect(initial.title).toBe('B');
			stringHandle.dispose();
			const childSource = readFileSync(
				'packages/octane/tests/_fixtures/dom-presentation-child.tsrx',
				'utf8',
			);
			const childOptions = {
				compileOptions: { dev, hmr: false },
				runtimeModules: {
					'octane/dom-bindings': DomBindings,
					'octane/dom-binding-program': DomBindingPrograms,
					'octane/dom-binding-controls': DomBindingControls,
					'octane/dom-binding-styles': DomBindingStyles,
					'octane/dom-binding-signals': DomBindingSignals,
				},
			};
			const childServer = loadCompiledFixtureSource(childSource, {
				...childOptions,
				id: '/src/dom-presentation-child.tsrx',
				mode: 'server',
			});
			const childRequest = `?octane-bindings=ControlStyleChild&octane-mount=1&octane-props=${encodeURIComponent(JSON.stringify([1, ['draft', 'styles']]))}`;
			const childProgram = loadCompiledFixtureSource(childSource, {
				...childOptions,
				id: '/src/dom-presentation-child.tsrx' + childRequest,
				mode: 'client',
			});
			const imported = authoredPresentation(
				'ImportedControlStylePresentation',
				{ draft, styles: { left } },
				dev,
				readFileSync('packages/octane/tests/_fixtures/dom-presentation-imported.tsrx', 'utf8'),
				{
					'./dom-presentation-child.tsrx': childServer,
					['./dom-presentation-child.tsrx' + childRequest]: childProgram,
				},
			);
			styleHost.innerHTML = imported.html;
			const importedRoot = styleHost.querySelector('section')!;
			const importedInput = importedRoot.querySelector('input')!;
			const importedHandle = imported.attach(importedRoot, imported.state);
			draft.set('imported control');
			left.set(19);
			expect(importedInput.value).toBe('imported control');
			expect(importedInput.style.left).toBe('19px');
			expect(importedRoot.querySelector('input')).toBe(importedInput);
			importedHandle.dispose();
			expect(() =>
				loadCompiledFixtureSource(
					`export function Invalid(props) @{ 'use dom bindings'; <span title={(props.account.save() || props.identifier).slice(0, 1).toUpperCase() as string} /> }`,
					{
						id: '/src/invalid-string-chain.tsrx?octane-bindings=Invalid',
						mode: 'client',
						compileOptions: { dev, hmr: false },
					},
				),
			).toThrow(/calls in bindings must be imported pure projections/);
			expect(() =>
				loadCompiledFixtureSource(
					`export function Invalid(props) @{ 'use dom bindings'; <input type={props.type} checked={props.checked} /> }`,
					{
						id: '/src/invalid-checked-host.tsrx?octane-bindings=Invalid',
						mode: 'client',
						compileOptions: { dev, hmr: false },
					},
				),
			).toThrow(/"type" must be static or explicitly unbound/);
			controlScope.dispose();
		});
	}

	it('requires explicit root replacement and releases the previous root exactly once', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const button = container.firstElementChild!;
		const cleanup = vi.fn();
		const previous = attach();
		const registration = previous.registerBehavior({
			target: '[data-action]',
			adopt: () => cleanup,
		});
		await registration.ready;

		expect(() => attachBehaviorRoot(container)).toThrow(/conflict|root|replace|already/i);
		const replacement = attach(container, { replace: true });

		expect(previous.signal.aborted).toBe(true);
		expect(registration.signal.aborted).toBe(true);
		expect(replacement.signal.aborted).toBe(false);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.firstElementChild).toBe(button);
	});

	it('scopes root and ownership identity to each document and rejects cross-document ranges', async () => {
		container.innerHTML = '<section><button data-action>Local</button></section>';
		const localRange = container.firstElementChild!;
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		try {
			const foreignDocument = iframe.contentDocument!;
			const foreignContainer = foreignDocument.createElement('main');
			foreignContainer.innerHTML = '<section><button data-action>Foreign</button></section>';
			foreignDocument.body.appendChild(foreignContainer);
			const foreignRange = foreignContainer.firstElementChild!;
			const owner = { name: 'document-scoped' };
			const localAdoption = vi.fn();
			const foreignAdoption = vi.fn();
			const localRoot = attach();
			const foreignRoot = attach(foreignContainer);
			localRoot.registerExternalRange(localRange, { owner });
			foreignRoot.registerExternalRange(foreignRange, { owner });
			const localBehavior = localRoot.registerBehavior({
				id: 'document-action',
				owner,
				target: '[data-action]',
				adopt: localAdoption,
			});
			const foreignBehavior = foreignRoot.registerBehavior({
				id: 'document-action',
				owner,
				target: '[data-action]',
				adopt: foreignAdoption,
			});
			await Promise.all([localBehavior.ready, foreignBehavior.ready]);

			expect(localAdoption.mock.calls[0][0]).toBe(localRange.firstElementChild);
			expect(foreignAdoption.mock.calls[0][0]).toBe(foreignRange.firstElementChild);
			expect(() => localRoot.registerExternalRange(foreignRange, { owner })).toThrow(
				/document|container|range|belong/i,
			);
			expect(() => foreignRoot.registerExternalRange(localRange, { owner })).toThrow(
				/document|container|range|belong/i,
			);
		} finally {
			iframe.remove();
		}
	});

	it('adds behavior to permanent-static SSR DOM without claiming surrounding hydration', async () => {
		const onStaticRender = vi.fn();
		container.innerHTML = renderToString(staticServer.PermanentExternallyPatched, {
			html: '<button id="server-action" data-action>Server action</button>',
			label: 'Server label',
		}).html;
		const range = container.querySelector('#server-owned-range')!;
		const button = range.querySelector('#server-action')!;
		const owner = { name: 'server-stream' };
		const handled = vi.fn();
		const root = attach();
		root.registerExternalRange(range, { owner });
		const behavior = root.registerBehavior({
			owner,
			target: '[data-action]',
			events: ['click'],
			adopt() {},
			handleEvent: handled,
		});
		await behavior.ready;

		hydratedRoot = hydrateRoot(container, staticClient.PermanentExternallyPatched, {
			html: '<p>Client must not reconcile externally owned markup</p>',
			label: 'Server label',
			onStaticRender,
		});
		flushSync(() => {});
		flushEffects();
		const first = new MouseEvent('click', { bubbles: true });
		button.dispatchEvent(first);

		const inserted = document.createElement('button');
		inserted.id = 'streamed-action';
		inserted.setAttribute('data-action', '');
		range.appendChild(inserted);
		flushSync(() =>
			hydratedRoot!.render(staticClient.PermanentExternallyPatched, {
				html: '<p>Updated client content must not own the range</p>',
				label: 'Updated label',
				onStaticRender,
			}),
		);
		flushEffects();
		const second = new MouseEvent('click', { bubbles: true });
		inserted.dispatchEvent(second);

		expect(container.querySelector('#server-owned-range')).toBe(range);
		expect(range.querySelector('#server-action')).toBe(button);
		expect(range.querySelector('#streamed-action')).toBe(inserted);
		expect(container.querySelector('#server-owned-live-label')?.textContent).toBe('Updated label');
		expect(handled.mock.calls.map(([event]) => event)).toEqual([first, second]);
		expect(onStaticRender).not.toHaveBeenCalled();

		root.dispose();
		expect(range.querySelector('#server-action')).toBe(button);
		expect(range.querySelector('#streamed-action')).toBe(inserted);
	});

	it('adopts permanent-static markup produced by standards-based ReadableStream SSR', async () => {
		const stream = await renderToReadableStream(staticServer.PermanentExternallyPatched, {
			html: '<button id="readable-action" data-action>Streamed action</button>',
			label: 'Readable stream label',
		});
		container.innerHTML = await new Response(stream).text();
		const range = container.querySelector('#server-owned-range')!;
		const button = container.querySelector('#readable-action')!;
		const owner = { name: 'readable-stream-owner' };
		const handled = vi.fn();
		const root = attach();
		root.registerExternalRange(range, { owner });
		const behavior = root.registerBehavior({
			owner,
			target: '[data-action]',
			events: ['click'],
			adopt() {},
			handleEvent: handled,
		});
		await behavior.ready;

		const interaction = new MouseEvent('click', { bubbles: true });
		button.dispatchEvent(interaction);

		expect(handled).toHaveBeenCalledOnce();
		expect(handled.mock.calls[0][0]).toBe(interaction);
		expect(handled.mock.calls[0][1]).toBe(button);
		expect(container.querySelector('#server-owned-range')).toBe(range);
		expect(range.firstElementChild).toBe(button);
		expect(container.querySelector('#server-owned-live-label')?.textContent).toBe(
			'Readable stream label',
		);
	});
});
