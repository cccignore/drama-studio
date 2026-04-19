import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-2xl font-semibold">项目不存在</div>
      <div className="text-sm text-[color:var(--color-muted)]">
        可能被删除或链接有误。
      </div>
      <Link href="/studio">
        <Button>回到项目列表</Button>
      </Link>
    </div>
  );
}
