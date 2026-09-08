import { useState } from 'octane';
import { useKeyboard } from '@octanejs/aria';
import {
	Label,
	Link,
	Popover,
	PreviewTrigger,
	Text,
	Token,
	TokenField,
	TokenFieldValue,
	TokenInput,
} from '@octanejs/aria/components';

export function Tokens(props: { isReadOnly?: boolean; isDisabled?: boolean }) {
	return <TokenField
		defaultValue={new TokenFieldValue([
			{ type: 'text', text: 'Hello ' },
			{ type: 'token', text: 'Ada' },
		])}
		isReadOnly={props.isReadOnly}
		isDisabled={props.isDisabled}
	>
		<Label>Message</Label>
		<TokenInput>
			{(segment) => <Token>{segment.text as string}</Token>}
		</TokenInput>
		<Text slot="description">Choose recipients</Text>
	</TokenField>;
}

export function Preview() {
	return <PreviewTrigger delay={0} closeDelay={0}>
		<Link href="#details">Preview details</Link>
		<Popover aria-label="Details">
			<a href="#more">Read more</a>
		</Popover>
	</PreviewTrigger>;
}

export function TokenBlocks() @{
	<TokenField
		defaultValue={new TokenFieldValue([
			{ type: 'token', text: 'Ada' },
		])}
	>
		<Label>Recipient</Label>
		<TokenInput>
			<Token>Ada</Token>
		</TokenInput>
	</TokenField>
}

export function Shortcuts() {
	const [count, setCount] = useState(0);
	const [bubbles, setBubbles] = useState(0);
	const { keyboardProps } = useKeyboard({
		shortcuts: { 'Control+k': () => setCount((n: number) => n + 1) },
	});
	return <div onKeyDown={() => setBubbles((n: number) => n + 1)}>
		<input aria-label="Shortcuts" {...keyboardProps} />
		<output>{'handled:' + count + ' bubbled:' + bubbles}</output>
	</div>;
}
