# @octanejs/stick-to-bottom

Octane binding for [`use-stick-to-bottom@1.1.6`](https://github.com/stackblitz/use-stick-to-bottom).

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

For render-prop children in `.tsrx`, pass `children={(ctx) => ...}`. Nested TSRX children compile to an opaque render block.

See [UPSTREAM.md](./UPSTREAM.md).
