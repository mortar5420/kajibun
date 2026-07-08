import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const env = getOption(args, '--env');
const dryRun = args.includes('--dry-run');
const skipPreflight = args.includes('--skip-preflight');
const skipBuild = args.includes('--skip-build');
const help = args.includes('--help') || args.includes('-h');
const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptDir, '..');
const uiDir = resolve(apiDir, '../kajibun-ui');

if (help || !env || !['dev', 'prod'].includes(env)) {
  printUsage();
  process.exit(help ? 0 : 1);
}

const wranglerEnv = env === 'prod' ? '' : env;
const targetName = env === 'prod' ? 'kajibun' : 'kajibun-dev';

console.log(`Deploy target: ${targetName}`);

if (!skipBuild) {
  runCommand('bun', ['run', 'build'], {
    cwd: uiDir,
    env: {
      ...process.env,
      VITE_API_BASE_URL: '/api',
    },
  });
}

if (!skipPreflight) {
  runWrangler(['deploy', `--env=${wranglerEnv}`, '--dry-run']);
}

if (dryRun) {
  console.log('Dry run completed. No deployment was published.');
  process.exit(0);
}

runWrangler(['deploy', `--env=${wranglerEnv}`]);

function getOption(values, name) {
  const equalsValue = values.find((value) => value.startsWith(`${name}=`));
  if (equalsValue) {
    return equalsValue.slice(name.length + 1);
  }

  const index = values.indexOf(name);
  if (index >= 0) {
    return values[index + 1];
  }

  return undefined;
}

function runWrangler(wranglerArgs) {
  runCommand('bunx', ['wrangler', ...wranglerArgs], {
    cwd: apiDir,
  });
}

function runCommand(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function printUsage() {
  console.log(`Usage:
  npm run deploy:dev
  npm run deploy:prod
  npm run deploy -- --env dev [--dry-run] [--skip-build] [--skip-preflight]
  npm run deploy -- --env prod [--dry-run] [--skip-build] [--skip-preflight]

Options:
  --env dev|prod       Required deployment target.
  --dry-run            Build UI and run Wrangler dry-run only.
  --skip-build         Skip UI build before deploy.
  --skip-preflight     Skip the automatic dry-run before deploy.
`);
}
