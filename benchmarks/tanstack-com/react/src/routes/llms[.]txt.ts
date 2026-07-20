import { createFileRoute } from '@tanstack/react-router';
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
