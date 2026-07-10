// Ported from react-hook-form@7.81.0 src/__tests__/formStateSubscribe.server.test.tsx
// (jest → vitest, octane server runtime).
import { describe, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';

import { FormStateSubscribe } from '../../src/formStateSubscribe.tsrx';
import { useForm } from '../../src/useForm';

describe('FormStateSubscribe with SSR', () => {
	it('should render correctly', () => {
		const Component = () => {
			const { control } = useForm<{
				test: string;
			}>();

			return (
				<FormStateSubscribe
					control={control}
					name="test"
					render={(state) => <span>{state.errors.test?.message as string}</span>}
				/>
			);
		};

		renderToStaticMarkup(Component);
	});
});
