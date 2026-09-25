import { flushSync, hydrateRoot } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { describe, expect, it, vi } from 'vitest';

import { loadServerFixture } from '../_server-fixture.js';
import { FunctionChildrenHost } from './_fixtures/function-children-host.tsrx';

const server = loadServerFixture(
	'packages/octane/tests/hydration/_fixtures/function-children-host.tsrx',
);

describe('function children in descriptor hosts', () => {
	for (const siblings of [false, true]) {
		it(`adopts function children ${siblings ? 'between siblings' : 'as a sole child'}`, () => {
			const ref = { current: null as HTMLButtonElement | null };
			const onClick = vi.fn();
			const props = { siblings, label: 'initial', ref, onClick };
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.FunctionChildrenHost, props).html;
			document.body.appendChild(container);
			const host = container.querySelector('#descriptor-host');
			const button = container.querySelector('#function-child') as HTMLButtonElement;
			const adjacent = [...container.querySelectorAll('i')];
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				expect(ref.current).toBeNull();
				root = hydrateRoot(container, FunctionChildrenHost, props);
				flushSync(() => {});
				expect(errors).not.toHaveBeenCalled();
				expect(container.querySelector('#descriptor-host')).toBe(host);
				expect(container.querySelector('#function-child')).toBe(button);
				expect(ref.current).toBe(button);
				flushSync(() => button.click());
				expect(onClick).toHaveBeenCalledTimes(1);
				flushSync(() => root!.render(FunctionChildrenHost, { ...props, label: 'updated' }));
				expect(container.querySelector('#function-child')).toBe(button);
				expect(button.textContent).toBe('updated');
				expect([...container.querySelectorAll('i')]).toEqual(adjacent);
				expect(host?.textContent).toBe(siblings ? 'beforeupdatedafter' : 'updated');
			} finally {
				root?.unmount();
				container.remove();
				errors.mockRestore();
			}
			expect(ref.current).toBeNull();
		});
	}
});
