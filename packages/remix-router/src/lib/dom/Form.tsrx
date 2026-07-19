// Form — transcribed from react-router@8.2.0 lib/dom/lib.tsx onto octane.
// forwardRef → ref-as-prop. The submit handler is a NATIVE delegated `submit`
// listener (octane has no synthetic events): `event.submitter` is read
// directly off the native SubmitEvent where React goes through
// `event.nativeEvent.submitter` — same value, no behavior change.
import { startTransition, useContext } from 'octane';
import type { OctaneNode } from 'octane';
import { NavigationContext } from '../context.ts';
import type { RelativeRoutingType } from '../router/router.ts';
import type { HTMLFormMethod } from '../router/utils.ts';
import { ABSOLUTE_URL_REGEX } from '../router/url.ts';
import { useFormAction, useSubmit } from './lib.ts';

const defaultMethod = 'get';

type FormProps = {
	children?: OctaneNode;
	method?: HTMLFormMethod;
	action?: string;
	encType?: 'application/x-www-form-urlencoded' | 'multipart/form-data' | 'text/plain';
	navigate?: boolean;
	fetcherKey?: string;
	replace?: boolean;
	state?: any;
	relative?: RelativeRoutingType;
	preventScrollReset?: boolean;
	reloadDocument?: boolean;
	viewTransition?: boolean;
	defaultShouldRevalidate?: boolean;
	discover?: 'render' | 'none';
	onSubmit?: (event: SubmitEvent) => void;
	ref?: { current: HTMLFormElement | null } | ((node: HTMLFormElement | null) => void);
	[key: string]: unknown;
};

export function Form(props: FormProps) @{
	const {
		discover = 'render',
		fetcherKey,
		navigate,
		reloadDocument,
		replace,
		state,
		method = defaultMethod,
		action,
		onSubmit,
		relative,
		preventScrollReset,
		viewTransition,
		defaultShouldRevalidate,
		ref,
		children,
		...rest
	} = props;

	const { useTransitions } = useContext(NavigationContext);
	const submit = useSubmit();
	const formAction = useFormAction(action, { relative });
	const formMethod =
		method.toLowerCase() === 'get' ? 'get' : 'post';
	const isAbsolute = typeof action === 'string' && ABSOLUTE_URL_REGEX.test(action);

	function submitHandler(event: SubmitEvent) {
		onSubmit && onSubmit(event);
		if (event.defaultPrevented) return;
		event.preventDefault();

		// Native submitters are button/input elements (upstream types the React
		// nativeEvent submitter the same way).
		const submitter = event.submitter as HTMLButtonElement | HTMLInputElement | null ?? null;

		const submitMethod =
			submitter && submitter.getAttribute('formmethod') as HTMLFormMethod | null || method;

		const doSubmit = () => submit(submitter || event.currentTarget as HTMLFormElement, {
			fetcherKey,
			method: submitMethod,
			navigate,
			replace,
			state,
			relative,
			preventScrollReset,
			viewTransition,
			defaultShouldRevalidate,
		});

		if (useTransitions && navigate !== false) {
			startTransition(() => doSubmit());
		} else {
			doSubmit();
		}
	}

	<form
		ref={ref}
		method={formMethod}
		action={formAction}
		onSubmit={reloadDocument ? onSubmit : submitHandler}
		{...rest}
		data-discover={!isAbsolute && discover === 'render' ? 'true' : undefined}
	>{children}</form>
}
