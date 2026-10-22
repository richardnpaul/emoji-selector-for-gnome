// Usage: node scripts/check-shexli.mjs <extension zip or directory>
import { main } from './lib/shexli.mjs';

process.exitCode = main(process.argv.slice(2));
