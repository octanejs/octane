import type {
	ToolkitListNestMode,
	ToolkitPortableTextList,
	ToolkitPortableTextListItem,
} from '@portabletext/toolkit';
import type {
	ArbitraryTypedObject,
	PortableTextBlock,
	PortableTextBlockStyle,
	PortableTextListItemBlock,
	PortableTextListItemType,
	TypedObject,
} from '@portabletext/types';
import type { OctaneNode } from 'octane';

export type PortableTextComponentType<Props = any> = (props: Props) => OctaneNode;

export interface PortableTextProps<
	B extends TypedObject = PortableTextBlock | ArbitraryTypedObject,
> {
	value: B | B[] | null | undefined;
	components?: PortableTextComponents<B>;
	onMissingComponent?: MissingComponentHandler | false;
	listNestingMode?: ToolkitListNestMode;
}

export type PortableTextComponent<N> = PortableTextComponentType<PortableTextComponentProps<N>>;
export type PortableTextBlockComponent = PortableTextComponent<PortableTextBlock>;
export type PortableTextListComponent = PortableTextComponent<OctanePortableTextList>;
export type PortableTextListItemComponent = PortableTextComponent<PortableTextListItemBlock>;
export type PortableTextMarkComponent<M extends TypedObject = any> = PortableTextComponentType<
	PortableTextMarkComponentProps<M>
>;
export type PortableTextTypeComponent<V extends TypedObject = any> = PortableTextComponentType<
	PortableTextTypeComponentProps<V>
>;

type LooseRecord<K extends string, V> = Record<string, V> & { [P in K]?: V };
type TypeName<T> = T extends { _type: infer Name } ? (Name extends string ? Name : never) : never;
type BuiltInPortableTextString<T> = T extends string ? (string extends T ? never : T) : never;
type BlockFrom<B extends TypedObject> = Extract<B, { _type: 'block' }>;
type CustomTypeFrom<B extends TypedObject> = Exclude<B, { _type: 'block' }>;
type CustomTypeName<B extends TypedObject> = TypeName<CustomTypeFrom<B>>;

export type DefaultPortableTextBlockStyle = BuiltInPortableTextString<PortableTextBlockStyle>;
export type DefaultPortableTextListItem = BuiltInPortableTextString<PortableTextListItemType>;
export type DefaultPortableTextMark =
	'em' | 'strong' | 'code' | 'underline' | 'strike-through' | 'link';

type BlockStyleName<B extends TypedObject> =
	BlockFrom<B> extends { style?: infer Style }
		? NonNullable<Style> extends string
			? NonNullable<Style>
			: never
		: never;
type CustomBlockStyleName<B extends TypedObject> = Exclude<
	BlockStyleName<B>,
	DefaultPortableTextBlockStyle
>;
type ListItemName<B extends TypedObject> =
	BlockFrom<B> extends { listItem?: infer Item }
		? NonNullable<Item> extends string
			? NonNullable<Item>
			: never
		: never;
type CustomListItemName<B extends TypedObject> = Exclude<
	ListItemName<B>,
	DefaultPortableTextListItem
>;
type MarkFrom<B extends TypedObject> =
	BlockFrom<B> extends { markDefs?: infer MarkDefs }
		? NonNullable<MarkDefs> extends readonly (infer MarkDef)[]
			? Extract<MarkDef, TypedObject>
			: never
		: never;
type MarkName<B extends TypedObject> = TypeName<MarkFrom<B>>;
type CustomMarkName<B extends TypedObject> = Exclude<MarkName<B>, DefaultPortableTextMark>;

type BlockComponentFor<B extends TypedObject> =
	BlockFrom<B> extends never ? PortableTextBlockComponent : PortableTextComponent<BlockFrom<B>>;
type ListComponentFor<B extends TypedObject> =
	ListItemName<B> extends never
		? PortableTextListComponent
		: PortableTextComponent<
				Omit<OctanePortableTextList, 'listItem'> & { listItem: ListItemName<B> }
			>;
type ListItemComponentFor<B extends TypedObject> =
	ListItemName<B> extends never
		? PortableTextListItemComponent
		: PortableTextComponent<Omit<BlockFrom<B>, 'listItem'> & { listItem: ListItemName<B> }>;

type BlockComponents<B extends TypedObject> =
	string extends BlockStyleName<B>
		? LooseRecord<PortableTextBlockStyle, PortableTextBlockComponent | undefined>
		: BlockStyleName<B> extends never
			? LooseRecord<PortableTextBlockStyle, PortableTextBlockComponent | undefined>
			: Record<string, PortableTextComponent<any> | undefined> & {
					[Style in BlockStyleName<B>]?: PortableTextComponent<
						Omit<BlockFrom<B>, 'style'> & { style?: Style }
					>;
				};

