import { type OctaneNode } from 'octane';
import { renderToStaticMarkup } from 'octane/server';

function Wrap(props: { node: OctaneNode }) {
	return props.node;
}

/**
 * Renders an Octane element tree to static HTML markup.
 * Per packages/html-react-parser/upstream/__tests__/helpers/index.ts
 */
export function render(node: OctaneNode): string {
	return renderToStaticMarkup(Wrap, { node }).html;
}
