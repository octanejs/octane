import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import {
	DirectServerHookApp,
	ServerApp,
	WrappedServerHookApp,
	WrappedThrowingServerApp,
} from '../_fixtures/server.tsrx';

describe('@octanejs/react-error-boundary/server', () => {
	it('lets descendant render failures propagate', () => {
		expect(() => renderToString(ServerApp)).toThrow('server failure');
		expect(() => renderToString(WrappedThrowingServerApp)).toThrow('server failure');
	});

	it('provides idle context to direct and HOC descendants without catching', () => {
		expect(renderToString(DirectServerHookApp).html).toContain(
			'id="direct-server-hook">idle</span>',
		);
		expect(renderToString(WrappedServerHookApp).html).toContain('id="hoc-server-hook">idle</span>');
	});
});
