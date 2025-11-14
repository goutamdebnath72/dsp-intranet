// src/app/api/circulars/[id]/route.ts

import { NextResponse } from "next/server";
// ⛔️ REMOVED: import db from '@/lib/db';
// ✅ ADDED: Import the single connection function
import { getDb } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  // ✅ ADDED: Get the shared DB connection
  const db = await getDb();

  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    // 'findByPk' means "Find by Primary Key"
    // ✅ CHANGED: Use the shared db.Circular model
    const circular = await db.Circular.findByPk(id);

    if (!circular) {
      return NextResponse.json(
        { error: "Circular not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(circular);
  } catch (error) {
    console.error(`API Error fetching circular ${params.id}:`, error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
