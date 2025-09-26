// actions/helloWorld.js
"use strict";

module.exports = {
	async handler(ctx) {
		return {
			message: "Hello, world!",
			timestamp: new Date().toISOString()
		};
	}
};
