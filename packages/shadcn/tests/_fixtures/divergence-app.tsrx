import { Input as RadixInput } from '@octanejs/shadcn/Input';
import { Textarea as RadixTextarea } from '@octanejs/shadcn/Textarea';
import { Input as AriaInput } from '@octanejs/shadcn/react-aria/Input';
import { Textarea as AriaTextarea } from '@octanejs/shadcn/react-aria/Textarea';
import { Input as BaseInput } from '@octanejs/shadcn/base-ui/Input';
import { Textarea as BaseTextarea } from '@octanejs/shadcn/base-ui/Textarea';
import { Button } from '@octanejs/shadcn/Button';
import { Item } from '@octanejs/shadcn/Item';
import { Spinner as RadixSpinner } from '@octanejs/shadcn/Spinner';
import { Spinner as AriaSpinner } from '@octanejs/shadcn/react-aria/Spinner';
import { Spinner as BaseSpinner } from '@octanejs/shadcn/base-ui/Spinner';
import { NativeSelect as BaseNativeSelect } from '@octanejs/shadcn/base-ui/NativeSelect';
import { createElement } from 'octane';

export const nativeInputEvents: string[] = [];
export const nativeChangeEvents: string[] = [];

const valueOf = (event: Event) =>
	(event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
const recordInput = (event: Event) => nativeInputEvents.push(valueOf(event));
const recordChange = (event: Event) => nativeChangeEvents.push(valueOf(event));

export function NativeInputEventsFixture() @{
	<div>
		<RadixInput id="radix-input" onInput={recordInput} onChange={recordChange} />
		<RadixTextarea id="radix-textarea" onInput={recordInput} onChange={recordChange} />
		<AriaInput id="aria-input" onInput={recordInput} onChange={recordChange} />
		<AriaTextarea id="aria-textarea" onInput={recordInput} onChange={recordChange} />
		<BaseInput id="base-input" onInput={recordInput} onChange={recordChange} />
		<BaseTextarea id="base-textarea" onInput={recordInput} onChange={recordChange} />
	</div>
}

export function AsChildDescriptorsFixture() {
	return createElement(
		'div',
		null,
		createElement(
			Button,
			{ asChild: true },
			createElement('a', { id: 'as-button', href: '#button' }, 'Button'),
		),
		createElement(Item, { asChild: true }, createElement('article', { id: 'as-item' }, 'Item')),
	);
}

export function IconResolutionFixture() @{
	<div>
		<RadixSpinner id="radix-spinner" />
		<AriaSpinner id="aria-spinner" />
		<BaseSpinner id="base-spinner" />
		<BaseNativeSelect aria-label="Choice">
			<option>One</option>
		</BaseNativeSelect>
	</div>
}
