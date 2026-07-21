import { renderCodeBlockData } from '@tanstack/highlight';
import { useMemo } from 'octane';
import { CodeBlockView } from './CodeBlockView.tsrx';
import { MermaidBlock } from './MermaidBlock.tsrx';
import { extractCodeBlockData, type CodeBlockProps } from './codeBlock.shared';

export function CodeBlock(props: CodeBlockProps) {
	const { code, lang, title } = extractCodeBlockData(props);

	if (lang === 'mermaid') {
		return <MermaidBlock
			className={props.className}
			code={code}
			isEmbedded={props.isEmbedded}
			showTypeCopyButton={props.showTypeCopyButton}
			style={props.style}
			title={title}
		/>;
	}

	return <HighlightedCodeBlock code={code} lang={lang} props={props} title={title} />;
}

function HighlightedCodeBlock({
	code,
	lang,
	props,
	title,
}: {
	code: string;
	lang: string;
	props: CodeBlockProps;
	title?: string;
}) {
	const rendered = useMemo(() => {
		return renderCodeBlockData({ code, lang, title });
	}, [code, lang, title]);

	return <CodeBlockView
		className={props.className}
		copyText={rendered.copyText}
		htmlMarkup={rendered.htmlMarkup}
		isEmbedded={props.isEmbedded}
		lang={rendered.lang}
		showTypeCopyButton={props.showTypeCopyButton}
		style={props.style}
		title={rendered.title}
	/>;
}
