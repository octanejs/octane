import {
	type FloatingContext,
	type Placement,
	autoUpdate,
	offset,
	useClick,
	useFloating,
	useInteractions,
} from '@octanejs/floating-ui';

declare function expectType<T>(value: T): void;

const floating = useFloating({ placement: 'bottom-start', middleware: [offset(8)] });
expectType<Placement>(floating.placement);
expectType<FloatingContext>(floating.context);

const click = useClick(floating.context, { toggle: true });
const interactions = useInteractions([click]);
expectType<(userProps?: Record<string, unknown>) => Record<string, unknown>>(
	interactions.getReferenceProps,
);

expectType<(...args: Parameters<typeof autoUpdate>) => ReturnType<typeof autoUpdate>>(autoUpdate);
