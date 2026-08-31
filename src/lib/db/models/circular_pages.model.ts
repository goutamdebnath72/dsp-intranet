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

  @Column({ name: "page_number" })
  pageNumber!: number;

  @Column({ name: "file_url" })
  fileUrl!: string;

  // The arrow function defers evaluation; Relation<> prevents TS metadata emission
  @ManyToOne(() => Circular, (circular) => circular.pages)
  @JoinColumn({ name: "circular_id" })
  circular!: Relation<Circular>;
}
