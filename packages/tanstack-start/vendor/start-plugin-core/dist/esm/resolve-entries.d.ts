export declare function resolveEntry<TRequired extends boolean, TReturn = TRequired extends true ? string : string | undefined>(opts: {
    type: string;
    configuredEntry?: string;
    defaultEntry: string;
    resolvedSrcDirectory: string;
    required: TRequired;
}): TReturn;
