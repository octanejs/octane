/**
 * Depth- and size-bounded serialization of live application values.
 *
 * The `octane/devtools` bridge deliberately hands out live same-realm
 * references; this module is the single place they are converted into an
 * inert, JSON-safe form for the panel, agent prompts, and the MCP snapshot
 * endpoint. Serialization must never throw and never invoke application
 * getters beyond plain enumeration.
 */

export type SerializedValue =
	| { t: 'undefined' }
	| { t: 'null' }
	| { t: 'string'; v: string; truncated?: true }
	| { t: 'number'; v: number | string }
	| { t: 'boolean'; v: boolean }
	| { t: 'bigint'; v: string }
	| { t: 'symbol'; v: string }
	| { t: 'function'; name: string }
	| { t: 'date'; v: string }
	| { t: 'regexp'; v: string }
	| { t: 'element'; tag: string }
	| { t: 'error'; name: string; message: string }
	| { t: 'array'; items: SerializedValue[]; length: number; truncated?: true }
	| { t: 'map'; entries: [SerializedValue, SerializedValue][]; size: number; truncated?: true }
	| { t: 'set'; items: SerializedValue[]; size: number; truncated?: true }
	| {
			t: 'object';
			ctor: string | null;
			entries: [string, SerializedValue][];
			truncated?: true;
	  }
	| { t: 'circular' }
	| { t: 'max-depth' }
	| { t: 'unserializable'; reason: string };

export interface SerializeOptions {
	/** Maximum object/array nesting. Deeper values collapse to `max-depth`. */
	maxDepth?: number;
	/** Maximum entries kept per object/array/map/set level. */
	maxEntries?: number;
	/** Maximum retained string length. */
	maxString?: number;
}

const DEFAULTS: Required<SerializeOptions> = { maxDepth: 4, maxEntries: 24, maxString: 240 };

function serializeString(value: string, maxString: number): SerializedValue {
	if (value.length > maxString)
		return { t: 'string', v: value.slice(0, maxString), truncated: true };
	return { t: 'string', v: value };
}

function isDomNode(value: object): value is { nodeType: number; nodeName: string } {
	// Real instance check first: serialization runs in the page realm (the
	// bridge hands out same-realm references), so duck-typing is only the
	// fallback for Node-less environments — a plain app object shaped like
	// { nodeType, nodeName } (parser/AST state) must NOT collapse to a tag.
	if (typeof Node !== 'undefined') return value instanceof Node;
	return (
		typeof (value as { nodeType?: unknown }).nodeType === 'number' &&
		typeof (value as { nodeName?: unknown }).nodeName === 'string'
	);
}

