import { useState } from 'octane';
import { DropdownMenu } from '@octanejs/radix';

export function DropdownMenuApp() {
	const [lastAction, setLastAction] = useState('none');
	const [checked, setChecked] = useState(false);
	const [flavor, setFlavor] = useState('vanilla');
	return (
		<div data-testid="app">
			<span data-testid="last">{lastAction}</span>
			<span data-testid="checked">{String(checked)}</span>
			<span data-testid="flavor">{flavor}</span>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger data-testid="trigger">actions</DropdownMenu.Trigger>
				<DropdownMenu.Portal
					children={[
						<DropdownMenu.Content key="c" data-testid="content" sideOffset={4}>
							<DropdownMenu.Label data-testid="label">Actions</DropdownMenu.Label>
							<DropdownMenu.Item data-testid="item-copy" onSelect={() => setLastAction('copy')}>
								Copy
							</DropdownMenu.Item>
							<DropdownMenu.Item
								data-testid="item-delete"
								disabled
								onSelect={() => setLastAction('delete')}
							>
								Delete
							</DropdownMenu.Item>
							<DropdownMenu.Separator data-testid="separator" />
							<DropdownMenu.CheckboxItem
								data-testid="item-check"
								checked={checked}
								onCheckedChange={setChecked}
							>
								<DropdownMenu.ItemIndicator data-testid="check-indicator">
									✓
								</DropdownMenu.ItemIndicator>
								Notifications
							</DropdownMenu.CheckboxItem>
							<DropdownMenu.RadioGroup value={flavor} onValueChange={setFlavor}>
								<DropdownMenu.RadioItem data-testid="radio-vanilla" value="vanilla">
									<DropdownMenu.ItemIndicator data-testid="vanilla-indicator">
										•
									</DropdownMenu.ItemIndicator>
									Vanilla
								</DropdownMenu.RadioItem>
								<DropdownMenu.RadioItem data-testid="radio-chocolate" value="chocolate">
									<DropdownMenu.ItemIndicator data-testid="chocolate-indicator">
										•
									</DropdownMenu.ItemIndicator>
									Chocolate
								</DropdownMenu.RadioItem>
							</DropdownMenu.RadioGroup>
						</DropdownMenu.Content>,
					]}
				/>
			</DropdownMenu.Root>
		</div>
	);
}

export function DropdownMenuWithSubApp() {
	const [lastAction, setLastAction] = useState('none');
	return (
		<div data-testid="app">
			<span data-testid="last">{lastAction}</span>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger data-testid="trigger">more</DropdownMenu.Trigger>
				<DropdownMenu.Portal
					children={[
						<DropdownMenu.Content key="c" data-testid="content">
							<DropdownMenu.Item data-testid="item-new" onSelect={() => setLastAction('new')}>
								New
							</DropdownMenu.Item>
							<DropdownMenu.Sub>
								<DropdownMenu.SubTrigger data-testid="sub-trigger">Share</DropdownMenu.SubTrigger>
								<DropdownMenu.Portal
									children={[
										<DropdownMenu.SubContent key="sc" data-testid="sub-content">
											<DropdownMenu.Item
												data-testid="item-email"
												onSelect={() => setLastAction('email')}
											>
												Email
											</DropdownMenu.Item>
											<DropdownMenu.Item
												data-testid="item-sms"
												onSelect={() => setLastAction('sms')}
											>
												SMS
											</DropdownMenu.Item>
										</DropdownMenu.SubContent>,
									]}
								/>
							</DropdownMenu.Sub>
						</DropdownMenu.Content>,
					]}
				/>
			</DropdownMenu.Root>
		</div>
	);
}
