import { readSkillFile } from "./skill";
import { profileToText, type ProfileInput } from "./profile";

function cycleContext(now = new Date()): string {
  const y = now.getFullYear();
  return now.getMonth() >= 7
    ? `${y}–${y + 1} application cycle`
    : `${y - 1}–${y} application cycle`;
}

/** Assembles the agent's full system prompt: skill file + runtime context + profile. */
export async function buildSystemPrompt(profile: ProfileInput | null): Promise<string> {
  const skill = await readSkillFile();
  const today = new Date().toISOString().slice(0, 10);
  return [
    skill,
    "",
    "───── RUNTIME CONTEXT (added by Dr Scholar app) ─────",
    `CURRENT DATE: ${today} (UTC). ${cycleContext()}.`,
    "Only recommend opportunities that are currently open or have a deadline in the future relative to CURRENT DATE. If you cannot confirm a deadline, mark it 'unverified — check the page'.",
    "Budget guard: serverless reply hard-cap is ~280 seconds. Keep total research under 4 minutes.",
    "",
    "───── STUDENT PROFILE (source of truth for personalization) ─────",
    profileToText(profile),
  ].join("\n");
}
