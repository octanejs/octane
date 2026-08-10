import type { HotkeysProviderProps, UseHotkeyOptions } from '../src/index.ts';
import type { RefObjectLike } from '../src/utils.ts';

declare function expectType<T>(value: T): void;

const target: RefObjectLike<HTMLElement | null> = { current: null };
const options: UseHotkeyOptions = { target, platform: 'mac' };
expectType<UseHotkeyOptions>(options);

declare const props: HotkeysProviderProps;
expectType<HotkeysProviderProps>(props);
