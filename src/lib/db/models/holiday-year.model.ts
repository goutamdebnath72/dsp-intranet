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

  // ==========================================
  //               RELATIONSHIPS
  // ==========================================

  @ManyToOne("HolidayMaster", "years", { onDelete: "CASCADE" })
  @JoinColumn({ name: "holidayMasterId" })
  holidayMaster?: any;
}
