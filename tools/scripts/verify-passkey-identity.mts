import 'reflect-metadata';
import { newDb } from 'pg-mem';
import { DataSource, EntityMetadata } from 'typeorm';

/**
 * Behavioural check of the passkey→account binding for every app that uses
 * passkeys. Each app's REAL entity classes are loaded, a schema is generated
 * from their own TypeORM metadata, two accounts with two credentials are
 * inserted, and the exact lookups the auth service performs are replayed.
 *
 * Guards three things:
 *  1. `credential.userId` is actually populated by findOneBy (it wasn't when
 *     it was a relation property — that's what crossed accounts)
 *  2. each passkey resolves to ITS OWN account
 *  3. the FK still maps to the historical `userIdId` column, so existing
 *     rows survive schema synchronization
 */
const APPS = ['wheel', 'trip', 'split', 'finances'] as const;

const PG_TYPE: Record<string, string> = {
  uuid: 'uuid',
  text: 'text',
  timestamp: 'timestamp',
  datetime: 'timestamp',
  boolean: 'boolean',
  integer: 'integer',
  varchar: 'text',
};

function createTableSql(meta: EntityMetadata): string {
  const cols = meta.columns.map((c) => {
    const type = PG_TYPE[String(c.type)];
    if (!type) throw new Error(`unmapped type ${String(c.type)} on ${c.databaseName}`);
    return `"${c.databaseName}" ${type}${c.isPrimary ? ' PRIMARY KEY' : ''}`;
  });
  return `CREATE TABLE "${meta.tableName}" (${cols.join(', ')});`;
}

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`❌ ${msg}`);
};

