import * as React from 'octane';
import { useMergedRefs } from '@octanejs/base-ui-utils/useMergedRefs';
import { useButton } from '../../src/internals/use-button/useButton';

export function UseButtonHydrationFixture1(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
	const { disabled, ...otherProps } = props;
	const { getButtonProps } = useButton({ disabled, native: false });

	return <span {...getButtonProps(otherProps)} />;
}

export function UseButtonHydrationFixture2(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
	const { disabled, ...otherProps } = props;
	const { getButtonProps } = useButton({ disabled });
	return <button {...getButtonProps(otherProps)} />;
}
