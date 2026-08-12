import type { editor } from 'monaco-editor';

import type { Monaco } from './types';

const bindingOwnedModels = new WeakSet<editor.ITextModel>();
const modelLeaseCounts = new WeakMap<editor.ITextModel, number>();

/**
 * Ownership-aware model helper. Upstream's utils/getOrCreateModel returns or
 * creates a model by path; this port additionally tracks lease counts so shared
 * and externally-created models are not disposed by the wrong owner.
 */
export function getOrCreateModel(
	monaco: Monaco,
	value: string,
	language: string,
	path: string | undefined,
	leasedModels: Set<editor.ITextModel>,
): editor.ITextModel {
	const uri = path ? monaco.Uri.parse(path) : undefined;
	const existing = uri ? monaco.editor.getModel(uri) : null;
	const model = existing ?? monaco.editor.createModel(value, language || undefined, uri);
	if (!existing) bindingOwnedModels.add(model);
	if (!leasedModels.has(model)) {
		leasedModels.add(model);
		modelLeaseCounts.set(model, (modelLeaseCounts.get(model) ?? 0) + 1);
	}
	return model;
}

export function releaseModels(
	leasedModels: Set<editor.ITextModel>,
	preservedModels: ReadonlySet<editor.ITextModel>,
): void {
	for (const model of leasedModels) {
		const nextLeaseCount = Math.max(0, (modelLeaseCounts.get(model) ?? 1) - 1);
		if (nextLeaseCount === 0) {
			modelLeaseCounts.delete(model);
		} else {
			modelLeaseCounts.set(model, nextLeaseCount);
		}

		if (nextLeaseCount === 0) {
			if (preservedModels.has(model)) {
				// The final keepCurrent* lease transfers ownership out of the binding.
				bindingOwnedModels.delete(model);
			} else if (bindingOwnedModels.has(model)) {
				if (!model.isDisposed()) model.dispose();
				bindingOwnedModels.delete(model);
			}
		}
	}
	leasedModels.clear();
}
