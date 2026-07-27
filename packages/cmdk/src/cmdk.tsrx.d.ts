// Ambient declaration for cmdk.tsrx so `.ts` consumers and tsgo see real types
// without parsing the .tsrx source (kept in sync with cmdk.tsrx's exports).
import type { OctaneNode } from 'octane';
import type {
	CommandProps,
	DialogProps,
	EmptyProps,
	GroupProps,
	InputProps,
	ItemProps,
	ListProps,
	LoadingProps,
	SeparatorProps,
	State,
} from './types';

export declare function CommandRoot(props: CommandProps): OctaneNode;
export declare function Item(props: ItemProps): OctaneNode;
export declare function Input(props: InputProps): OctaneNode;
export declare function List(props: ListProps): OctaneNode;
export declare function Group(props: GroupProps): OctaneNode;
export declare function Separator(props: SeparatorProps): OctaneNode;
export declare function Dialog(props: DialogProps): OctaneNode;
export declare function Empty(props: EmptyProps): OctaneNode;
export declare function Loading(props: LoadingProps): OctaneNode;

export declare const Command: typeof CommandRoot & {
	List: typeof List;
	Item: typeof Item;
	Input: typeof Input;
	Group: typeof Group;
	Separator: typeof Separator;
	Dialog: typeof Dialog;
	Empty: typeof Empty;
	Loading: typeof Loading;
};

export declare function useCommandState<T>(selector: (state: State) => T): T;

export {
	Item as CommandItem,
	Input as CommandInput,
	List as CommandList,
	Group as CommandGroup,
	Separator as CommandSeparator,
	Dialog as CommandDialog,
	Empty as CommandEmpty,
	Loading as CommandLoading,
};
