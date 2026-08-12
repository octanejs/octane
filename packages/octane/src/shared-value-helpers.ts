/** Pure element-value operations shared without coupling renderer runtime graphs. */

/** Apply component defaults to a newly allocated public element props object. */
export function applyElementDefaultProps(type: any, props: any): void {
	const defaults = type?.defaultProps;
	if (defaults == null) return;
	for (const name in defaults) {
		if (props[name] === undefined) props[name] = defaults[name];
	}
}

/** Resolve live lazy-component defaults without mutating or needlessly cloning props. */
export function resolveLazyDefaultProps(component: any, props: any): any {
	const defaults = component.defaultProps;
	if (defaults == null || typeof defaults !== 'object') return props;
	let resolved = props;
	for (const key of Object.keys(defaults)) {
		if (props == null || props[key] === undefined) {
			if (resolved === props) resolved = props == null ? {} : { ...props };
			resolved[key] = defaults[key];
		}
	}
	return resolved;
}

function escapeElementKey(key: string): string {
	return '$' + key.replace(/[=:]/g, (match) => (match === '=' ? '=0' : '=2'));
}

/** Preserve React-compatible slash escaping for flattened mapped children. */
export function escapeMappedElementKey(key: string): string {
	return key.replace(/\/+/g, '$&/');
}

/** Preserve explicit escaped child keys and implicit base-36 positional keys. */
export function childElementKey(child: any, index: number): string {
	return child != null && typeof child === 'object' && child.key != null
		? escapeElementKey('' + child.key)
		: index.toString(36);
}

/** React accepts iterable objects but ignores functions with attached iterators. */
export function childrenIterator(children: any): (() => Iterator<any>) | null {
	if (children == null || typeof children !== 'object') return null;
	const iterator =
		(typeof Symbol === 'function' && (children as any)[Symbol.iterator]) ||
		(children as any)['@@iterator'];
	return typeof iterator === 'function' ? iterator : null;
}
