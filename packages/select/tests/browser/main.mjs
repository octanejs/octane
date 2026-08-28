import { resolveOctaneStyle } from '../octane-style.mjs';
import { createStyleCache, resolveStyle } from '../style-adapter.mjs';

globalThis.__reactSelectCandidate = {
	run() {
		document.head.querySelectorAll('style').forEach((style) => style.remove());
		const cache = createStyleCache({ key: 'rs', nonce: 'client-nonce' });
		const first = resolveStyle(cache, {
			color: 'hotpink',
			'&:hover': { color: 'rebeccapurple' },
		});
		const firstTags = document.querySelectorAll('style[data-emotion="rs"]');
		const clientNonces = [...firstTags].map((tag) => tag.getAttribute('nonce'));
		const firstTagCount = firstTags.length;

		const second = resolveStyle(cache, {
			color: 'hotpink',
			'&:hover': { color: 'rebeccapurple' },
		});
		const deduped = document.querySelectorAll('style[data-emotion="rs"]').length === firstTagCount;
		resolveStyle(cache, { color: 'royalblue' });
		const orderedRules = [...document.querySelectorAll('style[data-emotion="rs"]')]
			.flatMap((tag) => [...(tag.sheet?.cssRules ?? [])].map((rule) => rule.cssText))
			.join('\n');

		const other = createStyleCache({ key: 'other' });
		resolveStyle(other, { color: 'hotpink' });
		const isolatedTags = document.querySelectorAll('style[data-emotion="other"]').length;

		document.head.querySelectorAll('style').forEach((style) => style.remove());
		const serverStyle = document.createElement('style');
		serverStyle.setAttribute('data-octane', first.id);
		serverStyle.textContent = '.server-rule{color:hotpink;}';
		document.head.appendChild(serverStyle);
		const hydrationCache = createStyleCache({ key: 'rs' });
		resolveOctaneStyle(hydrationCache, {
			color: 'hotpink',
			'&:hover': { color: 'rebeccapurple' },
		});

		return {
			className: first.className,
			classesMatch: second.className === first.className,
			clientNonces,
			deduped,
			hydratedTags: document.querySelectorAll('style').length,
			isolatedTags,
			styleTagsForNestedRule: firstTagCount,
			orderedRules:
				orderedRules.indexOf('hotpink') < orderedRules.indexOf('royalblue') &&
				orderedRules.includes('rebeccapurple'),
			serverStylePreserved: serverStyle.textContent === '.server-rule{color:hotpink;}',
		};
	},
};
