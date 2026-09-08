# @octanejs/stick-to-bottom

Octane binding for [`use-stick-to-bottom@1.1.6`](https://github.com/stackblitz/use-stick-to-bottom).

## Installation

```sh
npm install @octanejs/stick-to-bottom
pnpm add @octanejs/stick-to-bottom
```

```tsrx
import { StickToBottom } from '@octanejs/stick-to-bottom';

export function Transcript(props: { messages: string[] }) @{
	<StickToBottom>
		<StickToBottom.Content>
			@for (const message of props.messages; key message) {
				<p>{message}</p>
			}
		</StickToBottom.Content>
	</StickToBottom>
}
```

Nested TSRX children render normally. Function children remain render props and receive the stick-to-bottom context.

See [UPSTREAM.md](./UPSTREAM.md).
