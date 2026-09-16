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

  // Rich-text body as sanitized HTML (formatting preserved for display).
  @Column({ type: "text", nullable: true })
  content?: string;

  // Plain-text projection of `content` (HTML stripped) — what we embed and
  // run literal search on, so the AI never sees markup.
  @Column({ type: "text", name: "contentText", nullable: true })
  contentText?: string | null;

  @Column({
    type: "timestamp with time zone",
    nullable: false,
    transformer: LuxonDateTimeTransformer,
  })
  date!: DateTime;

  @Column({ type: "varchar", nullable: false })
  authorTicketNo!: string;

  // Vector embedding for the Omnibar semantic search (768-dim, Gemini).
  // select:false so normal queries don't drag the vector across the wire;
  // search SQL selects it explicitly.
  @Column({ type: "vector", nullable: true, select: false } as any)
  embedding?: any;

  @OneToMany("AnnouncementReadStatus", "announcement", { cascade: true })
  readByUsers?: any[];
}