type ListComponents<B extends TypedObject> =
	string extends ListItemName<B>
		? LooseRecord<PortableTextListItemType, PortableTextListComponent | undefined>
		: ListItemName<B> extends never
			? Record<string, PortableTextListComponent | undefined>
			: Record<string, PortableTextComponent<any> | undefined> & {
					[Item in ListItemName<B>]?: PortableTextComponent<
						Omit<OctanePortableTextList, 'listItem'> & { listItem: Item }
					>;
				};

type ListItemComponents<B extends TypedObject> =
	string extends ListItemName<B>
		? LooseRecord<PortableTextListItemType, PortableTextListItemComponent | undefined>
		: ListItemName<B> extends never
			? Record<string, PortableTextListItemComponent | undefined>
			: Record<string, PortableTextComponent<any> | undefined> & {
					[Item in ListItemName<B>]?: PortableTextComponent<
						Omit<BlockFrom<B>, 'listItem'> & { listItem: Item }
					>;
				};

type MarkComponents<B extends TypedObject> =
	string extends MarkName<B>
		? Record<string, PortableTextMarkComponent | undefined>
		: MarkName<B> extends never
			? Record<string, PortableTextMarkComponent | undefined>
			: Record<string, PortableTextMarkComponent | undefined> & {
					[Name in MarkName<B>]?: PortableTextMarkComponent<Extract<MarkFrom<B>, { _type: Name }>>;
				};

type TypeComponents<B extends TypedObject> =
	string extends CustomTypeName<B>
		? Record<string, PortableTextTypeComponent | undefined>
		: CustomTypeName<B> extends never
			? Record<string, PortableTextTypeComponent | undefined>
			: Record<string, PortableTextTypeComponent | undefined> & {
					[Name in CustomTypeName<B>]?: PortableTextTypeComponent<
						Extract<CustomTypeFrom<B>, { _type: Name }>
					>;
				};

export interface PortableTextOctaneComponents<B extends TypedObject = any> {
	types: TypeComponents<B>;
	marks: MarkComponents<B>;
	block: BlockComponents<B> | PortableTextComponent<BlockFrom<B>>;
	list: ListComponents<B> | PortableTextListComponent;
	listItem: ListItemComponents<B> | PortableTextListItemComponent;
	hardBreak: PortableTextComponentType | false;
	unknownMark: PortableTextMarkComponent;
	unknownType: PortableTextComponent<UnknownNodeType>;
	unknownBlockStyle: PortableTextComponent<PortableTextBlock>;
	unknownList: PortableTextComponent<OctanePortableTextList>;
	unknownListItem: PortableTextComponent<PortableTextListItemBlock>;
}

/** @deprecated Prefer PortableTextOctaneComponents in new Octane code. */
export type PortableTextReactComponents<B extends TypedObject = any> =
	PortableTextOctaneComponents<B>;
export type PortableTextComponents<B extends TypedObject = any> = Partial<
	PortableTextOctaneComponents<B>
>;

type PortableTextValueItem<T> = Extract<
	NonNullable<T> extends readonly (infer B)[] ? B : NonNullable<T>,
	TypedObject
>;
type PortableTextArrayItem<T> =
	NonNullable<T> extends readonly (infer Item)[]
		? Extract<NonNullable<Item>, { _type: 'block' }> extends never
			? never
			: Extract<NonNullable<Item>, TypedObject>
		: never;
type InferPortableTextTypedObject<T> = T extends unknown
	? PortableTextArrayItem<T> extends never
		? NonNullable<T> extends readonly (infer Item)[]
			? InferPortableTextTypedObject<Item>
			: NonNullable<T> extends object
				? {
						[Key in keyof NonNullable<T>]: InferPortableTextTypedObject<NonNullable<T>[Key]>;
					}[keyof NonNullable<T>]
				: never
		: PortableTextArrayItem<T>
	: never;

type StrictTypeComponents<B extends TypedObject> =
	string extends CustomTypeName<B>
		? Record<string, PortableTextTypeComponent | undefined>
		: CustomTypeName<B> extends never
			? Record<string, never>
			: {
					[Name in CustomTypeName<B>]-?: PortableTextTypeComponent<
						Extract<CustomTypeFrom<B>, { _type: Name }>
					>;
				};
type StrictTypeOverrides<B extends TypedObject> =
	CustomTypeName<B> extends never
		? { types?: StrictTypeComponents<B> }
		: { types: StrictTypeComponents<B> };

type StrictMarkComponents<B extends TypedObject> =
	string extends MarkName<B>
		? Record<string, PortableTextMarkComponent | undefined>
		: MarkName<B> extends never
			? Record<string, never>
			: {
					[Name in CustomMarkName<B>]-?: PortableTextMarkComponent<
						Extract<MarkFrom<B>, { _type: Name }>
					>;
				} & {
					[Name in Extract<DefaultPortableTextMark, MarkName<B>>]?: PortableTextMarkComponent<
						Extract<MarkFrom<B>, { _type: Name }>
					>;
				};
