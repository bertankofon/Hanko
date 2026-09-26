import {resolve} from 'node:path';
import {config as loadEnv} from 'dotenv';
import type {NextConfig} from 'next';

// The repo keeps a single .env at the root (CLAUDE.md §5), but Next only looks
// inside app/. Load the root file here so the CLI and the UI share one source.
loadEnv({path: resolve(process.cwd(), '..', '.env'), quiet: true});

const config: NextConfig = {
  // @hanko/verify ships TypeScript source so the CLI and the System tab run the
  // exact same check definitions.
  transpilePackages: ['@hanko/verify'],
};

export default config;
