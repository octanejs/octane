// Vendored from react-hook-form@7.81.0 src/form.tsx (octane port).
// Form component to manage submission — renders a real <form> (or the headless
// render prop) and posts via fetch. Same submission/error semantics as
// upstream; the submit handler receives the NATIVE submit event.
import { useState, useCallback, useEffect } from 'octane';
import { flatten } from './utils/flatten.ts';
import { useFormContext } from './useFormContext.ts';

const POST_REQUEST = 'post';

export function Form(props) {
	const methods = useFormContext();
	const [mounted, setMounted] = useState(false);
	const {
		control = methods.control,
		onSubmit,
		children,
		action,
		method = POST_REQUEST,
		headers,
		encType,
		onError,
		render,
		onSuccess,
		validateStatus,
		...rest
	} = props;

	const submit = useCallback(async (event) => {
		let hasError = false;
		let type = '';

		await control.handleSubmit(async (data) => {
			const formData = new FormData();
			let formDataJson = '';

			try {
				formDataJson = JSON.stringify(data);
			} catch {
			}

			const flattenFormValues = flatten(data);

			for (const key in flattenFormValues) {
				formData.append(key, flattenFormValues[key]);
			}

			if (onSubmit) {
				await onSubmit({
					data,
					event,
					method,
					formData,
					formDataJson,
				});
			}

			if (action) {
				try {
					const shouldStringifySubmissionData = [
						headers && headers['Content-Type'],
						encType,
					].some((value) => value && value.includes('json'));

					const response = await fetch(String(action), {
						method,
						headers: {
							...headers,
							...(encType && encType !== 'multipart/form-data' ? { 'Content-Type': encType } : {}),
						},
						body: shouldStringifySubmissionData ? formDataJson : formData,
					});

					if (
						response &&
							(validateStatus
								? !validateStatus(response.status)
								: response.status < 200 || response.status >= 300)
					) {
						hasError = true;
						onError && onError({ response });
						type = String(response.status);
					} else {
						onSuccess && onSuccess({ response });
					}
				} catch (error) {
					hasError = true;
					onError && onError({ error });
				}
			}
		})(event);

		if (hasError && control) {
			control._subjects.state.next({
				isSubmitSuccessful: false,
			});
			control.setError('root.server', {
				type,
			});
		}
	}, [control, onSubmit, method, action, headers, encType, validateStatus, onError, onSuccess]);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (render) {
		return render({ submit });
	}

	return <form
		noValidate={mounted}
		action={action}
		method={method}
		encType={encType}
		onSubmit={submit}
		{...rest}
	>{children}</form>;
}
