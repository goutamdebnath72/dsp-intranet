// src/lib/db/models/announcement.model.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
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

@Entity({ name: "announcement" })
export class Announcement {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({
    type: "timestamp with time zone",
    name: "createdAt",
    default: () => "CURRENT_TIMESTAMP",
    transformer: LuxonDateTimeTransformer,
  })
  createdAt!: DateTime;

  @Column({ type: "varchar", nullable: false })
  title!: string;

  @Column({ type: "text", nullable: true })
  content?: string;

  @Column({
    type: "timestamp with time zone",
    nullable: false,
    transformer: LuxonDateTimeTransformer,
  })
  date!: DateTime;

  // ✅ ADDED: Author tracking
  @Column({ type: "varchar", nullable: false })
  authorTicketNo!: string;

  // ==========================================
  //               RELATIONSHIPS
  // ==========================================

  @OneToMany("AnnouncementReadStatus", "announcement", { cascade: true })
  readByUsers?: any[];
}
