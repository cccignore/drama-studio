import { NextRequest } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/api/read-json-body";
import { AppError, ok, toJsonError } from "@/lib/api/errors";
import { createProject, listProjects } from "@/lib/drama/store";

export const runtime = "nodejs";

const CreateSchema = z.object({
  title: z.string().optional(),
});

export async function GET() {
  try {
    return ok({ items: listProjects() });
  } catch (err) {
    return toJsonError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("invalid_input", parsed.error.issues[0]?.message ?? "参数错误", 400);
    }
    const created = createProject({ title: parsed.data.title });
    return ok({ item: created }, { status: 201 });
  } catch (err) {
    return toJsonError(err);
  }
}
