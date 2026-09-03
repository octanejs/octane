import { expect, expectTypeOf, it } from 'vitest';
import * as dom from '@testing-library/dom';
import * as testingLibrary from '../src/index';
import * as pure from '../src/pure';

it('preserves the complete DOM query surface in both public entrypoints', () => {
	for (const name of Object.keys(dom)) {
		if (name === 'fireEvent' || name === 'default') continue;
		expect(Reflect.get(testingLibrary, name), name).toBe(Reflect.get(dom, name));
		expect(Reflect.get(pure, name), name).toBe(Reflect.get(dom, name));
	}

	const container = document.createElement('div');
	const button = document.createElement('button');
	container.append(button);
	const query = (_container: HTMLElement, name: string) => (name === 'button' ? [button] : []);
	const single = testingLibrary.makeSingleQuery(query, () => 'multiple buttons');
	const all = testingLibrary.makeGetAllQuery(query, () => 'missing button');
	const namespaceSingle = testingLibrary.queryHelpers.makeSingleQuery(
		query,
		() => 'multiple buttons',
	);
	expect(testingLibrary.queryHelpers).toBe(dom.queryHelpers);
	expect(namespaceSingle(container, 'button')).toBe(button);
	expectTypeOf(namespaceSingle).toEqualTypeOf<typeof single>();
	expectTypeOf(testingLibrary.queryHelpers.makeFindQuery(namespaceSingle)).returns.toEqualTypeOf<
		Promise<HTMLButtonElement | null>
	>();
	expect(single(container, 'button')).toBe(button);
	expect(single(container, 'missing')).toBeNull();
	expect(all(container, 'button')).toEqual([button]);
	expect(() => all(container, 'missing')).toThrow('missing button');
	expectTypeOf(single).parameter(1).toEqualTypeOf<string>();
	expectTypeOf(single).returns.toEqualTypeOf<HTMLButtonElement | null>();
	expectTypeOf(all).returns.toEqualTypeOf<HTMLButtonElement[]>();
	expectTypeOf(testingLibrary.makeFindQuery(single)).returns.toEqualTypeOf<
		Promise<HTMLButtonElement | null>
	>();
});
