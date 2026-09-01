import { DefaultGridSuggestionItem } from '@blocknote/core/extensions';
import { JSX } from 'octane';

import { SuggestionMenuProps } from '../types.js';

export type DefaultReactGridSuggestionItem =
	DefaultGridSuggestionItem & {
		icon?: Octane.JSX.Element;
	};

export type GridSuggestionMenuProps<T> =
	SuggestionMenuProps<T> & {
		columns: number;
	};
