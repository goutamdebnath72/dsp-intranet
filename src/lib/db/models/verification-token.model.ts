import { Sequelize, DataTypes, Model } from "sequelize";

export class VerificationToken extends Model {
  public identifier!: string;
  public token!: string;
  public expires!: Date;
}

export function initVerificationTokenModel(sequelize: Sequelize) {
  VerificationToken.init(
    {
      identifier: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      token: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true, // <-- Make the token the primary key
      },
      expires: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "verificationtoken",
      timestamps: false,
      // This adds the @@unique([identifier, token]) constraint
      indexes: [
        {
          unique: true,
          fields: ["identifier", "token"],
        },
      ],
      // We removed the incorrect 'primaryKey: false'
    }
  );
  return VerificationToken;
}
