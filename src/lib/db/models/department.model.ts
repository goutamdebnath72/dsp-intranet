import { Sequelize, DataTypes, Model } from "sequelize";

export class Department extends Model {
  public id!: string;
  public code!: number;
  public name!: string;

  // This will be populated by Sequelize
  // after we define associations
  public readonly users?: any[];
}

export function initDepartmentModel(sequelize: Sequelize) {
  Department.init(
    {
      id: {
        // We'll use STRING to match Prisma's cuid()
        type: DataTypes.STRING,
        primaryKey: true,
        // We can't auto-generate cuid() easily here,
        // so we'll set it manually in the app logic or use UUID
        // For now, let's keep it simple.
      },
      code: {
        type: DataTypes.INTEGER,
        unique: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "departments",
      timestamps: false,
    }
  );
  return Department;
}
