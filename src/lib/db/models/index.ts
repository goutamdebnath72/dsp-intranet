// src/lib/db/models/index.ts
import { Sequelize } from "sequelize";

// Import init functions only — we will capture returned model objects from each init
import { initAccountModel } from "./account.model";
import { initAnnouncementModel } from "./announcement.model";
import { initAnnouncementReadStatusModel } from "./announcement-read-status.model";
import { initCircularModel } from "./circular.model";
import { initDepartmentModel } from "./department.model";
import { initHolidayMasterModel } from "./holiday-master.model";
import { initHolidayYearModel } from "./holiday-year.model";
import { initLinkModel } from "./link.model";
import { initSessionModel } from "./session.model";
import { initUserModel } from "./user.model";
import { initVerificationTokenModel } from "./verification-token.model";

/**
 * Initialize all models and set associations.
 * Each `initXModel` must return the defined Sequelize Model instance (e.g. via `sequelize.define(...)`).
 * We capture those return values and then perform associations on those concrete values.
 */
export function initModels(sequelize: Sequelize) {
  // 1. Initialize all models and keep references
  const Account = initAccountModel(sequelize);
  const Announcement = initAnnouncementModel(sequelize);
  const AnnouncementReadStatus = initAnnouncementReadStatusModel(sequelize);
  const Circular = initCircularModel(sequelize);
  const Department = initDepartmentModel(sequelize);
  const HolidayMaster = initHolidayMasterModel(sequelize);
  const HolidayYear = initHolidayYearModel(sequelize);
  const Link = initLinkModel(sequelize);
  const Session = initSessionModel(sequelize);
  const User = initUserModel(sequelize);
  const VerificationToken = initVerificationTokenModel(sequelize);

  // 2. Associations (use the concrete model references)
  // User <=> Account (One-to-Many)
  if (User && Account && typeof (User as any).hasMany === "function") {
    User.hasMany(Account, { foreignKey: "userId", onDelete: "CASCADE" });
    Account.belongsTo(User, { foreignKey: "userId" });
  }

  // User <=> Session (One-to-Many)
  if (User && Session && typeof (User as any).hasMany === "function") {
    User.hasMany(Session, { foreignKey: "userId", onDelete: "CASCADE" });
    Session.belongsTo(User, { foreignKey: "userId" });
  }

  // Department <=> User (One-to-Many)
  if (Department && User && typeof (Department as any).hasMany === "function") {
    Department.hasMany(User, { foreignKey: "departmentId" });
    User.belongsTo(Department, { foreignKey: "departmentId" });
  }

  // User <=> AnnouncementReadStatus (One-to-Many)
  if (
    User &&
    AnnouncementReadStatus &&
    typeof (User as any).hasMany === "function"
  ) {
    User.hasMany(AnnouncementReadStatus, {
      foreignKey: "userId",
      onDelete: "CASCADE",
    });
    AnnouncementReadStatus.belongsTo(User, { foreignKey: "userId" });
  }

  // Announcement <=> AnnouncementReadStatus (One-to-Many)
  if (
    Announcement &&
    AnnouncementReadStatus &&
    typeof (Announcement as any).hasMany === "function"
  ) {
    Announcement.hasMany(AnnouncementReadStatus, {
      foreignKey: "announcementId",
      onDelete: "CASCADE",
    });
    AnnouncementReadStatus.belongsTo(Announcement, {
      foreignKey: "announcementId",
    });
  }

  // HolidayMaster <=> HolidayYear (One-to-Many)
  if (
    HolidayMaster &&
    HolidayYear &&
    typeof (HolidayMaster as any).hasMany === "function"
  ) {
    HolidayMaster.hasMany(HolidayYear, {
      foreignKey: "holidayMasterId",
      onDelete: "CASCADE",
    });
    HolidayYear.belongsTo(HolidayMaster, { foreignKey: "holidayMasterId" });
  }

  // 3. Return the model map (concrete model instances)
  return {
    Account,
    Announcement,
    AnnouncementReadStatus,
    Circular,
    Department,
    HolidayMaster,
    HolidayYear,
    Link,
    Session,
    User,
    VerificationToken,
  };
}
