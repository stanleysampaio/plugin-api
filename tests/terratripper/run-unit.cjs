// Empacota unit.tsx com o esbuild do TerraPlanner e executa no Node.
const path = require('path');
const { execFileSync } = require('child_process');
const TERRAPLANNER = process.env.TERRAPLANNER_DIR || path.resolve(__dirname, '../../../terraplanner');
const nm = path.join(TERRAPLANNER, 'node_modules');
const out = path.join(require('os').tmpdir(), 'terratripper-unit.cjs');
execFileSync(path.join(nm, '.bin/esbuild'), [
  path.join(__dirname, 'unit.tsx'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${out}`, '--log-level=warning',
  `--alias:react=${path.join(nm, 'react')}`, `--alias:react-dom=${path.join(nm, 'react-dom')}`,
], { stdio: 'inherit' });
execFileSync(process.execPath, [out], { stdio: 'inherit' });
