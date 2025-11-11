import { Sequelize, DataTypes, Model } from "sequelize";
import { HolidayType } from "./holiday-master.model"; // We re-use the enum

export class HolidayYear extends Model {
  public id!: number;
  public date!: Date;
  public year!: number;
  public holidayType!: HolidayType;
  public holidayMasterId!: number;
}

export function initHolidayYearModel(sequelize: Sequelize) {
  HolidayYear.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      year: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      holidayType: {
        // We use the same ENUM from HolidayMaster
        type: DataTypes.ENUM(HolidayType.CH, HolidayType.FH, HolidayType.RH),
        allowNull: false,
      },
      holidayMasterId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        // This will be set as a foreign key when we define associations
      },
    },
    {
      sequelize,
      tableName: "holidayyear",
      timestamps: false,
      // This adds the @@index([year])
      indexes: [
        {
          fields: ["year"],
        },
      ],
    }
  );
  return HolidayYear;
}
