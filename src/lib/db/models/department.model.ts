// src/lib/db/models/department.model.ts
import { Entity, PrimaryColumn, Column, OneToMany } from "typeorm";

@Entity({ name: "departments" })
export class Department {
  @PrimaryColumn({ type: "varchar" })
  id!: string;

  @Column({ type: "integer", unique: true, nullable: false })
  code!: number;

  @Column({ type: "varchar", nullable: false })
  name!: string;

  // ==========================================
  //               RELATIONSHIPS
  // ==========================================

  @OneToMany("User", "department")
  users?: any[];
}
