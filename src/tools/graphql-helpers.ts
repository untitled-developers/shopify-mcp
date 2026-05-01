export interface ShopifyUserError {
  field?: (string | number)[] | null;
  code?: string | null;
  message: string;
}

export interface ShopifyConnection<T> {
  nodes?: T[];
  edges?: { node: T }[];
}

export function gid(resource: string, id: string): string {
  return id.startsWith("gid://") ? id : `gid://shopify/${resource}/${id}`;
}

export function nodes<T>(connection?: ShopifyConnection<T> | null): T[] {
  if (!connection) return [];
  if (connection.nodes) return connection.nodes;
  if (connection.edges) return connection.edges.map((edge) => edge.node);
  return [];
}

export function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Partial<T>;
}

export function throwOnUserErrors(operation: string, errors?: ShopifyUserError[] | null): void {
  if (!errors || errors.length === 0) return;
  const messages = errors.map((error) => error.message).join("; ");
  throw new Error(`${operation} errors: ${messages}`);
}

export function searchQuery(parts: Record<string, string | number | boolean | undefined>): string | undefined {
  const query = Object.entries(parts)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(" ");
  return query || undefined;
}