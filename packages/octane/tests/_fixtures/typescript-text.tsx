/** @jsxImportSource octane */
import type { OctaneNode } from 'octane';

function Frame(props: { children: OctaneNode }) {
	return <article id="extracted-frame">{props.children}</article>;
}

export function ExtractedText(props: { label: string; child: OctaneNode }) {
	return (
		<Frame>
			<h2 id="extracted-label">{props.label}</h2>
			<section id="extracted-child">{props.child}</section>
		</Frame>
	);
}
