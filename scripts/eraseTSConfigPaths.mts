#!/usr/bin/env -vS node --import=tsx/esm

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tsConfigPath = path.join(__dirname, '..', 'tsconfig.json');

const eraseTSConfigPaths = async () => {
	const tsConfig = await fs.readFile(tsConfigPath, 'utf-8');

	const tsConfigJson = JSON.parse(tsConfig);

	delete tsConfigJson.compilerOptions.paths;
	await fs.writeFile(tsConfigPath, JSON.stringify(tsConfigJson, null, 2));
};

eraseTSConfigPaths();
