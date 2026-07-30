import { useState } from 'octane';
import { Streamdown } from '@octanejs/streamdown';
import { cjk } from '@octanejs/streamdown/cjk';
import { math } from '@octanejs/streamdown/math';

type MarkdownParityProps = {
	content: string;
};

export function MarkdownParity({ content }: MarkdownParityProps) {
	return <Streamdown
		allowedTags={{ mention: ['user_id'] }}
		controls={false}
		literalTagContent={['mention']}
		mode="static"
		plugins={{ cjk, math }}
	>{content}</Streamdown>;
}

export function StreamingMarkdownParity({ content }: MarkdownParityProps) {
	const [markdown, setMarkdown] = useState(content);

	return <section>
		<button
			id="append-markdown"
			type="button"
			onClick={() => setMarkdown((previous) => `${previous}\n\n## Added\n\n- stable\n- streamed`)}
		>
			append
		</button>
		<Streamdown animated={{ duration: 100 }} controls={false} isAnimating>{markdown}</Streamdown>
	</section>;
}
