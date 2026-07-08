#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const usage = `
Usage:
  node scripts/put-secrets.mjs --file <path> [--env <name>] [--dry-run]

Examples:
  node scripts/put-secrets.mjs --file .secrets.production.env
  node scripts/put-secrets.mjs --file .secrets.development.env --env dev
  node scripts/put-secrets.mjs --file .secrets.production.env --dry-run

Input file format:
  GOOGLE_OIDC_CLIENT_ID=...
  GOOGLE_OIDC_CLIENT_SECRET=...
  SESSION_SECRET=...
  ALLOWED_GOOGLE_EMAILS=user1@example.com,user2@example.com
`;

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.file) {
  console.log(usage.trim());
  process.exit(args.help ? 0 : 1);
}

const entries = parseEnvFile(await readFile(args.file, "utf8"));

if (entries.length === 0) {
  console.error(`No secrets found in ${args.file}`);
  process.exit(1);
}

console.log(`Reading ${entries.length} secret(s) from ${basename(args.file)}`);

for (const [key, value] of entries) {
  if (args.dryRun) {
    console.log(`[dry-run] would put ${key}${args.env ? ` to env:${args.env}` : ""}`);
    continue;
  }

  await putSecret({ key, value, env: args.env });
  console.log(`Put ${key}${args.env ? ` to env:${args.env}` : ""}`);
}

function parseArgs(rawArgs) {
  const parsed = {
    dryRun: false,
    env: undefined,
    file: undefined,
    help: false,
  };

  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--env" || arg === "-e") {
      parsed.env = requireNextValue(rawArgs, ++i, arg);
    } else if (arg === "--file" || arg === "-f") {
      parsed.file = requireNextValue(rawArgs, ++i, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function requireNextValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseEnvFile(input) {
  const entries = [];

  for (const [index, rawLine] of input.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid env line ${index + 1}: expected KEY=value`);
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    const value = unquote(normalizedLine.slice(separatorIndex + 1).trim());
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      throw new Error(`Invalid secret key on line ${index + 1}: ${key}`);
    }

    entries.push([key, value]);
  }

  return entries;
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function putSecret({ key, value, env }) {
  const args = ["wrangler@latest", "secret", "put", key];
  if (env) {
    args.push("--env", env);
  }

  await run("npx", args, `${value}\n`);
}

function run(command, args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "inherit", "inherit"],
    });

    child.stdin.end(stdin);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
      }
    });
  });
}
