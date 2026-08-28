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
