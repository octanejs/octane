type StorageKind = 'local' | 'session';

function getStorage(kind: StorageKind) {
	if (typeof window === 'undefined') {
		return null;
	}

	try {
		return kind === 'local' ? window.localStorage : window.sessionStorage;
	} catch {
		return null;
	}
}

function getStorageItem(kind: StorageKind, key: string) {
	try {
		return getStorage(kind)?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function setStorageItem(kind: StorageKind, key: string, value: string) {
	try {
		getStorage(kind)?.setItem(key, value);
	} catch {
		// Storage can be unavailable in private or restricted browser modes.
	}
}

function removeStorageItem(kind: StorageKind, key: string) {
	try {
		getStorage(kind)?.removeItem(key);
	} catch {
		// Storage can be unavailable in private or restricted browser modes.
	}
}

export function getLocalStorageItem(key: string) {
	return getStorageItem('local', key);
}

export function setLocalStorageItem(key: string, value: string) {
	return setStorageItem('local', key, value);
}

export function removeLocalStorageItem(key: string) {
	return removeStorageItem('local', key);
}

export function getSessionStorageItem(key: string) {
	return getStorageItem('session', key);
}

export function setSessionStorageItem(key: string, value: string) {
	return setStorageItem('session', key, value);
}
