"use strict";

const { mixin: OpenAPIMixin } = require("@spailybot/moleculer-auto-openapi");

function getBaseUrl() {
	const base = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
	return `${base.replace(/\/$/, "")}/api`;
}

module.exports = {
	name: "openapi",
	mixins: [OpenAPIMixin],
	settings: {
		openapi: {
			openapi: "3.0.3",
			info: {
				title: "Medaryon API",
				description: "Specifica OpenAPI generata dalle action esposte via moleculer-web",
				version: process.env.APP_VERSION || "1.0.0"
			},
			servers: [
				{ url: getBaseUrl() }
			],
			ui: {
				path: "/api/docs",
				oauth2RedirectPath: "/api/openapi/oauth2-redirect.html",
				assetsPath: "/api/openapi/assets"
			},
			components: {
				securitySchemes: {
					BearerAuth: {
						type: "http",
						scheme: "bearer",
						bearerFormat: "JWT"
					}
				}
			},
			security: [
				{ BearerAuth: [] }
			],
		}
	}
};
