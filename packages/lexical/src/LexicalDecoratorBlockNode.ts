// Ported from @lexical/react/src/LexicalDecoratorBlockNode.ts. Framework-agnostic
// apart from the decorate() return type — React typed it `JSX.Element`; octane's
// decorate() returns a renderable, so the type parameter is left open (subclasses
// pin it). Pair with BlockWithAlignableContents for selection + alignment.
import {
	$getDocument,
	DecoratorNode,
	type ElementFormatType,
	enumValue,
	type LexicalNode,
	type LexicalParseJSON,
	type NodeKey,
	nodeSchema,
	type SerializedLexicalNode,
	type SerializedPartial,
	type Spread,
	withField,
} from 'lexical';

import { GENERATED_DECORATORBLOCK } from './shared/LexicalReactGeneratedJSON';

export type SerializedDecoratorBlockNode = Spread<
	{
		format: ElementFormatType;
	},
	SerializedLexicalNode
>;

// Single source of truth for parsing the node-specific properties of a
// SerializedDecoratorBlockNode. DecoratorBlockNode is an abstract base (it has
// no concrete node type) so it publishes its schema on `$config` under the
// well-known `Symbol.for('DecoratorBlockNode')` key; concrete subclasses
// compose it with their own.
const decoratorBlockNodeSchema = nodeSchema<DecoratorBlockNode>()({
	format: withField(enumValue(['', 'left', 'start', 'center', 'right', 'end', 'justify']), {
		field: '__format',
	}),
});

export interface DecoratorBlockNode {
	exportJSON(compact?: false): SerializedDecoratorBlockNode;
	exportJSON(compact: boolean): SerializedPartial<SerializedDecoratorBlockNode>;
	updateFromJSON(serializedNode: LexicalParseJSON<SerializedDecoratorBlockNode>): this;
}

export class DecoratorBlockNode extends DecoratorNode<unknown> {
	__format: ElementFormatType;

	constructor(format?: ElementFormatType, key?: NodeKey) {
		super(key);
		this.__format = format || '';
	}

	$config() {
		return this.config(Symbol.for('DecoratorBlockNode'), {
			// Named explicitly: this class carries the only declaration of `format`
			// that its concrete subclasses inherit, and composeSchema honors an
			// explicit `extends` where a severed static prototype chain would stop.
			extends: DecoratorNode,
			generated: GENERATED_DECORATORBLOCK,
			json: decoratorBlockNodeSchema,
		});
	}

	canIndent(): false {
		return false;
	}

	createDOM(): HTMLElement {
		return $getDocument().createElement('div');
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
