/**
 * React server-integration's render matrix expressed through Octane's public
 * client, server, streaming, and hydration APIs.
 *
 * Fixtures are imported normally for the client and loaded with
 * `loadServerFixture()` for the server. Each registered mode is an independent
 * test so failures and cleanup remain isolated. Assertions receive parsed DOM,
 * public render results, diagnostics, and explicitly captured pre-hydration
 * state; renderer markers and other private protocol details stay out of the
 * contract.
 */
import { expect, it, vi } from 'vitest';
import * as ClientRuntime from '../../../src/index.js';
import type { Root, RootOptions } from '../../../src/index.js';
import * as ServerRuntime from 'octane/server';
import type { RenderOptions, StreamOptions } from 'octane/server';
import { prerender } from 'octane/static';
import {
	collectPipeableStream,
	collectReadableStream,
	type CollectedServerStream,
} from '../../_server-stream.js';

/** Exact public mode names accepted by the React-conformance ledger. */
export type RenderMode =
	| 'client'
	| 'server-string'
	| 'server-stream'
	| 'hydrate-match'
	| 'hydrate-mismatch'
	| 'production-compile';

/** Production compilation is supplied by the octane-prod Vitest project. */
export type MatrixRenderMode = Exclude<RenderMode, 'production-compile'>;

export type BufferedRenderVariant = 'renderToString' | 'renderToStaticMarkup' | 'prerender';
export type StreamRenderVariant = 'renderToPipeableStream' | 'renderToReadableStream';
export type RenderVariant =
	'createRoot' | BufferedRenderVariant | StreamRenderVariant | 'hydrateRoot';
export type RenderSide = 'client' | 'server';

type FixtureModule = Record<string, any>;
type ComponentName<Module extends FixtureModule> = Extract<keyof Module, string>;
type SharedComponentName<
	ClientModule extends FixtureModule,
	ServerModule extends FixtureModule,
> = Extract<ComponentName<ClientModule>, ComponentName<ServerModule>>;

export interface RenderCaseContext<State> {
	mode: MatrixRenderMode;
	variant: RenderVariant;
	side: RenderSide;
	state: State;
}

export interface HydrationPreparationContext<State, ServerProps, ClientProps> {
	mode: 'hydrate-match' | 'hydrate-mismatch';
	state: State;
	serverProps: ServerProps;
	clientProps: ClientProps;
	serverHtml: string;
	css: string;
}

export interface RenderObservation<State, ServerProps, ClientProps, Capture> {
	mode: MatrixRenderMode;
	variant: RenderVariant;
	/** Parsed server markup or the live client/hydration container. */
	root: ParentNode;
	container: HTMLElement;
	/** Raw server response for server modes; live container HTML for client/hydration. */
	html: string;
	/** Original hydratable server response for hydration modes. */
	serverHtml?: string;
	/** Buffered scoped-style result. Streaming styles are part of `html`. */
	css: string;
	/** Transport chunks for streaming modes, in acceptance order. */
	chunks: readonly string[];
	/** Errors reported through the public streaming `onError` callback. */
	streamErrors: readonly unknown[];
	/** Live root for client and hydration assertions. */
	octaneRoot?: Root;
	/** Value explicitly captured before hydrateRoot ran. */
	before?: Capture;
	state: State;
	serverProps?: ServerProps;
	clientProps?: ClientProps;
	/** Console errors published during hydration. */
	diagnostics: readonly string[];
}

export type HydrationDiagnosticExpectation<Observation> =
	| 'none'
	| 'hydration-mismatch'
	| ((diagnostics: readonly string[], observation: Observation) => void | Promise<void>);

export interface HydrationProps<
	State,
	ServerProps,
	ClientProps,
	ClientModule extends FixtureModule,
	ServerModule extends FixtureModule,
> {
	serverComponent?: ComponentName<ServerModule>;
	clientComponent?: ComponentName<ClientModule>;
	serverProps?: (context: RenderCaseContext<State>) => ServerProps;
	clientProps?: (context: RenderCaseContext<State>) => ClientProps;
}

export interface HydrationMismatch<
	State,
	ServerProps,
	ClientProps,
	Capture,
	ClientModule extends FixtureModule,
	ServerModule extends FixtureModule,
