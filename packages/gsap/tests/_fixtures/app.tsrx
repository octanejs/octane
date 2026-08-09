import { useRef } from 'octane';
import { useGSAP, type UseGSAPReturn } from '@octanejs/gsap';

export function GSAPProbe(props: {
	value: string;
	log: (entry: string) => void;
	capture: (api: UseGSAPReturn) => void;
	revertOnUpdate?: boolean;
}) @{
	const scope = useRef<HTMLDivElement>(null);
	const api = useGSAP((context, contextSafe) => {
		props.log(`effect:${props.value}:${context.selector?.('.target').length ?? 0}`);
		const safeLog = contextSafe(() => props.log(`safe:${props.value}`));
		safeLog();
		return () => props.log(`cleanup:${props.value}`);
	}, { scope, dependencies: [props.value], revertOnUpdate: props.revertOnUpdate });
	props.capture(api);

	<div ref={scope}>
		<span class="target">{props.value}</span>
	</div>
}

export function GSAPUndefinedDependenciesProbe(props: {
	value: string;
	log: (entry: string) => void;
}) @{
	useGSAP(() => {
		props.log(`effect:${props.value}`);
		return () => props.log(`cleanup:${props.value}`);
	}, { dependencies: undefined });

	<div>{props.value}</div>
}

export function GSAPNullDependenciesProbe(props: {
	value: string;
	log: (entry: string) => void;
}) @{
	useGSAP(() => {
		props.log(`effect:${props.value}`);
		return () => props.log(`cleanup:${props.value}`);
	}, null);

	<div>{props.value}</div>
}
