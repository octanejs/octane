import type { Ref } from 'octane';
import { normalize_spread_props_for_ref_attr } from 'octane/tsrx-spread';

declare const open: { id: string; [key: string]: unknown };
const openRef: Ref<HTMLDivElement> | undefined = normalize_spread_props_for_ref_attr(open).ref;
openRef;

declare const handlers: Record<string, (event: Event) => void>;
const handlersRef: undefined = normalize_spread_props_for_ref_attr(handlers).ref;
handlersRef;

declare const declared: { ref?: Ref<HTMLDivElement>; [key: string]: unknown };
const declaredRef: Ref<HTMLDivElement> | undefined =
	normalize_spread_props_for_ref_attr(declared).ref;
declaredRef;
// @ts-expect-error A declared ref keeps its own type.
const declaredWrong: undefined = normalize_spread_props_for_ref_attr(declared).ref;
declaredWrong;

declare const plain: { id: string };
const plainRef: undefined = normalize_spread_props_for_ref_attr(plain).ref;
plainRef;
