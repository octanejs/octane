import {
	ChangeEvent,
	ComponentType,
	createContext,
	CSSProperties,
	ForwardedRef,
	HTMLInputAutoCompleteAttribute,
	KeyboardEvent,
	MouseEvent,
	OctaneNode,
	useContext,
} from 'octane';

import { BlockNoteEditor, User } from '@blocknote/core';
import {
	DefaultReactGridSuggestionItem,
} from '../components/SuggestionMenu/GridSuggestionMenu/types.js';
import { DefaultReactSuggestionItem } from '../components/SuggestionMenu/types.js';

type ToolbarRootType = {
	className?: string;
	children?: OctaneNode;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
	variant?: 'default' | 'action-toolbar';
};

type ToolbarButtonType =
	{
		className?: string;
		mainTooltip?: string;
		secondaryTooltip?: string;
		icon?: OctaneNode;
		onClick?: (e: MouseEvent) => void;
		isSelected?: boolean;
		isDisabled?: boolean;
		variant?: 'default' | 'compact';
	} & ({ children: OctaneNode; label?: string } | { children?: undefined; label: string });

type ToolbarSelectType = {
	className?: string;
	items: {
		text: string;
		icon: OctaneNode;
		onClick: () => void;
		isSelected: boolean;
		isDisabled?: boolean;
	}[];
	isDisabled?: boolean;
};

type MenuButtonType =
	{
		className?: string;
		onClick?: (e: MouseEvent) => void;
		icon?: OctaneNode;
		onDragStart?: (e: React.DragEvent) => void;
		onDragEnd?: (e: React.DragEvent) => void;
		draggable?: boolean;
	} & ({ children: OctaneNode; label?: string } | { children?: undefined; label: string });

