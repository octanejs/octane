// Type declaration for the .tsrx component (resolved by relative path).
export type SymbolType = 'circle' | 'cross' | 'diamond' | 'square' | 'star' | 'triangle' | 'wye';
export interface SymbolsProps {
	type?: SymbolType;
	size?: number;
	sizeType?: 'area' | 'diameter';
	cx?: number;
	cy?: number;
	className?: unknown;
	[key: string]: unknown;
}
export declare const Symbols: {
	(props: SymbolsProps): unknown;
	registerSymbol: (key: string, factory: unknown) => void;
};
