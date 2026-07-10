// Ported from react-hook-form@7.81.0 src/__tests__/useForm.server.test.tsx
// (jest → vitest, octane server runtime). react-dom/server renderToString →
// octane renderToStaticMarkup (clean, non-hydratable HTML — matches upstream's
// marker-free expectations); expected strings re-baselined once for octane's
// serializer (it matches React's void-tag output), asserted against `.html`.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';

import { useForm } from '../../src/useForm';

describe('useForm with SSR', () => {
	it('should not output error', () => {
		const Component = () => {
			const { register } = useForm<{
				test: string;
			}>();
			return (
				<div>
					<input {...register('test')} />
				</div>
			);
		};

		const spy = vi.spyOn(console, 'error');

		expect(renderToStaticMarkup(Component).html).toEqual('<div><input name="test"/></div>');

		expect(spy).not.toHaveBeenCalled();
	});

	it('should display error with errors prop', () => {
		const App = () => {
			const {
				register,
				formState: { errors },
			} = useForm<{
				test: string;
			}>({
				errors: {
					test: { type: 'test', message: 'test error' },
				},
			});

			return (
				<div>
					<input {...register('test')} />
					<span role="alert">{errors.test && errors.test.message}</span>
				</div>
			);
		};

		expect(renderToStaticMarkup(App).html).toEqual(
			'<div><input name="test"/><span role="alert">test error</span></div>',
		);
	});

	it('should not pass down constrained API for server side rendering', () => {
		const App = () => {
			const { register } = useForm<{
				test: string;
			}>();

			return (
				<div>
					<input
						{...register('test', {
							required: true,
							min: 2,
							max: 2,
							maxLength: 2,
							minLength: 2,
						})}
					/>
				</div>
			);
		};

		expect(renderToStaticMarkup(App).html).toEqual('<div><input name="test"/></div>');
	});

	it('should pass down constrained API for server side rendering', () => {
		const App = () => {
			const { register } = useForm<{
				test: string;
			}>({
				shouldUseNativeValidation: true,
			});

			return (
				<div>
					<input
						{...register('test', {
							required: true,
							min: 2,
							max: 2,
							maxLength: 2,
							minLength: 2,
						})}
					/>
				</div>
			);
		};

		expect(renderToStaticMarkup(App).html).toEqual('<div><input name="test"/></div>');
	});

	it('should support progress enhancement for form', () => {
		const App = () => {
			const { register } = useForm<{
				test: string;
			}>({
				progressive: true,
			});

			return (
				<div>
					<input
						{...register('test', {
							required: true,
							min: 2,
							max: 2,
							maxLength: 2,
							minLength: 2,
						})}
					/>
				</div>
			);
		};

		expect(renderToStaticMarkup(App).html).toEqual(
			'<div><input required="" min="2" max="2" minLength="2" maxLength="2" name="test"/></div>',
		);
	});
});
