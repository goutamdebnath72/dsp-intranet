import { Sequelize, DataTypes, Model } from 'sequelize';

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
        type: DataTypes.STRING,
        allowNull: false,
      },
      fileUrls: {
        // This will be stored as a 'text[]' in Postgres
        type: DataTypes.ARRAY(DataTypes.STRING),
      },
      publishedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      embedding: {
        // JSONB is the best way to store a vector array in Postgres
        // Sequelize will map this to CLOB/BLOB in Oracle
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'circulars',
      timestamps: false, // We're not using createdAt/updatedAt
    }
  );
  return Circular;
}