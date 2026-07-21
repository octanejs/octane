import { useImperativeHandle, useDeferredValue, useState } from 'octane';
import { useLabelCallbacks } from './external-hook.ts';

export function ImpHandle(props) @{
	useImperativeHandle(props.handleRef, () => ({ tag: props.tag }), []);
	<span class="ih">{props.tag as string}</span>
}

export function DeferNaN(props) @{
	const d = useDeferredValue(props.value);
	<span class="d">{(d !== d ? 'NaN' : String(d)) as string}</span>
}

export function CallbackLabels(props) @{
	const [label, setLabel] = useState('a');
	props.bind((x: string) => setLabel(x));
	const cbs = useLabelCallbacks(label);
	<button
		class="cb"
		onClick={() => props.onResult(cbs.noDeps() + '|' + cbs.withDeps())}
	>{label as string}</button>
}
