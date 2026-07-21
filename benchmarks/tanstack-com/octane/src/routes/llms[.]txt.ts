import { createFileRoute } from '@octanejs/tanstack-router';
import { generateLlmsTxt, setLlmsTxtResponseHeaders } from '~/utils/llms';

export const Route = createFileRoute('/llms.txt')({
	server: {
		handlers: {
			GET: async () => {
				const content = generateLlmsTxt();

				setLlmsTxtResponseHeaders();

				return new Response(content);
			},
		},
	},
});
