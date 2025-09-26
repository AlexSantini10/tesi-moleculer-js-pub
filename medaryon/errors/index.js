"use strict";

const { MoleculerError, ValidationError, MoleculerClientError } = require("moleculer").Errors;
const { Errors: ApiErrors } = require("moleculer-web");

/**
 * Allegare stacktrace solo se non in produzione
 */
function withStack(err) {
	if (process.env.NODE_ENV !== "production") {
		err.stack = new Error().stack;
	}
	return err;
}

module.exports = {
	InvalidRoleError(role) {
		return withStack(new ValidationError("Invalid role: " + role, 400, "INVALID_ROLE"));
	},

	MissingTokenError() {
		return withStack(new ApiErrors.UnAuthorizedError("Token is missing", 401, "NO_TOKEN"));
	},

	InvalidTokenError() {
		return withStack(new ApiErrors.UnAuthorizedError("Token is invalid", 401, "INVALID_TOKEN"));
	},

	UnauthorizedAccessError() {
		return withStack(new ApiErrors.UnAuthorizedError("Unauthorized", 401, "UNAUTHORIZED"));
	},

	ForbiddenAccessError(msg = "You are not allowed to perform this action") {
		return withStack(new MoleculerClientError(msg, 403, "FORBIDDEN"));
	},

	LoginFailedError() {
		return withStack(new ValidationError("Invalid email or password", 400, "LOGIN_FAILED"));
	},

	UserNotFoundError(id) {
		return withStack(new MoleculerError("User with ID " + id + " not found", 404, "USER_NOT_FOUND"));
	},

	DBError(msg = "Database error") {
		return withStack(new MoleculerError(msg, 400, "DB_ERROR"));
	},

	/**
	 * Errori aggiuntivi generici e riutilizzabili
	 */
	ValidationFailedError(field, msg) {
		const message = msg || ("Invalid value for " + field);
		return withStack(new ValidationError(message, 400, "VALIDATION_FAILED"));
	},

	NotFoundError(resource, id) {
		const base = resource || "Resource";
		const message = id ? (base + " with ID " + id + " not found") : (base + " not found");
		return withStack(new MoleculerError(message, 404, "NOT_FOUND"));
	},

	ConflictError(msg = "Conflict error") {
		return withStack(new MoleculerError(msg, 409, "CONFLICT"));
	},

	ExternalServiceError(serviceName, msg) {
		const name = serviceName || "External service";
		const message = msg || (name + " error");
		return withStack(new MoleculerError(message, 502, "EXTERNAL_SERVICE_ERROR"));
	},

	RateLimitExceededError() {
		return withStack(new MoleculerError("Too many requests", 429, "RATE_LIMIT_EXCEEDED"));
	}
};
