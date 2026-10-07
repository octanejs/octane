import { useContext, useState } from 'octane';
import 'octane/signals';
import { Avatar, Button, Icon, IconButton, Tooltip } from './primitives.tsrx';
import { menuOpen$, model$, StringsContext } from './state';

const MODELS = ['default', 'fast', 'thinking', 'pro'];

function ModelMenu() @{
	<ul class="model-menu" role="menu">
		@for (const name of MODELS; key name) {
			<li role="menuitem" class={['model-option', name === model$.get() && 'selected']}>
				<Icon name={'model-' + name} size={16} />
				<span>{name}</span>
				@if (name === model$.get()) {
					<Icon name="check" size={16} />
				}
			</li>
		}
	</ul>
}

function ModelPicker() @{
	<div class="model-picker">
		<Button
			label={'Model: ' + model$.get()}
			icon="chevron-down"
			variant="picker"
			onClick={() => menuOpen$.set(!menuOpen$.get())}
		/>
		@if (menuOpen$.get()) {
			<ModelMenu />
		}
	</div>
}

function ShareMenu(props: { open: boolean }) @{
	<div class="share">
		<IconButton icon="share" label="Share" />
		@if (props.open) {
			<div class="share-popover">
				<Button label="Copy link" icon="link" />
				<Button label="Export" icon="download" />
			</div>
		}
	</div>
}

export function Header(props: { signedIn: boolean }) @{
	const strings = useContext(StringsContext);
	const [shareOpen] = useState(false);
	<header class="frame-header">
		<div class="frame-header-start">
			<IconButton icon="sidebar" label="Open sidebar" />
			<IconButton icon="compose" label={strings.newChat} />
			<ModelPicker />
		</div>
		<div class="frame-header-end">
			<ShareMenu open={shareOpen} />
			<IconButton icon="temporary" label="Temporary chat" />
			<IconButton icon="dots" label={strings.options} />
			@if (props.signedIn) {
				<Tooltip label="Account">
					<Avatar initials="AB" />
				</Tooltip>
			} @else {
				<div class="auth-actions">
					<Button label="Log in" variant="primary" />
					<Button label="Sign up for free" variant="secondary" />
				</div>
			}
		</div>
	</header>
}
