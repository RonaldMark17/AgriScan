import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(frontendRoot, '..');
const backendRoot = path.join(repoRoot, 'backend');
const exportScript = path.join(backendRoot, 'app', 'ml', 'export_visual_memory_runtime.py');
const runtimeSource = path.join(backendRoot, 'app', 'ml', 'artifacts', 'visual_memory_runtime.json');
const runtimeTarget = path.join(frontendRoot, 'src', 'data', 'visualMemoryRuntime.json');

function runPythonExport() {
  const candidates = [
    process.env.PYTHON ? { command: process.env.PYTHON, args: [exportScript] } : null,
    { command: 'python', args: [exportScript] },
    { command: 'py', args: ['-3', exportScript] },
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.status === 0) return;
    if (result.error?.code === 'ENOENT') continue;
    const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    throw new Error(output || `Visual-memory export failed with ${candidate.command}.`);
  }

  throw new Error('Python was not found. Set the PYTHON environment variable or install Python.');
}

function syncRuntime() {
  if (!existsSync(exportScript)) {
    throw new Error(`Visual-memory export script not found at ${exportScript}`);
  }

  let exportError = null;
  try {
    runPythonExport();
  } catch (error) {
    exportError = error;
  }

  if (existsSync(runtimeSource)) {
    mkdirSync(path.dirname(runtimeTarget), { recursive: true });
    copyFileSync(runtimeSource, runtimeTarget);
    console.log(`Synced visual-memory runtime to ${runtimeTarget}`);
    return;
  }

  if (existsSync(runtimeTarget)) {
    if (exportError) {
      console.warn(`Using existing visual-memory runtime snapshot because export was unavailable: ${exportError.message}`);
    } else {
      console.log(`Using existing visual-memory runtime snapshot at ${runtimeTarget}`);
    }
    return;
  }

  if (exportError) {
    throw exportError;
  }
  throw new Error(`Visual-memory runtime was not generated at ${runtimeSource}`);
}

syncRuntime();
