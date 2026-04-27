import type { BatchItem, BatchMarket, BatchProject, ParsedSourceDrama } from "./types";
import type { LLMMessage } from "../llm/types";

export function marketLabel(market: BatchMarket): string {
  return market === "domestic" ? "国内短剧市场（红果/抖音/快手）" : "海外本土化市场（TikTok/ReelShort/DramaBox）";
}

function marketRules(market: BatchMarket): string {
  if (market === "domestic") {
    return [
      "面向国内短剧用户：强冲突、强反转、强爽点、强付费卡点。",
      "可使用身份反转、复仇逆袭、家庭伦理、豪门情感、悬疑怪谈等红果高转化母题。",
      "不得照搬输入剧名、人物、关键桥段，只提炼爆款结构。",
    ].join("\n");
  }
  return [
    "面向海外短剧用户：TikTok / ReelShort / DramaBox 语境。",
    "",
    "【出海本土化硬性约束（不可违反）】",
    "- 故事必须**完全本土化**为面向英语母语圈（北美 / 欧洲 / 大洋洲 / 拉美）的海外短剧，**严禁任何亚裔元素**：禁止华裔 / 韩裔 / 日裔 / 越南裔 / 泰国裔 / 菲律宾裔等亚裔角色、人名、外貌描写或文化符号。",
    "- 所有人名**只用纯英文名**（First + Last，例：Mia Carter / Lucas Reed / Ethan Walker）。**禁止**中文名、拼音名（Lin Xia / Wang Wei）、半中半英的双名格式（如「林夏 / Lin Xia」）、以及任何 Chen / Wang / Li / Park / Kim / Nguyen 这类亚裔常见姓氏。如果上游红果源剧带亚裔名字，必须替换为西方名字。",
    "- 角色外貌不得使用「黑长直 / 杏眼 / 东方面孔 / 旗袍 / 汉服 / 韩服」等亚裔/东方暗示；演员体型、肤色、发色、瞳色、服装风格全部按西方角色刻画。",
    "- 城市、职业、阶层冲突、家庭结构、节庆、饮食、教育体系全部本土化为海外语境（NYC / LA / Chicago / London / Sydney / Toronto / São Paulo），**禁止**出现「沪上 / 京城 / 华尔街相亲角 / 春节回家 / 高考 / 体制内」这类中国语境。",
    "- 关系冲突使用海外平台验证过的母题（契约婚姻 / 豪门继承 / 黑帮 / 校园 / 狼人 / 吸血鬼 / 复仇 / 身份秘密 / 单亲妈妈），不要照搬「门当户对 / 家族联姻 / 长辈逼婚 / 婆媳矛盾」。",
    "- 新剧名必须为全英文（推荐 4 词以内全大写）。",
    "",
    "审核交付语言规则：上述本土化是关于**人物与世界设定**；输出格式仍为中文场记 + 英文对白，只有最终分镜脚本的台词/SFX 用英文，其余说明、三幕创意、完整剧本文本都用中文便于中文审核。",
    "不得保留强中国地域依赖设定，不能照搬输入剧名、人物、关键桥段。",
  ].join("\n");
}

export function parseSourceDramas(raw: string): ParsedSourceDrama[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line
        .split(/\s*[|｜]\s*/)
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length >= 3) {
        return {
          sourceTitle: parts[0],
          sourceKeywords: parts[1],
          sourceSummary: parts.slice(2).join(" | "),
          sourceText: line,
        };
      }
      if (parts.length === 2) {
        return {
          sourceTitle: parts[0],
          sourceKeywords: "",
          sourceSummary: parts[1],
          sourceText: line,
        };
      }
      const match = line.match(/^(.{2,40}?)[：:,\s]+(.+)$/);
      return {
        sourceTitle: (match?.[1] ?? line).trim(),
        sourceKeywords: "",
        sourceSummary: (match?.[2] ?? "").trim(),
        sourceText: line,
      };
    });
}

const COMPLEX_REVERSAL_BATCH_RULES = [
  "【复杂反转模式（必须遵守）】",
  "- 三幕合计写出 5–7 层反转的具体揭晓时刻；少于 5 层视为不及格。",
  "- 不要在文中标「第 X 层反转」，反转必须通过情节自然展开。",
  "- 反转必须分别来自下面任一类型，不允许同类反转连续叠：",
  "  身份反转 / 关系反转 / 动机反转 / 现实反转（梦境/模拟/回忆）/ 存在反转（AI/循环/已死亡）/ 世界观反转 / 元叙事反转。",
  "- Act 1 至少 1 层小反转；Act 2 至少 2 层（含一次重大颠覆——重新定义观众对前面剧情的理解）；Act 3 至少 1 层终极反转。",
  "- 终极反转**不得让观众觉得前面都白看了**：要让人想重看，而不是被骗。",
  "- 第一主角必须严格写出 5 要素（年龄 / 外貌 / 穿着 / 气质 / 整体印象一句话）。",
  "- 海外向：剧名必须为全大写英文，4 词以内最稳。",
].join("\n");

