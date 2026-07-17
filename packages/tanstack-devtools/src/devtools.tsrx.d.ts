// Declaration companion for devtools.tsrx.
import type {
	ClientEventBusConfig,
	TanStackDevtoolsConfig,
	TanStackDevtoolsPlugin,
	TanStackDevtoolsPluginProps,
	TanStackDevtoolsTheme,
} from '@tanstack/devtools';

// `{} | null | undefined` rather than `unknown` so the `(el, props) => Renderable`
// callback member of the render/name/trigger unions keeps its parameter inference.
type Renderable = {} | null | undefined;

type PluginRender =
	| Renderable
	| ((el: HTMLElement, props: TanStackDevtoolsPluginProps) => Renderable);

type TriggerProps = {
	theme: TanStackDevtoolsTheme;
};

type TriggerRender = Renderable | ((el: HTMLElement, props: TriggerProps) => Renderable);

export type TanStackDevtoolsOctanePlugin = Omit<TanStackDevtoolsPlugin, 'render' | 'name'> & {
	render: PluginRender;
	name: string | PluginRender;
};

type TanStackDevtoolsOctaneConfig = Omit<Partial<TanStackDevtoolsConfig>, 'customTrigger'> & {
	customTrigger?: TriggerRender;
};

export interface TanStackDevtoolsOctaneInit {
	plugins?: Array<TanStackDevtoolsOctanePlugin>;
	config?: TanStackDevtoolsOctaneConfig;
	eventBusConfig?: ClientEventBusConfig;
}

export declare function TanStackDevtools(props: TanStackDevtoolsOctaneInit): unknown;

export {};
