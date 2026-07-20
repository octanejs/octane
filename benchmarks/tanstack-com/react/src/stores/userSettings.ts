import { create } from 'zustand';

export { useAdsPreference } from '~/hooks/useAdPreference';

export type UserSettings = Record<string, unknown>;

type UserSettingsState = {
	settings: UserSettings;
	hasHydrated: boolean;
	setHasHydrated: (value: boolean) => void;
};

export const useUserSettingsStore = create<UserSettingsState>()((set) => ({
	settings: {},
	hasHydrated: true,
	setHasHydrated: (value) => set({ hasHydrated: value }),
}));
