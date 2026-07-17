// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/platform.ts).
// octane adaptation: `navigator.userAgentData` is not in TS's DOM lib, so it is read through a cast.

function testUserAgent(re: RegExp) {
	if (typeof window === 'undefined' || window.navigator == null) {
		return false;
	}
	let brands = (window.navigator as any)['userAgentData']?.brands;
	return (
		(Array.isArray(brands) &&
			brands.some((brand: { brand: string; version: string }) => re.test(brand.brand))) ||
		re.test(window.navigator.userAgent)
	);
}

function testPlatform(re: RegExp) {
	return typeof window !== 'undefined' && window.navigator != null
		? re.test((window.navigator as any)['userAgentData']?.platform || window.navigator.platform)
		: false;
}

function cached(fn: () => boolean) {
	if (process.env.NODE_ENV === 'test') {
		return fn;
	}

	let res: boolean | null = null;
	return () => {
		if (res == null) {
			res = fn();
		}
		return res;
	};
}

export const isMac: () => boolean = cached(function () {
	return testPlatform(/^Mac/i);
});

export const isIPhone: () => boolean = cached(function () {
	return testPlatform(/^iPhone/i);
});

export const isIPad: () => boolean = cached(function () {
	return (
		testPlatform(/^iPad/i) ||
		// iPadOS 13 lies and says it's a Mac, but we can distinguish by detecting touch support.
		(isMac() && navigator.maxTouchPoints > 1)
	);
});

export const isIOS: () => boolean = cached(function () {
	return isIPhone() || isIPad();
});

export const isAppleDevice: () => boolean = cached(function () {
	return isMac() || isIOS();
});

export const isWebKit: () => boolean = cached(function () {
	return testUserAgent(/AppleWebKit/i) && !isChrome();
});

export const isChrome: () => boolean = cached(function () {
	return testUserAgent(/Chrome/i);
});

export const isAndroid: () => boolean = cached(function () {
	return testUserAgent(/Android/i);
});

export const isFirefox: () => boolean = cached(function () {
	return testUserAgent(/Firefox/i);
});
