const ROOT_SITE = Symbol('apollo.root');
const subSites = new Map();

/** Return a stable child site for repeated helper hooks inside one public hook. */
export function subSite(site, tag) {
	const parent = typeof site === 'symbol' ? site : ROOT_SITE;
	let children = subSites.get(parent);
	if (!children) subSites.set(parent, (children = new Map()));
	let child = children.get(tag);
	if (!child) {
		child = Symbol(`${parent.description || 'apollo'}:${tag}`);
		children.set(tag, child);
	}
	return child;
}

/** Compiler hook sites are symbols, but Apollo's skipToken is user data. */
export function isCompilerSite(value, reserved) {
	return typeof value === 'symbol' && value !== reserved;
}
