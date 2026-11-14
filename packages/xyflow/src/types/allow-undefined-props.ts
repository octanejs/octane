/** Permit explicit undefined only on audited internal forwarding keys. */
export type AllowUndefined<Props, Keys extends keyof Props> = {
	[Key in keyof Props]: Key extends Keys ? Props[Key] | undefined : Props[Key];
};
