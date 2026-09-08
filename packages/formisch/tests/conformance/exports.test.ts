import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { Field, FieldArray, Form, useField, useFieldArray, useForm } from '@octanejs/formisch';

describe('package exports', () => {
	it('exports the Formisch component and hook surface', () => {
		expect(Field).toBeTypeOf('function');
		expect(FieldArray).toBeTypeOf('function');
		expect(Form).toBeTypeOf('function');
		expect(useField).toBeTypeOf('function');
		expect(useFieldArray).toBeTypeOf('function');
		expect(useForm).toBeTypeOf('function');
	});
});

it('keeps React imports out of authored Formisch source and adapted type probes', () => {
	const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
	const violations: string[] = [];
	for (const directory of ['src', 'typetests']) {
		for (const file of readdirSync(join(packageRoot, directory), { recursive: true })) {
			if (!/\.(?:ts|tsx|tsrx|js)$/.test(file)) continue;
			const source = readFileSync(join(packageRoot, directory, file), 'utf8');
			for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
				if (
					/^(?:react|react-dom)(?:\/|$)/.test(imported.fileName) ||
					imported.fileName === '@formisch/react'
				) {
					violations.push(`${directory}/${file}: ${imported.fileName}`);
				}
			}
		}
	}
	expect(violations).toEqual([]);
});
