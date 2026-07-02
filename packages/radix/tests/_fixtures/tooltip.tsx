import { Tooltip } from '@octanejs/radix';

export function TooltipApp() {
	return (
		<div data-testid="app">
			<Tooltip.Provider delayDuration={100} skipDelayDuration={200}>
				<Tooltip.Root>
					<Tooltip.Trigger data-testid="trigger">hover me</Tooltip.Trigger>
					<Tooltip.Portal
						children={[
							<Tooltip.Content key="c" data-testid="content" sideOffset={4}>
								Tip text
								<Tooltip.Arrow data-testid="arrow" width={12} height={6} />
							</Tooltip.Content>,
						]}
					/>
				</Tooltip.Root>
			</Tooltip.Provider>
		</div>
	);
}
