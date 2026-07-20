import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { twMerge } from 'tailwind-merge';

interface TooltipProps {
	children: React.ReactNode;
	content: React.ReactNode;
	side?: 'top' | 'right' | 'bottom' | 'left';
	align?: 'start' | 'center' | 'end';
	delayDuration?: number;
	className?: string;
}

export function Tooltip({
	children,
	content,
	side = 'top',
	align = 'center',
	delayDuration = 200,
	className,
}: TooltipProps) {
	if (!content) {
		return <>{children}</>;
	}

	return (
		<TooltipPrimitive.Provider delayDuration={delayDuration}>
			<TooltipPrimitive.Root>
				<TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
				<TooltipPrimitive.Portal>
					<TooltipPrimitive.Content
						side={side}
						align={align}
						sideOffset={5}
						className={twMerge(
							'z-50 rounded-lg px-3 py-2 text-xs',
							'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900',
							'shadow-lg',
							'animate-in fade-in-0 zoom-in-95',
							'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
							className,
						)}
					>
						{content}
						<TooltipPrimitive.Arrow className="fill-gray-900 dark:fill-gray-100" />
					</TooltipPrimitive.Content>
				</TooltipPrimitive.Portal>
			</TooltipPrimitive.Root>
		</TooltipPrimitive.Provider>
	);
}
