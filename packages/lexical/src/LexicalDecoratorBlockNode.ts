// Ported from @lexical/react/src/LexicalDecoratorBlockNode.ts. Framework-agnostic
// apart from the decorate() return type — React typed it `JSX.Element`; octane's
// decorate() returns a renderable, so the type parameter is left open (subclasses
// pin it). Pair with BlockWithAlignableContents for selection + alignment.
import type {
	ElementFormatType,
	LexicalNode,
	LexicalUpdateJSON,
	NodeKey,
	SerializedLexicalNode,
	Spread,
} from 'lexical';

import { DecoratorNode } from 'lexical';

export type SerializedDecoratorBlockNode = Spread<
	{
		format: ElementFormatType;
	},
	SerializedLexicalNode
>;

export class DecoratorBlockNode extends DecoratorNode<unknown> {
	__format: ElementFormatType;

	constructor(format?: ElementFormatType, key?: NodeKey) {
		super(key);
		this.__format = format || '';
	}

	afterCloneFrom(prevNode: this): void {
		super.afterCloneFrom(prevNode);
		this.__format = prevNode.__format;
	}

	exportJSON(): SerializedDecoratorBlockNode {
		return {
			...super.exportJSON(),
			format: this.__format || '',
		};
	}

	updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedDecoratorBlockNode>): this {
		return super.updateFromJSON(serializedNode).setFormat(serializedNode.format || '');
	}

	canIndent(): false {
		return false;
	}

	createDOM(): HTMLElement {
		return document.createElement('div');
	}

	updateDOM(): false {
		return false;
	}

	setFormat(format: ElementFormatType): this {
		const self = this.getWritable();
		self.__format = format;
		return self;
	}

	getFormat(): ElementFormatType {
		return this.getLatest().__format;
	}

	isInline(): false {
		return false;
	}
}

export function $isDecoratorBlockNode(
	node: LexicalNode | null | undefined,
): node is DecoratorBlockNode {
	return node instanceof DecoratorBlockNode;
}
