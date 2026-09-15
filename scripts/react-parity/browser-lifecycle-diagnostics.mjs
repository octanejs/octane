// Temporary, opt-in evidence for browser parity disconnects. Observe the provider
// after its initial navigation; never inject into tests or retry a failed session.
function diagnosticUrl(url) {
	if (!url || !URL.canParse(url)) return undefined;
	const parsed = new URL(url);
	return parsed.protocol === 'http:' || parsed.protocol === 'https:'
		? `${parsed.origin}${parsed.pathname}`
		: parsed.protocol;
}

async function observePage(provider, sessionId, project) {
	const page = provider.getPage(sessionId);
	const report = (event, details = {}) => {
		process.stderr.write(
			`${JSON.stringify({ diagnostic: 'parity-browser', at: new Date().toISOString(), project, sessionId, event, ...details })}\n`,
		);
	};
	page.on('close', () => report('page-close'));
	page.on('crash', () => report('page-crash'));
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame()) report('top-navigation', { url: diagnosticUrl(frame.url()) });
	});
	const cdp = await page.context().newCDPSession(page);
	await Promise.all([cdp.send('Page.enable'), cdp.send('Network.enable')]);
	const { frameTree } = await cdp.send('Page.getFrameTree');
	let topFrameId = frameTree.frame.id;
	cdp.on('Page.frameNavigated', ({ frame }) => {
		if (!frame.parentId) topFrameId = frame.id;
	});
	for (const event of ['Page.frameRequestedNavigation', 'Page.frameScheduledNavigation']) {
		cdp.on(event, ({ frameId, reason, url }) => {
			if (frameId === topFrameId) report(event, { reason, url: diagnosticUrl(url) });
		});
	}
	cdp.on('Network.requestWillBeSent', ({ frameId, type, request, initiator }) => {
		if (frameId !== topFrameId || type !== 'Document') return;
		report('top-document-request', {
			url: diagnosticUrl(request.url),
			initiator: {
				type: initiator.type,
				url: diagnosticUrl(initiator.url),
				lineNumber: initiator.lineNumber,
				stack: initiator.stack?.callFrames.slice(0, 8).map((frame) => ({
					functionName: frame.functionName,
					url: diagnosticUrl(frame.url),
					lineNumber: frame.lineNumber,
					columnNumber: frame.columnNumber,
				})),
			},
		});
	});
	report('observation-ready', { url: diagnosticUrl(page.url()) });
}

export function withBrowserLifecycleDiagnostics(project) {
	const browser = project.test?.browser;
	const option = browser?.provider;
	if (process.env.REACT_PARITY_BROWSER_DIAGNOSTICS !== '1' || option?.name !== 'playwright') {
		return project;
	}
	return {
		...project,
		test: {
			...project.test,
			browser: {
				...browser,
				provider: {
					...option,
					providerFactory(...args) {
						const provider = option.providerFactory.apply(this, args);
						if (provider.browserName !== 'chromium') return provider;
						const openPage = provider.openPage;
						provider.openPage = async function (...pageArgs) {
							const result = await openPage.apply(this, pageArgs);
							try {
								await observePage(this, pageArgs[0], args[0].name);
							} catch {
								// Diagnostic setup cannot replace the original provider outcome.
								process.stderr.write(
									`${JSON.stringify({ diagnostic: 'parity-browser', at: new Date().toISOString(), project: args[0].name, sessionId: pageArgs[0], event: 'observation-failed' })}\n`,
								);
							}
							return result;
						};
						const close = provider.close;
						provider.close = function (...closeArgs) {
							process.stderr.write(
								`${JSON.stringify({ diagnostic: 'parity-browser', at: new Date().toISOString(), project: args[0].name, event: 'provider-close-start' })}\n`,
							);
							return close.apply(this, closeArgs);
						};
						return provider;
					},
				},
			},
		},
	};
}
