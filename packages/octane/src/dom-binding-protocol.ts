/** Compiler-owned DOM presentation markers. This leaf is shared by client and SSR. */
export type BindingKey = string | number;

export function encodeBindingKey(key: BindingKey): string {
	if (typeof key === 'string')
		return 's:' + JSON.stringify(key).replace(/-/g, '\\u002d').replace(/</g, '\\u003c');
	if (typeof key === 'number' && Number.isFinite(key)) return 'n:' + String(key);
	throw new TypeError('A DOM presentation key must be a string or finite number.');
}

export function decodeBindingKey(encoded: string): BindingKey {
	let key: unknown;
	try {
		key = JSON.parse(encoded.slice(2));
	} catch {
		throw new TypeError('A DOM presentation key has invalid serialized identity.');
	}
	if (
		(encoded.startsWith('s:') && typeof key === 'string') ||
		(encoded.startsWith('n:') && typeof key === 'number' && Number.isFinite(key))
	) {
		if (encodeBindingKey(key) === encoded) return key;
	}
	throw new TypeError('A DOM presentation key has invalid serialized identity.');
}

export interface BindingMarker {
	id: string;
	site: string;
	kind: 'root' | 'if' | 'for' | 'item' | 'text' | 'view' | 'slot' | 'opaque';
	arm?: number;
	key?: string;
}

export function parseBindingMarker(data: string): BindingMarker | null {
	if (data.startsWith('[f0;b;') || data.startsWith('[f1;b;')) {
		const separator = data.indexOf(';', 6);
		if (separator <= 6 || separator === data.length - 1) return null;
		return {
			id: data.slice(6, separator),
			site: data.slice(separator + 1),
			kind: 'for',
			arm: data.charCodeAt(2) - 48,
		};
	}
	if (!data.startsWith('[b;')) return null;
	const idEnd = data.indexOf(';', 3);
	if (idEnd <= 3 || idEnd === data.length - 1) return null;
	const id = data.slice(3, idEnd);
	if (data.slice(idEnd + 1) === 'root') return { id, site: 'root', kind: 'root' };
	const siteEnd = data.indexOf(';', idEnd + 1);
	if (siteEnd <= idEnd + 1 || siteEnd === data.length - 1) return null;
	const site = data.slice(idEnd + 1, siteEnd);
	const kind = data.slice(siteEnd + 1);
	if (kind === 't') return { id, site, kind: 'text' };
	if (kind === 'v') return { id, site, kind: 'view' };
	if (kind === 's') return { id, site, kind: 'slot' };
	if (kind === 'o') return { id, site, kind: 'opaque' };
	if (kind.startsWith('k;')) {
		const key = kind.slice(2);
		try {
			decodeBindingKey(key);
		} catch {
			return null;
		}
		return { id, site, kind: 'item', key };
	}
	if (/^(?:-1|0|[1-9]\d*)$/.test(kind)) {
		const arm = Number(kind);
		if (Number.isSafeInteger(arm)) return { id, site, kind: 'if', arm };
	}
	return null;
}

export function isBindingOpenComment(data: string): boolean {
	// The general hydration/early-stream path only counts balanced ranges. Keep
	// exact receipt decoding, key validation, and allocations in adoption itself.
	const list = data.startsWith('[f0;b;') || data.startsWith('[f1;b;');
	if (!list && !data.startsWith('[b;')) return false;
	const idStart = list ? 6 : 3;
	const idEnd = data.indexOf(';', idStart);
	if (idEnd <= idStart || idEnd === data.length - 1) return false;
	if (list) return data.indexOf(';', idEnd + 1) === -1;
	if (data.length - idEnd === 5 && data.endsWith(';root')) return true;
	const siteEnd = data.indexOf(';', idEnd + 1);
	if (siteEnd <= idEnd + 1 || siteEnd === data.length - 1) return false;
	const tail = siteEnd + 1;
	if (data.length === tail + 1) {
		const code = data.charCodeAt(tail);
		return (
			code === 116 || code === 118 || code === 115 || code === 111 || (code >= 48 && code <= 57)
		);
	}
	if (data.charCodeAt(tail) === 107 && data.charCodeAt(tail + 1) === 59)
		return (
			(data.charCodeAt(tail + 2) === 115 || data.charCodeAt(tail + 2) === 110) &&
			data.charCodeAt(tail + 3) === 58 &&
			data.length > tail + 4
		);
	if (data.length === tail + 2 && data.endsWith('-1')) return true;
	if (data.charCodeAt(tail) < 49 || data.charCodeAt(tail) > 57) return false;
	for (let index = tail + 1; index < data.length; index++) {
		const code = data.charCodeAt(index);
		if (code < 48 || code > 57) return false;
	}
	return true;
}
