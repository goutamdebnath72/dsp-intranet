// src/lib/db/models/account.model.ts
import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";

@Entity({ name: "account" })
@Index(["provider", "providerAccountId"], { unique: true })
export class Account {
  @PrimaryColumn({ type: "varchar" })
  id!: string;

  @Column({ type: "varchar", name: "userId" })
  userId!: string;

  @Column({ type: "varchar" })
  type!: string;

  @Column({ type: "varchar" })
  provider!: string;

  @Column({ type: "varchar", name: "providerAccountId" })
  providerAccountId!: string;

  @Column({ type: "varchar", nullable: true, name: "refresh_token" })
  refresh_token?: string;

  @Column({ type: "varchar", nullable: true, name: "access_token" })
  access_token?: string;

  @Column({ type: "integer", nullable: true, name: "expires_at" })
  expires_at?: number;

  @Column({ type: "varchar", nullable: true, name: "token_type" })
  token_type?: string;

  @Column({ type: "varchar", nullable: true })
  scope?: string;

  @Column({ type: "varchar", nullable: true, name: "id_token" })
  id_token?: string;

  @Column({ type: "varchar", nullable: true, name: "session_state" })
  session_state?: string;

  // ==========================================
  //               RELATIONSHIPS
  // ==========================================

  @ManyToOne("User", "accounts", { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user?: any;
}
