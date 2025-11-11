import { Sequelize, DataTypes, Model } from "sequelize";

export class User extends Model {
  public id!: string;
  public name?: string;
  public email?: string;
  public emailVerified?: Date;
  public image?: string;
  public password?: string;
  public role!: string;
  public ticketNo!: string;
  public designation?: string;
  public contactNo?: string;
  public sailPNo?: string;
  public departmentId?: string;

  // These will be populated by Sequelize after associations are defined
  public readonly accounts?: any[];
  public readonly readAnnouncements?: any[];
  public readonly sessions?: any[];
  public readonly department?: any;
}

export function initUserModel(sequelize: Sequelize) {
  User.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        // We will need to generate a CUID/UUID in the app logic before creation
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
      },
      emailVerified: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      image: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "standard",
      },
      ticketNo: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
      },
      designation: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      contactNo: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      sailPNo: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      departmentId: {
        type: DataTypes.STRING,
        allowNull: true,
        // This will be set as a foreign key when we define associations
      },
    },
    {
      sequelize,
      tableName: "user",
      timestamps: false,
    }
  );
  return User;
}
