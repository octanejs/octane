// Ported from @tanstack/react-devtools 0.10.7
// (https://github.com/TanStack/devtools/tree/main/packages/react-devtools/src/devtools.tsx).
//
// Octane adaptations:
// - React hooks (useEffect/useMemo/useRef/useState) come directly from octane.
// - `createPortal` comes from octane instead of react-dom. Octane renders a portal
//   VALUE returned from a component at any position, so each plugin / title / trigger
//   is portaled into the container the framework-agnostic core hands us via a tiny
//   `DevtoolsPortal` component (matching the pattern in @octanejs/lexical's Decorators).
// - The framework-agnostic `@tanstack/devtools` core (TanStackDevtoolsCore, Solid) is
//   reused UNCHANGED, exactly as the React binding does.
// - `ref` is the normal React-19-style ref prop; native events; no synthetic layer.
import { createPortal, useEffect, useMemo, useRef, useState } from 'octane';
import { TanStackDevtoolsCore } from '@tanstack/devtools';
import type {
	ClientEventBusConfig,
	TanStackDevtoolsConfig,
	TanStackDevtoolsPlugin,
	TanStackDevtoolsPluginProps,
	TanStackDevtoolsTheme,
} from '@tanstack/devtools';

// An octane renderable (JSX element descriptor, component, primitive, array, …).
// `{} | null | undefined` rather than `unknown` so the `(el, props) => Renderable`
// callback member of the render/name/trigger unions keeps its parameter inference
// (a `unknown` union member collapses the whole union to `unknown`).
type Renderable = {} | null | undefined;

type PluginRender =
	| Renderable
	| ((el: HTMLElement, props: TanStackDevtoolsPluginProps) => Renderable);

type TriggerProps = {
	theme: TanStackDevtoolsTheme;
};

type TriggerRender =
	| Renderable
	| ((el: HTMLElement, props: TriggerProps) => Renderable);

export type TanStackDevtoolsOctanePlugin = Omit<
	TanStackDevtoolsPlugin,
	'render' | 'name'
> & {
	/**
	 * The render can be an octane element or a function that returns one. If it's a
	 * function, it's called to render the plugin; otherwise it's rendered directly.
	 *
	 * ```jsx
	 *   { render: () => <CustomPluginComponent /> }
	 *   // or
	 *   { render: <CustomPluginComponent /> }
	 * ```
	 */
	render: PluginRender;
	/**
	 * Name displayed in the devtools UI. A string is used verbatim; an element (or a
	 * function returning one) is portaled into the plugin's title slot.
	 *
	 * ```jsx
	 *   { name: 'Your Plugin', render: () => <CustomPluginComponent /> }
	 *   // or
	 *   { name: <h1>Your Plugin title</h1>, render: () => <CustomPluginComponent /> }
	 * ```
	 */
	name: string | PluginRender;
};

type TanStackDevtoolsOctaneConfig = Omit<
	Partial<TanStackDevtoolsConfig>,
	'customTrigger'
> & {
	/**
	 * Optional custom trigger component. An octane element or a function returning one.
	 *
	 * ```jsx
	 *   { customTrigger: <CustomTriggerComponent /> }
	 * ```
	 */
	customTrigger?: TriggerRender;
};

export interface TanStackDevtoolsOctaneInit {
	/**
	 * Plugins to render in the devtools. Each plugin needs a `render` that returns an
	 * octane element (or a function that does).
	 *
	 * ```jsx
	 * <TanStackDevtools
	 *   plugins={[{ id: 'your-plugin-id', name: 'Your Plugin', render: <CustomPluginComponent /> }]}
	 * />
	 * ```
	 */
	plugins?: Array<TanStackDevtoolsOctanePlugin>;
	/**
	 * Configuration for the devtools shell. Used to seed the initial state the first
	 * time the devtools start; afterwards settings persist in local storage and change
	 * through the settings panel.
	 */
	config?: TanStackDevtoolsOctaneConfig;
	/**
	 * Configuration for the TanStack Devtools client event bus.
	 */
	eventBusConfig?: ClientEventBusConfig;
}

