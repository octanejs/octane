export {
	getFeaturesHandler,
	type FeaturesResponse,
	type FeatureInfo,
	type FeatureOption,
} from './features';

export {
	compileHandler,
	compileWithAttributionHandler,
	type ProjectDefinition,
	type CompileRequest,
	type CompileResponse,
	type CompileHandlerOptions,
	type AttributedCompileOutput,
	type AttributedFile,
	type LineAttribution,
} from './compile';

export {
	validateHandler,
	type ValidationError,
	type ValidationSuggestion,
	type ValidateResponse,
} from './validate';

export {
	suggestHandler,
	type SuggestRequest,
	type SuggestResponse,
	type FeatureSuggestion,
} from './suggest';

export {
	featureArtifactsHandler,
	type FeatureArtifactsRequest,
	type FeatureArtifactsResponse,
	type FeatureArtifact,
} from './feature-artifacts';

export {
	loadRemoteIntegrationHandler,
	loadRemoteTemplateHandler,
	type RemoteIntegrationResponse,
	type RemoteTemplateResponse,
} from './remote';

export type {
	AddOnCompiled as IntegrationCompiled,
	StarterCompiled as CustomTemplateCompiled,
} from './compile';

export type FeatureId = string;

export { type FrameworkId, FRAMEWORKS, normalizeFrameworkId } from './config';
