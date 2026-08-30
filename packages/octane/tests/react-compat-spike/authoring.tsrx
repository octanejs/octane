import type * as React from 'react';
import { ReactCompat } from './stock-root-bridge.js';
import { ReactIsland as AliasedCompat } from './bridge-barrel.js';
import {
	Counter,
	DefaultedClass,
	DefaultedFunction,
	type CounterProps,
} from './react-components.js';

interface Props extends CounterProps {
	childKey?: string;
}

export function LiteralCounterApp() @{
	<ReactCompat>
		<Counter start={3} />
	</ReactCompat>
}

export function DirectCounterApp(props: Props) @{
	<ReactCompat>
		<Counter key={props.childKey} start={props.start} label={props.label} ref={props.ref} />
	</ReactCompat>
}

export function ReexportedCounterApp(props: Props) @{
	<AliasedCompat>
		<Counter key={props.childKey} start={props.start} label={props.label} ref={props.ref} />
	</AliasedCompat>
}

interface ComponentProps extends Props {
	component: React.ComponentType<CounterProps>;
}

export function ComponentTransportApp(props: ComponentProps) @{
	const Component = props.component;
	<ReactCompat>
		<Component key={props.childKey} start={props.start} label={props.label} />
	</ReactCompat>
}

export function DefaultedFunctionApp(props: { label?: string }) @{
	<ReactCompat>
		<DefaultedFunction label={props.label} />
	</ReactCompat>
}

export function DefaultedClassApp(props: { label?: string }) @{
	<ReactCompat>
		<DefaultedClass label={props.label} />
	</ReactCompat>
}
