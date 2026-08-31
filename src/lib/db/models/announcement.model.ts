// src/lib/db/models/announcement.model.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ValueTransformer,
} from "typeorm";
import { DateTime } from "luxon";

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

  @Column({ type: "varchar", nullable: false })
  authorTicketNo!: string;

  // ✅ ADDED: Vector embedding column for Omnibar deep search
  @Column({ type: "text", nullable: true, select: false }) // or type: "vector" if explicitly configured in TypeORM
  embedding?: string | null;

  @OneToMany("AnnouncementReadStatus", "announcement", { cascade: true })
  readByUsers?: any[];
}
