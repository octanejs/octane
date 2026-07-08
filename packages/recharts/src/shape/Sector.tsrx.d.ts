// Type declaration for the .tsrx component (resolved by relative path).
export interface SectorProps {
	cx?: number;
	cy?: number;
	innerRadius?: number;
	outerRadius?: number;
	startAngle?: number;
	endAngle?: number;
	cornerRadius?: number | string;
	forceCornerRadius?: boolean;
	cornerIsExternal?: boolean;
	className?: unknown;
	[key: string]: unknown;
}
export declare const defaultSectorProps: Required<
	Pick<
		SectorProps,
		| 'cx'
		| 'cy'
		| 'innerRadius'
		| 'outerRadius'
		| 'startAngle'
		| 'endAngle'
		| 'cornerRadius'
		| 'forceCornerRadius'
		| 'cornerIsExternal'
	>
>;
export declare const Sector: (props: SectorProps) => unknown;