type StrictMarkOverrides<B extends TypedObject> =
	CustomMarkName<B> extends never
		? { marks?: StrictMarkComponents<B> }
		: { marks: StrictMarkComponents<B> };

type StrictBlockComponents<B extends TypedObject> =
	string extends BlockStyleName<B>
		? LooseRecord<PortableTextBlockStyle, PortableTextBlockComponent | undefined>
		: BlockStyleName<B> extends never
			? Record<string, never>
			: {
					[Style in CustomBlockStyleName<B>]-?: PortableTextComponent<
						Omit<BlockFrom<B>, 'style'> & { style?: Style }
					>;
				} & {
					[
						Style in Extract<DefaultPortableTextBlockStyle, BlockStyleName<B>>
					]?: PortableTextComponent<Omit<BlockFrom<B>, 'style'> & { style?: Style }>;
				};
type StrictBlockOverrides<B extends TypedObject> =
	CustomBlockStyleName<B> extends never
		? { block?: StrictBlockComponents<B> | BlockComponentFor<B> }
		: { block: StrictBlockComponents<B> | BlockComponentFor<B> };

type StrictListComponents<B extends TypedObject> =
	string extends ListItemName<B>
		? LooseRecord<PortableTextListItemType, PortableTextListComponent | undefined>
		: ListItemName<B> extends never
			? Record<string, never>
			: {
					[Item in CustomListItemName<B>]-?: PortableTextComponent<
						Omit<OctanePortableTextList, 'listItem'> & { listItem: Item }
					>;
				} & {
					[Item in Extract<DefaultPortableTextListItem, ListItemName<B>>]?: PortableTextComponent<
						Omit<OctanePortableTextList, 'listItem'> & { listItem: Item }
					>;
				};
type StrictListOverrides<B extends TypedObject> =
	CustomListItemName<B> extends never
		? { list?: StrictListComponents<B> | ListComponentFor<B> }
		: { list: StrictListComponents<B> | ListComponentFor<B> };

type StrictListItemComponents<B extends TypedObject> =
	string extends ListItemName<B>
		? LooseRecord<PortableTextListItemType, PortableTextListItemComponent | undefined>
		: ListItemName<B> extends never
			? Record<string, never>
			: {
					[Item in ListItemName<B>]-?: PortableTextComponent<
						Omit<BlockFrom<B>, 'listItem'> & { listItem: Item }
					>;
				};
type StrictListItemOverrides<B extends TypedObject> = {
	listItem?: StrictListItemComponents<B> | ListItemComponentFor<B>;
};

export type InferComponents<T> = PortableTextComponents<PortableTextValueItem<T>>;
export type InferValue<T> = Exclude<InferPortableTextTypedObject<T>, undefined>[];
export type InferStrictComponents<T> = Omit<
	PortableTextComponents<PortableTextValueItem<T>>,
	'types' | 'marks' | 'block' | 'list' | 'listItem'
> &
	StrictTypeOverrides<PortableTextValueItem<T>> &
	StrictMarkOverrides<PortableTextValueItem<T>> &
	StrictBlockOverrides<PortableTextValueItem<T>> &
	StrictListOverrides<PortableTextValueItem<T>> &
	StrictListItemOverrides<PortableTextValueItem<T>>;

export interface PortableTextComponentProps<T> {
	value: T;
	index: number;
	isInline: boolean;
	children?: OctaneNode;
	renderNode: NodeRenderer;
}
export type PortableTextTypeComponentProps<T> = Omit<PortableTextComponentProps<T>, 'children'>;
export interface PortableTextMarkComponentProps<M extends TypedObject = ArbitraryTypedObject> {
	value?: M;
	text: string;
	markKey?: string;
	markType: string;
	children: OctaneNode;
	renderNode: NodeRenderer;
}

export type UnknownNodeType = { _type: string; [key: string]: unknown } | TypedObject;
export type NodeRenderer = <T extends TypedObject>(options: Serializable<T>) => OctaneNode;
export type NodeType = 'block' | 'mark' | 'blockStyle' | 'listStyle' | 'listItemStyle';
export type MissingComponentHandler = (
	message: string,
	options: { type: string; nodeType: NodeType },
) => void;
export interface Serializable<T> {
	node: T;
	index: number;
	isInline: boolean;
	renderNode: NodeRenderer;
}
export interface SerializedBlock {
	_key: string;
	children: OctaneNode;
	index: number;
	isInline: boolean;
	node: PortableTextBlock | PortableTextListItemBlock;
}

export type OctanePortableTextList = ToolkitPortableTextList;
export type OctanePortableTextListItem = ToolkitPortableTextListItem;
/** @deprecated Prefer OctanePortableTextList in new Octane code. */
export type ReactPortableTextList = OctanePortableTextList;
/** @deprecated Prefer OctanePortableTextListItem in new Octane code. */
export type ReactPortableTextListItem = OctanePortableTextListItem;