const convertRender = (
	Component: PluginRender,
	setComponents: (updater: (prev: Record<string, Renderable>) => Record<string, Renderable>) => void,
	e: HTMLElement,
	props: TanStackDevtoolsPluginProps,
) => {
	const element = typeof Component === 'function' ? Component(e, props) : Component;

	setComponents((prev) => ({
		...prev,
		[e.getAttribute('id') as string]: element,
	}));
};

const convertTrigger = (
	Component: TriggerRender,
	setComponent: (element: Renderable | null) => void,
	e: HTMLElement,
	props: TriggerProps,
) => {
	const element = typeof Component === 'function' ? Component(e, props) : Component;
	setComponent(element);
};

// A createPortal VALUE returned from a component renders at any position in octane,
// so each container's content lives in its own tiny portal component.
function DevtoolsPortal(props: { target: HTMLElement; content: Renderable }) {
	return createPortal(props.content, props.target);
}

export const TanStackDevtools = ({
	plugins,
	config,
	eventBusConfig,
}: TanStackDevtoolsOctaneInit): Renderable => {
	const devToolRef = useRef<HTMLDivElement | null>(null);

	const [pluginContainers, setPluginContainers] = useState<Record<string, HTMLElement>>({});
	const [titleContainers, setTitleContainers] = useState<Record<string, HTMLElement>>({});
	const [triggerContainer, setTriggerContainer] = useState<HTMLElement | null>(null);

	const [PluginComponents, setPluginComponents] = useState<Record<string, Renderable>>({});
	const [TitleComponents, setTitleComponents] = useState<Record<string, Renderable>>({});
	const [TriggerComponent, setTriggerComponent] = useState<Renderable | null>(null);

	const pluginsMap: Array<TanStackDevtoolsPlugin> = useMemo(
		() =>
			plugins?.map((plugin) => {
				return {
					...plugin,
					name:
						typeof plugin.name === 'string'
							? plugin.name
							: (e, props) => {
									const id = e.getAttribute('id')!;
									const target = e.ownerDocument.getElementById(id);

									if (target) {
										setTitleContainers((prev) => ({
											...prev,
											[id]: e,
										}));
									}

									convertRender(
										plugin.name as PluginRender,
										setTitleComponents,
										e,
										props,
									);
								},
					render: (e, theme) => {
						const id = e.getAttribute('id')!;
						const target = e.ownerDocument.getElementById(id);

						if (target) {
							setPluginContainers((prev) => ({
								...prev,
								[id]: e,
							}));
						}

						convertRender(plugin.render, setPluginComponents, e, theme);
					},
				};
			}) ?? [],
		[plugins],
	);

	const [devtools] = useState(() => {
		const { customTrigger, ...coreConfig } = config || {};
		return new TanStackDevtoolsCore({
			config: {
				...coreConfig,
				customTrigger: customTrigger
					? (el, props) => {
							setTriggerContainer(el);
							convertTrigger(customTrigger, setTriggerComponent, el, props);
						}
					: undefined,
			},
			eventBusConfig,
			plugins: pluginsMap,
		});
	});

	useEffect(() => {
		devtools.setConfig({
			plugins: pluginsMap,
		});
	}, [devtools, pluginsMap]);

	useEffect(() => {
		if (devToolRef.current) {
			devtools.mount(devToolRef.current);
		}

		return () => devtools.unmount();
	}, [devtools]);

	const hasPlugins =
		Object.values(pluginContainers).length > 0 && Object.values(PluginComponents).length > 0;
	const hasTitles =
		Object.values(titleContainers).length > 0 && Object.values(TitleComponents).length > 0;

	return (
		<>
			<div style={{ position: 'absolute' }} ref={devToolRef} />

			{hasPlugins
				? Object.entries(pluginContainers).map(function mapPlugin([key, pluginContainer]) {
						return (
							<DevtoolsPortal key={key} target={pluginContainer} content={PluginComponents[key]} />
						);
					})
				: null}

			{hasTitles
				? Object.entries(titleContainers).map(function mapTitle([key, titleContainer]) {
						return (
							<DevtoolsPortal key={key} target={titleContainer} content={TitleComponents[key]} />
						);
					})
				: null}

			{triggerContainer && TriggerComponent
				? <DevtoolsPortal target={triggerContainer} content={TriggerComponent} />
				: null}
		</>
	);
};
