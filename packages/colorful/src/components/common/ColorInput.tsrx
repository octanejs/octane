import { useCallback, useEffect, useState } from 'octane';
import { useEventCallback } from '../../hooks/useEventCallback.tsrx';
import type { ColorInputBaseProps } from '../../types';

interface Props extends ColorInputBaseProps {
	escape: (value: string) => string;
	validate: (value: string) => boolean;
	format?: (value: string) => string;
	process?: (value: string) => string;
}

export const ColorInput = (props: Props) => {
	const {
		color = '',
		onChange,
		onBlur,
		onInput,
		escape,
		validate,
		format,
		process,
		...rest
	} = props;
	const [value, setValue] = useState(() => escape(color));
	const onChangeCallback = useEventCallback<string>(onChange);
	const onBlurCallback = useEventCallback<
		FocusEvent & { currentTarget: HTMLInputElement & EventTarget }
	>(onBlur);

	const handleInput = useCallback((event: InputEvent & {
		currentTarget: HTMLInputElement & EventTarget;
	}) => {
		const target = event.currentTarget;
		const inputValue = escape(target.value);
		setValue(inputValue);
		if (validate(inputValue)) onChangeCallback(process ? process(inputValue) : inputValue);
		onInput?.(event);
	}, [escape, process, validate, onChangeCallback, onInput]);

	const handleBlur = useCallback((event: FocusEvent & {
		currentTarget: HTMLInputElement & EventTarget;
	}) => {
		const target = event.currentTarget;
		if (!validate(target.value)) setValue(escape(color));
		onBlurCallback(event);
	}, [color, escape, validate, onBlurCallback]);

	useEffect(() => {
		setValue(escape(color));
	}, [color, escape]);

	return <input
		{...rest}
		value={format ? format(value) : value}
		spellCheck="false"
		onInput={handleInput}
		onBlur={handleBlur}
	/>;
};
