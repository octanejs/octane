import { it, expect } from 'vitest';
import { mount } from './_helpers';
import { MapSuspense, DirectSuspense, BoundaryChildren } from './_fixtures/value-jsx-suspense.tsx';

// Regression: <Suspense>/<ErrorBoundary> render their children as the try BODY
// (renderBlock calls it as a function). The .tsrx `{props.children}` lowering
// passes a render fn, but a React-style .tsx parent lowers element children to a
// createElement DESCRIPTOR (esp. in value position like `.map`), which is not
// callable — previously threw "block.body is not a function". See childrenAsBody.
it('keyed .map of <Suspense>-wrapped components renders (HN StoriesPage pattern)', () => {
	const r = mount(MapSuspense as any);
	expect(r.findAll('.inner').length).toBe(3);
	r.unmount();
});
it('a single .tsx <Suspense> with element children renders them', () => {
	const r = mount(DirectSuspense as any);
	expect(r.find('.inner').textContent).toBe('x');
	r.unmount();
});
it('a .tsx <ErrorBoundary> with element children renders them', () => {
	const r = mount(BoundaryChildren as any);
	expect(r.find('.inner').textContent).toBe('y');
	r.unmount();
});
