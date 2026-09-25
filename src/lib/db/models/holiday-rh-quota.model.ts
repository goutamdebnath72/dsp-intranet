// src/lib/db/models/holiday-rh-quota.model.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

/**
 * Per-year, per-category Restricted Holiday quota (e.g. 2026: Category A &
 * C may take 4 RH, Category B may take 2, Category D may take 4). This is a
 * year-level policy fact, not tied to any single holiday, so it lives in its
 * own table rather than as a column on HolidayYear.
 */
@Entity({ name: "holiday_rh_quota" })
@Index(["year"])
export class HolidayRhQuota {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "integer", nullable: false })
  year!: number;

  @Column({ type: "varchar", nullable: false })
  category!: string;

  @Column({ type: "integer", nullable: false })
  quota!: number;
}
