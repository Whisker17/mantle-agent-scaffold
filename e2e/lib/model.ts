import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type E2ELlmProvider = "openai" | "anthropic" | "openrouter";

export interface E2EConfig {
  provider: E2ELlmProvider;
  apiKey: string;
  modelName: string;
  timeoutMs: number;
  maxRetries: number;
  openRouterSiteUrl?: string;
  openRouterAppName?: string;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

export function hasRequiredLlmConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.E2E_LLM_PROVIDER && env.E2E_LLM_API_KEY);
}

export function resolveE2EConfig(env: NodeJS.ProcessEnv = process.env): E2EConfig {
  const providerInput = env.E2E_LLM_PROVIDER;
  const apiKey = env.E2E_LLM_API_KEY;

  if (!providerInput || !apiKey) {
    throw new Error("E2E_LLM_PROVIDER and E2E_LLM_API_KEY are required.");
  }

  const provider = providerInput.toLowerCase();
  if (provider !== "openai" && provider !== "anthropic" && provider !== "openrouter") {
    throw new Error(`Unsupported E2E_LLM_PROVIDER: ${providerInput}`);
  }

  let defaultModel = "gpt-4o";
  if (provider === "anthropic") {
    defaultModel = "claude-sonnet-4-20250514";
  } else if (provider === "openrouter") {
    defaultModel = "openai/gpt-4o-mini";
  }

  const modelName = env.E2E_LLM_MODEL ?? defaultModel;

  return {
    provider,
    apiKey,
    modelName,
    timeoutMs: parsePositiveInteger(env.E2E_TIMEOUT_MS, 30000),
    maxRetries: parseNonNegativeInteger(env.E2E_MAX_RETRIES, 2),
    openRouterSiteUrl: env.E2E_OPENROUTER_SITE_URL,
    openRouterAppName: env.E2E_OPENROUTER_APP_NAME
  };
}

export function resolveE2EModel(config: E2EConfig): LanguageModel {
  if (config.provider === "openai") {
    return createOpenAI({ apiKey: config.apiKey })(config.modelName);
  }

  if (config.provider === "openrouter") {
    const headers: Record<string, string> = {};
    if (config.openRouterSiteUrl) {
      headers["HTTP-Referer"] = config.openRouterSiteUrl;
    }
    if (config.openRouterAppName) {
      headers["X-Title"] = config.openRouterAppName;
    }

    return createOpenAI({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: config.apiKey,
      headers
    })(config.modelName);
  }

  return createAnthropic({ apiKey: config.apiKey })(config.modelName);
}
