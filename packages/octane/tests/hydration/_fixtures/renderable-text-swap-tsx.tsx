/** @jsxImportSource octane */
import { createElement, type OctaneNode } from 'octane';

// The `.tsx` lowering of renderable-text-swap.tsrx: a bare `{expr}` hole whose
// server value was an element but whose client value is text or empty.

type Kind = 'p' | 'text' | null;

function pick(kind: Kind, v: string): OctaneNode {
	return kind === 'p' ? createElement('p', { class: 'x' }, v) : kind === 'text' ? v : null;
}

export function Hole({ kind, v, tail }: { kind: Kind; v: string; tail: string }) {
	return (
		<section>
			<div>{pick(kind, v)}</div>
			<i>{tail}</i>
		</section>
	);
}

export function SiblingHole({ kind, v, tail }: { kind: Kind; v: string; tail: string }) {
	return (
		<section>
			{pick(kind, v)}
			<i>{tail}</i>
		</section>
	);
}
