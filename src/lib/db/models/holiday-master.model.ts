// src/lib/db/models/holiday-master.model.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm";

// Define the enum for HolidayType exactly matching your application and database specifications
export enum HolidayType {
  CH = "CH", // Compensated Holiday
  FH = "FH", // Festival Holiday
  RH = "RH", // Restricted Holiday
}

@Entity({ name: "holidaymaster" })
export class HolidayMaster {
  @PrimaryGeneratedColumn({ type: "integer" })
  id!: number;

  @Column({ type: "varchar", unique: true, nullable: false })
  name!: string;

  // Alternate spellings for the same holiday, e.g. "Doljatra" (this row,
  // FH-typed) carries alias "Dol Yatra" (the separate RH-typed master row's
  // own name). A search for either spelling should find this row. Nullable/
  // empty for the common case of no known alternate spelling.
  @Column({
    type: "text",
    array: true,
    nullable: true,
    default: () => "'{}'",
  })
  aliases!: string[];

  @Column({
    type: "enum",
    enum: HolidayType,
    nullable: false,
  })
  type!: HolidayType;

  // ==========================================
  //               RELATIONSHIPS
  // ==========================================

  /**
   * One HolidayMaster definition maps to many calendar year entries (HolidayYear)
   * Handles Cascade deletions safely if a master definition is pruned
   */
  @OneToMany("HolidayYear", "holidayMaster")
  years?: any[];
}
