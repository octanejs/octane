// Declaration companion for this module only.
import type { TableFeatures } from '@tanstack/table-core';
import type { CreateTableHookOptions, CreateTableHookResult, TableComponentType } from './types';

export declare function createTableHook<
	TFeatures extends TableFeatures,
	const TTableComponents extends Record<string, TableComponentType>,
	const TCellComponents extends Record<string, TableComponentType>,
	const THeaderComponents extends Record<string, TableComponentType>,
>(
	options: CreateTableHookOptions<TFeatures, TTableComponents, TCellComponents, THeaderComponents>,
): CreateTableHookResult<TFeatures, TTableComponents, TCellComponents, THeaderComponents>;
