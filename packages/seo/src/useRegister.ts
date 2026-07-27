/**
 * Register one component instance's descriptors with the enclosing registry.
 *
 * Registration happens DURING RENDER, not in an effect: effects never run on the
 * server, so an effect-based registration would leave the server-rendered
 * `<head>` empty and hand crawlers nothing. That is precisely the failure this
 * package exists to remove.
 *
 * The effect below exists only for the client half of the lifecycle: it notifies
 * the outlet after a commit that changed something, and removes the source on
 * unmount so a navigated-away page stops contributing. Document metadata does
 * not affect layout, so it does not need to block paint.
 */
import { useContext, useEffect, useRef } from 'octane';
import { SeoContext } from './context.js';
import type { SeoConfig, SeoDescriptor } from './descriptors.js';

export function useRegisterSeo(descriptors: readonly SeoDescriptor[], config?: SeoConfig): void {
	const registry = useContext(SeoContext);
	if (registry === null) {
		throw new Error(
			'[@octanejs/seo] <Title>/<Meta>/<Link>/<Script>/<JsonLd>/<Seo> must render inside a <Head>.',
		);
	}
	const idRef = useRef<number>(0);
	if (idRef.current === 0) idRef.current = registry.nextSourceId();
	registry.register(idRef.current, descriptors);
	if (config !== undefined) registry.configure(idRef.current, config);

	// Two effects, and they must stay separate.
	//
	// Publish re-registers the committed descriptors and notifies the outlet. The
	// dependency array is left to the compiler on purpose: `descriptors` is read
	// here, so inference keys the effect on it and re-runs exactly when the
	// metadata this component contributes may have changed. Both calls are
	// idempotent, re-registering an equal set is a no-op and `flush()` does
	// nothing unless something actually changed.
	useEffect(() => {
		registry.register(idRef.current, descriptors);
		if (config !== undefined) registry.configure(idRef.current, config);
		registry.flush();
	});

	// Teardown is mount/unmount ONLY. It cannot ride the effect above: that one
	// re-runs, and a cleanup running before each re-run would make a component
	// delete its own registration merely by re-rendering, letting an outer
	// default win. This closure reads nothing that changes, so inference gives it
	// mount/unmount semantics on its own.
	useEffect(() => {
		return () => {
			registry.remove(idRef.current);
			registry.flush();
		};
	});
}
