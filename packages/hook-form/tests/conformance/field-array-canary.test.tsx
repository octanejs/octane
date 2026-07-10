// R6 canary — upstream useFieldArray tests render lists with BLOCK-BODY
// `.map()` callbacks (the runtime de-opt childSlot path, not the compiler's
// keyed forBlock fast path). This pins that swap/move/remove through that path
// preserve focused-input identity (document.activeElement) and values BEFORE
// the ~215-test field-array suite lands.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, act } from '@octanejs/testing-library';
import { useForm, useFieldArray } from '@octanejs/hook-form';
import type { UseFieldArrayReturn } from '@octanejs/hook-form';

type FormValues = { items: { value: string }[] };

let arrayMethods!: UseFieldArrayReturn<FormValues, 'items'>;

function App() {
	const { register, control } = useForm<FormValues>({
		defaultValues: {
			items: [{ value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' }],
		},
	});
	const methods = useFieldArray({ control, name: 'items' });
	arrayMethods = methods;
	return (
		<div>
			{methods.fields.map((field, index) => {
				// deliberately block-body: exercises the de-opt childSlot path
				const id = `item-${index}`;
				return (
					<input key={field.id} data-testid={id} {...register(`items.${index}.value` as const)} />
				);
			})}
		</div>
	);
}

const values = () => screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value);

describe('field array de-opt list canary', () => {
	it('renders defaults through a block-body map', () => {
		render(<App />);
		expect(values()).toEqual(['a', 'b', 'c', 'd']);
	});

	it('swap preserves survivor DOM node identity and untouched-node focus', async () => {
		render(<App />);
		const before = screen.getAllByRole('textbox') as HTMLInputElement[];
		// focus a node NOT involved in the reorder — reconcilers (React and
		// octane alike) may physically move a swapped node, and the platform
		// blurs a node on insertBefore; only unmoved-node focus is guaranteed.
		act(() => before[3].focus());

		await act(async () => {
			arrayMethods.swap(0, 1);
		});
		expect(values()).toEqual(['b', 'a', 'c', 'd']);
		const after = screen.getAllByRole('textbox') as HTMLInputElement[];
		// keyed survivors keep their physical nodes (value travels with node)
		expect(after[0]).toBe(before[1]);
		expect(after[1]).toBe(before[0]);
		expect(after[2]).toBe(before[2]);
		expect(after[3]).toBe(before[3]);
		expect(document.activeElement).toBe(before[3]);
	});

	it('remove keeps surviving nodes and values', async () => {
		render(<App />);
		const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
		fireEvent.input(inputs[1], { target: { value: 'edited' } });

		await act(async () => {
			arrayMethods.remove(0);
		});
		expect(values()).toEqual(['edited', 'c', 'd']);
		expect(screen.getAllByRole('textbox')[0]).toBe(inputs[1]);
	});

	it('append focuses the new field by default', async () => {
		render(<App />);
		await act(async () => {
			arrayMethods.append({ value: 'e' });
		});
		expect(values()).toEqual(['a', 'b', 'c', 'd', 'e']);
		const inputs = screen.getAllByRole('textbox');
		expect(document.activeElement).toBe(inputs[4]);
	});
});
