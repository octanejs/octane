import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OTPInput, REGEXP_ONLY_DIGITS, type RenderProps } from 'input-otp';

function Slots(props: RenderProps) {
	return (
		<div
			style={{ width: 240, height: 48 }}
			data-testid="input-otp-renderer"
			data-test-render-is-focused={props.isFocused || undefined}
			data-test-render-is-hovering={props.isHovering || undefined}
		>
			{props.slots.map((slot, index) => (
				<span key={index} data-testid={`slot-${index}`} data-test-char={slot.char ?? undefined}>
					{slot.char ?? slot.placeholderChar ?? ''}
				</span>
			))}
		</div>
	);
}
function Base() {
	const [value, setValue] = useState('');
	return (
		<OTPInput
			value={value}
			onChange={setValue}
			maxLength={6}
			pattern={REGEXP_ONLY_DIGITS}
			render={(state) => <Slots {...state} />}
		/>
	);
}
function Props() {
	return (
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
	);
}
function Autofocus() {
	return (
		<OTPInput maxLength={6} autoFocus>
			<span />
		</OTPInput>
	);
}
function Complete() {
	const [complete, setComplete] = useState(false);
	return (
		<OTPInput maxLength={6} disabled={complete} onComplete={() => setComplete(true)}>
			<span />
		</OTPInput>
	);
}
function PwmSpace() {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>
			<div data-testid="roomy" style={{ width: 'fit-content' }}>
				<OTPInput maxLength={6} render={(state) => <Slots {...state} />} />
			</div>
			<div data-testid="tight" style={{ width: 'fit-content', overflowX: 'auto', padding: 8 }}>
				<OTPInput maxLength={6} render={(state) => <Slots {...state} />} />
			</div>
		</div>
	);
}
function App() {
	const path = window.location.pathname;
	return (
		<main data-ready="true">
			{path === '/props' ? (
				<Props />
			) : path === '/with-autofocus' ? (
				<Autofocus />
			) : path === '/with-on-complete' ? (
				<Complete />
			) : path === '/pwm-space' ? (
				<PwmSpace />
			) : (
				<Base />
			)}
		</main>
	);
}
createRoot(document.querySelector('#root')!).render(<App />);
