// Command.Input. Drives the search from the native `onInput` event (the public
// `onValueChange` API is unchanged); supports controlled `value`.
import { useEffect } from 'octane';
import { useCommand, useStore } from '../context.tsrx';
import { useCmdk } from '../hooks.tsrx';
import type { InputProps } from '../types';

export function Input(props: InputProps) @{
	const { onValueChange, ref: _ref, ...etc } = props;
	const isControlled = props.value != null;
	const store = useStore()!;
	const search = useCmdk((s) => s.search);
	const selectedItemId = useCmdk((s) => s.selectedItemId);
	const context = useCommand()!;

	useEffect(() => {
		if (props.value != null) {
			store.setState('search', props.value);
		}
	}, [props.value]);

	<input
		ref={props.ref}
		{...etc}
		cmdk-input=""
		autoComplete="off"
		autoCorrect="off"
		spellCheck={false}
		aria-autocomplete="list"
		role="combobox"
		aria-expanded={true}
		aria-controls={context.listId}
		aria-labelledby={context.labelId}
		aria-activedescendant={selectedItemId}
		id={context.inputId}
		type="text"
		value={isControlled ? props.value : search}
		onInput={(event) => {
			const next = event.currentTarget.value;
			if (!isControlled) store.setState('search', next);
			onValueChange?.(next);
		}}
	/>
}
