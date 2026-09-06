import { expect, it, vi } from 'vitest';
import { useId, type Ref } from 'octane';
import { render, screen } from '@octanejs/testing-library';
import { fastComponentRef } from '../src/fastHooks';
import { useMergedRefs } from '../src/useMergedRefs';
import { isReactVersionAtLeast } from '../src/reactVersion';

const Input = fastComponentRef(
	function Input(
		{
			secondaryRef,
		}: {
			secondaryRef?: Ref<HTMLInputElement>;
		},
		forwardedRef: Ref<HTMLInputElement>,
	) {
		const ref = useMergedRefs(forwardedRef, secondaryRef);
		return <input aria-label="Merged input" ref={ref} />;
	},
);

// @parity-case ordinary:base-ui-utils-native-refs
it('attaches and cleans up recursive refs passed through a fast component', () => {
	const objectRef = { current: null as HTMLInputElement | null };
	const cleanup = vi.fn();
	const callback = vi.fn(() => cleanup);
	const secondaryRef = { current: null as HTMLInputElement | null };
	const { unmount } = render(
		<Input ref={[objectRef, [callback, null]]} secondaryRef={secondaryRef} />,
	);
	const input = screen.getByLabelText('Merged input');
	expect(objectRef.current).toBe(input);
	expect(secondaryRef.current).toBe(input);
	expect(callback).toHaveBeenCalledExactlyOnceWith(input);
	expect(cleanup).not.toHaveBeenCalled();
	unmount();
	expect(objectRef.current).toBe(null);
	expect(secondaryRef.current).toBe(null);
	expect(cleanup).toHaveBeenCalledOnce();
	expect(callback).toHaveBeenCalledOnce();
});

function ModernFeatures({ onCleanup }: { onCleanup: () => void }) {
	const id = useId();
	return <section inert={isReactVersionAtLeast(19)} ref={() => onCleanup}>
		<label htmlFor={id}>Modern input</label>
		<input id={id} />
	</section>;
}

// @parity-case ordinary:base-ui-utils-capabilities
it(
	'supports the inert, stable ID, and ref cleanup capabilities advertised to upstream code',
	() => {
		const onCleanup = vi.fn();
		const { rerender, unmount } = render(<ModernFeatures onCleanup={onCleanup} />);
		const input = screen.getByLabelText('Modern input');
		const id = input.id;
		expect(id).not.toBe('');
		expect(input.parentElement).toHaveAttribute('inert');
		rerender(<ModernFeatures onCleanup={onCleanup} />);
		expect(screen.getByLabelText('Modern input')).toBe(input);
		expect(input.id).toBe(id);
		onCleanup.mockClear();
		unmount();
		expect(onCleanup).toHaveBeenCalledOnce();
	},
);
