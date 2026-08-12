import { describe, expect, it } from 'vitest';
import { Children as clientChildren, createElement as createClientElement } from 'octane';
import { Children as serverChildren, createElement as createServerElement } from 'octane/server';

const implementations = [
	{
		name: 'client',
		Children: clientChildren,
		createElement: (type: any, props?: any) => createClientElement(type, props),
	},
	{
		name: 'server',
		Children: serverChildren,
		createElement: (type: any, props?: any) => createServerElement(type, props),
	},
] as const;

describe.each(implementations)(
	'$name public element and child values',
	({ Children, createElement }) => {
		it('applies inherited component defaults to undefined values without mutating input props', () => {
			const Component = (props: { tone?: string; nullable?: string | null }) => props.tone;
			const defaults = Object.assign(Object.create({ inherited: 'prototype default' }), {
				tone: 'fallback',
				nullable: 'unused fallback',
			});
			(Component as typeof Component & { defaultProps?: typeof defaults }).defaultProps = defaults;
			const supplied = Object.freeze({ tone: undefined, nullable: null });

			const element = createElement(Component, supplied);

			expect(element.props).toEqual({
				tone: 'fallback',
				nullable: null,
				inherited: 'prototype default',
			});
			expect(supplied).toEqual({ tone: undefined, nullable: null });
		});

		it('preserves escaped mapped iterable keys and ignores callable iterable children', () => {
			const original = createElement('span', { key: 'key=:/root' });
			const iterable = {
				*['@@iterator']() {
					yield original;
				},
			};
			const mapped = Children.map(iterable, () => createElement('strong', { key: 'next/path' }));

			expect(mapped).toHaveLength(1);
			expect((mapped![0] as { key: string }).key).toBe('next//path/.$key=0=2/root');

			const callable = Object.assign(function ignoredChild() {}, {
				*[Symbol.iterator]() {
					yield original;
				},
			});
			expect(Children.toArray(callable)).toEqual([]);
		});
	},
);
