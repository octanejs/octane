// Account section: Radix composites for structure and React Aria hooks for the
// form fields.
import { useRef, useState } from 'octane';
import { Accordion, Avatar, Dialog, DropdownMenu, Tabs } from '@octanejs/radix';
import { useButton, useTextField } from '@octanejs/aria';

function TextField(props: { label: string; value: string; onValue: (value: string) => void }) @{
	const ref = useRef<HTMLInputElement | null>(null);
	const { labelProps, inputProps } = useTextField(
		{ label: props.label, value: props.value, onChange: props.onValue },
		ref,
	);
	<div class="field">
		<label {...labelProps}>{props.label as string}</label>
		<input {...inputProps} ref={ref} />
	</div>
}

function SaveButton(props: { onSave: () => void }) @{
	const ref = useRef<HTMLButtonElement | null>(null);
	const { buttonProps, isPressed } = useButton({ onPress: props.onSave }, ref);
	<button {...buttonProps} ref={ref} data-pressed={isPressed || undefined}>
		{'Save profile'}
	</button>
}

export function AccountPanel() @{
	const [name, setName] = useState('Ada Lovelace');
	const [email, setEmail] = useState('ada@example.com');
	const [saved, setSaved] = useState(0);

	<section class="panel">
		<h2>{'Account'}</h2>
		<Avatar.Root>
			<Avatar.Fallback>{name.slice(0, 2) as string}</Avatar.Fallback>
		</Avatar.Root>
		<Tabs.Root defaultValue="profile">
			<Tabs.List aria-label="Account sections">
				<Tabs.Trigger value="profile">{'Profile'}</Tabs.Trigger>
				<Tabs.Trigger value="security">{'Security'}</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="profile">
				<TextField label="Name" value={name} onValue={setName} />
				<TextField label="Email" value={email} onValue={setEmail} />
				<SaveButton onSave={() => setSaved(saved + 1)} />
				<p>{'Saved ' + saved + ' times'}</p>
			</Tabs.Content>
			<Tabs.Content value="security">
				<Accordion.Root type="single" collapsible>
					<Accordion.Item value="password">
						<Accordion.Header>
							<Accordion.Trigger>{'Password'}</Accordion.Trigger>
						</Accordion.Header>
						<Accordion.Content>{'Last changed 30 days ago.'}</Accordion.Content>
					</Accordion.Item>
					<Accordion.Item value="sessions">
						<Accordion.Header>
							<Accordion.Trigger>{'Sessions'}</Accordion.Trigger>
						</Accordion.Header>
						<Accordion.Content>{'Two active sessions.'}</Accordion.Content>
					</Accordion.Item>
				</Accordion.Root>
			</Tabs.Content>
		</Tabs.Root>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>{'More'}</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content>
					<DropdownMenu.Label>{'Account'}</DropdownMenu.Label>
					<DropdownMenu.Item onSelect={() => setSaved(0)}>{'Reset counter'}</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item>{'Sign out'}</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
		<Dialog.Root>
			<Dialog.Trigger>{'Delete account'}</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content>
					<Dialog.Title>{'Delete account?'}</Dialog.Title>
					<Dialog.Description>{'This cannot be undone.'}</Dialog.Description>
					<Dialog.Close>{'Cancel'}</Dialog.Close>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	</section>
}