function serializeInner(
	value: unknown,
	depth: number,
	options: Required<SerializeOptions>,
	seen: Set<object>,
): SerializedValue {
	switch (typeof value) {
		case 'undefined':
			return { t: 'undefined' };
		case 'string':
			return serializeString(value, options.maxString);
		case 'number':
			return { t: 'number', v: Number.isFinite(value) ? value : String(value) };
		case 'boolean':
			return { t: 'boolean', v: value };
		case 'bigint':
			return { t: 'bigint', v: value.toString() };
		case 'symbol':
			return { t: 'symbol', v: value.description ?? 'Symbol()' };
		case 'function':
			return { t: 'function', name: value.name || '<anonymous>' };
	}
	if (value === null) return { t: 'null' };
	const obj = value as object;
	if (seen.has(obj)) return { t: 'circular' };
	if (value instanceof Date) {
		const time = value.getTime();
		return { t: 'date', v: Number.isNaN(time) ? 'Invalid Date' : value.toISOString() };
	}
	if (value instanceof RegExp) return { t: 'regexp', v: String(value) };
	if (value instanceof Error) {
		return {
			t: 'error',
			name: value.name || 'Error',
			message: typeof value.message === 'string' ? value.message.slice(0, options.maxString) : '',
		};
	}
	if (isDomNode(obj)) return { t: 'element', tag: obj.nodeName.toLowerCase() };
	if (depth >= options.maxDepth) return { t: 'max-depth' };
	seen.add(obj);
	try {
		if (Array.isArray(value)) {
			const items: SerializedValue[] = [];
			const bound = Math.min(value.length, options.maxEntries);
			for (let i = 0; i < bound; i++)
				items.push(serializeInner(value[i], depth + 1, options, seen));
			return {
				t: 'array',
				items,
				length: value.length,
				...(value.length > bound ? { truncated: true as const } : null),
			};
		}
		if (value instanceof Map) {
			const entries: [SerializedValue, SerializedValue][] = [];
			for (const [k, v] of value) {
				if (entries.length >= options.maxEntries) break;
				entries.push([
					serializeInner(k, depth + 1, options, seen),
					serializeInner(v, depth + 1, options, seen),
				]);
			}
			return {
				t: 'map',
				entries,
				size: value.size,
				...(value.size > entries.length ? { truncated: true as const } : null),
			};
		}
		if (value instanceof Set) {
			const items: SerializedValue[] = [];
			for (const v of value) {
				if (items.length >= options.maxEntries) break;
				items.push(serializeInner(v, depth + 1, options, seen));
			}
			return {
				t: 'set',
				items,
				size: value.size,
				...(value.size > items.length ? { truncated: true as const } : null),
			};
		}
		const keys = Object.keys(obj);
		const entries: [string, SerializedValue][] = [];
		const bound = Math.min(keys.length, options.maxEntries);
		for (let i = 0; i < bound; i++) {
			const key = keys[i];
			let entry: unknown;
			try {
				entry = (obj as Record<string, unknown>)[key];
			} catch {
				entries.push([key, { t: 'unserializable', reason: 'getter threw' }]);
				continue;
			}
			entries.push([key, serializeInner(entry, depth + 1, options, seen)]);
		}
		const proto = Object.getPrototypeOf(obj) as { constructor?: { name?: string } } | null;
		const ctorName = proto?.constructor?.name;
		return {
			t: 'object',
			ctor: ctorName !== undefined && ctorName !== 'Object' ? ctorName : null,
			entries,
			...(keys.length > bound ? { truncated: true as const } : null),
		};
	} catch {
		return { t: 'unserializable', reason: 'enumeration threw' };
	} finally {
		seen.delete(obj);
	}
}

/** Serialize any live value into an inert, JSON-safe tagged tree. Never throws. */
export function serializeValue(value: unknown, options?: SerializeOptions): SerializedValue {
	const resolved: Required<SerializeOptions> = { ...DEFAULTS, ...options };
	try {
		return serializeInner(value, 0, resolved, new Set());
	} catch {
		return { t: 'unserializable', reason: 'serialization threw' };
	}
}

/** One-line display form of a serialized value, for tree rows and prompts. */
export function formatValuePreview(value: SerializedValue, maxLength = 80): string {
	const text = formatInner(value);
	return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function formatInner(value: SerializedValue): string {
	switch (value.t) {
		case 'undefined':
			return 'undefined';
		case 'null':
			return 'null';
		case 'string':
			return JSON.stringify(value.truncated === true ? `${value.v}…` : value.v);
		case 'number':
		case 'boolean':
			return String(value.v);
		case 'bigint':
			return `${value.v}n`;
		case 'symbol':
			return `Symbol(${value.v})`;
		case 'function':
			return `ƒ ${value.name}`;
		case 'date':
			return value.v;
		case 'regexp':
			return value.v;
		case 'element':
			return `<${value.tag}>`;
		case 'error':
			return `${value.name}: ${value.message}`;
		case 'array':
			return `Array(${value.length}) [${value.items.map(formatInner).join(', ')}${value.truncated === true ? ', …' : ''}]`;
		case 'map':
			return `Map(${value.size})`;
		case 'set':
			return `Set(${value.size})`;
		case 'object': {
			const body = value.entries.map(([key, entry]) => `${key}: ${formatInner(entry)}`).join(', ');
			const prefix = value.ctor !== null ? `${value.ctor} ` : '';
			return `${prefix}{${body}${value.truncated === true ? ', …' : ''}}`;
		}
		case 'circular':
			return '[circular]';
		case 'max-depth':
			return '…';
		case 'unserializable':
			return `[unserializable: ${value.reason}]`;
	}
}
