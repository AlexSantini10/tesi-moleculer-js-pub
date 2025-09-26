function filterWhereForRole(role, userId) {
	// Restituisce condizioni di visibilità da applicare in findAll/findOne
	if (role === "admin") {
		return {}; // tutto visibile
	}
	if (role === "patient") {
		return [
			{ visible_to_patient: true },
			{ author_role: "patient", author_id: userId }
		];
	}
	if (role === "doctor") {
		return [
			{ visible_to_doctor: true },
			{ author_role: "doctor", author_id: userId }
		];
	}
	return { id: -1 };
}

module.exports = { filterWhereForRole };
