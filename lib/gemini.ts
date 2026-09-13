/**
 * Shared Gemini types. All Gemini API logic lives in lib/llm.ts.
 */

export type FunctionDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};
