import * as React from 'react';
import { Link, LinkProps } from '@tanstack/react-router';
import { Button } from '~/ui';

type BottomCTAProps = {
	linkProps: LinkProps;
	label?: string;
	className?: string;
};

export function BottomCTA({ linkProps, label = 'Get Started!', className }: BottomCTAProps) {
	return (
		<div className="flex flex-col items-center gap-4 px-4 py-12">
			<div className="font-extrabold text-xl lg:text-2xl">Wow, you've come a long way!</div>
			<div className="italic font-sm opacity-70">Only one thing left to do...</div>
			<div>
				{/* @ts-expect-error - LinkProps is not assignable to ButtonProps */}
				<Button
					as={Link}
					{...linkProps}
					className={`py-2 px-4 text-sm shadow-xs hover:shadow-sm ${className}`}
				>
					{label}
				</Button>
			</div>
		</div>
	);
}
