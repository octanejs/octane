'use strong';

import { createContext, Fragment, useContext, useEffect, useState } from 'octane';
import { query$ } from 'octane/signals';

const Channel = createContext('outside');
type Subscribe = (name: string) => () => void;
type GroupProps = { id: string; label: string; channel: string; subscribe: Subscribe };

function ContextLeaf() @{
	const channel = useContext(Channel);
	<output>{channel}</output>
}

export function ScopedGroup(props: GroupProps) @{
	<Fragment key={props.id}>@{
		const [count, setCount] = useState(0);
		const label = props.label;
		useEffect(() => props.subscribe(props.id));
		<Channel value={props.channel}>
			<button onClick={() => setCount(count + 1)}>{`${label}:${count}`}</button>
			<ContextLeaf />
		</Channel>
	}</Fragment>
}

export function RepeatedGroups(props: GroupProps) @{
	<div>
		<section>
			<ScopedGroup {...props} />
		</section>
		<section>
			<ScopedGroup {...props} />
		</section>
		<ContextLeaf />
	</div>
}

export function BoundaryGroup(props: {
	id: string;
	label: string;
	read: () => string;
	subscribe: Subscribe;
}) @{
	<section>
		<Fragment key={props.id}>
			@try {
				const value = props.read();
				useEffect(() => props.subscribe(props.id));
				<strong>{`${props.label}:${value}`}</strong>
			} @pending {
				<i>{`pending:${props.label}`}</i>
			} @catch (error) {
				<p>{`${props.label}:${(error as Error).message}`}</p>
			}
		</Fragment>
	</section>
}

export function ResourceGroup(props: {
	id: string;
	load: (selection: string, options: { signal: AbortSignal }) => Promise<string>;
}) @{
	<Fragment key={props.id}>@{
		const value$ = query$(() => 'resource', props.load);
		<output>{value$.latest('waiting')}</output>
	}</Fragment>
}

export function SpreadChild(props: { label: string; subscribe: Subscribe; tail?: string }) @{
	const [count, setCount] = useState(0);
	const [initialLabel] = useState(() => props.label);
	useEffect(() => props.subscribe(initialLabel));
	<button
		onClick={() => setCount(count + 1)}
	>{`${props.label}:${count}:${props.tail ?? ''}`}</button>
}

type SpreadProps = {
	Component: typeof SpreadChild;
	props: { key?: string | number | null; label: string; subscribe: Subscribe };
	readKey: () => string | number | null | undefined;
	readTail: () => string;
};

export function SpreadBeforeKey(props: SpreadProps) @{
	<props.Component {...props.props} key={props.readKey()} tail={props.readTail()} />
}

export function KeyBeforeSpread(props: SpreadProps) @{
	<props.Component key={props.readKey()} {...props.props} tail={props.readTail()} />
}
