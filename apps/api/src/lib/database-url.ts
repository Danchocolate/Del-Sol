export function runtimeDatabaseUrl(value: string, isVercel: boolean): string {
  if (!isVercel) return value;
  const url = new URL(value);
  if (!url.hostname.endsWith('.pooler.supabase.com') || url.port !== '6543') return value;

  // Supabase's transaction pooler cannot use Prisma's prepared statements.
  // Limit each serverless instance to one connection to avoid exhausting the pool.
  url.searchParams.set('pgbouncer', 'true');
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
  return url.toString();
}
