export interface PromptDefinition {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
}

export const prompts: PromptDefinition[] = [];

export function getPromptMessages(_name: string): Array<Record<string, unknown>> | null {
  return null;
}
