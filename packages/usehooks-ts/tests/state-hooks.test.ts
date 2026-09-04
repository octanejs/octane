import { afterEach, describe, expect, it } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import { StateProbe, StepValidationProbe } from './_fixtures/hooks.tsrx';

afterEach(() => document.body.replaceChildren());

describe('state hooks', () => {
	it('keeps omitted optional arguments and two call sites independent', () => {
		const result = mount(StateProbe);
		expect(result.find('#state').textContent).toBe('false/true/2/false/1/1');
		result.click('#first');
		expect(result.find('#state').textContent).toBe('true/true/2/false/1/1');
		result.click('#second');
		expect(result.find('#state').textContent).toBe('true/false/2/false/1/1');
		result.unmount();
	});

	it('matches the pinned counter, toggle, map, and step transitions', () => {
		const result = mount(StateProbe);
		result.click('#increment');
		result.click('#toggle');
		result.click('#map');
		result.click('#next');
		expect(result.find('#state').textContent).toBe('false/true/3/true/2/2');
		result.click('#reset');
		result.click('#remove');
		expect(result.find('#state').textContent).toBe('false/true/2/true/-/2');
		result.unmount();
	});

	it('replaces map contents and supports previous and updater step transitions', () => {
		const result = mount(StateProbe);
		result.click('#map-all');
		expect(result.find('#state').textContent).toBe('false/true/2/false/-/1');
		result.click('#set-updater');
		expect(result.find('#state').textContent).toBe('false/true/2/false/-/2');
		result.click('#prev');
		expect(result.find('#state').textContent).toBe('false/true/2/false/-/1');
		result.unmount();
	});

	it.each([0, 3, Number.NaN])(
		'rejects invalid step value %s before scheduling a render',
		(value) => {
			let setStep: ((value: number) => void) | undefined;
			const result = mount(StepValidationProbe, {
				onReady(actions) {
					setStep = actions.setStep;
				},
			});
			try {
				expect(() => setStep?.(value)).toThrow('Step not valid');
				expect(result.find('p').textContent).toBe('1');
			} finally {
				result.unmount();
			}
		},
	);

	it('validates updater results immediately without losing earlier same-turn actions', () => {
		let setStep: ((value: number | ((previous: number) => number)) => void) | undefined;
		const result = mount(StepValidationProbe, {
			onReady(actions) {
				setStep = actions.setStep;
			},
		});
		try {
			let rejected: unknown;
			act(() => {
				setStep!(2);
				try {
					setStep!((step) => step + 1);
				} catch (error) {
					rejected = error;
				}
				setStep!((step) => step - 1);
			});
			expect(rejected).toBeInstanceOf(Error);
			expect((rejected as Error).message).toBe('Step not valid');
			expect(result.find('p').textContent).toBe('1');
		} finally {
			result.unmount();
		}
	});

	it('keeps repeated same-turn step actions within both bounds', () => {
		let actions:
			| {
					goToNextStep(): void;
					goToPrevStep(): void;
					setStep(value: number | ((previous: number) => number)): void;
			  }
			| undefined;
		const result = mount(StepValidationProbe, {
			onReady(nextActions) {
				actions = nextActions;
			},
		});

		const next = actions!.goToNextStep;
		act(() => {
			next();
			next();
		});
		expect(result.find('p').textContent).toBe('2');

		const previous = actions!.goToPrevStep;
		act(() => {
			previous();
			previous();
		});
		expect(result.find('p').textContent).toBe('1');

		const setStep = actions!.setStep;
		act(() => {
			setStep((step) => step + 1);
			setStep((step) => step - 1);
		});
		expect(result.find('p').textContent).toBe('1');

		result.unmount();
	});
});
