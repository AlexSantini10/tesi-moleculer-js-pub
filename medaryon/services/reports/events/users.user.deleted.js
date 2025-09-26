"use strict";

/**
 * Un utente è stato eliminato/disattivato.
 * Se era autore di referti, li rende non visibili al paziente.
 *
 * payload.metadata = { userId }
 */
module.exports = async function(payload) {
	try {
		const md = payload && payload.metadata ? payload.metadata : null;
		const userId = md ? Number(md.userId) : null;
		if (!userId) return;

		const [affected] = await this.Report.update(
			{ visible_to_patient: false },
			{ where: { author_id: userId } }
		);

		this.logger.info("users.user.deleted -> hid authored reports for patient", { authorId: userId, affected });
	} catch (err) {
		this.logger.error("users.user.deleted handler error", { err: err && err.message });
	}
};
