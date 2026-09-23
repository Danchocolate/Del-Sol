import { describe, expect, it } from 'vitest';
import { runtimeDatabaseUrl } from '../../apps/api/src/lib/database-url.js';

describe('serverless database URL', () => {
  const pooled =
    'postgresql://postgres.project:demo@aws-0-region.pooler.supabase.com:6543/postgres';

  it('configures Supabase transaction pooling for Prisma', () => {
    const url = new URL(runtimeDatabaseUrl(pooled, true));
    expect(url.searchParams.get('pgbouncer')).toBe('true');
    expect(url.searchParams.get('connection_limit')).toBe('1');
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.password).toBe('demo');
  });

  it('preserves explicit pool and SSL settings', () => {
    const url = new URL(
      runtimeDatabaseUrl(`${pooled}?connection_limit=2&sslmode=verify-full`, true),
    );
    expect(url.searchParams.get('connection_limit')).toBe('2');
    expect(url.searchParams.get('sslmode')).toBe('verify-full');
    expect(url.searchParams.get('pgbouncer')).toBe('true');
  });

  it('does not alter local or non-transaction connections', () => {
    expect(runtimeDatabaseUrl(pooled, false)).toBe(pooled);
    expect(runtimeDatabaseUrl(pooled.replace(':6543/', ':5432/'), true)).toBe(
      pooled.replace(':6543/', ':5432/'),
    );
  });
});
