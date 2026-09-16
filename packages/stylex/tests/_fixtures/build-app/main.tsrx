// A compiled app entry for the production-build test: it imports the generated sheet
// and two styled components from SEPARATE modules, so the StyleX rules come from more
// than one file (stressing the build-time aggregation/ordering).
import 'virtual:stylex.css';
import { Box } from './Box.tsrx';
import { Pill } from './Pill.tsrx';
import { createRoot } from 'octane';
import { mountBindings } from 'octane/behavior';

export const components = { Box, Pill };

export function normal(parent: HTMLElement, props: Parameters<typeof Box>[0]) {
	const root = createRoot(parent);
	root.render(Box, props);
	return root;
}

export function bound(parent: HTMLElement, source: import('octane/behavior').BindingSource) {
	return mountBindings({ parent }, Box, source);
}
