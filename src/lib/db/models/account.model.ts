import { Sequelize, DataTypes, Model } from "sequelize";

export class Account extends Model {
  public id!: string;
  public userId!: string;
  public type!: string;
  public provider!: string;
  public providerAccountId!: string;
  public refresh_token?: string;
  public access_token?: string;
  public expires_at?: number;
  public token_type?: string;
  public scope?: string;
  public id_token?: string;
  public session_state?: string;
}

export function initAccountModel(sequelize: Sequelize) {
  // ✅ Prevents "Cannot read properties of undefined (reading 'define')" error
  if (!sequelize) {
    throw new Error("Sequelize instance is undefined in initAccountModel()");
  }

  Account.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      provider: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      providerAccountId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      refresh_token: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      access_token: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      expires_at: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      token_type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      scope: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      id_token: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      session_state: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "account",
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ["provider", "providerAccountId"],
        },
      ],
    }
  );

  return Account;
}
