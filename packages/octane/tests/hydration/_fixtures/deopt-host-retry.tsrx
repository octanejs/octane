// A runtime host element (createElement) whose server children differ from
// the client's, which need ranges the server did not render. The first
// hydration attempt adopts the server host and builds the client children in
// it; then a sibling suspends, so the next attempt adopts the same host.
import { Hydrate, createElement, use, type ComponentBody } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

function Leaf(props: { v: string }) @{
	<em>{props.v}</em>
}

export type Kind = 'host' | 'component' | 'list' | 'nested' | 'empty';

function content(kind: Kind, server: boolean, v: string) {
	if (server) return kind === 'empty' ? null : 'hello';
	const leaf = createElement(Leaf, { v });
	if (kind === 'component') return leaf;
	if (kind === 'list') return [createElement('span', { key: 'a' }, leaf), 'x'];
	if (kind === 'nested') return createElement('b', null, createElement('span', null, leaf));
	return createElement('span', null, leaf);
}

function host(kind: Kind, server: boolean, v: string) {
	return createElement('div', { id: 'host' }, content(kind, server, v));
}

interface Props {
	kind: Kind;
	server: boolean;
	v: string;
	Tail: ComponentBody;
}

export function BoundaryRetry(props: Props) @{
	const el = host(props.kind, props.server, props.v);
	<main>
		@try {
			<section>
				{el}
				<props.Tail />
			</section>
		} @pending {
			<i>{'loading'}</i>
		}
	</main>
}

export function RootRetry(props: Props) @{
	const el = host(props.kind, props.server, props.v);
	<section>
		{el}
		<props.Tail />
	</section>
}

export function Tail() @{
	<p>{'tail'}</p>
}

function Waits(props: { text: Promise<string> }) @{
	<em class="waits">{use(props.text)}</em>
}

// The sibling suspends on a value whose server output was text, so the first
// attempt rebuilds that hole too.
export function UseRetry(props: { server: boolean; text: Promise<string> | null }) @{
	const el = host('host', props.server, 'q');
	<main>
		@try {
			<section>
				{el}
				<p>
					{props.text === null ? 'A' : createElement(Waits, { text: props.text })}
				</p>
			</section>
		} @pending {
			<i>{'loading'}</i>
		}
	</main>
}

// Captures that change before the boundary activates legitimately differ from
// the server's.
export function DormantHost(props: { when: HydrationStrategy; server: boolean }) @{
	const el = host('host', props.server, 'q');
	<main>
		<Hydrate when={props.when} split={false}>
			<section>{el}</section>
		</Hydrate>
	</main>
}
