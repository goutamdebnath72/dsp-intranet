// src/app/api/circulars/[id]/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Circular } from "@/lib/db/models/circular.model";

type RouteContext = {
  params: {
    id: string;
  };
};

/**
 * GET: Fetch a single circular by its primary key ID
 * Replaces legacy Sequelize findByPk with TypeORM findOne repository pattern.
 */
export async function GET(request: Request, context: RouteContext) {
  const dataSource = await getDb();
  const { params } = context;

  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    // Target the strictly typed TypeORM circular entity repository
    const circularRepository = dataSource.getRepository<Circular>("Circular");
    const circular = await circularRepository.findOne({
      where: { id },
    });

    if (!circular) {
      return NextResponse.json(
        { error: "Circular not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(circular);
  } catch (error) {
    console.error(`API Error fetching circular ${params.id}:`, error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
