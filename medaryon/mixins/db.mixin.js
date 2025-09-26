"use strict";

const fs = require("fs");
const DbService = require("moleculer-db");

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema
 * @typedef {import('moleculer').Context} Context
 * @typedef {import('moleculer-db').MoleculerDB} MoleculerDB
 */

module.exports = function (collection) {
	const cacheCleanEventName = "cache.clean." + collection;

	/** @type {MoleculerDB & ServiceSchema} */
	const schema = {
		mixins: [DbService],

		events: {
			/**
			 * Pulire la cache del servizio al ricevimento dell'evento dedicato
			 * @param {Context} ctx
			 */
			async [cacheCleanEventName]() {
				if (this.broker.cacher) {
					await this.broker.cacher.clean(this.fullName + ".*");
				}
			}
		},

		methods: {
			/**
			 * Emettere un evento di pulizia cache quando un'entità cambia
			 * @param {String} type
			 * @param {any} json
			 * @param {Context} ctx
			 */
			async entityChanged(type, json, ctx) {
				ctx.broadcast(cacheCleanEventName);
			}
		},

		/**
		 * Allo start, se previsto seed, popolazione iniziale quando la collezione è vuota
		 */
		async started() {
			if (this.seedDB) {
				const count = await this.adapter.count();
				if (count === 0) {
					this.logger.info("La collezione '" + collection + "' è vuota. Avviare seeding...");
					await this.seedDB();
					this.logger.info("Seeding completato. Numero record: " + (await this.adapter.count()));
				}
			}
		}
	};

	if (process.env.MONGO_URI) {
		// Adapter MongoDB
		const MongoAdapter = require("moleculer-db-adapter-mongo");
		schema.adapter = new MongoAdapter(process.env.MONGO_URI);
		schema.collection = collection;
	} else if (process.env.NODE_ENV === "test") {
		// Adapter in memoria per test
		schema.adapter = new DbService.MemoryAdapter();
	} else {
		// Adapter NeDB su file per ambiente locale/produzione leggera

		// Creare cartella dati se mancante
		if (!fs.existsSync("./data")) {
			fs.mkdirSync("./data");
		}

		// Usare l'adapter NeDB (persistenza su file)
		const NeDBAdapter = require("moleculer-db-adapter-nedb");
		schema.adapter = new NeDBAdapter({
			filename: "./data/" + collection + ".db",
			autoload: true
		});
	}

	return schema;
};
