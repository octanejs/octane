// React Router's best configuration for this journey, shared by the React
// Router fixture and its Octane port: parents skip revalidation on search-only
// changes and after the task's action, which only touches the task.
export const parentShouldRevalidate = ({
	currentUrl,
	nextUrl,
	formMethod,
	defaultShouldRevalidate,
}) => (formMethod ? false : currentUrl.pathname !== nextUrl.pathname && defaultShouldRevalidate);

export const taskShouldRevalidate = ({
	currentUrl,
	nextUrl,
	formMethod,
	defaultShouldRevalidate,
}) =>
	formMethod
		? defaultShouldRevalidate
		: currentUrl.pathname !== nextUrl.pathname && defaultShouldRevalidate;
