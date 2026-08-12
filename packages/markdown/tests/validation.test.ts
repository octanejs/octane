import type { ComponentBody } from 'octane';
import { prerender } from 'octane/static';
import { expect, it } from 'vitest';
import Markdown from '../src/index';

async function publicHtml(props: Parameters<typeof Markdown>[0]): Promise<string> {
	return (await prerender(Markdown as ComponentBody<typeof props>, props)).html.replace(
		/<!--\[-->|<!--\]-->/g,
		'',
	);
}

it.each([
	[null, ''],
	[undefined, ''],
])('accepts pinned empty child %j', async function (children, expected) {
	expect(await publicHtml({ children })).toBe(expected);
});

it('rejects non-string children with the pinned message', function () {
	expect(function () {
		Markdown({ children: 123 as never });
	}).toThrow('Unexpected value `123` for `children` prop, expected `string`');
});

it('rejects boolean true children with the exact pinned diagnostic', function () {
	expect(function () {
		Markdown({ children: true as never });
	}).toThrow('Unexpected value `true` for `children` prop, expected `string`');
});

it('rejects combined element lists with the pinned message', function () {
	expect(function () {
		Markdown({ children: 'x', allowedElements: [], disallowedElements: [] });
	}).toThrow(
		'Unexpected combined `allowedElements` and `disallowedElements`, expected one or the other',
	);
});

it.each([
	['allowDangerousHtml', undefined, 'remove it'],
	['source', 'children', 'use `children` instead'],
])('rejects removed prop %s', function (from, _to, action) {
	expect(function () {
		Markdown({ children: '', [from]: true } as never);
	}).toThrow(`Unexpected \`${from}\` prop, ${action}`);
});
