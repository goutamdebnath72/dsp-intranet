// src/app/api/circulars/[id]/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { Circular } from "@/lib/db/models/circular.model";
import { DateTime } from "luxon";
import { EDIT_DELETE_WINDOW_HOURS } from "@/lib/constants";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(request: Request, context: RouteContext) {
  const dataSource = await getDb();
  const { params } = context;

  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const circularRepository = dataSource.getRepository(Circular);
    const circular = await circularRepository.findOne({ where: { id } });

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

export async function PATCH(request: Request, context: RouteContext) {
  const { params } = context;
  const circularId = parseInt(params.id, 10);
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  const ticketNo = (session?.user as any)?.ticketNo || "";
  if (!ticketNo.startsWith("4")) {
    return NextResponse.json(
      { error: "Forbidden: Executive access required" },
      { status: 403 },
    );
  }

  try {
    const dataSource = await getDb();
    const circularRepo = dataSource.getRepository(Circular);
    const circular = await circularRepo.findOne({ where: { id: circularId } });

    if (!circular)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (circular.authorTicketNo !== ticketNo) {
      return NextResponse.json(
        { error: "Forbidden: You are not the author" },
        { status: 403 },
      );
    }

    const now = DateTime.now();
    const diff = now.diff(circular.publishedAt || now, "hours").hours;
    if (diff > EDIT_DELETE_WINDOW_HOURS) {
      return NextResponse.json(
        { error: "Modification window expired" },
        { status: 403 },
      );
    }

    const { headline, fileUrls } = await request.json();
    circular.headline = headline || circular.headline;
    circular.fileUrls = fileUrls !== undefined ? fileUrls : circular.fileUrls;

    await circularRepo.save(circular);
    return NextResponse.json(circular);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { params } = context;
  const circularId = parseInt(params.id, 10);
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);

  const ticketNo = (session?.user as any)?.ticketNo || "";
  if (!ticketNo.startsWith("4")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const dataSource = await getDb();
    const circularRepo = dataSource.getRepository(Circular);
    const circular = await circularRepo.findOne({ where: { id: circularId } });

    if (!circular)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (circular.authorTicketNo !== ticketNo) {
      return NextResponse.json(
        { error: "Forbidden: Not author" },
        { status: 403 },
      );
    }

    const now = DateTime.now();
    const diff = now.diff(circular.publishedAt || now, "hours").hours;
    if (diff > EDIT_DELETE_WINDOW_HOURS) {
      return NextResponse.json(
        { error: "Deletion window expired" },
        { status: 403 },
      );
    }

    await circularRepo.remove(circular);
    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
