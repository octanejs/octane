// Ported from react-hook-form@7.81.0 src/__tests__/watch.server.test.tsx
// (jest → vitest, octane server runtime).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';

import { useForm } from '../../src/useForm';
import { Watch } from '../../src/watch.tsrx';

describe('Watch with SSR', () => {
	it('should be rendered correctly', () => {
		const Component = () => {
			const { control } = useForm({ defaultValues: { foo: 'bar' } });
			return (
				<Watch control={control} names={['foo']} render={([foo]: [string]) => <span>{foo}</span>} />
			);
		};

		expect(renderToStaticMarkup(Component).html).toBe('<span>bar</span>');
	});
});
