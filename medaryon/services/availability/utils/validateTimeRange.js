module.exports = (start, end) => {
	if (!start || !end) return false;
	return start < end;
};
