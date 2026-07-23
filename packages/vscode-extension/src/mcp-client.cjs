'use strict';

const { OCTANE_MCP_ENDPOINT } = require('./mcp-provider.cjs');

let requestId = 0;

class OctaneMcpError extends Error {
	/** @param {string} message @param {unknown} [details] */
	constructor(message, details) {
		super(message);
		this.name = 'OctaneMcpError';
		this.details = details;
	}
}

/**
 * @param {string} method
 * @param {unknown} params
 * @param {{ fetch?: typeof fetch, signal?: AbortSignal }} [options]
 */
async function requestOctaneMcp(method, params, options = {}) {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	if (typeof fetchImpl !== 'function') {
		throw new OctaneMcpError('This VS Code runtime does not provide HTTP fetch.');
	}
	const response = await fetchImpl(OCTANE_MCP_ENDPOINT, {
		method: 'POST',
		headers: {
			accept: 'application/json, text/event-stream',
			'content-type': 'application/json',
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
		signal: options.signal,
	});
	if (!response.ok) {
		throw new OctaneMcpError(`Octane MCP returned HTTP ${response.status}.`);
	}
	/** @type {any} */
	const payload = await response.json();
	if (payload.error) {
		throw new OctaneMcpError(payload.error.message ?? 'Octane MCP request failed.', payload.error);
	}
	return payload.result;
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} args
 * @param {{ fetch?: typeof fetch, signal?: AbortSignal }} [options]
 */
async function callOctaneMcpTool(name, args, options) {
	/** @type {any} */
	const result = await requestOctaneMcp('tools/call', { name, arguments: args }, options);
	/** @type {Array<{ type: string, text?: string }>} */
	const content = result?.content ?? [];
	const text = content
		.filter((part) => part.type === 'text' && typeof part.text === 'string')
		.map((part) => part.text)
		.join('\n\n');
	if (result?.isError) throw new OctaneMcpError(text || `Octane MCP tool ${name} failed.`);
	return text;
}

module.exports = { OctaneMcpError, callOctaneMcpTool, requestOctaneMcp };
