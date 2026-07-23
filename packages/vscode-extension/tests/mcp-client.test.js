import { describe, expect, it, vi } from 'vitest';
import { OctaneMcpError, callOctaneMcpTool, requestOctaneMcp } from '../src/mcp-client.cjs';
import { OCTANE_MCP_ENDPOINT } from '../src/mcp-provider.cjs';

function response(payload, { ok = true, status = 200 } = {}) {
	return { json: vi.fn(async () => payload), ok, status };
}

describe('Octane MCP client', () => {
	it('uses stateless Streamable HTTP without credentials', async () => {
		const fetch = vi.fn(async () => response({ jsonrpc: '2.0', result: { tools: [] } }));
		const result = await requestOctaneMcp('tools/list', {}, { fetch });

		expect(result).toEqual({ tools: [] });
		expect(fetch).toHaveBeenCalledOnce();
		const [url, init] = fetch.mock.calls[0];
		expect(url).toBe(OCTANE_MCP_ENDPOINT);
		expect(init.headers).toEqual({
			accept: 'application/json, text/event-stream',
			'content-type': 'application/json',
		});
		expect(init.headers.authorization).toBeUndefined();
		expect(JSON.parse(init.body)).toMatchObject({
			jsonrpc: '2.0',
			method: 'tools/list',
			params: {},
		});
	});

	it('returns text tool content and surfaces protocol failures', async () => {
		const fetch = vi.fn(async () =>
			response({
				result: { content: [{ type: 'text', text: 'compiled' }] },
			}),
		);
		expect(await callOctaneMcpTool('octane_compile', { source: 'x' }, { fetch })).toBe('compiled');

		await expect(
			requestOctaneMcp(
				'tools/list',
				{},
				{
					fetch: vi.fn(async () => response({ error: { message: 'Unavailable' } })),
				},
			),
		).rejects.toEqual(expect.objectContaining({ name: 'OctaneMcpError', message: 'Unavailable' }));
		expect(new OctaneMcpError('x')).toBeInstanceOf(Error);
	});
});
