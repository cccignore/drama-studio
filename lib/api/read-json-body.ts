import { AppError } from "./errors";

export async function readJsonBody<T = unknown>(request: Request): Promise<T> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new AppError("invalid_body", "请求体无法读取", 400);
  }
  if (!text) return {} as T;
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new AppError("invalid_body", "请求体必须是 JSON 对象", 400);
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("invalid_json", "请求体不是合法 JSON", 400);
  }
}