> extends HydrationProps<State, ServerProps, ClientProps, ClientModule, ServerModule> {
	/** Optional realistic server-DOM mutation before hydration. */
	mutateServerDom?: (
		container: HTMLElement,
		context: HydrationPreparationContext<State, ServerProps, ClientProps>,
	) => void | Promise<void>;
	diagnostics?: HydrationDiagnosticExpectation<
		RenderObservation<State, ServerProps, ClientProps, Capture>
	>;
}

export interface ServerRenderMatrixCase<
	State,
	ServerProps,
	ClientProps,
	Capture,
	ClientModule extends FixtureModule,
	ServerModule extends FixtureModule,
> {
	component: SharedComponentName<ClientModule, ServerModule>;
	clientComponent?: ComponentName<ClientModule>;
	serverComponent?: ComponentName<ServerModule>;
	/** Defaults to the five public modes when `mismatch` exists, otherwise four. */
	modes?: readonly MatrixRenderMode[];
	/** New state for each independently executed API variant. */
	createState?: () => State | Promise<State>;
	/** Fresh props for every side/API; defaults to undefined. */
	props?: (context: RenderCaseContext<State>) => ServerProps | ClientProps;
	/** Optional distinct props/components for matching hydration. */
	hydrateMatch?: HydrationProps<State, ServerProps, ClientProps, ClientModule, ServerModule>;
	/** Required when `hydrate-mismatch` is enabled. */
	mismatch?: HydrationMismatch<
		State,
		ServerProps,
		ClientProps,
		Capture,
		ClientModule,
		ServerModule
	>;
	/** Exact diagnostics expected for either hydration lane. */
	clientDiagnostics?: HydrationDiagnosticExpectation<
		RenderObservation<State, ServerProps, ClientProps, Capture>
	>;
	hydrationDiagnostics?: Partial<
		Record<
			'hydrate-match' | 'hydrate-mismatch',
			HydrationDiagnosticExpectation<RenderObservation<State, ServerProps, ClientProps, Capture>>
		>
	>;
	/** `renderToString` by default; opt into APIs with distinct semantics. */
	bufferedVariants?: readonly BufferedRenderVariant[];
	/** `renderToPipeableStream` by default. */
	streamVariants?: readonly StreamRenderVariant[];
	createContainer?: () => HTMLElement;
	/** Connect the container for focus/layout/event cases. */
	attachContainer?: boolean;
	renderOptions?:
		RenderOptions | ((context: RenderCaseContext<State>) => RenderOptions | undefined);
	streamOptions?:
		StreamOptions | ((context: RenderCaseContext<State>) => StreamOptions | undefined);
	rootOptions?: RootOptions | ((context: RenderCaseContext<State>) => RootOptions | undefined);
	prepareBeforeHydrate?: (
		container: HTMLElement,
		context: HydrationPreparationContext<State, ServerProps, ClientProps>,
	) => void | Promise<void>;
	captureBeforeHydrate?: (
		container: HTMLElement,
		context: HydrationPreparationContext<State, ServerProps, ClientProps>,
	) => Capture | Promise<Capture>;
	/** Shared public-behavior oracle, run before any mode-specific oracle. */
	assert?: (
		observation: RenderObservation<State, ServerProps, ClientProps, Capture>,
	) => void | Promise<void>;
	/** Descriptive alias for `assert`; both run when supplied. */
	assertCommon?: (
		observation: RenderObservation<State, ServerProps, ClientProps, Capture>,
	) => void | Promise<void>;
	assertByMode?: Partial<
		Record<
			MatrixRenderMode,
			(
				observation: RenderObservation<State, ServerProps, ClientProps, Capture>,
			) => void | Promise<void>
		>
	>;
}

export interface CreateServerRenderMatrixOptions<
	ClientModule extends FixtureModule,
	ServerModule extends FixtureModule,
> {
	clientModule: ClientModule;
	serverModule: ServerModule;
	createContainer?: () => HTMLElement;
}

export interface ServerRenderMatrix<
	ClientModule extends FixtureModule,
	ServerModule extends FixtureModule,
