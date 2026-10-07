import { useCallback, useContext, useId, useState, type OctaneNode } from 'octane';
import 'octane/signals';
import type { WritableSignal } from 'octane/signals';
import { StringsContext } from './state';

// Small wrappers in the shape of a design system: almost every one forwards an
// optional `style` prop that callers leave undefined.
type Style = Record<string, string> | undefined;

export function Icon(props: { name: string; size?: number; class?: string }) @{
	const size = String(props.size ?? 20);
	<svg
		class={['icon', props.class]}
		width={size}
		height={size}
		viewBox="0 0 24 24"
		aria-hidden="true"
	>
		<use href={'#icon-' + props.name} />
	</svg>
}

export function Tooltip(props: { label?: string; side?: string; children?: OctaneNode }) @{
	const id = useId();
	const [open, setOpen] = useState(false);
	<span
		class="tooltip"
		data-side={props.side ?? 'bottom'}
		aria-describedby={open ? id : undefined}
		onPointerEnter={() => setOpen(true)}
		onPointerLeave={() => setOpen(false)}
	>
		{props.children}
		@if (open && props.label) {
			<span id={id} role="tooltip" class="tooltip-label">
				{props.label as string}
			</span>
		}
	</span>
}

export function Button(props: {
	icon?: string;
	label?: string;
	variant?: string;
	style?: Style;
	ariaLabel?: string;
	onClick?: (event: MouseEvent) => void;
	children?: OctaneNode;
}) @{
	<button
		type="button"
		class={['button', 'button-' + (props.variant ?? 'plain')]}
		style={props.style}
		aria-label={props.ariaLabel}
		onClick={props.onClick}
	>
		@if (props.icon) {
			<Icon name={props.icon} />
		}
		@if (props.label) {
			<span class="button-label">{props.label as string}</span>
		}
		{props.children}
	</button>
}

export function IconButton(props: {
	icon: string;
	label: string;
	style?: Style;
	onClick?: (event: MouseEvent) => void;
}) @{
	@if (props.label !== '') {
		<Tooltip label={props.label}>
			<Button
				icon={props.icon}
				variant="ghost"
				ariaLabel={props.label}
				style={props.style}
				onClick={props.onClick}
			/>
		</Tooltip>
	} @else {
		<Button icon={props.icon} variant="ghost" style={props.style} onClick={props.onClick} />
	}
}

export function Link(props: {
	href: string;
	class?: string;
	style?: Style;
	children?: OctaneNode;
}) @{
	<a href={props.href} class={['link', props.class]} style={props.style}>
		{props.children}
	</a>
}

export function Badge(props: { value: string; style?: Style }) @{
	<span class="badge" style={props.style}>
		{props.value}
	</span>
}

export function Avatar(props: { initials: string; style?: Style }) @{
	const strings = useContext(StringsContext);
	<span class="avatar" style={props.style} title={strings.options}>
		<span class="avatar-initials">{props.initials}</span>
	</span>
}

// A native-read toggle: the arm reads the handle during render.
export function Disclosure(props: { open$: WritableSignal<boolean>; children?: OctaneNode }) @{
	const toggle = useCallback(() => props.open$.set(!props.open$.get()), [props.open$]);
	<div class="disclosure" data-open={props.open$.get() ? 'true' : 'false'} onClick={toggle}>
		@if (props.open$.get()) {
			<div class="disclosure-body">{props.children}</div>
		}
	</div>
}
