// Adapted from react-hook-form@7.88.0 src/utils/json.ts for Octane.
function safeJSONStringify(value?: unknown) {
	try {
		return JSON.stringify(value);
	} catch {
		return '';
	}
}

function safeJSONParse(value?: string) {
	try {
		return JSON.parse(value as string);
	} catch {
		return;
	}
}

const safeJSON = {
	stringify: safeJSONStringify,
	parse: safeJSONParse,
};

export { safeJSON, safeJSONParse, safeJSONStringify };

export default safeJSON;
