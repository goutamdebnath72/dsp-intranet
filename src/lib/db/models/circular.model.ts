// src/lib/db/models/circular.model.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ValueTransformer,
  OneToMany,
} from "typeorm";
import type { Relation } from "typeorm";
import { DateTime } from "luxon";
import { CircularPage } from "./circular_pages.model";

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
    name: "publishedAt",
    nullable: true,
    transformer: LuxonDateTimeTransformer,
  })
  publishedAt!: DateTime | null;

  @Column({
    type: "vector",
    nullable: true,
  })
  embedding!: any;

  @Column({ type: "varchar", nullable: false })
  authorTicketNo!: string;

  @Column({ type: "integer", nullable: true })
  serialNumber?: number;

  // ✅ The arrow function defers evaluation and Relation<> safely isolates TS metadata
  @OneToMany(() => CircularPage, (page) => page.circular)
  pages!: Relation<CircularPage>[];
}
