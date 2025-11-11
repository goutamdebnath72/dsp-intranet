import { Sequelize, DataTypes, Model } from "sequelize";

export class Session extends Model {
  public id!: string;
  public sessionToken!: string;
  public userId!: string;
  public expires!: Date;
}

export function initSessionModel(sequelize: Sequelize) {
  Session.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      sessionToken: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.STRING,
        allowNull: false,
        // This will be set as a foreign key when we define associations
      },
      expires: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "session",
      timestamps: false,
    }
  );
  return Session;
}
