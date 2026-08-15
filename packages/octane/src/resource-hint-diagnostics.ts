/** Development-only authoring guidance for public client and server resource hints. */

type ResourceHintName =
	'prefetchDNS' | 'preconnect' | 'preload' | 'preloadModule' | 'preinit' | 'preinitModule';

function describeHintValue(value: unknown): string {
	if (value === null) return '`null`';
	if (value === undefined) return '`undefined`';
	if (value === '') return 'an empty string';
	if (typeof value === 'string') return JSON.stringify(value);
	if (typeof value === 'number') return '`' + value + '`';
	return 'a value of type "' + typeof value + '"';
}

export function resourceHintWarning(
	name: ResourceHintName,
	href: unknown,
	options: unknown,
	hasOptions = false,
): string | null {
	const invalidHref = typeof href !== 'string' || href === '';
	const invalidOptions = options === null || typeof options !== 'object';

	if (name === 'preload') {
		let encountered = '';
		if (invalidHref) encountered += ' The `href` argument was ' + describeHintValue(href) + '.';
		if (invalidOptions) {
			encountered += ' The `options` argument was ' + describeHintValue(options) + '.';
		} else {
			const destination = (options as Record<string, unknown>).as;
			if (typeof destination !== 'string' || destination === '') {
				encountered += ' The `as` option was ' + describeHintValue(destination) + '.';
			}
		}
		return encountered === ''
			? null
			: 'preload(): Expected a non-empty `href` string and an `options` object with a valid `as` destination.' +
					encountered;
	}

	if (name === 'preloadModule' || name === 'preinitModule') {
		let encountered = '';
		if (invalidHref) encountered += ' The `href` argument was ' + describeHintValue(href) + '.';
		if (options != null && invalidOptions) {
			encountered += ' The `options` argument was ' + describeHintValue(options) + '.';
		} else if (options !== null && typeof options === 'object' && 'as' in options) {
			const destination = (options as Record<string, unknown>).as;
			if (
				(name === 'preloadModule' && typeof destination !== 'string') ||
				(name === 'preinitModule' && destination !== 'script')
			) {
				encountered += ' The `as` option was ' + describeHintValue(destination) + '.';
			}
		}
		if (encountered === '') return null;
		return (
			name +
			'(): Expected a non-empty `href` string and optional object-shaped `options`' +
			(name === 'preinitModule' ? ' with `as: "script"`.' : ' with a string `as` destination.') +
			encountered
		);
	}

	if (invalidHref) {
		return (
			name + '(): Expected a non-empty string `href`; received ' + describeHintValue(href) + '.'
		);
	}

	if (name === 'preinit') {
		if (invalidOptions) {
			return (
				'preinit(): Expected the `options` argument to be an object with `as: "style"` or ' +
				'`as: "script"`; received ' +
				describeHintValue(options) +
				'.'
			);
		}
		const destination = (options as Record<string, unknown>).as;
		return destination === 'style' || destination === 'script'
			? null
			: 'preinit(): The `as` option must be "style" or "script"; received ' +
					describeHintValue(destination) +
					'. Use preload() for other resource destinations.';
	}

	if (name === 'preconnect') {
		if (options != null && typeof options !== 'object') {
			return (
				'preconnect(): Expected the optional `options` argument to be an object; received ' +
				describeHintValue(options) +
				'.'
			);
		}
		if (options !== null && typeof options === 'object') {
			const crossOrigin = (options as Record<string, unknown>).crossOrigin;
			if (typeof crossOrigin !== 'string') {
				return (
					'preconnect(): The `crossOrigin` option must be a string; received ' +
					describeHintValue(crossOrigin) +
					'. Remove the option or provide a string value.'
				);
			}
		}
		return null;
	}

	if (!hasOptions) return null;
	const crossOrigin =
		options !== null && typeof options === 'object' && 'crossOrigin' in options
			? ' Browsers never use `crossOrigin` for DNS queries.'
			: '';
	return (
		'prefetchDNS(): Expected only one `href` argument; the second `options` argument is unsupported.' +
		crossOrigin
	);
}
