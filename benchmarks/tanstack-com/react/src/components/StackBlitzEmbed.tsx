import * as React from 'react';
import { useIsDark } from '~/hooks/useIsDark';
import { stackBlitzIframeProps } from '~/utils/stackblitz-embed';

type StackBlitzEmbedProps = {
	repo: string;
	branch: string;
	examplePath: string;
	file?: string;
	preset?: 'node';
	height?: string | number;
	title?: string;
};

export function StackBlitzEmbed({
	repo,
	branch,
	examplePath,
	file,
	preset = 'node',
	height = '80vh',
	title,
}: StackBlitzEmbedProps) {
	const isDark = useIsDark();
	const themeParam = isDark ? 'dark' : 'light';
	const fileParam = file ? `&file=${encodeURIComponent(file)}` : '';

	const src = `https://stackblitz.com/github/${repo}/tree/${branch}/${examplePath}?embed=1&theme=${themeParam}&preset=${preset}${fileParam}`;

	return (
		//oxlint-disable-next-line jsx-a11y/iframe-has-title
		<iframe
			title={title || `${repo}: ${examplePath}`}
			key={`${examplePath}-${themeParam}`}
			src={src}
			{...stackBlitzIframeProps}
			sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
			className="shadow-lg"
			loading="lazy"
			style={{ width: '100%', height, border: '0' }}
		/>
	);
}
