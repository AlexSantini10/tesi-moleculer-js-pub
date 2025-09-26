const SENSITIVE_KEYS = ["password", "token", "access_token", "refresh_token", "secret"];

function redact(obj) {
	if (!obj || typeof obj !== "object") return obj;
	const clone = Array.isArray(obj) ? [] : {};
	Object.keys(obj).forEach(k => {
		const v = obj[k];
		if (SENSITIVE_KEYS.includes(k)) {
			clone[k] = "***";
		} else if (v && typeof v === "object") {
			clone[k] = redact(v);
		} else {
			clone[k] = v;
		}
	});
	return clone;
}

module.exports = { redact };
