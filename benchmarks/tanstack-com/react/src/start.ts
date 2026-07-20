// Bench delta: Sentry request/function middlewares removed (observability,
// not app behavior). CSRF middleware kept — it shapes server-fn responses.
import { createCsrfMiddleware, createStart } from '@tanstack/react-start';

const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === 'serverFn',
});

export const startInstance = createStart(() => {
	return {
		requestMiddleware: [csrfMiddleware],
		functionMiddleware: [],
	};
});
