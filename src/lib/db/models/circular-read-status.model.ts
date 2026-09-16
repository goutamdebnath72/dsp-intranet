// src/lib/db/models/circular-read-status.model.ts
import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
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

@Entity({ name: "circularreadstatus" })
@Index(["userId", "circularId"], { unique: true })
export class CircularReadStatus {
  @PrimaryColumn({ type: "varchar" })
  id!: string;

  @Column({ type: "varchar", name: "userId", nullable: false })
  userId!: string;

  @Column({ type: "integer", name: "circularId", nullable: false })
  circularId!: number;

  @Column({
    type: "timestamp with time zone",
    name: "readAt",
    default: () => "CURRENT_TIMESTAMP",
    transformer: LuxonDateTimeTransformer,
    nullable: false,
  })
  readAt!: DateTime;

  // ==========================================
  //               RELATIONSHIPS
  // ==========================================

  @ManyToOne("User", "readCirculars", { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user?: any;

  @ManyToOne("Circular", "readByUsers", { onDelete: "CASCADE" })
  @JoinColumn({ name: "circularId" })
  circular?: any;
}
