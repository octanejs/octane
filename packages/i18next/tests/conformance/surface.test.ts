import { describe, expect, it } from 'vitest';
import { createElement, isValidElement } from 'octane';
import * as binding from '@octanejs/i18next';
import * as upstream from 'react-i18next';
import { renderTranslation } from '../../src/IcuTransUtils/index.js';

describe('@octanejs/i18next public and pure-helper parity', () => {
	it('matches the react-i18next 17.0.9 root runtime export surface', () => {
		expect(Object.keys(binding).sort()).toEqual(Object.keys(upstream).sort());
	});

	it('serializes descriptor children using upstream Trans numbering rules', () => {
		const children = [
			'lorem ',
			createElement('strong', null, 'bold'),
			' and ',
			createElement('i', { className: 'icon' }),
		];

		expect(
			binding.nodesToString(children, {
				transSupportBasicHtmlNodes: true,
				transKeepBasicHtmlNodesFor: ['br', 'strong', 'i'],
			}),
		).toBe('lorem <strong>bold</strong> and <3></3>');
	});

	it('serializes interpolation objects and dynamic-list declarations', () => {
		expect(binding.nodesToString(['Hello ', { name: 'Ada' }], {})).toBe('Hello {{name}}');
		expect(
			binding.nodesToString(
				[
					'Items ',
					createElement(
						'ul',
						{ i18nIsDynamicList: true },
						createElement('li', null, 'one'),
						createElement('li', null, 'two'),
					),
				],
				{},
			),
		).toBe('Items <1></1>');
	});

	it('reconstructs nested ICU declarations as Octane descriptors', () => {
		const result = renderTranslation('<0>outer <0>inner &amp; safe</0></0>', [
			{
				type: 'div',
				props: { children: [{ type: 'strong', props: { className: 'nested' } }] },
			},
		]);

		expect(result).toHaveLength(1);
		expect(isValidElement(result[0])).toBe(true);
		expect(result[0]).toMatchObject({ type: 'div' });
		const nested = result[0].children;
		expect(nested[0]).toBe('outer ');
		expect(nested[1]).toMatchObject({
			type: 'strong',
			props: { className: 'nested' },
			children: 'inner & safe',
		});
	});

	it('exposes the i18next third-party initialization contract', () => {
		expect(binding.initReactI18next.type).toBe('3rdParty');
	});
});
