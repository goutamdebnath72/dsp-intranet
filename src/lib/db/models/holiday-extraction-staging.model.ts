// src/lib/db/models/holiday-extraction-staging.model.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

export type HolidayExtractionStatus = "pending" | "confirmed" | "rejected";

/** One extracted holiday entry, staged before being written to
 *  holidaymaster/holidayyear. Mirrors the target tables' shape closely so
 *  confirming a staged row is a near-direct copy, not a transformation. */
export interface StagedHolidayEntry {
  name: string; // resolved to an EXISTING holidaymaster.name/alias if one
  // matched (type-scoped); otherwise the raw extracted name, to be created
  // fresh on confirm.
  matchedMasterId: number | null; // null => a new HolidayMaster will be
  // created on confirm; non-null => reuse this existing master's id.
  isNewMaster: boolean;
  // Set when this entry matched an existing master via NEAR-MISS detection
  // (character-level similarity, e.g. "Doljatra" vs "Dol Yatra"), not an
  // exact match -- holds the raw extracted spelling, to be added to the
  // matched master's aliases array on confirm. Null for exact matches and
  // brand-new masters alike.
  newAlias: string | null;
  date: string; // ISO yyyy-mm-dd
  type: "CH" | "FH" | "RH";
  categories: string | null; // e.g. "A,B" -- FH rows only
  note: string | null; // one-off reclassification reason, or null
}

export interface StagedRhQuota {
  category: string;
  quota: number;
}

export interface HolidayExtractionPayload {
  holidays: StagedHolidayEntry[];
  rhQuota: StagedRhQuota[];
  /** Deterministic, code-level sanity-check messages (not from the LLM) --
   *  e.g. a suspiciously low RH count, which is a confirmed real failure
   *  mode (OCR silently dropping trailing rows of a long table). Empty when
   *  nothing looks off. Shown prominently in the admin review panel so a
   *  gap is caught by the system itself rather than requiring the reviewer
   *  to manually diff against the source PDF. */
  warnings: string[];
}

/**
 * Holds the AI-extracted holiday data for one circular/year, staged for an
 * admin to review before it's written to holidaymaster/holidayyear. Nothing
 * touches the real tables until a staged row is explicitly confirmed.
 */
@Entity({ name: "holiday_extraction_staging" })
@Index(["status"])
export class HolidayExtractionStaging {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "integer", name: "circular_id", nullable: false })
  circularId!: number;

  @Column({ type: "integer", nullable: false })
  year!: number;

  @Column({ type: "varchar", nullable: false, default: "pending" })
  status!: HolidayExtractionStatus;

  @Column({ type: "jsonb", nullable: false })
  payload!: HolidayExtractionPayload;

  @Column({ type: "timestamp", name: "created_at", nullable: false })
  createdAt!: Date;

  @Column({ type: "varchar", name: "reviewed_by", nullable: true })
  reviewedBy?: string | null;

  @Column({ type: "timestamp", name: "reviewed_at", nullable: true })
  reviewedAt?: Date | null;
}
