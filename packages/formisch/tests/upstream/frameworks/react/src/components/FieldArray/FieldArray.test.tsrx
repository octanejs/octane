import { insert } from '@octanejs/formisch';
import { fireEvent, render, screen, waitFor } from '@octanejs/testing-library';
import type { OctaneNode } from 'octane';
import * as v from 'valibot';
import { describe, expect, test, vi } from 'vitest';
import { useForm } from '@octanejs/formisch';
import type { FieldArrayStore } from '@octanejs/formisch';
import { FieldArray } from '@octanejs/formisch';

const schema = v.object({ items: v.array(v.string()) });
type FormSchema = typeof schema;

describe('FieldArray', () => {
	// Per frameworks/react/src/components/FieldArray/FieldArray.test.tsx:14
	test('should render JSX returned from children', () => {
		function Test(): OctaneNode {
			const form = useForm({ schema });
			return <FieldArray of={form} path={['items']}>
				{() => <span data-testid="content">hello</span>}
			</FieldArray>;
		}

		render(<Test />);

		expect(screen.getByTestId('content')).toHaveTextContent('hello');
	});

	// Per frameworks/react/src/components/FieldArray/FieldArray.test.tsx:29
	test('should invoke children with the field array store', () => {
		const renderProp = vi.fn<(field: FieldArrayStore<FormSchema, ['items']>) => OctaneNode>(
			() => <span />,
		);

		function Test(): OctaneNode {
			const form = useForm({ schema, initialInput: { items: ['a', 'b'] } });
			return <FieldArray of={form} path={['items']}>{renderProp}</FieldArray>;
		}

		render(<Test />);

		expect(renderProp).toHaveBeenCalled();
		const field = renderProp.mock.lastCall![0];
		expect(field.path).toEqual(['items']);
		expect(field.items).toHaveLength(2);
		expect(field.isValid).toBe(true);
	});

	// Per frameworks/react/src/components/FieldArray/FieldArray.test.tsx:52
	test('should re-render when the field array store updates', async () => {
		function Test(): OctaneNode {
			const form = useForm({ schema, initialInput: { items: ['a', 'b'] } });
			return <div>
				<button type="button" onClick={() => insert(form, { path: ['items'], initialInput: 'c' })}>
					Add
				</button>
				<FieldArray of={form} path={['items']}>
					{(field) => <span data-testid="count">{field.items.length}</span>}
				</FieldArray>
			</div>;
		}

		render(<Test />);

		const count = screen.getByTestId('count');

		expect(count).toHaveTextContent('2');

		fireEvent.click(screen.getByText('Add'));

		await waitFor(() => {
			expect(count).toHaveTextContent('3');
		});
	});
});
