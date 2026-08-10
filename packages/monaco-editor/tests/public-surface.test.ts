import { describe, expect, it } from 'vitest';

import * as binding from '../src/index';
import * as upstream from '@monaco-editor/react';

describe('@octanejs/monaco-editor public surface', () => {
	it('matches the @monaco-editor/react 4.7.0 runtime exports', () => {
		expect(Object.keys(binding).sort()).toEqual(Object.keys(upstream).sort());
		expect(binding.default).toBe(binding.Editor);
	});
});
