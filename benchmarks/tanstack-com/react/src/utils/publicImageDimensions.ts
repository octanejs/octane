type ImageDimensions = {
	height: number;
	width: number;
};

const publicImageDimensions: Record<string, ImageDimensions> = {
	'/blog-assets/react-server-components/header.jpg': {
		height: 701,
		width: 1200,
	},
	'/blog-assets/tanstack-router-signal-graph/bundle-size-history-react.png': {
		height: 904,
		width: 2116,
	},
	'/blog-assets/tanstack-router-signal-graph/bundle-size-history-solid.png': {
		height: 904,
		width: 2116,
	},
	'/blog-assets/tanstack-router-signal-graph/bundle-size-history-vue.png': {
		height: 904,
		width: 2116,
	},
	'/blog-assets/tanstack-router-signal-graph/client-side-nav-react.png': {
		height: 1096,
		width: 2688,
	},
	'/blog-assets/tanstack-router-signal-graph/client-side-nav-solid.png': {
		height: 1096,
		width: 2688,
	},
	'/blog-assets/tanstack-router-signal-graph/client-side-nav-vue.png': {
		height: 1096,
		width: 2688,
	},
	'/blog-assets/tanstack-router-signal-graph/header.jpg': {
		height: 1024,
		width: 1536,
	},
	'/blog-assets/tanstack-router-signal-graph/store-updates-history-react.png': {
		height: 828,
		width: 2122,
	},
	'/blog-assets/tanstack-router-signal-graph/store-updates-history-solid.png': {
		height: 828,
		width: 2122,
	},
	'/blog-assets/tanstack-router-signal-graph/store-updates-history-vue.png': {
		height: 828,
		width: 2122,
	},
	'/blog-assets/who-owns-the-tree/header.jpg': {
		height: 801,
		width: 1200,
	},
};

export function getPublicImageDimensions(src: string) {
	const pathname = getPathname(src);

	return pathname ? publicImageDimensions[pathname] : undefined;
}

function getPathname(src: string) {
	try {
		return new URL(src, 'https://tanstack.com').pathname;
	} catch {
		return undefined;
	}
}
