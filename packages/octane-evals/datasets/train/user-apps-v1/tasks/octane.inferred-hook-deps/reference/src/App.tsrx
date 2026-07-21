import { useEffect, useMemo } from 'octane';

export function App(props: {
	quantity: number;
	unitPrice: number;
	discount: number;
	onTotal: (total: number) => void;
}) @{
	const subtotal = useMemo(() => props.quantity * props.unitPrice);
	const total = useMemo(() => Math.max(0, subtotal - props.discount));

	useEffect(() => {
		props.onTotal(total);
	});

	<section aria-label="Invoice summary">
		<output aria-label="Quantity">{props.quantity as string}</output>
		<output aria-label="Subtotal">{subtotal.toFixed(2)}</output>
		<output aria-label="Total">{total.toFixed(2)}</output>
	</section>
}
