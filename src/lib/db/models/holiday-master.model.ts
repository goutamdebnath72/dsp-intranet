import { Sequelize, DataTypes, Model } from "sequelize";

// Define the enum for HolidayType, just as in Prisma
export enum HolidayType {
  CH = "CH",
  FH = "FH",
  RH = "RH",
}

export class HolidayMaster extends Model {
  public id!: number;
  public name!: string;
  public type!: HolidayType;

  // This will be populated by Sequelize
  // after we define associations
  public readonly years?: any[];
}

export function initHolidayMasterModel(sequelize: Sequelize) {
  HolidayMaster.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
      },
      type: {
        // We use DataTypes.ENUM to enforce the allowed values
        type: DataTypes.ENUM(HolidayType.CH, HolidayType.FH, HolidayType.RH),
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "holidaymaster",
      timestamps: false,
    }
  );
  return HolidayMaster;
}
