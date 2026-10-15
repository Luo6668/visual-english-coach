export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'Failed to fetch' || error.message.toLowerCase().includes('network request failed')) {
      return '无法连接认证服务，请检查网络和 Supabase 配置后重试。';
    }
    return error.message;
  }

  return '认证请求失败，请稍后重试。';
}
