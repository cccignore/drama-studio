import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drama Studio · 短剧创作工作台",
  description: "从选题到成片的 AI 短剧剧本生产线",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <Toaster
          position="top-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "hsl(222 16% 10%)",
              border: "1px solid hsl(222 12% 20%)",
              color: "hsl(210 20% 96%)",
            },
          }}
        />
      </body>
    </html>
  );
}
