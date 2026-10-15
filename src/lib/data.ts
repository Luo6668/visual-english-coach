const DATA_URL = process.env.EXPO_PUBLIC_DATA_API_URL || 'http://127.0.0.1:8787/data';

type DataOptions = {
  action?: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  filters?: Record<string, unknown>;
  values?: Record<string, unknown>;
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
  single?: boolean;
};

export async function mysqlData<T = any>(table: string, options: DataOptions = {}): Promise<T> {
  const response = await fetch(`${DATA_URL}/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `MySQL 数据服务异常 (${response.status})`);
  return payload.data as T;
}
