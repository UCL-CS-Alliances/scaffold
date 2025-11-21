import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  const items = await prisma.testItem.findMany();
  return NextResponse.json(items);
}
