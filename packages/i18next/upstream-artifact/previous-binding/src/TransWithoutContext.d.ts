import type {
	i18n,
	ReactOptions,
	ApplyTarget,
	ConstrainTarget,
	GetSource,
	InterpolationMap,
	ParseKeys,
	Namespace,
	SelectorFn,
	SelectorKey,
	TFunctionReturn,
	TypeOptions,
	TOptions,
	TFunction,
} from 'i18next';
import type { ComponentBody, ElementDescriptor } from 'octane';

type _DefaultNamespace = TypeOptions['defaultNS'];
type _EnableSelector = TypeOptions['enableSelector'];
type _KeySeparator = TypeOptions['keySeparator'];
type _AppendKeyPrefix<Key, KPrefix> = KPrefix extends string
	? `${KPrefix}${_KeySeparator}${Key & string}`
	: Key;

type TransChild = unknown;
type $NoInfer<T> = [T][T extends T ? 0 : never];

export type TransProps<
	Key extends ParseKeys<Ns, TOpt, KPrefix>,
	Ns extends Namespace = _DefaultNamespace,
	KPrefix = undefined,
	TContext extends string | undefined = undefined,
	TOpt extends TOptions & { context?: TContext } = { context: TContext },
	Ret = TFunctionReturn<Ns, _AppendKeyPrefix<Key, KPrefix>, TOpt>,
	E = Record<string, unknown>,
> = E & {
	children?: TransChild | readonly TransChild[];
	components?: readonly ElementDescriptor[] | { readonly [tagName: string]: ElementDescriptor };
	count?: number;
	context?: TContext;
	defaults?: string;
	i18n?: i18n;
	i18nKey?: Key | Key[];
	// allow a single namespace from an array-typed `t` (e.g. useTranslation(['ns'])); TS7 intersects
	// inference candidates from `t` and `ns`, so a bare `Ns` here rejects ns="ns" when t is passed
	ns?: Ns | (Ns extends readonly (infer S extends string)[] ? S : never);
	parent?: string | ComponentBody<any> | null;
	tOptions?: TOpt;
	values?: InterpolationMap<Ret>;
	shouldUnescape?: boolean;
	t?: TFunction<Ns, KPrefix>;
};

export interface TransLegacy {
	<
		const Key extends ParseKeys<Ns, TOpt, KPrefix>,
		Ns extends Namespace = _DefaultNamespace,
		KPrefix = undefined,
		TContext extends string | undefined = undefined,
		TOpt extends TOptions & { context?: TContext } = { context: TContext },
		Ret extends TFunctionReturn<Ns, _AppendKeyPrefix<Key, KPrefix>, TOpt> = TFunctionReturn<
			Ns,
			_AppendKeyPrefix<Key, KPrefix>,
			TOpt
		>,
		E = Record<string, unknown>,
	>(
		props: TransProps<Key, Ns, KPrefix, TContext, TOpt, Ret, E>,
	): unknown;
}

export interface TransSelectorProps<
	Key,
	Ns extends Namespace = _DefaultNamespace,
	KPrefix = undefined,
	TContext extends string | undefined = undefined,
	TOpt extends TOptions & { context?: TContext } = { context: TContext },
> {
	children?: TransChild | readonly TransChild[];
	components?: readonly ElementDescriptor[] | { readonly [tagName: string]: ElementDescriptor };
	count?: number;
	context?: TContext;
	defaults?: string | Key;
	i18n?: i18n;
	i18nKey?: Key | readonly Key[];
	// see TransProps.ns: keep single-namespace values assignable when `t` fixes Ns to an array
	ns?: Ns | (Ns extends readonly (infer S extends string)[] ? S : never);
	parent?: string | ComponentBody<any> | null;
	tOptions?: TOpt;
	values?: Key extends (...args: any[]) => infer R ? InterpolationMap<R> : {};
	shouldUnescape?: boolean;
	t?: TFunction<Ns, KPrefix>;
}

export interface TransSelector {
	<
		Target extends ConstrainTarget<TOpt>,
		Key extends
			SelectorFn<GetSource<$NoInfer<Ns>, KPrefix>, ApplyTarget<Target, TOpt>, TOpt> | SelectorKey,
		const Ns extends Namespace = _DefaultNamespace,
		KPrefix = undefined,
		TContext extends string | undefined = undefined,
		TOpt extends TOptions & { context?: TContext } = { context: TContext },
		E = Record<string, unknown>,
	>(
		props: TransSelectorProps<Key, Ns, KPrefix, TContext, TOpt> & E,
	): unknown;
}

export const Trans: _EnableSelector extends true | 'optimize' | 'strict'
	? TransSelector
	: TransLegacy;

export function nodesToString(
	children: unknown,
	i18nOptions?: ReactOptions,
	i18n?: i18n,
	i18nKey?: string,
): string;

export type ErrorCode =
	| 'NO_I18NEXT_INSTANCE'
	| 'NO_LANGUAGES'
	| 'DEPRECATED_OPTION'
	| 'TRANS_NULL_VALUE'
	| 'TRANS_INVALID_OBJ'
	| 'TRANS_INVALID_VAR'
	| 'TRANS_INVALID_COMPONENTS'
	| 'USE_T_BEFORE_READY'
	| 'OCTANE_TRANS_BLOCK_CHILDREN'
	| 'ICU_TRANS_RENDER_ERROR';

export type ErrorMeta = {
	code: ErrorCode;
	i18nKey?: string;
	[x: string]: any;
};

/**
 * Use to type the logger arguments
 * @example
 * ```
 * import type { ErrorArgs } from 'react-i18next';
 *
 * const logger = {
 *   // ....
 *   warn: function (...args: ErrorArgs) {
 *      if (args[1]?.code === 'TRANS_INVALID_OBJ') {
 *        const [msg, { i18nKey, ...rest }] = args;
 *        return log(i18nKey, msg, rest);
 *      }
 *      log(...args);
 *   }
 * }
 * i18n.use(logger).use(i18nReactPlugin).init({...});
 * ```
 */
export type ErrorArgs = readonly [string, ErrorMeta | undefined, ...any[]];
