module.exports = (sequelize, DataTypes) => {
	return sequelize.define("ActivityLog", {
		id: {
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true
		},
		actor_id: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		actor_role: {
			type: DataTypes.STRING(32),
			allowNull: false
		},
		action: {
			type: DataTypes.STRING(64),
			allowNull: false
		},
		entity_type: {
			type: DataTypes.STRING(64),
			allowNull: true
		},
		entity_id: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		status: {
			type: DataTypes.STRING(16),
			allowNull: false,
			defaultValue: "ok"
		},
		metadata: {
			type: DataTypes.JSON,
			allowNull: true
		},
		created_at: {
			type: DataTypes.DATE,
			allowNull: false,
			defaultValue: DataTypes.NOW
		}
	}, {
		tableName: "activity_logs",
		timestamps: false,
		indexes: [
			{ fields: ["actor_id"] },
			{ fields: ["action"] },
			{ fields: ["entity_type", "entity_id"] },
			{ fields: ["created_at"] }
		]
	});
};