export function buildCreativeMessages(project: BatchProject, item: BatchItem): LLMMessage[] {
  const complex = project.useComplexReversal;
  const systemPrompt = complex
    ? "你是 Drama Studio 红果批量工厂里负责高反转密度短剧的商业编剧策划，长期为 ReelShort / DramaBox / Dreame 等海外平台开发**含 5–7 层反转**的短剧创意。请按主链路 /creative 的质量标准 + 复杂反转模式输出：Act1/Act2/Act3 清晰，世界观与核心主题闭环。"
    : "你是 Drama Studio 主链路里的资深短剧编剧与制片顾问。请按主链路 /creative 的质量标准执行：强投流感、强付费感、强反转，Act1/Act2/Act3 清晰，世界观、核心主题、爽点和付费钩子可执行。";

  const sampleTitle = project.targetMarket === "overseas" ? "GLASS PRISON" : "玄医逆凡尘";
  const sampleProtagonist =
    project.targetMarket === "overseas"
      ? "Lucas——28 岁，瘦削敏感的记忆架构师，黑框眼镜下藏着忧郁的眼神，总是穿着灰色毛衣，手指修长适合键盘操作，看起来既脆弱又坚韧"
      : "林夏——27 岁，清冷利落的女法医，齐肩短发束成低马尾，常穿白色衬衫与黑色西裤，眼神锋利却藏着克制的善意，看起来沉稳到近乎冷漠";

  const baseLines = [
    `【目标市场】${marketLabel(project.targetMarket)}`,
    marketRules(project.targetMarket),
    `【总集数】${project.totalEpisodes}`,
    "",
    "【红果源剧】",
    `剧名：${item.sourceTitle || item.title}`,
    item.sourceKeywords ? `关键词/标签：${item.sourceKeywords}` : "",
    item.sourceSummary ? `简介：${item.sourceSummary}` : "",
    `原始素材：${item.sourceText}`,
    "",
    "请基于这 1 部红果源剧，输出 1 个全新的短剧方案。只能借鉴母题、冲突结构、爽点机制，不能照搬剧名、人物名、关键桥段。",
    "",
    "【输出格式：严格 7 段，必须使用以下中文 label，每段一行，缺一不可，禁止额外的 Markdown 标题、序号、加粗】",
    "新剧名: <一句话剧名>",
    "第一主角: <主角姓名——年龄、外貌、穿着、气质、整体印象一句话，五要素必须齐全且写在同一段>",
    "叙事视角: <第几人称 + 限制/全知/多视角，括号注明跟随谁>",
    "受众: <男性/女性/全年龄>",
    "故事类型: <用 + 连接 3–4 个核心标签，例如 科幻+记忆+身份质疑>",
    "故事背景: <用 + 连接 2–3 个设定要素，例如 2050年+记忆科技+监狱系统>",
    "故事梗概: Act 1: <≥250 字，含具体场景、对白、第一次反转揭晓时刻>",
    "Act 2: <≥250 字，含中段大反转的具体揭晓时刻>",
    "Act 3: <≥250 字，闭环结局，反派处罚明确、核心谜团全部揭晓>",
    "",
    "【格式示例（仅供格式参照，内容请重新构思，禁止抄袭）】",
    `新剧名: ${sampleTitle}`,
    `第一主角: ${sampleProtagonist}`,
    "叙事视角: 第三人称限制视角（跟随主角）",
    project.targetMarket === "overseas" ? "受众: 男性" : "受众: 全年龄",
    "故事类型: <类型1>+<类型2>+<类型3>",
    "故事背景: <要素1>+<要素2>+<要素3>",
    "故事梗概: Act 1: ……（具体情节）",
    "Act 2: ……（具体情节）",
    "Act 3: ……（具体情节）",
    "",
    "【硬性标准】",
    "- 新剧名必须独立成行，不要 Markdown 标题、不要书名号、不要数字序号。",
    project.targetMarket === "overseas"
      ? "- 海外向：新剧名必须为全英文（推荐 4 个单词以内全大写）；主角姓名一律纯英文。"
      : "- 国内向：新剧名建议 4-6 字中文、强冲突感。",
    "- 前 30 秒必须有开场爆点。",
    complex ? "- 三幕合计写出 5–7 层反转的具体揭晓时刻。" : "- Act 2 必须有足以推动付费的大反转。",
    "- Act 3 必须闭环，反派处罚明确，核心谜团全部揭晓。",
    "- 7 段都必须有内容，不允许写「待补充」「TBD」或留空。",
  ];

  if (complex) {
    baseLines.push("", COMPLEX_REVERSAL_BATCH_RULES);
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: baseLines.join("\n") },
  ];
}

