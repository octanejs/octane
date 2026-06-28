import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { HashtagNode } from '@lexical/hashtag';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { HorizontalRuleNode } from '@octanejs/lexical';

// The node classes the editor registers (initialConfig.nodes). All come from the
// framework-agnostic @lexical/* packages, except the HorizontalRuleNode decorator
// node which @octanejs/lexical provides.
export const EDITOR_NODES = [
	HeadingNode,
	QuoteNode,
	ListNode,
	ListItemNode,
	LinkNode,
	AutoLinkNode,
	HashtagNode,
	CodeNode,
	CodeHighlightNode,
	TableNode,
	TableCellNode,
	TableRowNode,
	HorizontalRuleNode,
];
