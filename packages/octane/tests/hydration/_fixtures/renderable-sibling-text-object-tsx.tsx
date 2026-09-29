/** @jsxImportSource octane */
import { createElement, type OctaneNode } from 'octane';

// The `.tsx` lowering of renderable-sibling-text-object.tsrx: a bare `{expr}`
// hole beside another child, whose server value was text but whose client value
// is a keyed element.

export function Hole({ kind, v, tail }: { kind: 'text' | 'keyed'; v: string; tail: OctaneNode }) {
	return (
		<section>
			{kind === 'keyed' ? createElement('p', { key: 'k', class: 'x' }, v) : v}
			<b>{tail}</b>
		</section>
	);
}
