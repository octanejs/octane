// Notification section: Radix form controls with Mantine hooks for local state.
import { Checkbox, Popover, Slider, Switch } from '@octanejs/radix';
import {
	useClickOutside,
	useCounter,
	useDebouncedValue,
	useDisclosure,
	useListState,
	useToggle,
} from '@octanejs/mantine-hooks';

type Channel = { id: string; label: string; enabled: boolean };

export function NotificationPanel() @{
	const [channels, handlers] = useListState<Channel>([
		{ id: 'email', label: 'Email', enabled: true },
		{ id: 'push', label: 'Push', enabled: false },
		{ id: 'sms', label: 'SMS', enabled: false },
	]);
	const [volume, setVolume] = useCounter(60, { min: 0, max: 100 });
	const [debouncedVolume] = useDebouncedValue(volume, 200);
	const [digest, toggleDigest] = useToggle(['daily', 'weekly'] as const);
	const [quietHours, quiet] = useDisclosure(false);
	const outside = useClickOutside(() => quiet.close());

	<section class="panel">
		<h2>{'Notifications'}</h2>
		<ul>
			@for (const channel of channels; key channel.id) {
				<li>
					<Switch.Root
						id={'channel-' + channel.id}
						checked={channel.enabled}
						onCheckedChange={(enabled: boolean) => handlers.setItemProp(
							channels.indexOf(channel),
							'enabled',
							enabled,
						)}
					>
						<Switch.Thumb />
					</Switch.Root>
					<label for={'channel-' + channel.id}>{channel.label as string}</label>
				</li>
			}
		</ul>
		<Slider.Root
			value={[volume]}
			max={100}
			step={5}
			onValueChange={(next: number[]) => setVolume.set(next[0])}
			aria-label="Volume"
		>
			<Slider.Track>
				<Slider.Range />
			</Slider.Track>
			<Slider.Thumb />
		</Slider.Root>
		<p>{'Volume ' + debouncedVolume}</p>
		<label>
			<Checkbox.Root checked={digest === 'weekly'} onCheckedChange={() => toggleDigest()}>
				<Checkbox.Indicator>{'✓'}</Checkbox.Indicator>
			</Checkbox.Root>
			{'Weekly digest (' + digest + ')'}
		</label>
		<Popover.Root
			open={quietHours}
			onOpenChange={(open: boolean) => (open ? quiet.open() : quiet.close())}
		>
			<Popover.Trigger>{'Quiet hours'}</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content ref={outside} sideOffset={4}>
					<p>{'Mute notifications from 22:00 to 07:00.'}</p>
					<Popover.Close>{'Done'}</Popover.Close>
					<Popover.Arrow />
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	</section>
}
