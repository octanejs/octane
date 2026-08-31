import { ReactElement, OctaneNode } from '../../react-shim.js';
import { Field, FieldProps } from '../Fields';
import { ItemSelector } from '../../lib/data/get-item';
import { ExtractField, UserGenerics } from '../Utils';
import { Config } from '../Config';

// Plugins can use `usePuck` instead of relying on props
type RenderFunc<Props extends { [key: string]: any } = { children: OctaneNode }> = (
	props: Props,
) => ReactElement;

// All direct render methods, excluding fields
export const overrideKeys = [
	'header',
	'headerActions',
	'fields',
	'fieldLabel',
	'drawer',
	'drawerItem',
	'componentOverlay',
	'outline',
	'puck',
	'preview',
] as const;

export type OverrideKey = (typeof overrideKeys)[number];

type OverridesGeneric<Shape extends { [key in OverrideKey]: any }> = Shape;

export type Overrides<UserConfig extends Config = Config> = OverridesGeneric<{
	fieldTypes: Partial<FieldRenderFunctions<UserConfig>>;
	header: RenderFunc<{ actions: OctaneNode; children: OctaneNode }>;
	actionBar: RenderFunc<{
		label?: string;
		children: OctaneNode;
		parentAction: OctaneNode;
	}>;
	headerActions: RenderFunc<{ children: OctaneNode }>;
	preview: RenderFunc;
	fields: RenderFunc<{
		children: OctaneNode;
		isLoading: boolean;
		itemSelector?: ItemSelector | null;
	}>;
	fieldLabel: RenderFunc<{
		children?: OctaneNode;
		icon?: OctaneNode;
		label: string;
		el?: 'label' | 'div';
		readOnly?: boolean;
		className?: string;
	}>;
	components: RenderFunc; // DEPRECATED
	componentItem: RenderFunc<{ children: OctaneNode; name: string }>; // DEPRECATED
	drawer: RenderFunc;
	drawerItem: RenderFunc<{ children: OctaneNode; name: string }>;
	iframe: RenderFunc<{ children: OctaneNode; document?: Document }>;
	outline: RenderFunc;
	componentOverlay: RenderFunc<{
		children: OctaneNode;
		hover: boolean;
		isSelected: boolean;
		componentId: string;
		componentType: string;
	}>;
	puck: RenderFunc;
}>;

export type FieldRenderFunctions<
	UserConfig extends Config = Config,
	G extends UserGenerics<UserConfig> = UserGenerics<UserConfig>,
	UserField extends { type: string } = Field | G['UserField'],
> = Omit<
	{
		[Type in UserField['type']]: FC<
			FieldProps<ExtractField<UserField, Type>, any> & {
				children: OctaneNode;
				name: string;
			}
		>;
	},
	'custom'
>;
