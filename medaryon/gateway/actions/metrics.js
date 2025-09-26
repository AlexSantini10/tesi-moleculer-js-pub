const { register } = require("../utils/prometheus");

module.exports = {
	rest: "GET /metrics",

	// endpoint che espone metriche Prometheus
	async handler(ctx) {
		try {
			const metrics = await register.metrics();

			ctx.meta.$responseType = "text/plain; version=0.0.4; charset=utf-8";
			ctx.meta.$statusCode = 200;
			return metrics;
		} catch (err) {
			ctx.meta.$responseType = "text/plain; version=0.0.4; charset=utf-8";
			ctx.meta.$statusCode = 500;
			return "metrics unavailable";
		}
	}
};
