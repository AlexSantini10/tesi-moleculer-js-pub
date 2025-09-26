module.exports = (sequelize, DataTypes) => {
	return sequelize.define("Report", {
		id: {
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true
		},
		appointment_id: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		author_id: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		author_role: {
			type: DataTypes.ENUM("patient", "doctor"),
			allowNull: false
		},
		title: {
			type: DataTypes.STRING(255),
			allowNull: true
		},
		notes: {
			type: DataTypes.TEXT,
			allowNull: true
		},
		report_url: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		mime_type: {
			type: DataTypes.STRING(100),
			allowNull: true
		},
		size_bytes: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		visible_to_patient: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: true
		},
		visible_to_doctor: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: true
		},
		created_at: {
			type: DataTypes.DATE,
			allowNull: false,
			defaultValue: DataTypes.NOW
		},
		updated_at: {
			type: DataTypes.DATE,
			allowNull: false,
			defaultValue: DataTypes.NOW
		}
	}, {
		tableName: "reports",
		timestamps: false,
		indexes: [
			{ fields: ["appointment_id"] },
			{ fields: ["author_id", "author_role"] }
		]
	});
};
