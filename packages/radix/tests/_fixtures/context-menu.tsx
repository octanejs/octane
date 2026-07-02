import { useState } from 'octane';
import { ContextMenu } from '@octanejs/radix';

export function ContextMenuApp() {
	const [lastAction, setLastAction] = useState('none');
	return (
		<div data-testid="app">
			<span data-testid="last">{lastAction}</span>
			<ContextMenu.Root>
				<ContextMenu.Trigger data-testid="trigger">right click me</ContextMenu.Trigger>
				<ContextMenu.Portal
					children={[
						<ContextMenu.Content key="c" data-testid="content">
							<ContextMenu.Item data-testid="item-back" onSelect={() => setLastAction('back')}>
								Back
							</ContextMenu.Item>
							<ContextMenu.Item data-testid="item-reload" onSelect={() => setLastAction('reload')}>
								Reload
							</ContextMenu.Item>
						</ContextMenu.Content>,
					]}
				/>
			</ContextMenu.Root>
		</div>
	);
}
