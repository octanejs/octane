import type { ReactNode } from 'react';
import {
	TanStackDevtools,
	type TanStackDevtoolsReactInit,
	type TanStackDevtoolsReactPlugin,
} from '../../upstream/src/index';

declare function expectType<T>(value: T): void;

expectType<typeof TanStackDevtools>(TanStackDevtools);

type PluginName = TanStackDevtoolsReactPlugin['name'];
expectType<string | ReactNode | ((el: HTMLElement, props: any) => ReactNode)>(
	null as unknown as PluginName,
);

type InitPlugins = NonNullable<TanStackDevtoolsReactInit['plugins']>;
expectType<TanStackDevtoolsReactPlugin[]>(null as unknown as InitPlugins);

type Trigger = NonNullable<NonNullable<TanStackDevtoolsReactInit['config']>['customTrigger']>;
expectType<ReactNode | ((el: HTMLElement, props: any) => ReactNode)>(null as unknown as Trigger);

// @ts-expect-error plugin requires a render member
const missingRender: TanStackDevtoolsReactPlugin = { name: 'broken' };
void missingRender;

// @ts-expect-error plugins must be adapter plugin entries
const badPlugins: TanStackDevtoolsReactInit = { plugins: [{ name: 'broken' }] };
void badPlugins;
