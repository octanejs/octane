import * as React from 'octane';
import { SafeReact } from '@octanejs/base-ui-utils/safeReact';
import { OTPField as OTPFieldBase } from '@octanejs/base-ui/otp-field';
import { Field } from '@octanejs/base-ui/field';
import { Form } from '@octanejs/base-ui/form';

export function OTPFieldRootServerCase1({ OTP_LENGTH }: { OTP_LENGTH: number }) {
	return <OTPFieldBase.Root name="otp" required length={OTP_LENGTH} validationType="alphanumeric">
		<OTPFieldBase.Input />
		<OTPFieldBase.Input />
		<OTPFieldBase.Input />
		<OTPFieldBase.Input />
		<OTPFieldBase.Input />
		<OTPFieldBase.Input />
	</OTPFieldBase.Root>;
}

export function OTPFieldRootServerCase2({ OTP_LENGTH }: { OTP_LENGTH: number }) {
	return <OTPFieldBase.Root
		data-testid="root"
		id="verification-code"
		length={OTP_LENGTH}
	>{Array.from(
		{ length: OTP_LENGTH },
		(_, index) => <OTPFieldBase.Input key={index} />,
	)}</OTPFieldBase.Root>;
}

export function OTPFieldRootServerCase3({ OTP_LENGTH }: { OTP_LENGTH: number }) {
	return <OTPFieldBase.Root name="otp" required length={OTP_LENGTH}>
		<OTPFieldBase.Input />
		<OTPFieldBase.Input />
		<OTPFieldBase.Input />
		<OTPFieldBase.Input />
		<OTPFieldBase.Input />
		<OTPFieldBase.Input />
	</OTPFieldBase.Root>;
}
