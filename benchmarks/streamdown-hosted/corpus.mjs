const SECTION = (index) => `## Streaming section ${index}

This paragraph mixes **strong text**, _emphasis_, an
[external link](https://example.com/section-${index}), and 中文内容，用来模拟多语言 AI
聊天消息中的普通 Markdown。

> The renderer should preserve completed blocks while the next block is still
> arriving. Section marker: quote-${index}.

- stable item ${index}.1
- stable item ${index}.2
- stable item ${index}.3

| metric | value | note |
| --- | ---: | --- |
| section | ${index} | deterministic |
| latency | ${index * 7} ms | sample |

\`\`\`ts
export const section${index} = {
  id: ${index},
  enabled: true,
  label: "stream-${index}",
}
\`\`\`

Inline math $x_${index} + y_${index}$ and block math:

$$
f_${index}(x) = x^2 + ${index}
$$
`;

export const STATIC_A = [
	'# Streamdown benchmark',
	'',
	'The same document is rendered by the before and after migration targets.',
	'',
	...Array.from({ length: 6 }, (_, index) => SECTION(index + 1)),
	'',
	'Final semantic marker: STATIC_A_COMPLETE',
].join('\n');

export const STATIC_B = [
	'# Streamdown replacement document',
	'',
	'This alternate document forces a real prop update and tree replacement.',
	'',
	...Array.from({ length: 6 }, (_, index) => SECTION(index + 11)),
	'',
	'Final semantic marker: STATIC_B_COMPLETE',
].join('\n');

export const STREAM_MARKDOWN = [
	'# Streaming response',
	'',
	'The following response arrives in deterministic slices.',
	'',
	...Array.from({ length: 5 }, (_, index) => SECTION(index + 21)),
	'',
	'Final semantic marker: STREAM_COMPLETE',
].join('\n');

export function createStreamFrames(step) {
	const frames = [];
	for (let end = step; end < STREAM_MARKDOWN.length; end += step) {
		frames.push(STREAM_MARKDOWN.slice(0, end));
	}
	frames.push(STREAM_MARKDOWN);
	return frames;
}
