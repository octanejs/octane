import { renderToStaticMarkup as render } from 'octane/server';
import type { OctaneNode } from 'octane';
// Match React's string result while executing Octane's real server compiler/runtime.
export function renderToStaticMarkup(node: OctaneNode): string {
	return render(node).html;
}
