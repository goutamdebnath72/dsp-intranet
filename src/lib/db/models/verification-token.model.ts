// src/lib/db/models/verification-token.model.ts
import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
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

@Entity({ name: "verificationtoken" })
@Index(["identifier", "token"], { unique: true })
export class VerificationToken {
  @PrimaryColumn({ type: "varchar" })
  token!: string;

  @Column({ type: "varchar", nullable: false })
  identifier!: string;

  @Column({
    type: "timestamp with time zone",
    nullable: false,
    transformer: LuxonDateTimeTransformer,
  })
  expires!: DateTime;
}
