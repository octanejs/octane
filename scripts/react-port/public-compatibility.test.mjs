import assert from 'node:assert/strict';
import test from 'node:test';
import { publicCompatibilityExport } from './public-compatibility.mjs';

test('retained Base UI aliases use public pinned namespace witnesses at both import paths', () => {
	for (const specifier of ['@octanejs/base-ui', '@octanejs/base-ui/dialog']) {
		assert.deepEqual(publicCompatibilityExport(specifier, 'createDialogHandle'), {
			specifier: '@octanejs/base-ui/dialog',
			path: 'Dialog.createHandle',
			additionalArity: undefined,
		});
	}
	assert.equal(publicCompatibilityExport('@octanejs/base-ui', 'useMediaQuery').additionalArity, 1);
});

test('unknown names, unrelated entries and other bindings receive no compatibility waiver', () => {
	assert.equal(publicCompatibilityExport('@octanejs/base-ui', 'unknownExport'), undefined);
	assert.equal(publicCompatibilityExport('@octanejs/base-ui/select', 'DialogHandle'), undefined);
	assert.equal(publicCompatibilityExport('@octanejs/other', 'useMediaQuery'), undefined);
});
