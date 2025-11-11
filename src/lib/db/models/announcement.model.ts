import { Sequelize, DataTypes, Model } from "sequelize";

export class Announcement extends Model {
  public id!: number;
  public createdAt!: Date;
  public title!: string;
  public content?: string;
  public date!: Date;

  // This will be populated by Sequelize
  // after we define associations
  public readonly readByUsers?: any[];
}

export function initAnnouncementModel(sequelize: Sequelize) {
  Announcement.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      content: {
        type: DataTypes.STRING, // Or DataTypes.TEXT if it can be very long
        allowNull: true,
      },
      date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "announcement",
      timestamps: false, // We set 'createdAt' manually with a default
    }
  );
  return Announcement;
}