export function buildScreenplayMessages(project: BatchProject, item: BatchItem): LLMMessage[] {
  return buildScreenplayChunkMessages(project, item, 1, project.totalEpisodes, "");
}

/**
 * Build prompts for a screenplay slice covering [startEp, endEp] only.
 * `previousTail` is the trailing portion of already-generated screenplay text
 * (last few hundred chars) so the model can keep continuity without re-reading
 * the entire prefix.
 */
export function buildScreenplayChunkMessages(
  project: BatchProject,
  item: BatchItem,
  startEp: number,
  endEp: number,
  previousTail: string
): LLMMessage[] {
  const creativeBlock = renderCreativeBlockForPrompt(item);
  const isFirstChunk = startEp === 1;
  const isLastChunk = endEp >= project.totalEpisodes;
  const continuityBlock = previousTail
    ? [
        "",
        "【上文已生成的剧本结尾（仅供承接，不要重复输出）】",
        previousTail,
        "",
      ].join("\n")
    : "";
  const overseas = project.targetMarket === "overseas";
  const formatTemplate = overseas
    ? [
        "场景：<具体地点 + 时段（日/夜/黄昏） + 内/外>",
        "人物：<本场出场人物，逗号分隔>",
        "过程描写：",
        "△<可拍的动作或镜头描述>",
        "<角色>（情绪）",
        "“<英文台词>”",
        "“<对应中文台词>”",
        "△<可拍的动作或镜头描述>",
        "<角色>",
        "“<英文台词>”",
        "“<对应中文台词>”",
      ]
    : [
        "场景：<具体地点 + 时段（日/夜/黄昏） + 内/外>",
        "人物：<本场出场人物，逗号分隔>",
        "过程描写：",
        "△<可拍的动作或镜头描述>",
        "<角色>（情绪）：<台词>",
        "△<可拍的动作或镜头描述>",
        "<角色>：<台词>",
      ];

  const formatRules = overseas
    ? [
        "- 每个子场次必须三个 label：场景 / 人物 / 过程描写。台词不再单独成块，而是与 △ 动作描写交错出现。",
        "- 「过程描写」内部按拍摄顺序逐行输出：动作行（△ 开头）、角色名行、英文台词行、中文台词行 —— 三类按需穿插，不要把所有 △ 堆在最前面，也不要把所有台词堆在最后面。",
        "- 角色行格式：`<角色姓名>` 或 `<角色姓名>（情绪）`，独占一行，**不带冒号、不带台词**。",
        "- 紧接角色行下面**先写一行英文台词**、**再写一行中文翻译**，两行都用中文圆角双引号 `“...”` 包裹，引号必须配对。",
        "- 同一个角色连续两句话各自一组：英文 + 中文，不要混排。",
        "- 旁白/OS 用 `<角色>（OS）` 标注；情绪标签放在角色名右侧的中文括号里。",
      ]
    : [
        "- 每个子场次必须三个 label：场景 / 人物 / 过程描写。",
        "- 「过程描写」内部按拍摄顺序逐行输出：动作行（△ 开头）与台词行交错排布，不要全部 △ 堆在前面再堆台词。",
        "- 台词行格式：`<角色>（情绪）：<台词>` 或 `<角色>：<台词>`，每行一句。",
      ];
  return [
    {
      role: "system",
      content: overseas
        ? "你是 Drama Studio 红果批量工厂里的专业海外短剧 Writer。请严格按 docx 交付格式输出剧本：每集若干个 N-M 子场次，每个子场次必须包含「场景 / 人物 / 过程描写」三个 label，过程描写内部把动作（△）与台词逐行交错。台词必须双语：先英文后中文，二者皆用中文圆角双引号 “...”。本集最后一个子场次必须额外加「钩子」。语言克制、台词短狠，每场至少发生一次局势变化。"
        : "你是 Drama Studio 红果批量工厂里的专业短剧 Writer。请严格按 docx 交付格式输出剧本：每集若干个 N-M 子场次，每个子场次必须包含「场景 / 人物 / 过程描写」三个 label，过程描写内部把动作（△）与台词逐行交错。本集最后一个子场次必须额外加「钩子」。语言克制、台词短狠，每场至少发生一次局势变化（信息释放/情绪转折/权力转移/关系变化/威胁升级/决策形成/谎言暴露）。",
    },
    {
      role: "user",
      content: [
        `【目标市场】${marketLabel(project.targetMarket)}`,
        marketRules(project.targetMarket),
        `【全剧总集数】${project.totalEpisodes}`,
        `【本次只输出区间】第 ${startEp} 集 至 第 ${endEp} 集（共 ${endEp - startEp + 1} 集）`,
        "",
        "【三幕创意】",
        creativeBlock,
        continuityBlock,
        "【输出格式：严格按以下结构，禁止任何额外 Markdown 标题或编号】",
        `第 ${startEp} 集`,
        "",
        `${startEp}-1`,
        "",
        ...formatTemplate,
        "",
        `${startEp}-2`,
        "（同上结构）",
        "",
        "钩子：",
        "<本集结尾钩子，1-2 句，留悬念到下一集>",
        "",
        `第 ${startEp + 1} 集`,
        "（同上结构）",
        "",
        "【硬性标准（针对本批次输出）】",
        `- 只输出第 ${startEp} 集到第 ${endEp} 集，**严禁**写第 ${startEp - 1} 集（如有）或第 ${endEp + 1} 集及之后内容。`,
        "- 必须从第 " + startEp + " 集开始连续写到第 " + endEp + " 集，每一集都要有，不能跳号也不能停在中间。",
        "- 每集 3-6 个子场次，子场次编号必须为「集号-序号」（如 " + startEp + "-1, " + startEp + "-2），不能用「第 X 场」或其他形式。",
        ...formatRules,
        "- 「钩子：」只在每集最后一个子场次后面出现一次，是本集收束悬念。",
        isFirstChunk
          ? `- 本批次为开篇：第 ${startEp} 集前 30 秒（即 ${startEp}-1 子场次）必须出现强爆点。`
          : "- 本批次为续写：开头紧接上文钩子，不要重新铺设定，立刻推进剧情。",
        isLastChunk
          ? `- 本批次为收官：第 ${endEp} 集必须把核心矛盾闭环、反派处罚明确、关键人物归位，钩子用作终章余韵而非新悬念。`
          : `- 本批次非收官：第 ${endEp} 集的钩子必须留住悬念过渡到下一批。`,
        "- 不要输出连续性检查点、复盘、分镜，也不要输出场记之外的旁白说明，也不要写「本批次结束」「待续」之类的总结。",
        overseas
          ? "- 海外向：人物使用纯英文姓名，地名/职业/品牌做海外化（NYC / LA / London / Sydney / Toronto 等）；只有台词行（英文 + 中文翻译）涉及双语，其余 label、场景描述、动作描写一律使用中文便于中文审核。"
          : "- 国内向：全部中文，使用国内短剧表达；地点用国内城市/小镇。",
      ].filter(Boolean).join("\n"),
    },
  ];
}

