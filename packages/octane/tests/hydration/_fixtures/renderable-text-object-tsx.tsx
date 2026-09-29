/** @jsxImportSource octane */
import { createElement, type OctaneNode } from 'octane';

// The `.tsx` lowering of renderable-text-object.tsrx: a bare `{expr}` hole that
// is its host's only child, whose server value was text but whose client value
// is an element.

export function Hole({ kind, v, tail }: { kind: 'text' | 'p'; v: string; tail: OctaneNode }) {
	return (
		<section>
			<div>{kind === 'p' ? createElement('p', { class: 'x' }, v) : v}</div>
			<b>{tail}</b>
		</section>
	);
}
