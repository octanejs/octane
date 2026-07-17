import {
	MarkViewContent,
	NodeViewContent,
	NodeViewWrapper,
	ReactNodeViewContentProvider,
} from '@octanejs/tiptap';

export function StaticCustomViews() @{
	<main data-static-custom-views="true">
		<ReactNodeViewContentProvider
			content={<strong data-static-node-content="true">Static node content</strong>}
		>
			<NodeViewWrapper as="article" data-static-node-wrapper="true">
				<NodeViewContent as="section" data-static-node-target="true" />
			</NodeViewWrapper>
		</ReactNodeViewContentProvider>
		<MarkViewContent as="em" data-static-mark-content="true">
			Static mark content
		</MarkViewContent>
	</main>
}
