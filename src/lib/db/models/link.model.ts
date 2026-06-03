// src/lib/db/models/link.model.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
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

@Entity({ name: "link" })
export class Link {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({
    type: "timestamp",
    name: "createdAt",
    default: () => "CURRENT_TIMESTAMP",
    transformer: LuxonDateTimeTransformer,
    nullable: false,
  })
  createdAt!: DateTime;

  @Column({ type: "varchar", nullable: false })
  title!: string;

  @Column({ type: "varchar", nullable: true })
  subtitle?: string;

  @Column({ type: "varchar", nullable: false })
  href!: string;

  @Column({ type: "varchar", nullable: true })
  icon?: string;

  @Column({ type: "varchar", nullable: false })
  category!: string;
}