export type ComponentProps = {
	FormattingToolbar: {
		Root: ToolbarRootType;
		Button: ToolbarButtonType;
		Select: ToolbarSelectType;
	};
	FilePanel: {
		Root: {
			className?: string;
			tabs: {
				name: string;
				tabPanel: OctaneNode;
			}[];
			openTab: string;
			setOpenTab: (name: string) => void;
			defaultOpenTab: string;
			loading: boolean;
		};
		Button: {
			className?: string;
			onClick: () => void;
		} & ({ children: OctaneNode; label?: string } | { children?: undefined; label: string });
		FileInput: {
			className?: string;
			accept: string;
			value: File | null;
			placeholder: string;
			onChange: (payload: File | null) => void;
		};
		TabPanel: {
			className?: string;
			children?: OctaneNode;
		};
		TextInput: {
			className?: string;
			value: string;
			placeholder: string;
			onChange: (event: ChangeEvent<HTMLInputElement>) => void;
			onKeyDown: (event: KeyboardEvent) => void;
		};
	};
	LinkToolbar: {
		Root: ToolbarRootType;
		Button: ToolbarButtonType;
		Select: ToolbarSelectType;
	};
	SideMenu: {
		Root: {
			className?: string;
			children?: OctaneNode;
		};
		Button: {
			className?: string;
			onClick?: (e: MouseEvent) => void;
			icon?: OctaneNode;
			onDragStart?: (e: React.DragEvent) => void;
			onDragEnd?: (e: React.DragEvent) => void;
			draggable?: boolean;
		} & ({ children: OctaneNode; label?: string } | { children?: undefined; label: string });
	};
	SuggestionMenu: {
		Root: {
			id: string;
			className?: string;
			children?: OctaneNode;
		};
		EmptyItem: {
			className?: string;
			children?: OctaneNode;
		};
		Item: {
			className?: string;
			id: string;
			isSelected: boolean;
			onClick: () => void;
			item: Omit<DefaultReactSuggestionItem, 'onItemClick'>;
		};
		Label: {
			className?: string;
			children?: OctaneNode;
		};
		Loader: {
			className?: string;
		};
	};
	GridSuggestionMenu: {
		Root: {
			id: string;
			columns: number;
			className?: string;
			children?: OctaneNode;
		};
		EmptyItem: {
			columns: number;
			className?: string;
			children?: OctaneNode;
		};
		Item: {
			className?: string;
			id: string;
			isSelected: boolean;
			onClick: () => void;
			item: DefaultReactGridSuggestionItem;
		};
		// Label: {
		//   className?: string;
		//   children?: OctaneNode;
		// };
		Loader: {
			columns: number;
			className?: string;
			children?: OctaneNode;
		};
	};
	TableHandle: {
		Root: {
			className?: string;
			draggable: boolean;
			onDragStart: (e: React.DragEvent) => void;
			onDragEnd: () => void;
			style?: CSSProperties;
		} & ({ children: OctaneNode; label?: string } | { children?: undefined; label: string });
		ExtendButton: {
			className?: string;
			onClick: (e: React.MouseEvent) => void;
			onMouseDown: (e: React.MouseEvent) => void;
			children: OctaneNode;
		};
	};
	Comments: {
		Card: {
			className?: string;
			headerText?: string;
			selected?: boolean;
			onFocus?: (event: React.FocusEvent) => void;
			onBlur?: (event: React.FocusEvent) => void;
			tabIndex?: number;
			children?: OctaneNode;
		};
		CardSection: {
			className?: string;
			children?: OctaneNode;
		};
		ExpandSectionsPrompt: {
			className?: string;
			children?: OctaneNode;
		};
		Editor: {
			className?: string;
			autoFocus?: boolean;
			editable: boolean;
			editor: BlockNoteEditor<any, any, any>;
			onFocus?: () => void;
			onBlur?: () => void;
		};
		Comment: {
			className?: string;
			children?: OctaneNode;
			authorInfo: 'loading' | User;
			timeString: string;
			edited: boolean;
			actions?: OctaneNode;
			showActions?: boolean | 'hover';
			emojiPickerOpen?: boolean;
		};
	};
	Versioning: {
		/**
 * The scrollable container for the version-history sidebar (header +
 * snapshot rows).
 */
		Sidebar: {
			className?: string;
			children?: OctaneNode;
		};
		/**
 * A single row in the version-history sidebar — the live "current version"
 * entry or a stored snapshot.
 */
		Snapshot: {
			className?: string;
			/** Whether this row is the version currently shown in the editor. */
			selected?: boolean;
			/** Whether this row is the baseline the current diff is compared against. */
			comparing?: boolean;
			onClick?: () => void;
			/** Row actions (e.g. the "..." menu), revealed on hover. */
			actions?: OctaneNode;
			children?: OctaneNode;
		};
	};
	AttributionTooltip: {
		/**
 * The attribution tooltip shown when hovering a suggestion mark. Positioned
 * by floating-ui and portaled by the controller — this only styles the box.
 */
		Root: {
			className?: string;
			/**
 * App-supplied class from `getAttributionMarkClassName` (override path).
 * When set, `Root` applies it and ignores `backgroundColor`.
 */
			markClassName?: string;
			/**
 * Per-user author color (default path). Applied inline when there's no
 * `markClassName`, since the tooltip is portaled away from the mark and
 * can't inherit the mark's color.
 */
			backgroundColor?: string;
			children?: OctaneNode;
		};
	};
	// TODO: We should try to make everything as generic as we can
	Generic: {
		Badge: {
			Root: {
				className?: string;
				text: string;
				icon?: OctaneNode;
				isSelected?: boolean;
				mainTooltip?: string;
				secondaryTooltip?: string;
				onClick?: (event: React.MouseEvent) => void;
				onMouseEnter?: () => void;
			};
			Group: {
				className?: string;
				children: OctaneNode;
			};
		};
		Form: {
			Root: {
				children?: OctaneNode;
			};
			TextInput: {
				className?: string;
				name: string;
				label?: string;
				variant?: 'default' | 'large';
				icon: OctaneNode;
				rightSection?: OctaneNode;
				autoFocus?: boolean;
				placeholder?: string;
				disabled?: boolean;
				value: string;
				onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
				onChange: (event: ChangeEvent<HTMLInputElement>) => void;
				onSubmit?: () => void;
				autoComplete?: HTMLInputAutoCompleteAttribute;
				'aria-activedescendant'?: string;
				ref?: ForwardedRef<HTMLInputElement>;
			};
		};
		Menu: {
			Root: {
				sub?: boolean;
				onOpenChange?: (open: boolean) => void;
				position?: | 'top'
				| 'right'
				| 'bottom'
				| 'left'
				| `${'top' | 'right' | 'bottom' | 'left'}-${'start' | 'end'}`;
				children?: OctaneNode;
			};
			Divider: {
				className?: string;
			};
			Dropdown: {
				className?: string;
				children?: OctaneNode;
				sub?: boolean;
			};
			Item: {
				className?: string;
				children?: OctaneNode;
				subTrigger?: boolean;
				icon?: OctaneNode;
				checked?: boolean;
				onClick?: () => void;
			};
			Label: {
				className?: string;
				children?: OctaneNode;
			};
			Trigger: {
				children?: OctaneNode;
				sub?: boolean;
			};
			Button: MenuButtonType;
		};
		Popover: {
			Root: {
				open?: boolean;
				onOpenChange?: (open: boolean) => void;
				position?: | 'top'
				| 'right'
				| 'bottom'
				| 'left'
				| `${'top' | 'right' | 'bottom' | 'left'}-${'start' | 'end'}`;
				portalRoot?: HTMLElement | null;
				children?: OctaneNode;
			};
			Content: {
				className?: string;
				variant: 'form-popover' | 'panel-popover';
				children?: OctaneNode;
			};
			Trigger: {
				children?: OctaneNode;
			};
		};
		Toolbar: {
			Root: ToolbarRootType;
			Button: ToolbarButtonType;
			Select: ToolbarSelectType;
		};
	};
};

export type Components =
	{ [Components in keyof Omit<
		ComponentProps,
		'Generic'
	>]: { [Component in keyof ComponentProps[Components]]: ComponentType<
		ComponentProps[Components][Component]
	> } } & {
		// only needed as Generic Root/etc elements are 1 level of nesting deeper
		Generic: { [GenericComponents in keyof ComponentProps['Generic']]: { [Component in keyof ComponentProps['Generic'][GenericComponents]]: ComponentType<
			ComponentProps['Generic'][GenericComponents][Component]
		> } };
	};

export const ComponentsContext = createContext<Components | undefined>(undefined);

export function useComponentsContext(): Components | undefined {
	return useContext(ComponentsContext)!;
}
