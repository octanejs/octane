import { Copy } from '@octanejs/lucide';
import { twMerge } from 'tailwind-merge';
import { useToast } from '~/components/ToastProvider.tsrx';
import { Button } from '~/ui';
import { copyTextToClipboard, useTemporaryFlag } from '~/utils/browser-effects';

export function CodeBlockView({
	className,
	copyText,
	htmlMarkup,
	isEmbedded,
	lang,
	showTypeCopyButton = true,
	style,
	title,
}: {
	className?: string;
	copyText: string;
	htmlMarkup: string;
	isEmbedded?: boolean;
	lang?: string;
	showTypeCopyButton?: boolean;
	style?: any;
	title?: string;
}) {
	const copied = useTemporaryFlag();
	const { notify } = useToast();

	return <div
		class={twMerge(
			'codeblock w-full max-w-full relative not-prose border border-gray-500/20 rounded-md overflow-hidden [&_pre]:rounded-none',
			className,
		)}
		style={style}
	>
		{(title || showTypeCopyButton) &&
			<div
				class="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded-t-md"
			>
				<div class="text-xs text-gray-700 dark:text-gray-300">
					{title || (lang?.toLowerCase() === 'bash' ? 'sh' : lang ?? '') as string}
				</div>

				<Button
					variant="ghost"
					size="xs"
					className={twMerge('border-0 rounded-md transition-opacity')}
					onClick={async () => {
						await copyTextToClipboard(copyText);
						copied.trigger();
						notify(
							<div class="flex flex-col">
								<span class="font-medium">Copied code</span>
								<span class="text-gray-500 dark:text-gray-400 text-xs">
									Code block copied to clipboard
								</span>
							</div>,
						);
					}}
					aria-label="Copy code to clipboard"
				>
					{copied.active ? <span class="text-xs">Copied!</span> : <Copy className="w-4 h-4" />}
				</Button>
			</div>}

		<div
			class={twMerge(isEmbedded ? 'h-full [&>pre]:h-full [&>pre]:rounded-none' : '')}
			dangerouslySetInnerHTML={{ __html: htmlMarkup }}
		/>
	</div>;
}
