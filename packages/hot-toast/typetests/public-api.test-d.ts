import type { CSSProperties, ElementDescriptor, OctaneNode } from 'octane';
import type { Assert, Equal } from '../../../scripts/react-port/type-assertions';
import toast, {
	CheckmarkIcon,
	type DefaultToastOptions,
	ErrorIcon,
	type IconTheme,
	LoaderIcon,
	type Renderable,
	resolveValue,
	type Toast,
	ToastBar,
	type ToasterProps,
	Toaster,
	ToastIcon,
	type ToastOptions,
	type ToastPosition,
	type ToastType,
	toast as namedToast,
	useToaster,
	useToasterStore,
	type ValueFunction,
	type ValueOrFunction,
} from '../src/index';
import * as headless from '../src/headless/index';

// The default export is the named toast, in both entries.
type _sameToast = Assert<Equal<typeof toast, typeof namedToast>>;
type _headlessToast = Assert<Equal<typeof headless.default, typeof toast>>;
type _headlessResolve = Assert<Equal<typeof headless.resolveValue, typeof resolveValue>>;
type _headlessUseToaster = Assert<Equal<typeof headless.useToaster, typeof useToaster>>;
type _headlessStore = Assert<Equal<typeof headless.useToasterStore, typeof useToasterStore>>;
type _headlessToastType = Assert<Equal<headless.Toast, Toast>>;

type _type = Assert<Equal<ToastType, 'success' | 'error' | 'loading' | 'blank' | 'custom'>>;
type _position = Assert<
	Equal<
		ToastPosition,
		'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
	>
>;
type _renderable = Assert<Equal<Renderable, ElementDescriptor<any> | string | null>>;
type _iconTheme = Assert<Equal<IconTheme, { primary: string; secondary: string }>>;
type _valueFunction = Assert<Equal<ValueFunction<number, string>, (arg: string) => number>>;
type _valueOrFunction = Assert<
	Equal<ValueOrFunction<number, string>, number | ValueFunction<number, string>>
>;
type _message = Assert<Equal<Toast['message'], ValueOrFunction<Renderable, Toast>>>;
type _style = Assert<Equal<Toast['style'], CSSProperties | undefined>>;
type _options = Assert<Equal<ToastOptions['duration'], number | undefined>>;
type _defaults = Assert<Equal<DefaultToastOptions['success'], ToastOptions | undefined>>;
type _children = Assert<
	Equal<ToasterProps['children'], ((toast: Toast) => ElementDescriptor<any>) | undefined>
>;

// toast and its variants return the toast id.
type _handler = Assert<Equal<ReturnType<typeof toast.success>, string>>;
const id: string = toast('Saved', { duration: 2000, position: 'top-right' });
toast.error((t) => `Failed ${t.id}`, { id, iconTheme: { primary: '#000', secondary: '#fff' } });
toast.loading('Working');
toast.custom(null);
toast.dismiss(id, 'secondary');
toast.dismissAll();
toast.remove(id);
toast.removeAll('secondary');
const settled: Promise<number> = toast.promise(Promise.resolve(1), {
	loading: 'Loading',
	success: (value) => `Got ${value satisfies number}`,
	error: 'Failed',
});
void settled;
type _resolved = Assert<Equal<ReturnType<typeof resolveValue<number, string>>, number>>;

// Hooks.
type Toaster$ = ReturnType<typeof useToaster>;
type _toasts = Assert<Equal<Toaster$['toasts'], Toast[]>>;
type _offset = Assert<Equal<ReturnType<Toaster$['handlers']['calculateOffset']>, number>>;
type _pause = Assert<Equal<Toaster$['handlers']['startPause'], () => void>>;
type _storeToasts = Assert<Equal<ReturnType<typeof useToasterStore>['toasts'], Toast[]>>;
type _pausedAt = Assert<Equal<ReturnType<typeof useToasterStore>['pausedAt'], number | undefined>>;

// Components.
declare const aToast: Toast;
type _toasterProps = Assert<Equal<Parameters<typeof Toaster>[0], ToasterProps>>;
type _iconProps = Assert<Equal<Parameters<typeof ToastIcon>[0], { toast: Toast }>>;
const bar: OctaneNode = ToastBar({
	toast: aToast,
	position: 'bottom-center',
	children: ({ icon, message }) => message ?? icon,
});
void bar;
const ref = { current: null as HTMLDivElement | null };
CheckmarkIcon({ primary: '#0f0', secondary: '#fff', ref });
ErrorIcon({ primary: '#f00', className: 'error', onClick: (event: MouseEvent) => void event });
LoaderIcon({ secondary: '#ccc', style: { width: 12 } });

// @ts-expect-error a position must be one of the six placements
toast('Nope', { position: 'middle' });
// @ts-expect-error ToastBar requires its toast
ToastBar({ position: 'top-center' });
// @ts-expect-error icon themes are strings
CheckmarkIcon({ primary: 1 });
// @ts-expect-error the headless entry has no components
void headless.Toaster;
