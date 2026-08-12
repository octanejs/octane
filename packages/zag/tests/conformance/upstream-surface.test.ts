import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as zag from '@octanejs/zag';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('@zag-js/react public surface', () => {
	it('provides the stable exports from @zag-js/react@1.42.0', () => {
		expect(Object.keys(zag).sort()).toEqual(
			['Portal', 'mergeProps', 'normalizeProps', 'useMachine', 'useSyncExternalStore'].sort(),
		);
	});

	it('keeps React out of the published dependency and source graphs', () => {
		const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
		expect(manifest.dependencies).not.toHaveProperty('react');
		expect(manifest.dependencies).not.toHaveProperty('react-dom');

		const source = readdirSync(join(packageRoot, 'src'))
			.filter(function keepTs(file) {
				return file.endsWith('.ts');
			})
			.map(function readSource(file) {
				return readFileSync(join(packageRoot, 'src', file), 'utf8');
			})
			.join('\n');
		expect(source).not.toMatch(/from ['"]react(?:-dom)?(?:\/[^'"]*)?['"]/);
	});

	it('maps React-style change handlers to Octane input handlers for text hosts', () => {
		const onChange = function onChange() {};
		const ref = function ref() {};
		const normalized = zag.normalizeProps.input({ onChange, ref });

		expect(normalized).not.toHaveProperty('onChange');
		expect(normalized.onInput).toBe(onChange);
		expect(normalized.ref).toBe(ref);
	});

	it('preserves native onChange for select and non-text inputs', () => {
		const onChange = function onChange() {};

		const selectProps = zag.normalizeProps.select({ onChange });
		expect(selectProps.onChange).toBe(onChange);
		expect(selectProps).not.toHaveProperty('onInput');

		const checkboxProps = zag.normalizeProps.input({ type: 'checkbox', onChange });
		expect(checkboxProps.onChange).toBe(onChange);
		expect(checkboxProps).not.toHaveProperty('onInput');

		const radioProps = zag.normalizeProps.input({ type: 'radio', onChange });
		expect(radioProps.onChange).toBe(onChange);
		expect(radioProps).not.toHaveProperty('onInput');

		const fileProps = zag.normalizeProps.input({ type: 'file', onChange });
		expect(fileProps.onChange).toBe(onChange);
		expect(fileProps).not.toHaveProperty('onInput');

		const dateProps = zag.normalizeProps.input({ type: 'date', onChange });
		expect(dateProps.onChange).toBe(onChange);
		expect(dateProps).not.toHaveProperty('onInput');

		const rangeProps = zag.normalizeProps.input({ type: 'range', onChange });
		expect(rangeProps.onChange).toBe(onChange);
		expect(rangeProps).not.toHaveProperty('onInput');
	});
});
