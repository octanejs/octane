import { useState } from 'octane';
import { ChevronDown, Copy, Check } from '@octanejs/lucide';
import { useToast } from '~/components/ToastProvider.tsrx';
import { Button } from '~/ui';
import { ButtonGroup } from './ButtonGroup.tsrx';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem } from './Dropdown.tsrx';
import { getPackageManager } from '~/utils/markdown/installCommand';
import { copyTextToClipboard, openPopupWindow, useTemporaryFlag } from '~/utils/browser-effects';
import { getLocalStorageItem } from '~/utils/browser-storage';

// Markdown icon component matching the screenshot
function MarkdownIcon({ className }: { className?: string }) {
	return <svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		class={className}
	>
		<rect x="3" y="5" width="18" height="14" rx="2" />
		<path d="M7 15V9l2 2 2-2v6" />
		<path d="M17 9v6l-2-2" />
	</svg>;
}

// Claude/Anthropic icon
function ClaudeIcon({ className }: { className?: string }) {
	return <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" class={className}>
		<path
			d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z"
		/>
	</svg>;
}

// ChatGPT/OpenAI icon
function ChatGPTIcon({ className }: { className?: string }) {
	return <svg viewBox="0 0 24 24" fill="currentColor" class={className}>
		<path
			d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"
		/>
	</svg>;
}

// Cursor icon
function CursorIcon({ className }: { className?: string }) {
	return <svg viewBox="0 0 24 24" fill="currentColor" class={className}>
		<path
			d="M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z"
		></path>
	</svg>;
}

// T3 Chat icon
function T3ChatIcon({ className }: { className?: string }) {
	return <svg viewBox="0 0 258 199" fill="currentColor" class={className}>
		<path
			fillRule="evenodd"
			clipRule="evenodd"
			d="M165.735 25.0701L188.947 0.972412H0.465994V25.0701H165.735Z"
		/>
		<path d="M163.981 96.3239L254.022 3.68314L221.206 3.68295L145.617 80.7609L163.981 96.3239Z" />
		<path
			d="M233.658 131.418C233.658 155.075 214.48 174.254 190.823 174.254C171.715 174.254 155.513 161.738 150 144.439L146.625 133.848L127.329 153.143L129.092 157.336C139.215 181.421 163.034 198.354 190.823 198.354C227.791 198.354 257.759 168.386 257.759 131.418C257.759 106.937 244.399 85.7396 224.956 74.0905L220.395 71.3582L202.727 89.2528L210.788 93.5083C224.403 100.696 233.658 114.981 233.658 131.418Z"
		/>
		<path
			fillRule="evenodd"
			clipRule="evenodd"
			d="M88.2625 192.669L88.2626 45.6459H64.1648L64.1648 192.669H88.2625Z"
		/>
	</svg>;
}

// Cache for fetched markdown content
const markdownCache = new Map<string, string>();

type CopyPageDropdownProps = {
	/** GitHub repo (e.g., 'tanstack/tanstack.com'). If provided, fetches from GitHub. */
	repo?: string;
	/** GitHub branch (e.g., 'main'). Required if repo is provided. */
	branch?: string;
	/** File path in the repo (e.g., 'src/blog/my-post.md'). Required if repo is provided. */
	filePath?: string;
	/** Current framework for filtering markdown content (appended as ?framework= query param) */
	currentFramework?: string;
	/** Raw content to copy directly, bypassing any fetch */
	content?: string;
	/** Override the copy button label (default: "Copy page") */
	label?: string;
};

