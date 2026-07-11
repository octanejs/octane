/**
 * Port of facebook/react ReactDOMFizzViewTransition-test.js (2026-07-11) —
 * scaffolded by scripts/scaffold-react-port.mjs.
 *
 * 4 in-scope cases, 0 skipped. These test the SSR side of View Transitions:
 * the server render emits vt-* ANNOTATIONS on boundary elements so that
 * hydration-time reveals (streamed-in Suspense content, initial paint
 * transitions) can activate without a client re-render. Ports land in
 * Phase 5 of docs/view-transitions-plan.md, against octane's
 * runtime.server.ts + server/index.ts surface.
 */
import { describe, it } from 'vitest';

describe('ReactDOMFizzViewTransition (ported)', () => {
	// ReactDOMFizzViewTransition-test.js:99
	it.todo('emits annotations for view transitions');
	// ReactDOMFizzViewTransition-test.js:142
	it.todo('emits enter/exit annotations for view transitions inside Suspense');
	// ReactDOMFizzViewTransition-test.js:207
	it.todo('can emit both enter and exit on the same node');
	// ReactDOMFizzViewTransition-test.js:274
	it.todo('emits annotations for view transitions outside Suspense');
});
