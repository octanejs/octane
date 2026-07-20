/**
 * Validate API Handler (v2)
 *
 * Uses cta-engine to validate project definitions.
 */

import type { ProjectDefinition } from './compile';
import { getFramework, DEFAULT_MODE } from './config';
import { create, type AddOn } from './create-worker';

export interface ValidationError {
	field: string;
	message: string;
}

export interface ValidationSuggestion {
	type: 'add' | 'remove' | 'change';
	feature?: string;
	option?: string;
	value?: unknown;
	reason: string;
}

export interface ValidateResponse {
	valid: boolean;
	errors: Array<ValidationError>;
	suggestions: Array<ValidationSuggestion>;
}

export async function validateHandler(definition: ProjectDefinition): Promise<ValidateResponse> {
	const framework = await getFramework();
	const allAddOns = create.getAllAddOns(framework, DEFAULT_MODE);

	const errors: Array<ValidationError> = [];
	const suggestions: Array<ValidationSuggestion> = [];

	const addOnMap = new Map(allAddOns.map((a: AddOn) => [a.id, a]));

	if (!definition.name || definition.name.trim() === '') {
		errors.push({
			field: 'name',
			message: 'Project name is required',
		});
	} else if (!/^[a-z0-9-_]+$/.test(definition.name)) {
		errors.push({
			field: 'name',
			message: 'Project name can only contain lowercase letters, numbers, hyphens, and underscores',
		});
	}

	for (const featureId of definition.features) {
		if (!addOnMap.has(featureId)) {
			errors.push({
				field: 'features',
				message: `Unknown feature: ${featureId}`,
			});
		}
	}

	for (const featureId of definition.features) {
		const addOn = addOnMap.get(featureId) as AddOn | undefined;
		if (addOn?.dependsOn) {
			for (const requiredId of addOn.dependsOn) {
				if (!definition.features.includes(requiredId)) {
					suggestions.push({
						type: 'add',
						feature: requiredId,
						reason: `'${featureId}' requires '${requiredId}'`,
					});
				}
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		suggestions,
	};
}
