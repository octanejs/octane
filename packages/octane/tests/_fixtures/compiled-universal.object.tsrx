import { useLayoutEffect } from 'octane';

export function CompiledUniversalScene(props) @{
	useLayoutEffect(() => {
		props.log(`layout:${props.label}`);
		return () => props.log(`cleanup:${props.label}`);
	}, [props.log, props.label]);
	<scene tone={props.tone} ref={props.hostRef}>
		<node value={props.value} />
		<label>{props.label as string}</label>
	</scene>
}
