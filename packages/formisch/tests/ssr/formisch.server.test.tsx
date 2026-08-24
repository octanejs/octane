/** @jsxImportSource octane */
import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

import { Field, Form, useForm } from '../../src/index';

const Schema = v.object({ name: v.string() });

function ServerForm() {
	const form = useForm({ schema: Schema, initialInput: { name: 'Ada' } });
	return (
		<Form of={form}>
			<Field of={form} path={['name']}>
				{(field) => <input {...field.props} value={field.input} />}
			</Field>
		</Form>
	);
}

describe('@octanejs/formisch SSR', () => {
	// @parity-case differential:formisch-ssr
	it('renders a deterministic native form without browser access', () => {
		const first = renderToString(ServerForm).html;
		const second = renderToString(ServerForm).html;
		expect(first).toBe(second);
		expect(first).toContain('<form');
		expect(first).toContain('novalidate');
		expect(first).toContain('name="name"');
		expect(first).toContain('value="Ada"');
	});
});
