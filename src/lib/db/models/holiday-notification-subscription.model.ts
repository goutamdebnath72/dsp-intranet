// src/lib/db/models/holiday-notification-subscription.model.ts
import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, ValueTransformer } from "typeorm";
import { DateTime } from "luxon";

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

/**
 * One row per subscribed user. Absence of a row means "never registered" --
 * distinct from `suppressAfterFirstView` being true with the notification
 * already seen, which means "registered, but currently muted." Deleting
 * this row IS the "complete unsubscribe" -- there is deliberately no
 * separate "subscribed: false" flag left behind, so re-registering later
 * starts fresh rather than silently reactivating old preferences.
 */
@Entity({ name: "holidaynotificationsubscription" })
export class HolidayNotificationSubscription {
  @PrimaryColumn({ type: "varchar" })
  id!: string;

  @Column({ type: "varchar", name: "userId", unique: true, nullable: false })
  userId!: string;

  // Default false: per the explicit instruction, the DEFAULT behaviour is
  // to show the notification at every fresh login. Turning this on is an
  // opt-in "only show me this once" preference, not the default.
  @Column({ type: "boolean", name: "suppressAfterFirstView", default: false })
  suppressAfterFirstView!: boolean;

  // Only meaningful when suppressAfterFirstView is true -- tracks whether
  // the one allowed showing has already happened, so it isn't shown again
  // on subsequent logins.
  @Column({ type: "boolean", name: "hasSeenFirstNotification", default: false })
  hasSeenFirstNotification!: boolean;

  @Column({
    type: "timestamp with time zone",
    name: "createdAt",
    default: () => "CURRENT_TIMESTAMP",
    transformer: LuxonDateTimeTransformer,
    nullable: false,
  })
  createdAt!: DateTime;

  @Column({
    type: "timestamp with time zone",
    name: "updatedAt",
    default: () => "CURRENT_TIMESTAMP",
    transformer: LuxonDateTimeTransformer,
    nullable: false,
  })
  updatedAt!: DateTime;

  @ManyToOne("User", { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user?: any;
}
