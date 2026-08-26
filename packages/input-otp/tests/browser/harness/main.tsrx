import { createRoot, delegateEvents, useContext, useState } from 'octane';
import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from '@octanejs/input-otp';

delegateEvents(['blur', 'focus', 'input', 'mouseleave', 'mouseover', 'paste']);

function Slots(_props: {}) @{
	const props = useContext(OTPInputContext);
	const slotIndexes = props.slots.map((_slot, index) => index);
	<div
		style={{ width: 240, height: 48 }}
		data-testid="input-otp-renderer"
		data-test-render-is-focused={props.isFocused || undefined}
		data-test-render-is-hovering={props.isHovering || undefined}
	>
		@for (const index of slotIndexes; key index) {
			<span
				data-testid={`slot-${index}`}
				data-test-char={props.slots[index].char ?? undefined}
				data-test-is-active={props.slots[index].isActive || undefined}
			>
				{props.slots[index].char ?? props.slots[index].placeholderChar ?? ''}
			</span>
		}
	</div>
}

function Base(_props: {}) @{
	<OTPInput maxLength={6} pattern={REGEXP_ONLY_DIGITS}>
		<Slots />
	</OTPInput>
}

function Props(_props: {}) @{
	<div>
		<OTPInput maxLength={6} disabled data-testid="input-otp-1">
			<span />
		</OTPInput>
		<OTPInput maxLength={6} inputMode="numeric" data-testid="input-otp-2">
			<span />
		</OTPInput>
		<OTPInput maxLength={6} inputMode="text" data-testid="input-otp-3">
			<span />
		</OTPInput>
		<OTPInput maxLength={6} containerClassName="testclassname" data-testid="input-otp-4">
			<span />
		</OTPInput>
		<OTPInput maxLength={3} data-testid="input-otp-5">
			<span />
		</OTPInput>
		<OTPInput maxLength={6} id="testid" name="testname" data-testid="input-otp-6">
			<span />
		</OTPInput>
		<OTPInput maxLength={6} pattern=" " data-testid="input-otp-7">
			<span />
		</OTPInput>
	</div>
}

function Autofocus(_props: {}) @{
	<OTPInput maxLength={6} autoFocus>
		<span />
	</OTPInput>
}

function Complete(_props: {}) @{
	const [complete, setComplete] = useState(false);
	<OTPInput maxLength={6} disabled={complete} onComplete={() => setComplete(true)}>
		<span />
	</OTPInput>
}

function PasteTransform(_props: {}) @{
	<OTPInput maxLength={6} pasteTransformer={(value) => value.replaceAll('-', '')}>
		<span />
	</OTPInput>
}

function NoPasswordManagerPush(_props: {}) @{
	<OTPInput maxLength={6} pushPasswordManagerStrategy="none">
		<span />
	</OTPInput>
}

function PwmSpace(_props: {}) @{
	<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>
		<div data-testid="roomy" style={{ width: 'fit-content' }}>
			<OTPInput maxLength={6}>
				<Slots />
			</OTPInput>
		</div>
		<div data-testid="tight" style={{ width: 'fit-content', overflowX: 'auto', padding: 8 }}>
			<OTPInput maxLength={6}>
				<Slots />
			</OTPInput>
		</div>
	</div>
}

function App(_props: {}) @{
	const path = window.location.pathname;
	<main data-ready="true" style={{ width: 240 }}>
		@if (path === '/props') {
			<Props />
		} @else if (path === '/with-autofocus') {
			<Autofocus />
		} @else if (path === '/with-on-complete') {
			<Complete />
		} @else if (path === '/paste-transform') {
			<PasteTransform />
		} @else if (path === '/password-manager-none') {
			<NoPasswordManagerPush />
		} @else if (path === '/pwm-space') {
			<PwmSpace />
		} @else {
			<Base />
		}
	</main>
}

const root = document.querySelector('#root');
if (!(root instanceof HTMLElement)) throw new Error('Missing root');
createRoot(root).render(App);
