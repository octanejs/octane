// The website's curated framework-integration inventory. The workspace package
// check verifies that every package classified as a framework integration
// appears exactly once here, keeping this directory and its count in sync.
import frameworkIntegrations from './framework-integrations.json';

export interface FrameworkIntegration {
	title: string;
	packageName: string;
	model: string;
	description: string;
	searchTerms?: readonly string[];
	guideAnchor: string;
}

export const FRAMEWORK_INTEGRATIONS = frameworkIntegrations satisfies FrameworkIntegration[];

export const FRAMEWORK_INTEGRATION_COUNT = FRAMEWORK_INTEGRATIONS.length;
