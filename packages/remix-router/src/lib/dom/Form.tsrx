// Form — transcribed from react-router@8.2.0 lib/dom/lib.tsx onto octane.
// forwardRef → ref-as-prop. The submit handler is a NATIVE delegated `submit`
// listener (octane has no synthetic events): `event.submitter` is read
// directly off the native SubmitEvent where React goes through
// `event.nativeEvent.submitter` — same value, no behavior change.
import { startTransition, useContext } from 'octane';
import { NavigationContext } from '../context.ts';
import { ABSOLUTE_URL_REGEX } from '../router/url.ts';
import { useFormAction, useSubmit } from './lib.ts';

const defaultMethod = 'get';

export function Form(props) @{
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

	function submitHandler(event) {
		onSubmit && onSubmit(event);
		if (event.defaultPrevented) return;
		event.preventDefault();

		const submitter = event.submitter ?? null;

		const submitMethod = submitter && submitter.getAttribute('formmethod') || method;

		const doSubmit = () => submit(submitter || event.currentTarget, {
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
