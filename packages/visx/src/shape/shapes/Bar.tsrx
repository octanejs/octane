import type { Ref } from 'react';
import type { Octane } from 'octane/jsx-runtime';
import cx from 'classnames';
import type { AddSVGProps } from '../types';

export type BarProps = {
	/** className to apply to rect element. */
	className?: Octane.SVGProps<SVGRectElement>['className'];
	/** reference to rect element. */
	innerRef?: Ref<SVGRectElement>;
};

export default function Bar({
	className,
	innerRef,
	...restProps
}: AddSVGProps<BarProps, SVGRectElement>) {
	return <rect ref={innerRef} className={cx('visx-bar', className)} {...restProps} />;
}
