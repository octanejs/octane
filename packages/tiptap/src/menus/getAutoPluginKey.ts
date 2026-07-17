import { PluginKey } from '@tiptap/pm/state';

export function getAutoPluginKey(
	pluginKey: PluginKey | string | undefined,
	defaultName: string,
): PluginKey | string {
	return pluginKey ?? new PluginKey(defaultName);
}
