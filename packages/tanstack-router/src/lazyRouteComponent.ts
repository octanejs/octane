// The normal entry accepts returned JSX and descriptors after loading.
import { createElement } from 'octane';
import { createLazyRouteLoader } from './lazyRouteLoader';

export function lazyRouteComponent(
	importer: () => Promise<any>,
	exportName?: string,
): ((props: any) => any) & { preload: () => Promise<any> | undefined } {
	const loader = createLazyRouteLoader(importer, exportName);
	const Lazy = (props: any) => createElement(loader.read(), props);
	Lazy.preload = loader.preload;
	return Lazy;
}
