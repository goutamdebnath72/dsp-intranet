// src/lib/db/models/session.model.ts
import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
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

@Entity({ name: "session" })
export class Session {
  @PrimaryColumn({ type: "varchar" })
  id!: string;

  @Column({
    type: "varchar",
    unique: true,
    nullable: false,
    name: "sessionToken",
  })
  sessionToken!: string;

  @Column({ type: "varchar", name: "userId" })
  userId!: string;

  @Column({
    type: "timestamp with time zone",
    nullable: false,
    transformer: LuxonDateTimeTransformer,
  })
  expires!: DateTime;

  // ==========================================
  //               RELATIONSHIPS
  // ==========================================

  @ManyToOne("User", "sessions", { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user?: any;
}
