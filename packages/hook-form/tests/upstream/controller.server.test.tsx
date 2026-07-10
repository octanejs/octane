// Ported from react-hook-form@7.81.0 src/__tests__/controller.server.test.tsx
// (jest → vitest, octane server runtime).
import { describe, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';

import { Controller } from '../../src/controller.tsrx';
import { useForm } from '../../src/useForm';

describe('Controller with SSR', () => {
	// issue: https://github.com/react-hook-form/react-hook-form/issues/1398
	it('should render correctly with as with component', () => {
		const Component = () => {
			const { control } = useForm<{
				test: string;
			}>();

			return (
				<Controller
					defaultValue="default"
					name="test"
					render={({ field }) => <input {...field} />}
					control={control}
				/>
			);
		};

		renderToStaticMarkup(Component);
	});
});
