/** @jsxImportSource octane */
import type { OctaneNode } from 'octane';

// A renderer module that never imports signals: its holes cannot tell a signal
// handle from any other renderable value.
export function Frame(props: { children?: OctaneNode }) {
	return <p>{props.children}</p>;
}
