function isAdmin(user) {
	return user && user.role === "admin";
}

function isOwnerOrAdmin(user, targetUserId) {
	return isAdmin(user) || (user && user.id === targetUserId);
}

module.exports = {
	isAdmin,
	isOwnerOrAdmin
};