import { type AddOnCompiled } from './compile';
import { compileWithAttributionHandler, type ProjectDefinition } from './compile';
import { type FrameworkId } from './config';

export interface FeatureArtifactsRequest {
	features: Array<string>;
	projectName?: string;
	framework?: FrameworkId;
	tailwind?: boolean;
	featureOptions?: Record<string, Record<string, unknown>>;
	customIntegrations?: Array<AddOnCompiled>;
}

export interface FeatureArtifact {
	files: Record<string, string>;
	injections: Record<string, { content: string; highlightedLines: Array<number> }>;
	packages: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	envVars?: Array<{
		name: string;
		description: string;
	}>;
}

export interface FeatureArtifactsResponse {
	artifacts: Record<string, FeatureArtifact>;
}

export async function featureArtifactsHandler(
	request: FeatureArtifactsRequest,
): Promise<FeatureArtifactsResponse> {
	if (!request.features || request.features.length === 0) {
		return { artifacts: {} };
	}

	const projectName = request.projectName || 'my-app';
	const tailwind = request.tailwind ?? true;

	const definition: ProjectDefinition = {
		name: projectName,
		framework: request.framework,
		tailwind,
		features: request.features,
		featureOptions: request.featureOptions ?? {},
		customIntegrations: request.customIntegrations,
	};

	const output = await compileWithAttributionHandler(definition);

	const artifacts: Record<string, FeatureArtifact> = {};

	for (const featureId of request.features) {
		artifacts[featureId] = {
			files: {},
			injections: {},
			packages: {
				dependencies: {},
				devDependencies: {},
			},
			envVars: [],
		};
	}

	for (const [path, fileData] of Object.entries(output.attributedFiles)) {
		const content = output.files[path];
		if (!content || !fileData.attributions) continue;

		const linesByFeature = new Map<string, Array<number>>();
		let hasBaseLines = false;

		for (const attr of fileData.attributions) {
			if (attr.featureId === 'base') {
				hasBaseLines = true;
				continue;
			}

			if (!linesByFeature.has(attr.featureId)) {
				linesByFeature.set(attr.featureId, []);
			}
			linesByFeature.get(attr.featureId)!.push(attr.lineNumber);
		}

		for (const [featureId, lines] of linesByFeature) {
			if (!artifacts[featureId]) continue;

			if (hasBaseLines) {
				artifacts[featureId].injections[path] = {
					content,
					highlightedLines: lines,
				};
			} else {
				const allLinesFromThis = fileData.attributions.every((a) => a.featureId === featureId);
				if (allLinesFromThis) {
					artifacts[featureId].files[path] = content;
				} else {
					artifacts[featureId].injections[path] = {
						content,
						highlightedLines: lines,
					};
				}
			}
		}
	}

	return { artifacts };
}