function renderCreativeBlockForPrompt(item: BatchItem): string {
  const structured = [
    item.title ? `新剧名: ${item.title}` : "",
    item.protagonist ? `第一主角: ${item.protagonist}` : "",
    item.narrativePov ? `叙事视角: ${item.narrativePov}` : "",
    item.audience ? `受众: ${item.audience}` : "",
    item.storyType ? `故事类型: ${item.storyType}` : "",
    item.setting ? `故事背景: ${item.setting}` : "",
    item.act1 ? `故事梗概: Act 1: ${item.act1}` : "",
    item.act2 ? `Act 2: ${item.act2}` : "",
    item.act3 ? `Act 3: ${item.act3}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (structured) return structured;
  return item.creativeMd || item.oneLiner || item.sourceText || item.title || "";
}

export function buildStoryboardMessages(project: BatchProject, item: BatchItem): LLMMessage[] {
  return buildStoryboardChunkMessages(project, item, item.screenplayMd, 1, project.totalEpisodes);
}

/**
 * Build prompts for a storyboard slice covering [startEp, endEp]. Caller must
 * pre-extract the matching screenplay slice and pass it in `screenplaySlice`.
 */
export function buildStoryboardChunkMessages(
  project: BatchProject,
  item: BatchItem,
  screenplaySlice: string,
  startEp: number,
  endEp: number
): LLMMessage[] {
  const _ = item;
  const overseas = project.targetMarket === "overseas";
  return [
    {
      role: "system",
      content:
        "你是 Drama Studio 主链路里的分镜导演。请按红果短剧拍摄用的逐秒分镜表输出：每个镜头一行，固定七列「镜头号 | 逐秒分镜画面描述 | 中英双语台词 | 运镜方式/景别 | 人物图/场景图 | 备注 | 时长」，每镜默认 4 秒，整集累计约 60–66 秒。",
    },
    {
      role: "user",
      content: [
        `【目标市场】${marketLabel(project.targetMarket)}`,
        `【全剧总集数】${project.totalEpisodes}`,
        `【本次只输出区间】第 ${startEp} 集 至 第 ${endEp} 集（共 ${endEp - startEp + 1} 集）`,
        "",
        "【完整剧本（仅本区间）】",
        screenplaySlice,
        "",
        `请基于上面的剧本，仅生成第 ${startEp} 集到第 ${endEp} 集 的分镜脚本。每集独立一段，集内按镜头号顺序连号，使用 GFM Markdown 表格格式，列结构如下（七列必须齐全）：`,
        "",
        "| 镜头号 | 逐秒分镜画面描述 | 中英双语台词 | 运镜方式/景别 | 人物图/场景图 | 备注 | 时长 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        overseas
          ? "| 1 | 0:00-0:04 延续上集，维克托西装外套披到伊芙琳肩上，镜头怼近她沾酒渍的裙子和他的高级定制外套形成反差 | 维克托：披上。至少今晚别再让他们看笑话。 / Victor: Put it on. Don't give them another show. | 近景 | 外套昂贵质感、女主狼狈反差 | SFX 布料摩擦声 | 4 |"
          : "| 1 | 0:00-0:04 镜头怼近主角沾酒渍的裙子，男主西装外套压上 | 男主：披上，今晚别让他们看笑话。 | 近景 | 外套昂贵质感、女主狼狈反差 | SFX 布料摩擦声 | 4 |",
        "",
        "【字段写法（严格遵守）】",
        "- 「镜头号」: 集内从 1 起的连续整数，**不要跨集累加**。每一集独立编号。",
        "- 「逐秒分镜画面描述」: 必须以 `M:SS-M:SS` 时间区间打头（例如 `0:00-0:04`），紧跟一段中文画面描述（动作/构图/调度/眼神/表情/重要道具）。区间端点必须连续，不留空。",
        overseas
          ? "- 「中英双语台词」: 每镜如有台词，按格式 `<角色中文名>：<中文台词> / <Character>: <English line>` 输出。中文在前、斜杠 ` / ` 分隔、英文在后；中英意思必须对齐。如本镜无台词，写 `-` 即可。多句台词在同一格内用换行连写，每句独立成行；旁白用 `（OS）` 后缀标注角色。"
          : "- 「中英双语台词」: 中文台词，格式 `<角色>：<台词>`。每镜如无台词写 `-`。多句台词在同一格内换行，每句独立成行；旁白用 `（OS）` 后缀标注角色。",
        "- 「运镜方式/景别」: 中文，例如 `近景`/`固定近景`/`特写`/`中景`/`全景`/`正反打 中近`/`推近`/`手持跟拍`。",
        "- 「人物图/场景图」: 中文，简短一句的「视觉锚点」备注，例如 `女主礼裙沾酒渍` `豪车内深色皮椅`，用于美术/Casting 定参考。",
        "- 「备注」: 中文，写 SFX、BGM、演技要点、机位提醒等，例如 `SFX 布料摩擦声` `BGM 低压` `维克托控制力强`。",
        "- 「时长」: 单镜秒数，默认 `4`，特殊节奏可写 `2` / `3` / `5` / `6`，整集累计约 60–66 秒。",
        "",
        "【硬性标准】",
        "- 每集表格之前必须有一行二级标题 `## 第 N 集分镜（约 X s）`，X 用集内时长合计。",
        "- 严禁把多镜合并到一行；严禁省略列。",
        "- Markdown 表格内换行用 `<br>`，不要用真实换行符。",
        "- 每集镜头数建议 12–20 之间，覆盖剧本里所有 N-M 子场次。",
        `- 严禁输出第 ${startEp} 集之前或第 ${endEp} 集之后的内容；不要写总结、「本批次结束」、「待续」之类的话。`,
        overseas
          ? "- 海外向语言规则：只有「中英双语台词」一列出现英文（与中文成对）；其余列（画面描述/景别/视觉锚点/备注）全部中文。人名一律使用英文名。"
          : "- 国内向语言规则：全部使用中文，地点/品牌使用国内语境。",
      ].join("\n"),
    },
  ];
}
