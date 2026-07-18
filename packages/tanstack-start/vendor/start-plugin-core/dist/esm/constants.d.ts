export declare const START_ENVIRONMENT_NAMES: {
    readonly server: "ssr";
    readonly client: "client";
};
export type StartEnvironmentName = (typeof START_ENVIRONMENT_NAMES)[keyof typeof START_ENVIRONMENT_NAMES];
export declare const VITE_ENVIRONMENT_NAMES: {
    readonly server: "ssr";
    readonly client: "client";
};
export type ViteEnvironmentNames = StartEnvironmentName;
export declare const ENTRY_POINTS: {
    readonly client: "virtual:tanstack-start-client-entry";
    readonly server: "virtual:tanstack-start-server-entry";
    readonly start: "#tanstack-start-entry";
    readonly router: "#tanstack-router-entry";
};
export declare const DEV_CLIENT_ENTRY = "virtual:tanstack-start-dev-client-entry";
export declare const SERVER_FN_LOOKUP = "server-fn-module-lookup";
export declare const TRANSFORM_ID_REGEX: RegExp[];
