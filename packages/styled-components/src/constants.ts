// Ported from styled-components 6.4.3 (MIT). Octane adaptations: no React/RSC
// probing; adds the octane SSR css-channel chunk prefix.
declare let SC_DISABLE_SPEEDY: boolean | null | undefined;

export const SC_ATTR: string =
	(typeof process !== 'undefined' &&
		typeof process.env !== 'undefined' &&
		(process.env.REACT_APP_SC_ATTR || process.env.SC_ATTR)) ||
	'data-styled';

export const SC_ATTR_ACTIVE = 'active';
export const SC_ATTR_VERSION = 'data-styled-version';
export const SC_VERSION = '6.4.3';
export const SPLITTER = '/*!sc*/\n';

export const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';

// Chunk ids emitted into octane's SSR css channel are namespaced `sc.<cid>.<name>`
// so client-boot rehydration can tell this binding's chunks apart from octane's
// own scoped-style hashes on the shared `data-octane` attribute.
export const OCTANE_CHUNK_PREFIX = 'sc.';

function readSpeedyFlag(name: string): boolean | undefined {
	if (typeof process !== 'undefined' && typeof process.env !== 'undefined') {
		const val = process.env[name];
		if (val !== undefined && val !== '') {
			return val !== 'false';
		}
	}
	return undefined;
}

export const DISABLE_SPEEDY = Boolean(
	typeof SC_DISABLE_SPEEDY === 'boolean'
		? SC_DISABLE_SPEEDY
		: (readSpeedyFlag('REACT_APP_SC_DISABLE_SPEEDY') ??
				readSpeedyFlag('SC_DISABLE_SPEEDY') ??
				(typeof process !== 'undefined' && typeof process.env !== 'undefined'
					? process.env.NODE_ENV !== 'production'
					: false)),
);

export const KEYFRAMES_ID_PREFIX = 'sc-keyframes-';

// Shared empty execution context when generating static styles
export const STATIC_EXECUTION_CONTEXT = {};
