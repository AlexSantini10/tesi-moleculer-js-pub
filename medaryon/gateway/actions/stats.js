module.exports = {
	rest: "GET /stats",

	// ritorno statistiche di sistema e del broker
	async handler(ctx) {
		try {
			const systemStats = this.getSystemStats();
			const brokerStats = {
				nodeID: this.broker.nodeID,
				uptime: this.broker.uptime,
				namespace: this.broker.namespace,
				services: Array.from(this.broker.registry.getServiceList({ onlyAvailable: true })),
				events: Array.from(this.broker.registry.getEventList({ onlyAvailable: true }))
			};

			return {
				type: "application/json",
				body: {
					brokerStats: brokerStats,
					systemStats: systemStats
				}
			};
		} catch (err) {
			return {
				type: "application/json",
				body: { error: "stats unavailable" },
				code: 500
			};
		}
	}
};
