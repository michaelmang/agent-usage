import { homedir } from 'node:os';
import { join } from 'node:path';

export const DATA_DIR = join(homedir(), '.local', 'share', 'agent-usage');
export const SNAPSHOT_DIR = join(DATA_DIR, 'snapshots');
