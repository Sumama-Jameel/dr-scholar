import { readSkillFile } from "@/lib/skill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ skill: await readSkillFile() });
}
