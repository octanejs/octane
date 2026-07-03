import { useState } from 'octane';
import { Menubar } from '@octanejs/radix';

export function MenubarApp() {
	const [lastAction, setLastAction] = useState('none');
	return (
		<div data-testid="app">
			<span data-testid="last">{lastAction}</span>
			<Menubar.Root data-testid="menubar">
				<Menubar.Menu value="file">
					<Menubar.Trigger data-testid="trigger-file">File</Menubar.Trigger>
					<Menubar.Portal
						children={[
							<Menubar.Content key="c" data-testid="content-file">
								<Menubar.Item data-testid="item-new" onSelect={() => setLastAction('new')}>
									New
								</Menubar.Item>
								<Menubar.Item data-testid="item-open" onSelect={() => setLastAction('open')}>
									Open
								</Menubar.Item>
							</Menubar.Content>,
						]}
					/>
				</Menubar.Menu>
				<Menubar.Menu value="edit">
					<Menubar.Trigger data-testid="trigger-edit">Edit</Menubar.Trigger>
					<Menubar.Portal
						children={[
							<Menubar.Content key="c" data-testid="content-edit">
								<Menubar.Item data-testid="item-undo" onSelect={() => setLastAction('undo')}>
									Undo
								</Menubar.Item>
								<Menubar.Item data-testid="item-redo" onSelect={() => setLastAction('redo')}>
									Redo
								</Menubar.Item>
							</Menubar.Content>,
						]}
					/>
				</Menubar.Menu>
				<Menubar.Menu value="view">
					<Menubar.Trigger data-testid="trigger-view" disabled>
						View
					</Menubar.Trigger>
					<Menubar.Portal
						children={[
							<Menubar.Content key="c" data-testid="content-view">
								<Menubar.Item data-testid="item-zoom">Zoom</Menubar.Item>
							</Menubar.Content>,
						]}
					/>
				</Menubar.Menu>
			</Menubar.Root>
		</div>
	);
}
