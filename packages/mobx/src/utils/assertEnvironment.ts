import { _getGlobalState } from 'mobx';
import { useState, useSyncExternalStore } from 'octane';

if (!useState || !useSyncExternalStore) {
	throw new Error('@octanejs/mobx requires Octane useState and useSyncExternalStore');
}
if (!(_getGlobalState?.()?.version >= 7)) {
	throw new Error('@octanejs/mobx requires mobx at least version 7 to be available');
}