> {
	itRenders<State = undefined, ServerProps = undefined, ClientProps = ServerProps, Capture = never>(
		title: string,
		spec: ServerRenderMatrixCase<
			State,
			ServerProps,
			ClientProps,
			Capture,
			ClientModule,
			ServerModule
		>,
	): void;
}

const DEFAULT_MODES = [
	'client',
	'server-string',
	'server-stream',
	'hydrate-match',
] as const satisfies readonly MatrixRenderMode[];

const MODE_LABEL: Record<MatrixRenderMode, string> = {
	client: 'clean client render',
	'server-string': 'server string render',
	'server-stream': 'server stream render',
	'hydrate-match': 'client render on matching server markup',
	'hydrate-mismatch': 'client recovery on mismatched server markup',
};

function createState<State>(
	spec: ServerRenderMatrixCase<State, any, any, any, any, any>,
): State | Promise<State> {
	return spec.createState === undefined ? (undefined as State) : spec.createState();
}

function makeContainer<State>(
	spec: ServerRenderMatrixCase<State, any, any, any, any, any>,
	fallback?: () => HTMLElement,
): HTMLElement {
	const container = spec.createContainer?.() ?? fallback?.() ?? document.createElement('div');
	if (spec.attachContainer && !container.isConnected) document.body.appendChild(container);
	return container;
}

function optionValue<State, Value>(
	option: Value | ((context: RenderCaseContext<State>) => Value | undefined) | undefined,
	context: RenderCaseContext<State>,
): Value | undefined {
	return typeof option === 'function'
		? (option as (context: RenderCaseContext<State>) => Value | undefined)(context)
		: option;
}

function componentOf(module: FixtureModule, name: string, side: RenderSide): any {
	const component = module[name];
	if (typeof component !== 'function') {
		throw new Error(`Missing ${side} fixture component ${JSON.stringify(name)}.`);
	}
	return component;
}

function propsFor<State, Props>(
	factory: ((context: RenderCaseContext<State>) => Props) | undefined,
	fallback: ((context: RenderCaseContext<State>) => unknown) | undefined,
	context: RenderCaseContext<State>,
): Props {
	return (factory === undefined ? fallback?.(context) : factory(context)) as Props;
}

function consoleMessages(spy: ReturnType<typeof vi.spyOn>): string[] {
	return spy.mock.calls.map((call: any[]) => call.map(String).join(' '));
}

async function assertDiagnostics<Observation>(
	expectation: HydrationDiagnosticExpectation<Observation>,
	diagnostics: readonly string[],
	observation: Observation,
): Promise<void> {
	if (typeof expectation === 'function') {
		await expectation(diagnostics, observation);
		return;
	}
	const mismatches = diagnostics.filter((message) => message.includes('hydration mismatch'));
	const unrelated = diagnostics.filter((message) => !message.includes('hydration mismatch'));
	expect(unrelated).toEqual([]);
	if (expectation === 'none' || process.env.OCTANE_TEST_COMPILE_MODE === 'prod') {
		expect(mismatches).toEqual([]);
	} else {
		expect(mismatches.length).toBeGreaterThan(0);
	}
}

async function assertObservation<State, ServerProps, ClientProps, Capture>(
	spec: ServerRenderMatrixCase<State, ServerProps, ClientProps, Capture, any, any>,
	observation: RenderObservation<State, ServerProps, ClientProps, Capture>,
): Promise<void> {
	await spec.assert?.(observation);
	await spec.assertCommon?.(observation);
	await spec.assertByMode?.[observation.mode]?.(observation);
}

export function createServerRenderMatrix<
	ClientModule extends FixtureModule,
	ServerModule extends FixtureModule,
