import { useContext } from 'octane';

import { OTPInput, OTPInputContext } from '../../../src/input.tsrx';
import { REGEXP_ONLY_DIGITS } from '../../../src/regexp';
import type { OTPInputProps } from '../../../src/types';

function ContextProjection() @{
	const state = useContext(OTPInputContext);
	<output
		data-testid="context"
		data-focused={state.isFocused || undefined}
		data-hovering={state.isHovering || undefined}
		data-slots={state.slots.map((slot) => slot.char ?? slot.placeholderChar ?? '_').join('|')}
		data-placeholders={state.slots.map((slot) => slot.placeholderChar ?? '_').join('|')}
		data-active={state.slots.map((slot) => String(slot.isActive)).join('|')}
		data-fake-caret={state.slots.map((slot) => String(slot.hasFakeCaret)).join('|')}
	/>
}

export function UncontrolledInput(props: {
	onChange?: (value: string) => void;
	onComplete?: (value: string) => void;
	onInput?: (event: InputEvent) => void;
}) @{
	<OTPInput
		maxLength={4}
		defaultValue="12"
		pattern={REGEXP_ONLY_DIGITS}
		placeholder="0000"
		onChange={props.onChange}
		onComplete={props.onComplete}
		onInput={props.onInput}
		aria-label="Verification code"
		name="verification-code"
	>
		<ContextProjection />
	</OTPInput>
}

export function RenderPropInput(props: { value: string; onChange: (value: string) => void }) @{
	<OTPInput
		maxLength={4}
		value={props.value}
		onChange={props.onChange}
		render={(state) =>
			<output
				data-testid="render"
				data-slots={state.slots.map((slot) => slot.char ?? '_').join('|')}
			/>}
	/>
}

export function NoScriptDisabledInput() @{
	<OTPInput maxLength={2} disabled noScriptCSSFallback={null}>
		<ContextProjection />
	</OTPInput>
}

export function EmptyInput() @{
	<OTPInput maxLength={4} placeholder="1234" aria-label="Empty verification code">
		<ContextProjection />
	</OTPInput>
}

export function RefInput(props: { inputRef: OTPInputProps['ref'] }) @{
	<OTPInput maxLength={4} ref={props.inputRef}>
		<ContextProjection />
	</OTPInput>
}

export function CallbackInput(props: {
	onFocus: (event: FocusEvent) => void;
	onBlur: (event: FocusEvent) => void;
	onPaste: (event: ClipboardEvent) => void;
	onMouseOver: (event: MouseEvent) => void;
	onMouseLeave: (event: MouseEvent) => void;
}) @{
	<OTPInput
		maxLength={4}
		id="forwarded-id"
		data-testid="forwarded-input"
		required
		tabIndex={3}
		autoComplete="off"
		spellCheck={true}
		nonce="csp-style"
		pasteTransformer={(value) => value.replaceAll('-', '')}
		onFocus={props.onFocus}
		onBlur={props.onBlur}
		onPaste={props.onPaste}
		onMouseOver={props.onMouseOver}
		onMouseLeave={props.onMouseLeave}
	>
		<ContextProjection />
	</OTPInput>
}
