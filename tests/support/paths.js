// Where the extension's assets are, and what it says about itself.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXTENSION_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets');
export const METADATA = JSON.parse(readFileSync(path.join(EXTENSION_DIR, 'metadata.json'), 'utf8'));
