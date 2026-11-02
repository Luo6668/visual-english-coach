export function getAuthErrorMessage(error: unknown): string {
  const message = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('failed to fetch') || normalized.includes('network request failed')) {
    return '无法连接认证服务，请检查网络后重试。';
  }
  if (normalized.includes('invalid login credentials')) {
    return '邮箱或密码不正确，请重新输入。';
  }
  if (normalized.includes('email not confirmed')) {
    return '邮箱尚未验证，请先打开验证邮件完成确认。';
  }
  if (normalized.includes('user already registered')) {
    return '这个邮箱已经注册，可以直接登录。';
  }
  if (normalized.includes('password should be at least') || normalized.includes('weak_password')) {
    return '密码强度不足，请至少使用 8 位并混合字母与数字。';
  }
  if (normalized.includes('email rate limit') || normalized.includes('over_email_send_rate_limit')) {
    return '邮件发送过于频繁，请稍后再试。';
  }
  if (normalized.includes('otp_expired') || normalized.includes('expired')) {
    return '重置链接已过期，请重新发送。';
  }
  if (normalized.includes('auth session missing') || normalized.includes('session_not_found')) {
    return '重置链接无效或已过期，请重新发送。';
  }
  if (normalized.includes('same_password')) {
    return '新密码不能与当前密码相同。';
  }

  return message || '认证请求失败，请稍后重试。';
}
