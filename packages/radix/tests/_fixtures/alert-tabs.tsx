import { AlertDialog, Tabs } from '@octanejs/radix';

// Always-modal AlertDialog: role=alertdialog, Cancel autofocused on open, outside
// interactions never dismiss, Action/Cancel close.
export function AlertApp() {
	return (
		<div data-testid="app">
			<AlertDialog.Root>
				<AlertDialog.Trigger data-testid="trigger">delete</AlertDialog.Trigger>
				<AlertDialog.Portal
					children={[
						<AlertDialog.Overlay key="o" data-testid="overlay" />,
						<AlertDialog.Content key="c" data-testid="content">
							<AlertDialog.Title data-testid="title">Are you sure?</AlertDialog.Title>
							<AlertDialog.Description data-testid="desc">Permanent.</AlertDialog.Description>
							<AlertDialog.Cancel data-testid="cancel">Cancel</AlertDialog.Cancel>
							<AlertDialog.Action data-testid="action">Delete</AlertDialog.Action>
						</AlertDialog.Content>,
					]}
				/>
			</AlertDialog.Root>
		</div>
	);
}

// Tabs with roving focus: ArrowRight/Left move between triggers (single tab stop),
// automatic activation selects the focused tab.
export function TabsKeyboard() {
	return (
		<Tabs.Root defaultValue="one">
			<Tabs.List data-testid="list">
				<Tabs.Trigger data-testid="t1" value="one">
					One
				</Tabs.Trigger>
				<Tabs.Trigger data-testid="t2" value="two">
					Two
				</Tabs.Trigger>
				<Tabs.Trigger data-testid="t3" value="three">
					Three
				</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content data-testid="c1" value="one">
				one
			</Tabs.Content>
			<Tabs.Content data-testid="c2" value="two">
				two
			</Tabs.Content>
			<Tabs.Content data-testid="c3" value="three">
				three
			</Tabs.Content>
		</Tabs.Root>
	);
}
