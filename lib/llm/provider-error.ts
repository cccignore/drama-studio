function excerpt(text: string, maxChars = 120): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars)}...`;
}

export function friendlyNetworkError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();
  if (/timeout|timed out|deadline/.test(lower)) {
    return "模型响应超时：请稍后重试，或缩小本次生成范围。";
  }
  if (/fetch failed|network|econnrefused|enotfound|tls|certificate|socket/.test(lower)) {
    return "无法连接到模型服务：请检查 endpoint、网络或代理设置，然后重试。";
  }
  return `调用模型失败：${excerpt(rawMessage) || "请检查模型配置后重试。"}`;
}

export function friendlyUpstreamError(status: number, rawText: string): string {
  const lower = rawText.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    /unauthorized|authentication|invalid api key|api key|permission denied/.test(lower)
  ) {
    return "模型鉴权失败：请检查 API Key、模型名称和额外请求头是否正确。";
  }

  if (status === 429 || /rate limit|too many requests|quota|capacity/.test(lower)) {
    return "模型服务繁忙或触发限流：请稍后重试，或缩小批量范围后再试。";
  }

  if (
    status === 400 ||
    status === 413 ||
    /context length|maximum context|context window|prompt is too long|too many tokens|max tokens|token limit|too long/.test(
      lower
    )
  ) {
    if (/context|token|too long|max/.test(lower)) {
      return "输入内容过长，超出模型上下文限制：请缩小批量范围、减少自由输入，或改为逐集生成。";
    }
  }

  if (status === 408 || status === 504 || /timeout|timed out|deadline/.test(lower)) {
    return "模型响应超时：请稍后重试，或缩小本次生成范围。";
  }

  if (status >= 500) {
    return "模型服务暂时异常：请稍后重试。";
  }

  const tail = excerpt(rawText);
  return tail ? `模型服务返回 ${status}：${tail}` : `模型服务返回 ${status}，请检查配置或稍后重试。`;
}
