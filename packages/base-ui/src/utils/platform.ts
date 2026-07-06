// Minimal port of @base-ui/utils/platform — the checks the ported components need: `os.ios`
// (NumberField input mode), `engine.webkit` (useDismiss IME timing), `screenReader.voiceOver`
// (FocusGuard). All derive from the UA string; under jsdom they resolve to `false`, so the
// UA-specific branches stay inert in tests.
function ua(): string {
	return typeof navigator === 'undefined' ? '' : (navigator.userAgent ?? '');
}

function isIOS(): boolean {
	if (typeof navigator === 'undefined') {
		return false;
	}
	return /iP(ad|hone|od)/.test(navigator.platform ?? '');
}

function isWebKit(): boolean {
	const s = ua();
	// WebKit but not Chromium/Blink (which also report "AppleWebKit").
	return /AppleWebKit/.test(s) && !/Chrome|Chromium|Edg\//.test(s);
}

function isVoiceOver(): boolean {
	// VoiceOver isn't directly detectable; Base UI infers it from Apple platforms. jsdom → false.
	return /Mac OS X|iPhone|iPad/.test(ua());
}

function isAndroid(): boolean {
	return /Android/.test(ua());
}

function isJsdom(): boolean {
	return /jsdom/i.test(ua());
}

export const platform = {
	os: {
		get ios() {
			return isIOS();
		},
		get android() {
			return isAndroid();
		},
	},
	engine: {
		get webkit() {
			return isWebKit();
		},
	},
	env: {
		get jsdom() {
			return isJsdom();
		},
	},
	screenReader: {
		get voiceOver() {
			return isVoiceOver();
		},
	},
};
