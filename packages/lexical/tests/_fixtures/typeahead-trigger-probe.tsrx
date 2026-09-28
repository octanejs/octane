import { useBasicTypeaheadTriggerMatch } from '@octanejs/lexical/LexicalTypeaheadMenuPluginUtils';

// useBasicTypeaheadTriggerMatch is a hook (it memoizes the TriggerFn it
// returns), so it has to run inside a component: the compiled call site here
// injects its trailing hook slot. The probe hands the TriggerFn to the test.
export function TriggerMatchProbe(props) {
	const triggerFn = useBasicTypeaheadTriggerMatch(props.trigger, props.options);
	props.onTriggerFn(triggerFn);
	return null;
}
