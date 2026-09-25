// src/lib/db/models/holiday-year.model.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  ValueTransformer,
} from "typeorm";
import { DateTime } from "luxon";
import { HolidayType } from "./holiday-master.model";

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

@Entity({ name: "holidayyear" })
@Index(["year"])
export class HolidayYear {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({
    type: "timestamp",
    nullable: false,
    transformer: LuxonDateTimeTransformer,
  })
  date!: DateTime;

  @Column({ type: "integer", nullable: false })
  year!: number;

  @Column({
    type: "enum",
    enum: HolidayType,
    name: "holidayType",
    nullable: false,
  })
  holidayType!: HolidayType;

  @Column({ type: "integer", name: "holidayMasterId", nullable: false })
  holidayMasterId!: number;

  // Which employee categories this specific FH instance applies to (e.g.
  // "A,B" or "B"). Only meaningful for FH rows — null for CH (applies to
  // everyone) and RH (categories' entitlement there is a quota, not a
  // per-holiday fact — see the separate holiday_rh_quota table).
  @Column({ type: "varchar", nullable: true })
  categories?: string | null;

  // Free-text annotation for anything noteworthy about THIS YEAR'S instance
  // of a holiday. Currently used for one-off conditional reclassifications:
  // e.g. 2024's circular additionally counts Ram Navami (normally an RH) as
  // a Festival Holiday for Category B only, because Vijaya Dashami fell on
  // their 2nd Saturday off-day that year, to keep their FH total at 18;
  // 2026's circular does the same thing with Bengali New Year's Day instead,
  // for the same reason (SAIL Foundation Day falling on a 4th Saturday).
  // Represented as a SECOND holidayyear row for the same holidayMasterId
  // and year, with holidayType = FH and this note explaining why -- the
  // existing RH row for that same master/year is untouched. Null for
  // ordinary rows.
  @Column({ type: "varchar", nullable: true })
  note?: string | null;

  // ==========================================
  //               RELATIONSHIPS
  // ==========================================

  @ManyToOne("HolidayMaster", "years", { onDelete: "CASCADE" })
  @JoinColumn({ name: "holidayMasterId" })
  holidayMaster?: any;
}
