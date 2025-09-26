"use strict";

const { httpRequestDuration } = require("../utils/prometheus");

module.exports = {
	rest: {
		method: "GET",
		path: "/stress"
	},
	params: {
		action: { type: "string", optional: true, default: "users.login" },
		concurrency: { type: "number", optional: true, default: 10, min: 1, max: 100 },
		requests: { type: "number", optional: true, default: 50, min: 1, max: 1000 }
	},
	async handler(ctx) {
		const { action, concurrency, requests } = ctx.params;

		const latencies = [];
		let errors = 0;

		const tasks = Array.from({ length: requests }, (_, i) => async () => {
			const end = httpRequestDuration.startTimer();
			const start = Date.now();
			try {
				// chiamata moleculer interna (qui potresti variare i parametri a seconda dell’action)
				await ctx.call(action, { email: "dummy@test.com", password: "123456" });
				const ms = Date.now() - start;
				latencies.push(ms);
				end({ method: "internal", route: action, status: 200 });
			} catch (err) {
				errors++;
				const ms = Date.now() - start;
				latencies.push(ms);
				end({ method: "internal", route: action, status: err.code || 500 });
			}
		});

		// esecuzione concorrente a batch
		const running = [];
		for (const task of tasks) {
			running.push(task());
			if (running.length >= concurrency) {
				await Promise.all(running.splice(0, running.length));
			}
		}
		if (running.length) await Promise.all(running);

		// statistiche base
		const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
		const max = Math.max(...latencies);
		const min = Math.min(...latencies);

		return {
			action,
			requests,
			concurrency,
			errors,
			latency: {
				mean,
				min,
				max
			},
			// link diretto alle metriche prometheus
			metrics_url: "/api/metrics"
		};
	}
};
