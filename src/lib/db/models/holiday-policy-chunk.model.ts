// src/lib/db/models/holiday-policy-chunk.model.ts
import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from "typeorm";

/**
 * A chunk of holiday-related free-text content for semantic search --
 * either a year-wide policy paragraph (RH deadline, compensatory off,
 * proportionate RH for new joiners) or a specific holiday's reclassification
 * note. Distinct from holidaymaster/holidayyear (structured calendar data)
 * and from circular_chunks (excerpts of a specific document): this
 * content's lifecycle is tied to the calendar YEAR, not to whether a
 * source circular still exists. See src/lib/holidays/extraction.ts's
 * header comment and src/lib/holidays/policyChunks.ts for the reasoning
 * and the generation pipeline.
 */
@Entity({ name: "holiday_policy_chunks" })
@Index(["year"])
export class HolidayPolicyChunk {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "integer", nullable: false })
  year!: number;

  @Column({ type: "varchar", nullable: false, name: "source_type" })
  sourceType!: "policyNote" | "reclassification";

  @Column({ type: "varchar", nullable: true })
  topic!: string | null;

  @Column({ type: "varchar", nullable: true, name: "holiday_name" })
  holidayName!: string | null;

  @Column({ type: "text", nullable: false })
  text!: string;

  @Column({ type: "vector", nullable: true })
  embedding!: any;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;
}
