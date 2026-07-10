// Ported from react-hook-form@7.81.0 src/__tests__/useFormContext.server.test.tsx
// (jest → vitest, octane server runtime).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';

import { useController } from '../../src/useController';
import { useForm } from '../../src/useForm';
import { FormProvider, useFormContext } from '../../src/useFormContext';
import { useFormState } from '../../src/useFormState';
import { useWatch } from '../../src/useWatch';

describe('FormProvider', () => {
	it('should work correctly with Controller, useWatch, useFormState.', () => {
		const App = () => {
			const { field } = useController({
				name: 'test',
				defaultValue: '',
			});
			return <input {...field} />;
		};

		const TestWatch = () => {
			const value = useWatch({
				name: 'test',
			});

			return <p>{value}</p>;
		};

		const TestFormState = () => {
			const { isDirty } = useFormState();

			return <div>{isDirty ? 'yes' : 'no'}</div>;
		};

		const TestUseFormContext = () => {
			const methods = useFormContext();
			methods.register('test');
			return null;
		};

		const Component = () => {
			const methods = useForm();

			return (
				<FormProvider {...methods}>
					<App />
					<TestUseFormContext />
					<TestWatch />
					<TestFormState />
				</FormProvider>
			);
		};

		const output = renderToStaticMarkup(Component).html;

		expect(output).toEqual('<input name="test" value=""/><p></p><div>no</div>');
	});
});
