'use strong';

import { unbound } from 'octane/behavior';
import { createReactCompatHost } from 'octane/react';
import type { ComponentProps } from 'react';

function Host(props: ComponentProps<'div'> & { 'data-open'?: boolean }) @{
	'use dom bindings';
	<div class={props.className} data-open={props['data-open']} style={props.style}>
		{unbound(props.children)}
	</div>
}

export const Frame = createReactCompatHost(Host);

type NavInput = { state: string; style: ComponentProps<'nav'>['style'] };

function NavView(props: ComponentProps<'nav'> & { input: NavInput }) @{
	'use dom bindings';
	<nav
		class={props.input.state}
		style={props.input.state === 'open' ? { width: 320, opacity: 0.9 } : props.input.style}
		data-open={props.input.state === 'open'}
		aria-label={props['aria-label']}
	>
		{unbound(props.children)}
	</nav>
}

function ButtonView(props: ComponentProps<'button'>) @{
	'use dom bindings';
	<button aria-pressed={props['aria-pressed']}>{unbound(props.children)}</button>
}

function FieldView(props: ComponentProps<'input'>) @{
	'use dom bindings';
	<input aria-label={props['aria-label']} />
}

function IconView(props: ComponentProps<'svg'>) @{
	'use dom bindings';
	<svg class={props.className}>{unbound(props.children)}</svg>
}

function LinkView(props: ComponentProps<'a'>) @{
	'use dom bindings';
	<a aria-current={props['aria-current']}>{unbound(props.children)}</a>
}

function StrokeView(props: ComponentProps<'path'>) @{
	'use dom bindings';
	<path class={props.className} />
}

export const Navigation = createReactCompatHost(NavView, 'nav');
export const Button = createReactCompatHost(ButtonView, 'button');
export const Field = createReactCompatHost(FieldView, 'input');
export const Icon = createReactCompatHost(IconView, 'svg');
export const Stroke = createReactCompatHost(StrokeView, 'path');
export const Link = createReactCompatHost(LinkView, 'a');