export function CopyPageDropdown(
	{
		repo,
		branch,
		filePath,
		currentFramework,
		content: rawContent,
		label = 'Copy page',
	}: CopyPageDropdownProps = {},
) {
	const [open, setOpen] = useState(false);
	const copied = useTemporaryFlag();
	const { notify } = useToast();

	// For docs pages in this repo, prefer the site's markdown endpoint so requests stay behind site caching.
	const pageMarkdownUrl = (() => {
		if (typeof window === 'undefined') {
			return '.md';
		}

		const base = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}.md`;
		const params = new URLSearchParams(window.location.search);
		if (currentFramework) {
			params.set('framework', currentFramework);
		}

		// Read package manager from localStorage (same key as PackageManagerTabs)
		const pm = getLocalStorageItem('packageManager');
		const validPm = getPackageManager(pm);
		params.set('pm', validPm);

		const queryString = params.toString();
		return queryString ? `${base}?${queryString}` : base;
	})();

	const sourceMarkdownUrl =
		repo === 'tanstack/tanstack.com'
			? pageMarkdownUrl
			: repo && branch && filePath
				? `https://raw.githubusercontent.com/${repo}/${branch}/${filePath}`
				: pageMarkdownUrl;

	const handleCopyPage = async () => {
		if (rawContent) {
			await copyTextToClipboard(rawContent);
			copied.trigger();
			notify(
				<div>
					<div class="font-medium">Copied to clipboard</div>
				</div>,
			);
			return;
		}

		const urlToFetch = sourceMarkdownUrl;
		const cached = markdownCache.get(urlToFetch);

		const copyContent = async (content: string, source: string) => {
			await copyTextToClipboard(content);
			copied.trigger();
			notify(
				<div>
					<div class="font-medium">Copied to clipboard</div>
					<div class="text-xs text-gray-500 dark:text-gray-400">{source}</div>
				</div>,
			);
		};

		if (cached) {
			await copyContent(cached, 'Markdown content copied from cache');
			return;
		}

		try {
			const response = await fetch(urlToFetch);
			if (!response.ok) throw new Error('Failed to fetch');
			const content = await response.text();
			markdownCache.set(urlToFetch, content);
			await copyContent(
				content,
				repo === 'tanstack/tanstack.com'
					? 'Markdown content copied from markdown endpoint'
					: 'Markdown content copied from GitHub',
			);
		} catch {
			// Fallback: try to copy current page content if available
			const pageContent = document.querySelector('.styled-markdown-content')?.textContent || '';
			if (pageContent) {
				await copyContent(pageContent, 'Copied rendered page content');
			} else {
				// Last resort: copy the URL
				await copyTextToClipboard(window.location.href);
				copied.trigger();
				notify(
					<div>
						<div class="font-medium">Copied to clipboard</div>
						<div class="text-xs text-gray-500 dark:text-gray-400">Page URL copied</div>
					</div>,
				);
			}
		}
	};

	const handleViewMarkdown = () => {
		const url = sourceMarkdownUrl;
		openPopupWindow(url);
	};

	const handleOpenInClaude = () => {
		const pageUrl = window.location.href;
		const prompt = encodeURIComponent(`Read from this URL: ${pageUrl} and explain it to me`);
		openPopupWindow(`https://claude.ai/new?q=${prompt}`);
	};

	const handleOpenInChatGPT = () => {
		const pageUrl = window.location.href;
		const prompt = encodeURIComponent(`Read from this URL: ${pageUrl} and explain it to me`);
		openPopupWindow(`https://chatgpt.com/?q=${prompt}`);
	};

	const handleOpenInCursor = () => {
		const pageUrl = window.location.href;
		const prompt = `Read from this URL:\n${pageUrl}\nand explain it to me`;
		openPopupWindow(`cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(prompt)}`);
	};

	const handleOpenInT3Chat = () => {
		const pageUrl = window.location.href;
		const prompt = encodeURIComponent(`Read from this URL: ${pageUrl} and explain it to me`);
		openPopupWindow(`https://t3.chat/new?q=${prompt}`);
	};

	const menuItems = [
		...(!rawContent
			? [
					{
						icon: MarkdownIcon,
						label: 'View as Markdown',
						description: 'Open this page in Markdown',
						onSelect: handleViewMarkdown,
					},
				]
			: []),
		{
			icon: ClaudeIcon,
			label: 'Open in Claude',
			description: 'Ask questions about this page',
			onSelect: handleOpenInClaude,
		},
		{
			icon: ChatGPTIcon,
			label: 'Open in ChatGPT',
			description: 'Ask questions about this page',
			onSelect: handleOpenInChatGPT,
		},
		{
			icon: T3ChatIcon,
			label: 'Open in T3 Chat',
			description: 'Ask questions about this page',
			onSelect: handleOpenInT3Chat,
		},
		{
			icon: CursorIcon,
			label: 'Open in Cursor',
			description: 'Ask questions about this page',
			onSelect: handleOpenInCursor,
		},
	];

	return <ButtonGroup>
		<Button
			type="button"
			variant="ghost"
			size="xs"
			rounded="none"
			className="border-0"
			onClick={handleCopyPage}
		>
			{copied.active
				? <>
						<Check className="w-3 h-3" />
						Copied!
					</>
				: <>
						<Copy className="w-3 h-3" />
						{label}
					</>}
		</Button>
		<Dropdown open={open} onOpenChange={setOpen}>
			<DropdownTrigger>
				<Button
					type="button"
					variant="ghost"
					size="xs"
					rounded="none"
					className="border-0 px-1.5"
					aria-label={`More ${label} options`}
				>
					<ChevronDown className="w-3 h-3" />
				</Button>
			</DropdownTrigger>
			<DropdownContent align="end" className="min-w-72">{menuItems.map(
				(item) => <DropdownItem
					key={item.label}
					onSelect={item.onSelect}
					className="gap-3 px-3 py-2.5"
				>
					<div
						class="shrink-0 w-5 h-5 flex items-center justify-center text-gray-700 dark:text-gray-400"
					>
						<item.icon className="w-4 h-4" />
					</div>
					<div class="flex flex-col gap-0.5">
						<span class="font-medium text-sm text-gray-900 dark:text-gray-100">{item.label}</span>
						<span class="text-xs text-gray-500 dark:text-gray-400">{item.description}</span>
					</div>
				</DropdownItem>,
			)}</DropdownContent>
		</Dropdown>
	</ButtonGroup>;
}
