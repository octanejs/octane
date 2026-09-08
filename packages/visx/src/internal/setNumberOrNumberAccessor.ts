/**
 * Work around TypeScript not narrowing the overloaded setter signatures used
 * by several D3 packages.
 */
export default function setNumberOrNumberAccessor<NumAccessor>(
	setter: (value: number | NumAccessor) => void,
	value: number | NumAccessor,
) {
	if (typeof value === 'number') setter(value);
	else setter(value);
}
