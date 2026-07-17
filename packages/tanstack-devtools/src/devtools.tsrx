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

type PluginRender = Renderable | ((el: HTMLElement, props: TanStackDevtoolsPluginProps) => Renderable);

type TriggerProps = {
	theme: TanStackDevtoolsTheme;
};

type TriggerRender = Renderable | ((el: HTMLElement, props: TriggerProps) => Renderable);

export type TanStackDevtoolsOctanePlugin = Omit<TanStackDevtoolsPlugin, 'render' | 'name'> & {
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

type TanStackDevtoolsOctaneConfig = Omit<Partial<TanStackDevtoolsConfig>, 'customTrigger'> & {
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

type ComponentMap = Record<string, Renderable>;
type ContainerMap = Record<string, HTMLElement>;
type SetComponents = (updater: (prev: ComponentMap) => ComponentMap) => void;

const convertRender = (
	Component: PluginRender,
	setComponents: SetComponents,
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
	setComponent: (element: Renderable) => void,
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

export function TanStackDevtools(props: TanStackDevtoolsOctaneInit) {
	const { plugins, config, eventBusConfig } = props;

	const devToolRef = useRef<HTMLDivElement>(null);

	const [pluginContainers, setPluginContainers] = useState<ContainerMap>({});
	const [titleContainers, setTitleContainers] = useState<ContainerMap>({});
	const [triggerContainer, setTriggerContainer] = useState<HTMLElement | null>(null);

	const [PluginComponents, setPluginComponents] = useState<ComponentMap>({});
	const [TitleComponents, setTitleComponents] = useState<ComponentMap>({});
	const [TriggerComponent, setTriggerComponent] = useState<Renderable>(null);

	const pluginsMap = useMemo<Array<TanStackDevtoolsPlugin>>(
		() =>
			plugins?.map((plugin) => {
				return {
					...plugin,
					name:
						typeof plugin.name === 'string'
							? plugin.name
							: (e: HTMLElement, pluginProps: TanStackDevtoolsPluginProps) => {
									const id = e.getAttribute('id')!;
									const target = e.ownerDocument.getElementById(id);

									if (target) {
										setTitleContainers((prev) => ({
											...prev,
											[id]: e,
										}));
									}

									convertRender(plugin.name as PluginRender, setTitleComponents, e, pluginProps);
								},
					render: (e: HTMLElement, pluginProps: TanStackDevtoolsPluginProps) => {
						const id = e.getAttribute('id')!;
						const target = e.ownerDocument.getElementById(id);

						if (target) {
							setPluginContainers((prev) => ({
								...prev,
								[id]: e,
							}));
						}

						convertRender(plugin.render, setPluginComponents, e, pluginProps);
					},
				} as TanStackDevtoolsPlugin;
			}) ?? [],
		[plugins],
	);

	const [devtools] = useState(() => {
		const { customTrigger, ...coreConfig } = config || {};
		return new TanStackDevtoolsCore({
			config: {
				...coreConfig,
				customTrigger: customTrigger
					? (el: HTMLElement, triggerProps: TriggerProps) => {
							setTriggerContainer(el);
							convertTrigger(customTrigger, setTriggerComponent, el, triggerProps);
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

			@if (hasPlugins) {
				@for (const [id, pluginContainer] of Object.entries(pluginContainers); key id) {
					<DevtoolsPortal target={pluginContainer} content={PluginComponents[id]} />
				}
			}

			@if (hasTitles) {
				@for (const [id, titleContainer] of Object.entries(titleContainers); key id) {
					<DevtoolsPortal target={titleContainer} content={TitleComponents[id]} />
				}
			}

			@if (triggerContainer && TriggerComponent) {
				<DevtoolsPortal target={triggerContainer} content={TriggerComponent} />
			}
		</>
	);
}
