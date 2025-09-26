module.exports = {
	rest: "GET /nodes",

	// ritorno la lista dei nodi Moleculer con info essenziali
	async handler(ctx) {
		try {
			const list = await ctx.call("$node.list");
			const nodes = list.map(node => ({
				id: node.id,
				available: node.available,
				hostname: node.hostname,
				ipList: node.ipList,
				client: node.client,
				config: node.config
			}));
			return {
				type: "application/json",
				body: nodes
			};
		} catch (err) {
			return {
				type: "application/json",
				body: { error: "nodes unavailable" },
				code: 500
			};
		}
	}
};
