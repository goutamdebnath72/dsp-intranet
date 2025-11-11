import { Sequelize, DataTypes, Model } from "sequelize";

export class AnnouncementReadStatus extends Model {
  public id!: string;
  public userId!: string;
  public announcementId!: number;
  public readAt!: Date;
}

export function initAnnouncementReadStatusModel(sequelize: Sequelize) {
  AnnouncementReadStatus.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.STRING,
        allowNull: false,
        // This will be set as a foreign key when we define associations
      },
      announcementId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        // This will be set as a foreign key when we define associations
      },
      readAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "announcementreadstatus",
      timestamps: false, // We use 'readAt' instead
      // This adds the @@unique([userId, announcementId]) constraint
      indexes: [
        {
          unique: true,
          fields: ["userId", "announcementId"],
        },
      ],
    }
  );
  return AnnouncementReadStatus;
}
