import { Logger } from './logger.cjs';
/**
 * Validates route params and logs warnings for invalid param names.
 *
 * @param routePath - The route path to validate
 * @param filePath - The file path for error messages
 * @param logger - Logger instance for warnings
 */
export declare function validateRouteParams(routePath: string, filePath: string, logger: Logger): void;
