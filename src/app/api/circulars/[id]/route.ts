import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const id = Number(params.id);
        if (isNaN(id)) {
            return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
        }

        const circular = await prisma.circular.findUnique({
            where: { id },
        });

        if (!circular) {
            return NextResponse.json({ error: 'Circular not found' }, { status: 404 });
        }

        return NextResponse.json(circular);
    } catch (error) {
        console.error(`API Error fetching circular ${params.id}:`, error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}