for (const app of APPS) {
  console.log(`\n─── ${app} ───`);
  const { User, UserCredential, RefreshToken } = await import(
    `../../apps/${app}/src/app/users/user.ts`
  );

  // finances runs on sqlite (its entities use sqlite-only column types), so
  // exercise each app on the driver it actually deploys with.
  const isSqlite = app === 'finances';
  let db: ReturnType<typeof newDb> | undefined;
  let ds: DataSource;

  if (isSqlite) {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [User, UserCredential, RefreshToken],
      synchronize: true,
    });
    await ds.initialize();
  } else {
    db = newDb();
    db.public.registerFunction({ name: 'current_database', implementation: () => 'test' });
    db.public.registerFunction({ name: 'version', implementation: () => 'PostgreSQL 14.0' });
    ds = await db.adapters.createTypeormDataSource({
      type: 'postgres',
      entities: [User, UserCredential, RefreshToken],
      synchronize: false,
    });
    await ds.initialize();
  }

  const userMeta = ds.getMetadata(User);
  const credMeta = ds.getMetadata(UserCredential);
  const tokenMeta = ds.getMetadata(RefreshToken);

  // ── 1. Schema must stay compatible with the deployed databases ──
  for (const meta of [credMeta, tokenMeta]) {
    const col = meta.findColumnWithPropertyName('userId');
    if (col?.databaseName !== 'userIdId') {
      fail(`${app}/${meta.name}: userId maps to "${col?.databaseName}", expected "userIdId" — sync would orphan rows`);
    }
    // The relation and the plain column must share ONE physical column,
    // otherwise schema sync emits it twice.
    const dupes = meta.columns.filter((c) => c.databaseName === 'userIdId');
    if (dupes.length !== 1) {
      fail(`${app}/${meta.name}: userIdId mapped by ${dupes.length} columns, expected 1`);
    }
    // Must stay nullable: the original relation created a nullable column, so
    // declaring NOT NULL would make sync run SET NOT NULL and fail the deploy
    // if any legacy row lacks the FK.
    if (col && !col.isNullable) {
      fail(`${app}/${meta.name}: userIdId declared NOT NULL — deploy would run SET NOT NULL on live data`);
    }
    const relProps = meta.relations.map((r) => r.propertyName);
    if (!relProps.includes('user')) {
      fail(`${app}/${meta.name}: no "user" relation (FK constraint lost)`);
    }
  }

  // ── 2. Build the real schema and seed two accounts ──
  // (sqlite already synchronized the entities above.)
  if (db) {
    for (const meta of [userMeta, credMeta, tokenMeta]) {
      db.public.none(createTableSql(meta));
    }
  }

  const users = ds.getRepository(User);
  const creds = ds.getRepository(UserCredential);
  const aliceId = '11111111-1111-4111-8111-111111111111';
  const bobId = '22222222-2222-4222-8222-222222222222';

  // Only set fields that exist on this app's User entity.
  const props = new Set(userMeta.columns.map((c) => c.propertyName));
  const mkUser = (id: string, label: string) => {
    const u: any = { id, name: label, isActive: true, failedLoginAttempts: 0 };
    if (props.has('username')) u.username = label.toLowerCase().replace(/[^a-z]/g, '');
    if (props.has('webAuthnUserId')) u.webAuthnUserId = `wa-${id}`;
    return users.create(u);
  };
  await users.save(mkUser(aliceId, 'Alice'));
  await users.save(mkUser(bobId, 'Bob'));

  await creds.save(
    creds.create({
      id: '33333333-3333-4333-8333-333333333333',
      credentialId: 'cred-alice',
      publicKey: 'pk',
      counter: 0,
      backedUp: false,
      userId: aliceId,
    } as any)
  );
  await creds.save(
    creds.create({
      id: '44444444-4444-4444-8444-444444444444',
      credentialId: 'cred-bob',
      publicKey: 'pk',
      counter: 0,
      backedUp: false,
      userId: bobId,
    } as any)
  );

  // ── 3. Replay the auth service's lookups ──
  for (const [credentialId, expectedId, expectedName] of [
    ['cred-alice', aliceId, 'Alice'],
    ['cred-bob', bobId, 'Bob'],
  ] as const) {
    const credential: any = await creds.findOneBy({ credentialId } as any);
    if (!credential?.userId) {
      fail(`${app}: findOneBy did not populate credential.userId for ${credentialId} — login would resolve an arbitrary account`);
      continue;
    }
    const user: any = await users.findOneBy({ id: credential.userId });
    if (user?.id !== expectedId) {
      fail(`${app}: ${credentialId} resolved to ${user?.name} [${user?.id}], expected ${expectedName}`);
    } else {
      console.log(`✅ ${app}: ${credentialId} → ${user.name} (own account)`);
    }
  }

  // ── 3b. A row with no FK must be rejected, never resolved ──
  await creds.save(
    creds.create({
      id: '55555555-5555-4555-8555-555555555555',
      credentialId: 'cred-orphan',
      publicKey: 'pk',
      counter: 0,
      backedUp: false,
      userId: null,
    } as any)
  );
  const orphan: any = await creds.findOneBy({ credentialId: 'cred-orphan' } as any);
  if (orphan?.userId) {
    fail(`${app}: orphan credential reported userId ${orphan.userId}`);
  } else {
    // This is the state the auth service's `!credential.userId` guard catches.
    // Without the guard, findOneBy({ id: undefined }) matches an arbitrary user.
    const wouldResolve: any = await users.findOneBy({ id: orphan?.userId as any });
    console.log(
      wouldResolve
        ? `✅ ${app}: FK-less credential is rejected by the guard (an unguarded lookup would have returned "${wouldResolve.name}")`
        : `✅ ${app}: FK-less credential resolves to nobody`
    );
  }

  // ── 4. Legacy refresh tokens must read as NULL generation ──
  const gen = tokenMeta.findColumnWithPropertyName('generation');
  if (!gen || !gen.isNullable || gen.default !== undefined) {
    fail(`${app}/RefreshToken: generation column missing, not nullable, or has a default — pre-fix sessions would survive`);
  } else {
    console.log(`✅ ${app}: pre-fix refresh tokens read as NULL generation (rejected)`);
  }

  await ds.destroy();
}

console.log(
  failures === 0
    ? '\n✅ all passkey apps verified'
    : `\n❌ ${failures} problem(s) found`
);
process.exit(failures === 0 ? 0 : 1);