>(
	options: CreateServerRenderMatrixOptions<ClientModule, ServerModule>,
): ServerRenderMatrix<ClientModule, ServerModule> {
	async function runClient<State, ServerProps, ClientProps, Capture>(
		spec: ServerRenderMatrixCase<
			State,
			ServerProps,
			ClientProps,
			Capture,
			ClientModule,
			ServerModule
		>,
	): Promise<void> {
		const state = await createState(spec);
		const context: RenderCaseContext<State> = {
			mode: 'client',
			variant: 'createRoot',
			side: 'client',
			state,
		};
		const props = propsFor<State, ClientProps>(undefined, spec.props, context);
		const container = makeContainer(spec, options.createContainer);
		const error =
			spec.clientDiagnostics === undefined
				? undefined
				: vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: Root | undefined;
		try {
			root = ClientRuntime.createRoot(container, optionValue(spec.rootOptions, context));
			root.render(
				componentOf(options.clientModule, String(spec.clientComponent ?? spec.component), 'client'),
				props,
			);
			ClientRuntime.flushSync(() => {});
			const diagnostics = error === undefined ? [] : consoleMessages(error);
			const observation: RenderObservation<State, ServerProps, ClientProps, Capture> = {
				mode: 'client',
				variant: 'createRoot',
				root: container,
				container,
				html: container.innerHTML,
				css: '',
				chunks: [],
				streamErrors: [],
				octaneRoot: root,
				state,
				clientProps: props,
				diagnostics,
			};
			await assertObservation<State, ServerProps, ClientProps, Capture>(spec, observation);
			if (spec.clientDiagnostics !== undefined) {
				await assertDiagnostics(spec.clientDiagnostics, diagnostics, observation);
			}
		} finally {
			root?.unmount();
			error?.mockRestore();
			container.remove();
		}
	}

	async function runBuffered<State, ServerProps, ClientProps, Capture>(
		spec: ServerRenderMatrixCase<
			State,
			ServerProps,
			ClientProps,
			Capture,
			ClientModule,
			ServerModule
		>,
	): Promise<void> {
		for (const variant of spec.bufferedVariants ?? ['renderToString']) {
			const state = await createState(spec);
			const context: RenderCaseContext<State> = {
				mode: 'server-string',
				variant,
				side: 'server',
				state,
			};
			const props = propsFor<State, ServerProps>(undefined, spec.props, context);
			const component = componentOf(
				options.serverModule,
				String(spec.serverComponent ?? spec.component),
				'server',
			);
			const renderOptions = optionValue(spec.renderOptions, context);
			const result =
				variant === 'renderToString'
					? ServerRuntime.renderToString(component, props, renderOptions)
					: variant === 'renderToStaticMarkup'
						? ServerRuntime.renderToStaticMarkup(component, props, renderOptions)
						: await prerender(component, props, renderOptions);
			const container = makeContainer(spec, options.createContainer);
			try {
				container.innerHTML = result.html;
				await assertObservation<State, ServerProps, ClientProps, Capture>(spec, {
					mode: 'server-string',
					variant,
					root: container,
					container,
					html: result.html,
					css: result.css,
					chunks: [],
					streamErrors: [],
					state,
					serverProps: props,
					diagnostics: [],
				});
			} finally {
				container.remove();
			}
		}
	}

	async function runStream<State, ServerProps, ClientProps, Capture>(
		spec: ServerRenderMatrixCase<
			State,
			ServerProps,
			ClientProps,
			Capture,
			ClientModule,
			ServerModule
		>,
	): Promise<void> {
		for (const variant of spec.streamVariants ?? ['renderToPipeableStream']) {
			const state = await createState(spec);
			const context: RenderCaseContext<State> = {
				mode: 'server-stream',
				variant,
				side: 'server',
				state,
			};
			const props = propsFor<State, ServerProps>(undefined, spec.props, context);
			const component = componentOf(
				options.serverModule,
				String(spec.serverComponent ?? spec.component),
				'server',
			);
			const streamOptions =
				optionValue(spec.streamOptions, context) ?? optionValue(spec.renderOptions, context);
			const result: CollectedServerStream =
				variant === 'renderToPipeableStream'
					? await collectPipeableStream(component, props, streamOptions)
					: await collectReadableStream(component, props, streamOptions);
			const container = makeContainer(spec, options.createContainer);
			try {
				container.innerHTML = result.html;
				await assertObservation<State, ServerProps, ClientProps, Capture>(spec, {
					mode: 'server-stream',
					variant,
					root: container,
					container,
					html: result.html,
					css: '',
					chunks: result.chunks,
					streamErrors: result.errors,
					state,
					serverProps: props,
					diagnostics: [],
				});
			} finally {
				container.remove();
			}
		}
	}

	async function runHydration<State, ServerProps, ClientProps, Capture>(
		mode: 'hydrate-match' | 'hydrate-mismatch',
		spec: ServerRenderMatrixCase<
			State,
			ServerProps,
			ClientProps,
			Capture,
			ClientModule,
			ServerModule
		>,
	): Promise<void> {
		const state = await createState(spec);
		const variant = 'hydrateRoot' as const;
		const serverContext: RenderCaseContext<State> = {
			mode,
			variant,
			side: 'server',
			state,
		};
		const clientContext: RenderCaseContext<State> = {
			mode,
			variant,
			side: 'client',
			state,
		};
		const hydration = mode === 'hydrate-mismatch' ? spec.mismatch : spec.hydrateMatch;
		if (mode === 'hydrate-mismatch' && hydration === undefined) {
			throw new Error('hydrate-mismatch mode requires a `mismatch` configuration.');
		}
		const serverProps = propsFor<State, ServerProps>(
			hydration?.serverProps,
			spec.props,
			serverContext,
		);
		const clientProps = propsFor<State, ClientProps>(
			hydration?.clientProps,
			spec.props,
			clientContext,
		);
		const serverComponentName = String(
			hydration?.serverComponent ?? spec.serverComponent ?? spec.component,
		);
		const clientComponentName = String(
			hydration?.clientComponent ?? spec.clientComponent ?? spec.component,
		);
		const result = ServerRuntime.renderToString(
			componentOf(options.serverModule, serverComponentName, 'server'),
			serverProps,
			optionValue(spec.renderOptions, serverContext),
		);
		const container = makeContainer(spec, options.createContainer);
		container.innerHTML = result.html;
		const preparation: HydrationPreparationContext<State, ServerProps, ClientProps> = {
			mode,
			state,
			serverProps,
			clientProps,
			serverHtml: result.html,
			css: result.css,
		};
		if (mode === 'hydrate-mismatch') {
			await spec.mismatch?.mutateServerDom?.(container, preparation);
		}
		await spec.prepareBeforeHydrate?.(container, preparation);
		const before = await spec.captureBeforeHydrate?.(container, preparation);
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: Root | undefined;
		try {
			root = ClientRuntime.hydrateRoot(
				container,
				componentOf(options.clientModule, clientComponentName, 'client'),
				clientProps,
				optionValue(spec.rootOptions, clientContext),
			);
			ClientRuntime.flushSync(() => {});
			const diagnostics = consoleMessages(error);
			const observation: RenderObservation<State, ServerProps, ClientProps, Capture> = {
				mode,
				variant,
				root: container,
				container,
				html: container.innerHTML,
				serverHtml: result.html,
				css: result.css,
				chunks: [],
				streamErrors: [],
				octaneRoot: root,
				before,
				state,
				serverProps,
				clientProps,
				diagnostics,
			};
			await assertObservation(spec, observation);
			await assertDiagnostics(
				spec.hydrationDiagnostics?.[mode] ??
					(mode === 'hydrate-match'
						? 'none'
						: (spec.mismatch?.diagnostics ?? 'hydration-mismatch')),
				diagnostics,
				observation,
			);
		} finally {
			root?.unmount();
			error.mockRestore();
			container.remove();
		}
	}

	async function runMode<State, ServerProps, ClientProps, Capture>(
		mode: MatrixRenderMode,
		spec: ServerRenderMatrixCase<
			State,
			ServerProps,
			ClientProps,
			Capture,
			ClientModule,
			ServerModule
		>,
	): Promise<void> {
		if (mode === 'client') return runClient(spec);
		if (mode === 'server-string') return runBuffered(spec);
		if (mode === 'server-stream') return runStream(spec);
		return runHydration(mode, spec);
	}

	return {
		itRenders(title, spec) {
			const modes =
				spec.modes ??
				(spec.mismatch === undefined
					? DEFAULT_MODES
					: ([...DEFAULT_MODES, 'hydrate-mismatch'] as const));
			for (const mode of modes) {
				it(`${title} — ${MODE_LABEL[mode]}`, () => runMode(mode, spec));
			}
		},
	};
}
