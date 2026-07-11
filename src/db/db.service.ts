import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// Never instantiated directly — DbModule provides the real drizzle instance
// under this class token. Extending NodePgDatabase gives us its full typed API.
export class DbService extends NodePgDatabase<typeof schema> {}
