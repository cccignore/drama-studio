import { NextResponse } from "next/server";

export class AppError extends Error {
  code: string;
  status: number;
  userMessage: string;
  constructor(code: string, userMessage: string, status = 400) {
    super(userMessage);
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
  }
}

export function toJsonError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { success: false, error: { code: err.code, message: err.userMessage } },
      { status: err.status }
    );
  }
  const message = err instanceof Error ? err.message : "服务端错误";
  return NextResponse.json(
    { success: false, error: { code: "internal", message } },
    { status: 500 }
  );
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}
