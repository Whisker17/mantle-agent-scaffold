import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLI_PATH = resolve(import.meta.dirname, "../dist/src/cli/index.js");

function run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return execFileAsync("node", [CLI_PATH, ...args], { timeout: 10000 })
    .then(({ stdout, stderr }) => ({ stdout, stderr, exitCode: 0 }))
    .catch((error: any) => ({
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      exitCode: error.code ?? 1
    }));
}

function runWithEnv(
  args: string[],
  env: Record<string, string>
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return execFileAsync("node", [CLI_PATH, ...args], {
    timeout: 10000,
    env: { ...process.env, ...env }
  })
    .then(({ stdout, stderr }) => ({ stdout, stderr, exitCode: 0 }))
    .catch((error: any) => ({
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      exitCode: error.code ?? 1
    }));
}

describe("CLI integration", () => {
  it("shows help with --help", async () => {
    const { stdout, exitCode } = await run(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("mantle-cli");
    expect(stdout).toContain("chain");
    expect(stdout).toContain("registry");
    expect(stdout).toContain("account");
    expect(stdout).toContain("token");
    expect(stdout).toContain("defi");
    expect(stdout).toContain("indexer");
    expect(stdout).toContain("diagnostics");
  });

  it("shows version with --version", async () => {
    const { stdout, exitCode } = await run(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("0.2.9");
  });

  it("chain info returns static config as JSON", async () => {
    const { stdout, exitCode } = await run(["chain", "info", "--json"]);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.chain_id).toBe(5000);
    expect(data.name).toBe("Mantle");
    expect(data.rpc_url).toBe("https://rpc.mantle.xyz");
  });

  it("chain info --network sepolia returns sepolia config", async () => {
    const { stdout, exitCode } = await run(["chain", "info", "-n", "sepolia", "--json"]);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.chain_id).toBe(5003);
    expect(data.name).toBe("Mantle Sepolia");
  });

  it("chain info human-readable output", async () => {
    const { stdout, exitCode } = await run(["chain", "info"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Chain ID");
    expect(stdout).toContain("5000");
    expect(stdout).toContain("Mantle");
  });

  it("registry resolve returns valid entry as JSON", async () => {
    const { stdout, exitCode } = await run(["registry", "resolve", "USDC", "--json"]);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.address).toBe("0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9");
    expect(data.label).toBe("USD Coin");
    expect(data.network).toBe("mainnet");
  });

  it("registry resolve unknown identifier fails", async () => {
    const { stdout, exitCode } = await run(["registry", "resolve", "NONEXISTENT_TOKEN_XYZ", "--json"]);
    expect(exitCode).not.toBe(0);
    const data = JSON.parse(stdout);
    expect(data.error).toBe(true);
    expect(data.code).toBe("ADDRESS_NOT_FOUND");
  });

  it("registry validate returns format check as JSON", async () => {
    const { stdout, exitCode } = await run([
      "registry", "validate",
      "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
      "--json"
    ]);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.valid_format).toBe(true);
    expect(data.is_zero_address).toBe(false);
  });

  it("defi subcommand help shows all commands", async () => {
    const { stdout, exitCode } = await run(["defi", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("swap-quote");
    expect(stdout).toContain("pool-liquidity");
    expect(stdout).toContain("pool-opportunities");
    expect(stdout).toContain("tvl");
    expect(stdout).toContain("lending-markets");
  });

  it("diagnostics subcommand help shows all commands", async () => {
    const { stdout, exitCode } = await run(["diagnostics", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("rpc-health");
    expect(stdout).toContain("probe");
  });

  it("rejects invalid timeout value before running command", async () => {
    const { stderr, exitCode } = await run([
      "indexer", "subgraph",
      "--endpoint", "https://127.0.0.1/graphql",
      "--query", "{ health }",
      "--timeout", "abc"
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("--timeout <ms>");
    expect(stderr).toContain("must be a valid integer");
  });

  it("disables ANSI colors when --no-color is set", async () => {
    const { stdout, exitCode } = await runWithEnv(["chain", "info", "--no-color"], {
      FORCE_COLOR: "1"
    });
    expect(exitCode).toBe(0);
    expect(stdout).not.toMatch(/\x1B\[[0-9;]*m/g);
  });
});
