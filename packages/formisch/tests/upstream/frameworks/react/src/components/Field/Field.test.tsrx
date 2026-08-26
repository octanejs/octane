import { fireEvent, render, screen, waitFor } from '@octanejs/testing-library';
import type { OctaneNode } from 'octane';
import * as v from 'valibot';
import { describe, expect, test, vi } from 'vitest';
import { useForm } from '@octanejs/formisch';
import type { FieldStore } from '@octanejs/formisch';
import { Field } from '@octanejs/formisch';

const schema = v.object({ name: v.string() });
type FormSchema = typeof schema;

describe('Field', () => {
	// Per frameworks/react/src/components/Field/Field.test.tsx:13
	test('should render JSX returned from children', () => {
		function Test(): OctaneNode {
			const form = useForm({ schema });
			return <Field of={form} path={['name']}>
				{() => <span data-testid="content">hello</span>}
			</Field>;
		}

		render(<Test />);

		expect(screen.getByTestId('content')).toHaveTextContent('hello');
	});

	// Per frameworks/react/src/components/Field/Field.test.tsx:28
	test('should invoke children with the field store', () => {
		const renderProp = vi.fn<(field: FieldStore<FormSchema, ['name']>) => OctaneNode>(
			() => <span />,
		);

		function Test(): OctaneNode {
			const form = useForm({ schema, initialInput: { name: 'John' } });
			return <Field of={form} path={['name']}>{renderProp}</Field>;
		}

		render(<Test />);

		expect(renderProp).toHaveBeenCalled();
		const field = renderProp.mock.lastCall![0];
		expect(field.path).toEqual(['name']);
		expect(field.input).toBe('John');
		expect(field.props.name).toBe('["name"]');
		expect(typeof field.props.onChange).toBe('function');
	});

	// Per frameworks/react/src/components/Field/Field.test.tsx:52
	test('should re-render when the field store updates', async () => {
		function Test(): OctaneNode {
			const form = useForm({ schema, initialInput: { name: 'initial' } });
			return <Field of={form} path={['name']}>
				{(field) => <>
					<input data-testid="input" {...field.props} value={field.input ?? ''} />
					<span data-testid="dirty">{String(field.isDirty)}</span>
				</>}
			</Field>;
		}

		render(<Test />);

		const input = screen.getByTestId('input') as HTMLInputElement;
		const dirty = screen.getByTestId('dirty');

		expect(input.value).toBe('initial');
		expect(dirty).toHaveTextContent('false');

		fireEvent.input(input, { target: { value: 'changed' } });

		await waitFor(() => {
			expect(input.value).toBe('changed');
			expect(dirty).toHaveTextContent('true');
		});
	});
});
