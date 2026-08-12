import { useContext, useState } from 'octane';
import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from '@octanejs/input-otp';

function Slots(_props: {}) @{
	const state = useContext(OTPInputContext);
	const indexes = state.slots.map((_slot, index) => index);

	<div class="cn-input-otp-group" style={{ display: 'flex' }}>
		@for (const index of indexes; key index) {
			<span
				class="cn-input-otp-slot"
				data-active={state.slots[index].isActive || undefined}
				style={{ display: 'grid', placeItems: 'center' }}
			>
				{state.slots[index].char ?? state.slots[index].placeholderChar ?? ''}
			</span>
		}
	</div>
}

export function InputOTPDemo(_props: {}) @{
	const [value, setValue] = useState('');

	<section style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
		<div>
			<h2>{'Verification code'}</h2>
			<p>{'Type or paste a six-digit code. One native input powers all six visual slots.'}</p>
		</div>
		<OTPInput
			maxLength={6}
			value={value}
			onChange={setValue}
			pattern={REGEXP_ONLY_DIGITS}
			inputMode="numeric"
			aria-label="Six-digit verification code"
			containerClassName="cn-input-otp"
		>
			<Slots />
		</OTPInput>
		<p aria-live="polite">
			{value.length === 6 ? 'Code complete.' : `${6 - value.length} digits remaining.`}
		</p>
	</section>
}
