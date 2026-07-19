//#region src/logger.ts
function logging(config) {
	function stripEmojis(str) {
		return str.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "");
	}
	function formatLogArgs(args) {
		if (process.env.CI) return args.map((arg) => typeof arg === "string" ? stripEmojis(arg) : arg);
		return args;
	}
	return {
		log: (...args) => {
			if (!config.disabled) console.log(...formatLogArgs(args));
		},
		debug: (...args) => {
			if (!config.disabled) console.debug(...formatLogArgs(args));
		},
		info: (...args) => {
			if (!config.disabled) console.info(...formatLogArgs(args));
		},
		warn: (...args) => {
			if (!config.disabled) console.warn(...formatLogArgs(args));
		},
		error: (...args) => {
			if (!config.disabled) console.error(...formatLogArgs(args));
		}
	};
}
//#endregion
export { logging };

//# sourceMappingURL=logger.js.map