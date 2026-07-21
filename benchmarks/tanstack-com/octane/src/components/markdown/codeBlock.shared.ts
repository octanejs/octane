import { isValidElement } from 'octane';

export type CodeBlockProps = Record<string, any> & {
	'data-code-title'?: string;
	dataCodeTitle?: string;
	isEmbedded?: boolean;
	showTypeCopyButton?: boolean;
};

export function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export function buildPlainCodeBlockHtml(code: string) {
	return `<pre class="th-code th-code--plaintext h-full" data-language="plaintext"><code>${escapeHtml(
		code,
	)}</code></pre>`;
}

export function extractCodeBlockData(props: CodeBlockProps) {
	const rawTitle = props.dataCodeTitle || props['data-code-title'];

	const title =
		rawTitle && rawTitle !== 'undefined' && rawTitle.trim().length > 0
			? rawTitle.trim()
			: undefined;

	const codeElement = getCodeElementProps(props.children);
	const lang = codeElement.className?.replace('language-', '') || 'plaintext';
	const code = codeElement.children;

	return {
		code,
		lang,
		title,
	};
}

function getCodeElementProps(node: unknown) {
	if (!isValidElement(node)) {
		return {
			children: '',
			className: undefined as string | undefined,
		};
	}

	const { props } = node as { props: unknown };

	if (typeof props !== 'object' || props === null) {
		return {
			children: '',
			className: undefined as string | undefined,
		};
	}

	// Octane normalizes `className` → `class` on compiled host JSX, while
	// runtime-created descriptors (renderMarkdown.ts) keep `className` — accept both.
	const className =
		'className' in props && typeof props.className === 'string'
			? props.className
			: 'class' in props && typeof (props as any).class === 'string'
				? ((props as any).class as string)
				: undefined;

	const children = 'children' in props && typeof props.children === 'string' ? props.children : '';

	return {
		children,
		className,
	};
}

export function getCodeBlockLanguageFromFilePath(filePath: string) {
	const ext = filePath.split('.').pop()?.toLowerCase();

	if (!ext) {
		return 'txt';
	}

	if (['cts', 'mts'].includes(ext)) return 'ts';
	if (['cjs', 'mjs'].includes(ext)) return 'js';
	if (ext === 'gts') return 'ts';
	if (ext === 'gjs') return 'js';
	if (['prettierrc', 'babelrc', 'webmanifest'].includes(ext)) return 'json';
	if (['env', 'example'].includes(ext)) return 'sh';

	// Marko is HTML-based; @tanstack/highlight has no Marko grammar, so fall
	// back to html for reasonable tag/attribute/string coloring.
	if (ext === 'marko') return 'html';

	if (
		[
			'gitignore',
			'prettierignore',
			'log',
			'gitattributes',
			'editorconfig',
			'lock',
			'opts',
			'dockerfile',
			'dockerignore',
			'npmrc',
			'nvmrc',
		].includes(ext)
	) {
		return 'txt';
	}

	return ext;
}
