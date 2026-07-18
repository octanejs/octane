import { describe, it, expect } from 'vitest';
// Deep import: the server entry ships with the SSR phase; the serializer's
// output contract is testable without it.
import { getPackageLocalizationScript } from '../src/i18n/server';

const localeSymbol = Symbol.for('react-aria.i18n.locale');
const stringsSymbol = Symbol.for('react-aria.i18n.strings');

describe('@octanejs/aria — i18n server serializer', () => {
	it('emits an executable bootstrap script when more than 26 strings are hoisted', () => {
		// A string is hoisted into a variable when it appears in more than one
		// package; 30 shared strings push past the 26 single-letter names.
		const shared: Record<string, string> = {};
		for (let i = 0; i < 30; i++) shared['key' + i] = 'shared string ' + i;
		const strings = { pkgA: { ...shared }, pkgB: { ...shared } };

		const script = getPackageLocalizationScript('ar-AE', strings as any);
		try {
			// The inline bootstrap must parse and run — hoisted-name overflow used to
			// produce invalid identifiers ('{', '|', …) and a SyntaxError here.
			new Function(script)();
			expect((window as any)[localeSymbol]).toBe('ar-AE');
			const installed = (window as any)[stringsSymbol];
			expect(installed.pkgA['key0']).toBe('shared string 0');
			expect(installed.pkgB['key29']).toBe('shared string 29');
		} finally {
			delete (window as any)[localeSymbol];
			delete (window as any)[stringsSymbol];
		}
	});
});
