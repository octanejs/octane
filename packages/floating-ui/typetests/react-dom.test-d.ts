import {
	arrow,
	offset,
	useFloating,
	type UseFloatingOptions,
} from '@octanejs/floating-ui/react-dom';

const options: UseFloatingOptions = { open: undefined, elements: { reference: undefined } };
const result = useFloating<HTMLButtonElement>({
	...options,
	middleware: [offset(() => 3, [3]), arrow({ element: { current: null }, padding: undefined })],
});
result.refs.setReference(document.createElement('button'));
// @ts-expect-error The narrowed reference accepts buttons.
result.refs.setReference(document.createElement('a'));
// @ts-expect-error The default reference can be virtual.
useFloating().refs.reference.current?.contains(document.body);
// @ts-expect-error Mounting returns a cleanup function.
useFloating({ whileElementsMounted: () => {} });
