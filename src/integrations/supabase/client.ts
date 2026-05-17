/**
 * SHIM del cliente Supabase que enruta todas las queries por normi-server.
 *
 * EXPONE LA MISMA API que el cliente JS oficial de Supabase para que las ~70
 * páginas del frontend no necesiten cambios. Por debajo, cada operación se
 * convierte en una petición HTTP a normi-server, que valida JWT, autoriza
 * por rol y ejecuta la query con service_role_key.
 *
 * RESULTADO DE SEGURIDAD:
 *  - El frontend NO tiene la anon key de Supabase.
 *  - Toda operación va con JWT (si no hay token, 401).
 *  - El server esconde contraseñas y demás columnas sensibles.
 *  - Atacantes no pueden hablar con Supabase directo desde el browser.
 *
 * Limitaciones conocidas:
 *  - No soporta `subscribe()` (realtime). Si se necesita, hay que migrar
 *    a SSE/WebSockets del backend.
 *  - `.auth.*` está stubbed (no usamos Supabase Auth; usamos JWT propio).
 */

import { apiRequest } from '@/lib/apiClient';

type Filter = [string, string, unknown];

interface QueryState {
  table: string;
  select?: string;
  filters: Filter[];
  or?: string;
  orderBy?: { column: string; ascending?: boolean; nullsFirst?: boolean };
  limit?: number;
  range?: [number, number];
  single?: 'single' | 'maybeSingle';
  count?: 'exact' | 'planned' | 'estimated';
}

interface MutationState extends QueryState {
  op: 'insert' | 'update' | 'delete' | 'upsert';
  data?: unknown;
  upsertOptions?: { onConflict?: string; ignoreDuplicates?: boolean };
}

class QueryBuilder<T = any> implements PromiseLike<{ data: T | null; error: any; count?: number | null }> {
  private state: QueryState | MutationState;

  constructor(table: string) {
    this.state = { table, filters: [] };
  }

  select(columns: string = '*', options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this.state.select = columns;
    if (options?.count) this.state.count = options.count;
    return this;
  }

  insert(data: unknown) {
    (this.state as MutationState).op = 'insert';
    (this.state as MutationState).data = data;
    return this;
  }
  update(data: unknown) {
    (this.state as MutationState).op = 'update';
    (this.state as MutationState).data = data;
    return this;
  }
  upsert(data: unknown, options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    (this.state as MutationState).op = 'upsert';
    (this.state as MutationState).data = data;
    (this.state as MutationState).upsertOptions = options;
    return this;
  }
  delete() {
    (this.state as MutationState).op = 'delete';
    return this;
  }

  eq(c: string, v: unknown) { this.state.filters.push(['eq', c, v]); return this; }
  neq(c: string, v: unknown) { this.state.filters.push(['neq', c, v]); return this; }
  gt(c: string, v: unknown) { this.state.filters.push(['gt', c, v]); return this; }
  gte(c: string, v: unknown) { this.state.filters.push(['gte', c, v]); return this; }
  lt(c: string, v: unknown) { this.state.filters.push(['lt', c, v]); return this; }
  lte(c: string, v: unknown) { this.state.filters.push(['lte', c, v]); return this; }
  in(c: string, vs: unknown[]) { this.state.filters.push(['in', c, vs]); return this; }
  is(c: string, v: null | boolean) { this.state.filters.push(['is', c, v]); return this; }
  like(c: string, v: string) { this.state.filters.push(['like', c, v]); return this; }
  ilike(c: string, v: string) { this.state.filters.push(['ilike', c, v]); return this; }
  contains(c: string, v: unknown) { this.state.filters.push(['contains', c, v]); return this; }
  overlaps(c: string, v: unknown) { this.state.filters.push(['overlaps', c, v]); return this; }
  not(c: string, op: string, v: unknown) { this.state.filters.push(['not', c, [op, v]]); return this; }
  match(criteria: Record<string, unknown>) { this.state.filters.push(['match', '', criteria]); return this; }
  or(expression: string) { this.state.or = expression; return this; }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.state.orderBy = { column, ...options };
    return this;
  }
  limit(n: number) { this.state.limit = n; return this; }
  range(from: number, to: number) { this.state.range = [from, to]; return this; }
  single() { this.state.single = 'single'; return this; }
  maybeSingle() { this.state.single = 'maybeSingle'; return this; }

  /** Extensión NO-Supabase: trae todas las filas paginando dentro del server
   *  (sin múltiples round-trips desde el browser). Solo para op=select. */
  fetchAll() { (this.state as any).fetchAll = true; return this; }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: T | null; error: any; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: T | null; error: any; count?: number | null }> {
    try {
      const op: any = (this.state as MutationState).op || 'select';
      const body: any = {
        table: this.state.table,
        op,
        select: this.state.select,
        filters: this.state.filters.length ? this.state.filters : undefined,
        or: this.state.or,
        order: this.state.orderBy,
        limit: this.state.limit,
        range: this.state.range,
        single: this.state.single,
        count: this.state.count,
      };
      if ((this.state as MutationState).data !== undefined) body.data = (this.state as MutationState).data;
      if ((this.state as MutationState).upsertOptions) body.upsertOptions = (this.state as MutationState).upsertOptions;
      if ((this.state as any).fetchAll) body.fetchAll = true;

      const res = await apiRequest<{ data: T | null; count?: number | null }>('/api/db', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return { data: res.data, error: null, count: res.count };
    } catch (err: any) {
      const error = err?.body && typeof err.body === 'object' ? err.body : { message: err?.message || 'Unknown error' };
      return { data: null, error };
    }
  }
}

// ─── Storage shim ──────────────────────────────────────────────────────────

class StorageBucket {
  constructor(private bucket: string) {}

  async upload(path: string, file: File | Blob | Uint8Array | ArrayBuffer, options?: { contentType?: string; upsert?: boolean }) {
    try {
      let bytes: Uint8Array;
      if (file instanceof File || file instanceof Blob) {
        bytes = new Uint8Array(await file.arrayBuffer());
      } else if (file instanceof Uint8Array) {
        bytes = file;
      } else {
        bytes = new Uint8Array(file as ArrayBuffer);
      }
      const contentBase64 = uint8ToBase64(bytes);
      const contentType = options?.contentType || (file as File).type || 'application/octet-stream';
      const res = await apiRequest<{ publicUrl: string }>('/api/storage/upload', {
        method: 'POST',
        body: JSON.stringify({ bucket: this.bucket, path, contentBase64, contentType }),
      });
      return { data: { path, publicUrl: res.publicUrl }, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.body?.error || err?.message || 'upload failed' } };
    }
  }

  getPublicUrl(path: string) {
    const baseUrl = 'https://npdtggwzodtssnicmkux.supabase.co/storage/v1/object/public';
    return {
      data: { publicUrl: `${baseUrl}/${this.bucket}/${path}` },
    };
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ─── Cliente principal ─────────────────────────────────────────────────────

export const supabase = {
  from<T = any>(table: string) {
    return new QueryBuilder<T>(table);
  },
  storage: {
    from(bucket: string) {
      return new StorageBucket(bucket);
    },
  },
  rpc(name: string, args?: Record<string, unknown>) {
    return apiRequest<{ data: any }>('/api/db', {
      method: 'POST',
      body: JSON.stringify({ op: 'rpc', rpc: name, args: args || {} }),
    }).then(
      (res) => ({ data: res.data, error: null }),
      (err) => ({ data: null, error: err?.body || { message: err?.message || 'rpc failed' } }),
    );
  },
  // .auth stub para evitar crashes si algún componente lo invoca.
  auth: {
    signOut: async () => ({ error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
};
