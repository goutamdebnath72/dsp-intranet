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
    type: "timestamp",
    name: "uploadedAt",
    nullable: true,
    transformer: LuxonDateTimeTransformer,
  })
  uploadedAt!: DateTime | null;

  @Column({
    type: "vector",
    nullable: true,
  })
  embedding!: any;

  @Column({ type: "varchar", nullable: false })
  authorTicketNo!: string;

  @Column({ type: "integer", nullable: true })
  serialNumber?: number;

  // Async-processing status. A newly-uploaded circular starts "processing"
  // (queued to QStash, not yet rendered/OCR'd/embedded) and moves to
  // "ready" once the background job (src/app/api/circulars/process/route.ts)
  // completes, or "failed" if it hits a permanent (non-retryable) error.
  // Existing rows default to "ready" since they were already fully
  // processed under the old synchronous flow.
  @Column({ type: "varchar", length: 20, nullable: false, default: "ready" })
  status!: "processing" | "ready" | "failed";

  @Column({ type: "text", nullable: true })
  processingError?: string | null;

  // Page count, known cheaply at upload time (PDF metadata read, no OCR)
  // before background processing starts. Lets the frontend estimate how
  // long THIS document will take based on its actual size, rather than a
  // generic guess that would be wrong for anything but an average-length
  // document.
  @Column({ type: "integer", nullable: true })
  pageCount?: number | null;

  // ✅ The arrow function defers evaluation and Relation<> safely isolates TS metadata
  @OneToMany(() => CircularPage, (page) => page.circular)
  pages!: Relation<CircularPage>[];

  /**
   * One Circular tracks multiple read-confirmations from Users
   */
  @OneToMany("CircularReadStatus", "circular", { cascade: true })
  readByUsers?: any[];
}
