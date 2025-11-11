import { Sequelize, DataTypes, Model } from 'sequelize';

export class Link extends Model {
  public id!: number;
  public createdAt!: Date;
  public title!: string;
  public subtitle?: string;
  public href!: string;
  public icon?: string;
  public category!: string;
}

export function initLinkModel(sequelize: Sequelize) {
  Link.init(
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
      subtitle: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      href: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      icon: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      category: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: 'link',
      timestamps: false, // We set 'createdAt' manually with a default
    }
  );
  return Link;
}