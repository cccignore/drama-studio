import type { DramaState } from "../types";
import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA, contextBlock, refsBlock } from "./_shared";

export interface ComplianceEpisodeInput {
  index: number;
  excerpt: string;
}

const JSON_SCHEMA = `{
  "summary": "<overall compliance summary>",
  "totals": {
    "blocker": <integer>,
    "risk": <integer>,
    "pass": <integer>
  },
  "items": [
    {
      "episode": <integer>,
      "level": "blocker" | "risk" | "pass",
      "category": "<risk category>",
      "rule": "<short checklist rule>",
      "finding": "<what happened in the episode>",
      "suggestion": "<specific rewrite or keep recommendation>"
    }
  ],
  "globalAdvice": ["<string>", "<string>"]
}`;

export function buildComplianceMessages(
  state: DramaState,
  episodes: ComplianceEpisodeInput[],
  refs: string,
  retryHint?: string
): LLMMessage[] {
  const episodeBlocks = episodes
    .map(
      (ep) => `### Episode ${ep.index}\n${ep.excerpt || "（本集内容缺失）"}`
    )
    .join("\n\n");

  const user = [
    "【任务】对已写出的剧本进行批量合规审查，输出严格 JSON。",
    "",
    "【项目信息】",
    contextBlock(state),
    "",
    "【待审查剧本片段】",
    episodeBlocks || "（暂无已写剧本）",
    "",
    refsBlock(refs),
    "",
    retryHint ? `【上次输出不合法，修正提示】\n${retryHint}` : "",
    "",
    "【输出要求】",
    "只输出一个 JSON 对象，不要输出 Markdown、解释或代码块。",
    "结构必须为：",
    JSON_SCHEMA,
    "",
    "审查规则：",
    "1) `blocker` 只用于明确红线或明显高风险内容。",
    "2) `risk` 用于可通过改写缓解的问题。",
    "3) `pass` 用于明确合规且值得保留的处理方式。",
    "4) 每一集至少给 1 条 item；如果某集没有明显风险，也要给出 1 条 `pass`。",
    "5) `suggestion` 必须具体到可执行的改写动作，禁止空话。",
    "6) `totals` 必须与 items 中三种 level 的数量一致。",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}
