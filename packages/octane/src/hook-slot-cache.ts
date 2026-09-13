// Frames retain bounded primitive path data, never hook owners or values.
const MAX_PATH_DEPTH = 16;
const MAX_BASE_SLOTS = 32;
const NATIVE_APPLY = Reflect.apply;
// A registry installed before this module loads is observable too. Bound and
// proxied functions stringify without the native method name; uncertain engine
// spellings simply leave caching disabled.
const INITIAL_SYMBOL_FOR = Symbol.for;
let NATIVE_SYMBOL_FOR: typeof Symbol.for | null = null;
try {
	const text = NATIVE_APPLY(Function.prototype.toString, INITIAL_SYMBOL_FOR, []);
	if (
		typeof INITIAL_SYMBOL_FOR === 'function' &&
		typeof text === 'string' &&
		/^function for\(\)\s*\{\s*\[native code\]\s*\}$/.test(text)
	)
		NATIVE_SYMBOL_FOR = INITIAL_SYMBOL_FOR;
} catch {
	// An altered function inspector must not make importing the runtime throw.
}

interface HookPathPart {
	prefix: string;
	tag: string;
	size: number;
	value: string;
}
interface CachedHookSlot extends HookPathPart {
	resolved: symbol;
}
interface HookPathFrame extends HookPathPart {
	path: string;
	slots: Map<unknown, CachedHookSlot> | null;
}
const frames: HookPathFrame[] = [];

function pathFrame(depth: number): HookPathFrame {
	return (frames[depth] ??= { prefix: '', tag: '', size: 0, value: '', path: '', slots: null });
}

/** Reuse compiler paths after observing every authored segment's coercion. */
export function resolveHookPath(
	stack: readonly unknown[],
	own: unknown,
	universal: boolean,
	server = false,
): symbol {
	const depth = stack.length;
	let prefix = universal ? '@octane:universal-hook:' : '@octane:hook:';
	let cacheable = depth < MAX_PATH_DEPTH;
	for (let index = 0; index <= depth; index++) {
		const last = index === depth;
		const part = last ? own : stack[index];
		cacheable &&= part === null || (typeof part !== 'object' && typeof part !== 'function');
		let tag: string;
		let size: number;
		let value: string;
		let encoded: string | undefined;
		if (!universal && last && own === undefined) {
			tag = '';
			size = 0;
			value = '';
		} else if (!universal) {
			tag = typeof part === 'number' ? 'n' : server && typeof part === 'string' ? 't' : 's';
			value =
				typeof part === 'number'
					? String(part)
					: server && typeof part === 'string'
						? part
						: ((part as symbol).description ?? '');
			size = value.length;
			// A replaced String function or Symbol description getter can return
			// nonstrings. Preserve their ordinary + coercion before continuing.
			if (typeof value !== 'string' || typeof size !== 'number') {
				encoded = tag + size + ':' + value;
				cacheable = false;
			}
		} else {
			tag = typeof part === 'symbol' ? 's' : 'v';
			// Universal slot coercion intentionally observes both reads. Complete
			// the first length's coercion before observing the second value.
			size = typeof part === 'symbol' ? (part.description?.length ?? 0) : String(part).length;
			const head = typeof size === 'number' ? undefined : `${tag}${size}:`;
			value = typeof part === 'symbol' ? (part.description ?? '') : String(part);
			if (head !== undefined || typeof value !== 'string') {
				encoded = `${head ?? `${tag}${size}:`}${value}`;
				cacheable = false;
			}
		}
		if (last) {
			const registry = Symbol;
			const intern = registry.for;
			if (!cacheable || intern !== NATIVE_SYMBOL_FOR) {
				const key = prefix + (encoded ?? (tag === '' ? '' : tag + size + ':' + value));
				return intern === NATIVE_SYMBOL_FOR ? intern(key) : NATIVE_APPLY(intern, registry, [key]);
			}
			const frame = pathFrame(depth);
			const slots = (frame.slots ??= new Map());
			const cached = slots.get(own);
			if (
				cached !== undefined &&
				cached.prefix === prefix &&
				cached.tag === tag &&
				cached.size === size &&
				cached.value === value
			)
				return cached.resolved;
			const resolved = intern(prefix + (tag === '' ? '' : tag + size + ':' + value));
			if (cached !== undefined) {
				cached.prefix = prefix;
				cached.tag = tag;
				cached.size = size;
				cached.value = value;
				cached.resolved = resolved;
			} else if (slots.size < MAX_BASE_SLOTS)
				slots.set(own, { prefix, tag, size, value, resolved });
			return resolved;
		}
		if (!cacheable) {
			prefix += encoded ?? tag + size + ':' + value;
			continue;
		}
		const frame = pathFrame(index);
		if (
			frame.prefix !== prefix ||
			frame.tag !== tag ||
			frame.size !== size ||
			frame.value !== value
		) {
			frame.prefix = prefix;
			frame.tag = tag;
			frame.size = size;
			frame.value = value;
			frame.path = prefix + tag + size + ':' + value;
		}
		prefix = frame.path;
	}
	throw new Error('Unreachable hook path');
}
