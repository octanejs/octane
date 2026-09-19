// Declaration companion for this provider module only.
import type { PacerProviderOptions } from './context';

export interface PacerProviderProps {
	children: unknown;
	defaultOptions?: PacerProviderOptions;
}

export declare function PacerProvider(props: PacerProviderProps): unknown;
