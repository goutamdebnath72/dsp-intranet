// src/lib/db/models/user.model.ts
import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  ValueTransformer,
} from "typeorm";
import { DateTime } from "luxon";

/**
 * ValueTransformer to automatically bridge native database JS Dates
 * to Luxon DateTime objects across the Next.js application layer.
 */
const LuxonDateTimeTransformer: ValueTransformer = {
  to(value: DateTime | null | undefined): Date | null {
    if (!value) return null;
    return value.toJSDate();
  },
  from(value: Date | null | undefined): DateTime | null {
    if (!value) return null;
    return DateTime.fromJSDate(value);
  },
};

@Entity({ name: "user" })
export class User {
  @PrimaryColumn({ type: "varchar" })
  id!: string; // Generated via your application logic (e.g., CUID or UUID) before insertion

  @Column({ type: "varchar", nullable: true })
  name?: string;

  @Column({ type: "varchar", unique: true, nullable: true })
  email?: string;

  @Column({
    type: "timestamp with time zone",
    name: "emailVerified", // Retains legacy camelCase schema structure to protect live data
    nullable: true,
    transformer: LuxonDateTimeTransformer,
  })
  emailVerified!: DateTime | null; // Flawless Luxon integration

  @Column({ type: "varchar", nullable: true })
  image?: string;

  @Column({ type: "varchar", nullable: true })
  password?: string;

  @Column({ type: "varchar", nullable: false, default: "standard" })
  role!: string;

  @Column({ type: "varchar", unique: true, nullable: false, name: "ticketNo" })
  ticketNo!: string;

  @Column({ type: "varchar", nullable: true })
  designation?: string;

  @Column({ type: "varchar", nullable: true, name: "contactNo" })
  contactNo?: string;

  @Column({ type: "varchar", nullable: true, name: "sailPNo" })
  sailPNo?: string;

  @Column({ type: "varchar", nullable: true, name: "departmentId" })
  departmentId?: string;

  // ==========================================
  //               RELATIONSHIPS
  // ==========================================

  /**
   * Many Users belong to One Department
   */
  @ManyToOne("Department", "users", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "departmentId" })
  department?: any;

  /**
   * One User can have Many Auth Accounts (NextAuth Linkages)
   */
  @OneToMany("Account", "user", { cascade: true })
  accounts?: any[];

  /**
   * One User can have Many active Auth Sessions
   */
  @OneToMany("Session", "user", { cascade: true })
  sessions?: any[];

  /**
   * One User tracks multiple read-confirmations for Announcements
   */
  @OneToMany("AnnouncementReadStatus", "user", { cascade: true })
  readAnnouncements?: any[];
}
