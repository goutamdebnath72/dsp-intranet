// src/lib/db/models/circular.model.ts
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

@Entity({ name: "circulars" })
export class Circular {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "text", nullable: false })
  headline!: string;

  @Column({
    type: "text",
    array: true,
    nullable: true,
    default: () => "'{}'",
  })
  fileUrls!: string[];

  @Column({
    type: "timestamp",
    name: "publishedAt", // ✅ Preserved: Matches camelCase layout from live schema
    nullable: true,
    transformer: LuxonDateTimeTransformer,
  })
  publishedAt!: DateTime | null;

  @Column({
    type: "vector", // ✅ Preserved: Matches native pgvector type
    nullable: true,
  })
  embedding!: any;

  // ✅ ADDED: Author tracking
  @Column({ type: "varchar", nullable: false })
  authorTicketNo!: string;

  // ✅ ADDED: Placeholder for serial numbering
  @Column({ type: "integer", nullable: true })
  serialNumber?: number;
}
