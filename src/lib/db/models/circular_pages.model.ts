// src/lib/db/models/circular_pages.model.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Circular } from "./circular.model";

@Entity({ name: "circular_pages" })
export class CircularPage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "integer", name: "page_number" })
  pageNumber!: number;

  @Column({ type: "varchar", name: "file_url" })
  fileUrl!: string;

  // I use the arrow function to defer evaluation; Relation<> prevents TS metadata emission
  @ManyToOne(() => Circular, (circular) => circular.pages)
  @JoinColumn({ name: "circular_id" })
  circular!: Relation<Circular>;
}
