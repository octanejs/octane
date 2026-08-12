import type { OctaneNode } from 'octane';
import {
	TanStackDevtools,
	type TanStackDevtoolsOctaneInit,
	type TanStackDevtoolsOctanePlugin,
} from '../src/index';

declare function expectType<T>(value: T): void;

expectType<typeof TanStackDevtools>(TanStackDevtools);

type PluginName = TanStackDevtoolsOctanePlugin['name'];
expectType<string | OctaneNode | ((el: HTMLElement, props: any) => OctaneNode)>(
	null as unknown as PluginName,
);

type InitPlugins = NonNullable<TanStackDevtoolsOctaneInit['plugins']>;
expectType<TanStackDevtoolsOctanePlugin[]>(null as unknown as InitPlugins);

type Trigger = NonNullable<NonNullable<TanStackDevtoolsOctaneInit['config']>['customTrigger']>;
expectType<OctaneNode | ((el: HTMLElement, props: any) => OctaneNode)>(null as unknown as Trigger);

// @ts-expect-error plugin requires a render member
const missingRender: TanStackDevtoolsOctanePlugin = { name: 'broken' };
void missingRender;

// @ts-expect-error plugins must be adapter plugin entries
const badPlugins: TanStackDevtoolsOctaneInit = { plugins: [{ name: 'broken' }] };
void badPlugins;
