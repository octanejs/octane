import { useGSAP } from '@octanejs/gsap';

export function ServerProbe(props: { onEffect: () => void }) @{
	const { contextSafe } = useGSAP(() => props.onEffect());
	<span data-context-safe={typeof contextSafe}>server-safe</span>
}
