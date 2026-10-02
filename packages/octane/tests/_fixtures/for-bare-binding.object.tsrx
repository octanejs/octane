import type { OctaneNode } from 'octane';

declare module 'octane/jsx-runtime' {
	namespace Octane {
		namespace JSX {
			interface IntrinsicElements {
				'row-list': { outer: string; children?: OctaneNode };
				'row-host': { id: string; label: string; position: number };
			}
		}
	}
}

export type RowsProps = { rows: { id: string; label?: string }[] };

// A bare-left `@for` header on a universal renderer binds each row's own item,
// as a `let` header does, and leaves the outer `id` untouched.
export function Rows(props: RowsProps) @{
	const id = 'outer';
	<row-list outer={id}>
		@for ({ id, label = 'untitled' } of props.rows; index i; key id) {
			<row-host id={id} label={label} position={i} />
		}
	</row-list>
}
