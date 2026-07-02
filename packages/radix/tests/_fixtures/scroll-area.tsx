import { ScrollArea } from '@octanejs/radix';

export function ScrollAreaApp(props?: {
	type?: 'auto' | 'always' | 'scroll' | 'hover';
	scrollHideDelay?: number;
	forceMount?: true;
	horizontal?: boolean;
}) {
	return (
		<div data-testid="app">
			<ScrollArea.Root
				data-testid="root"
				type={props?.type}
				scrollHideDelay={props?.scrollHideDelay}
			>
				<ScrollArea.Viewport data-testid="viewport">
					<div data-testid="content-inner">
						long content line 1<br />
						long content line 2<br />
						long content line 3
					</div>
				</ScrollArea.Viewport>
				<ScrollArea.Scrollbar
					data-testid="scrollbar-y"
					orientation="vertical"
					forceMount={props?.forceMount}
				>
					<ScrollArea.Thumb data-testid="thumb-y" forceMount={props?.forceMount} />
				</ScrollArea.Scrollbar>
				{props?.horizontal ? (
					<ScrollArea.Scrollbar
						data-testid="scrollbar-x"
						orientation="horizontal"
						forceMount={props?.forceMount}
					>
						<ScrollArea.Thumb data-testid="thumb-x" forceMount={props?.forceMount} />
					</ScrollArea.Scrollbar>
				) : null}
				<ScrollArea.Corner data-testid="corner" />
			</ScrollArea.Root>
		</div>
	);
}
