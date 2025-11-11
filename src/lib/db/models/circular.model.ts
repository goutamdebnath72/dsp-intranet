import { Sequelize, DataTypes, Model } from "sequelize";

export class Circular extends Model {
  public id!: number;
  public headline!: string;
  public fileUrls!: string[];
  public publishedAt!: Date;
  public embedding?: any; // Stored as JSONB in Postgres
}

export function initCircularModel(sequelize: Sequelize) {
  Circular.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      headline: {
        type: DataTypes.TEXT, // ✅ Changed from STRING → TEXT
        allowNull: false,
      },
      fileUrls: {
        type: DataTypes.ARRAY(DataTypes.TEXT), // ✅ Matches text[] column
        allowNull: true,
        defaultValue: [],
      },
      publishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      embedding: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "circulars",
      timestamps: false,
    }
  );

  return Circular;
}
