const COUNTER_TARGETS = new Map([
	['@tsrx/core', 'adapter'],
	['oxc-tsrx/tsrx-core-compat', 'authoritative'],
]);

const COUNTER_KEY = 'octane.tsrx-vite-preflight-parsing.parse-counts';

function wrapperSource(url, kind) {
	const request = JSON.stringify(url);
	return `
import * as implementation from ${request};
export * from ${request};

const counterKey = Symbol.for(${JSON.stringify(COUNTER_KEY)});

export function parseModule(source, filename, ...rest) {
	const counter = globalThis[counterKey];
	if (
		counter !== undefined &&
		source === counter.source &&
		counter.ids.includes(filename)
	) {
		counter.${kind}++;
		counter.calls.push({ kind: ${JSON.stringify(kind)}, filename });
	}
	return implementation.parseModule(source, filename, ...rest);
}
`;
}

export async function resolve(specifier, context, nextResolve) {
	const kind = COUNTER_TARGETS.get(specifier);
	if (kind === undefined) return nextResolve(specifier, context);
	const resolved = await nextResolve(specifier, context);
	return {
		url: `data:text/javascript;base64,${Buffer.from(wrapperSource(resolved.url, kind)).toString('base64')}`,
		shortCircuit: true,
	};
}
