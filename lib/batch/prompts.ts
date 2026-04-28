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

// ---------------------------------------------------------------------------
// Distill stage —— 把红果源剧（标题 + 标签 + 简介）压成一句"题材组合 + 故事
// 基底"风格的核心一句话，作为后续创意阶段的题材输入。
//
// 设计要点：
// - 输出永远是中文（即便目标市场是海外）。这一句话只是"题材输入"，海外本
//   土化由 creative 阶段的 marketRules 处理。
// - 30–60 字，强制包含 1 个题材标签 + 1 个核心关系冲突。
// - 严禁前缀（"一句话："）、解释、引号、Markdown 标题——下游会原样落库。
// ---------------------------------------------------------------------------
export function buildDistillMessages(item: BatchItem, market: BatchMarket): LLMMessage[] {
  const _ = market; // 当前一句话保持中文，市场仅作上下文参考
  const sourceLines = [
    item.sourceTitle ? `剧名：${item.sourceTitle}` : "",
    item.sourceKeywords ? `关键词/标签：${item.sourceKeywords}` : "",
    item.sourceSummary ? `简介：${item.sourceSummary}` : "",
    item.sourceText && !item.sourceTitle && !item.sourceSummary ? `原文：${item.sourceText}` : "",
  ].filter(Boolean);

  return [
    {
      role: "system",
      content:
        "你是 Drama Studio 红果批量工厂里的资深短剧策划。你的任务是把一部红果源剧的标题、标签、简介压成一句"
        + "「题材组合 + 故事基底」风格的核心一句话，用于后续创意阶段。要求：30-60 字、必须出现 1 个题材标签（如豪门/重生/复仇/契约婚/校园/狼人...）"
        + "和 1 个核心关系冲突（如新娘被抛弃、假千金被识破、契约联姻、复仇打脸等），"
        + "句子要直给、口语化，便于编剧一眼看出爆款抓手。**不要**输出多句话、引号、前缀（如『一句话：』『本剧讲述』）、Markdown 标题或解释。",
    },
    {
      role: "user",
      content: [
        "请把下面这部红果源剧压成一句话题材：",
        "",
        ...sourceLines,
        "",
        "只输出这一句话本身，30-60 字，不要任何前缀、引号或解释。",
      ].filter(Boolean).join("\n"),
    },
  ];
}

// ---------------------------------------------------------------------------
// Creative stage —— 复用用户已验证的"海外竖屏短剧三幕创意"长 system prompt，
// user 端只塞一句话题材 + 9 label 强约束输出格式。
//
// 改造说明：
// - 用户原 prompt 里有【题材信息】占位符段（题材组合/故事基底/女主设定...
//   全部 [例如：...]），这一段被删除——题材信息现在由 user 消息中的
//   `【一句话题材】` 直接喂入，模型从中推断所有槽位。
// - 用户原 prompt 的"输出要求"（Act 1/Act 2/Act 3 段落 + Optional Upgrade
//   格式）会被 user 消息末尾的【交付格式硬性要求】覆盖，强制按现有 9 个
//   中文 label 输出（新剧名/第一主角/叙事视角/受众/故事类型/故事背景/
//   故事梗概 Act 1: / Act 2: / Act 3:），便于 parseCreativeStructured 解析。
// ---------------------------------------------------------------------------
const CREATIVE_SYSTEM_PROMPT = [
  "你现在是一名擅长海外竖屏短剧市场的商业编剧策划，请根据 user 消息中提供的【一句话题材】，输出一个『强投流感、强付费感、强反转』的三幕创意方案。",
  "",
  "【项目目标】",
  "1. 项目定位",
  "   类型：竖屏短剧",
  "   时长：每集 72-78 秒",
  "   节奏：高密度、强钩子",
  "   受众：依据题材判断（女性向 / 男性向 / 全年龄）",
  "2. 世界观设定",
  "3. 视觉基调",
  "4. 核心主题",
  "   底层被制度当作祭品",
  "   身份被剥夺",
  "   真相与命运反噬",
  "",
  "我要开发的是海外短剧，不是传统电视剧。请优先考虑：",
  "开场即爆点",
  "强关系冲突",
  "强身份反差",
  "强情绪刺激",
  "每幕都有反转",
  "每幕结尾都有强钩子",
  "适合拆分成 30-80 集竖屏短剧",
  "有明显商业卖点，适合平台投流和付费转化",
  "爽点直给",
  "语言通俗直接",
  "",
  "防串味要求：",
  "不要把非现代题材写成现代网感剧",
  "不要把高概念世界写成短视频平台表达",
  "不要把特定时代背景写成通用都市语言",
  "不要把世界观内部冲突，偷换为现代舆论或媒体机制",
  "不要让角色说出不属于其时代、身份、阶层、体系的话",
  "不要让重大场景套用与题材无关的模板化场合",
  "所有冲突推进必须优先依赖该世界内部已有制度与习惯，而不是现代观众熟悉的便捷表达。",
  "适合投流文案阅读习惯",
  "",
  "【题材信息】",
  "题材信息从 user 消息中的【一句话题材】内化推断。请自动补全：题材组合、故事基底、女主设定、男主设定、反派设定、关系卖点、爽点关键词、风格倾向、目标集数、限制条件。",
  "题材可以组合，但必须有一个核心钩子最突出。常见组合（包括不限于）：",
  "1. 豪门/婚恋/身份反转",
  "2. 复仇打脸",
  "3. 狼人/吸血鬼/超自然伴侣",
  "4. 霸总/契约/先婚后爱",
  "5. 误认身份/真假千金/隐藏继承人",
  "6. 校园成人化（大学、精英学院）",
  "7. 职场+权力斗争",
  "8. 悬疑爱情",
  "9. 女性逆袭成长",
  "10. 监狱/黑帮/地下世界 romance",
  "11. 时间循环/重生/第二次机会",
  "12. 假结婚/假情侣变真爱",
  "13. 多男主修罗场",
  "14. 禁忌之恋",
  "但不能什么都堆，最后卖点失焦。必须让人一眼看出：这部戏最抓人的点是什么。",
  "",
  "【输出要求】",
  "请不要直接写完整剧本，也不要直接写分集。请输出『适合后续继续开发』的三幕创意方案。",
  "",
  "Act 1 用一段话写清以下内容：",
  "开场爆点（最好 30 秒内能成立）",
  "主要人物关系建立",
  "主角当前处境与压迫来源",
  "第一轮公开羞辱 / 重大误会 / 危机事件",
  "主角如何进入故事",
  "第一阶段小反转",
  "Act 1 结尾钩子",
  "要求：",
  "世界什么样",
  "主角什么状态",
  "事件如何打破平衡",
  "节奏快",
  "事件具体",
  "要有明确情绪爆点",
  "",
  "Act 2 用一段话写清以下内容：",
  "主角如何追查/逃避/误判",
  "敌人如何升级",
  "真相如何逐步揭示",
  "男女主关系如何升级",
  "反派如何持续压迫",
  "外部冲突和内部情感如何同时加码",
  "中段最关键的大反转（身份、孩子、血统、证据、婚姻真相、家族真相等）",
  "主角是否开始反击",
  "主角是否站队/误解/护短",
  "Act 2 结尾钩子",
  "要求：",
  "这一幕必须是全剧冲突最密集的部分",
  "必须有至少一个『足以推动付费』的大爆点",
  "",
  "Act 3 用一段话写清以下内容：",
  "真相如何揭晓",
  "最终对决发生在什么公开场合",
  "反派如何被打脸或失势",
  "男女主关系如何完成回收",
  "权力、身份、爱情如何三线合一",
  "终局爽点是什么",
  "要求：",
  "必须有公开打脸",
  "必须有情感回收",
  "必须有权力关系重置",
  "",
  "【写作原则】",
  "一切以短剧商业表达为优先",
  "不要空泛，尽量具体到事件",
  "不要写得像传统电视剧简介",
  "不要过于慢热",
  "不要平均用力，要突出爆点、羞辱、反转、打脸、护短、真相揭晓",
  "语言尽量具有平台宣传感和策划感",
  "优先写出『观众会立刻想看下一集』的结构",
  "不留第二季钩子",
  "结尾必须闭环",
  "反派处罚明确",
  "核心谜团全部揭晓",
  "",
  "【输出模板参考（仅作风格与篇幅参照，内容请重新构思，禁止抄袭）】",
  "剧名： The Janitor Who Bought Wall Street",
  "受众： 男性",
  "故事类型： 逆袭+后宫",
  "故事背景： 现代+都市（职场）",
  "故事梗概：",
  "Act 1：马库斯是华尔街顶级投行大楼的清洁工，每天默默擦地时承受着西装革履精英们的白眼与羞辱。他暗恋的前台女孩索菲亚当众拒绝了他的约会邀请，嘲笑他『一辈子只配拿拖把』（建立主角+故事背景）。最低谷时，马库斯接到律师电话——素未谋面的已故叔父给他留下了一家濒临破产的科技初创公司。马库斯决定孤注一掷，利用这家公司东山再起，向所有践踏过自己尊严的人证明价值。然而，投行副总裁布莱克——索菲亚的男友——嗅到威胁，誓言用金融手段吞并马库斯的公司，把他打回原形（引出目标+失败的赌注+核心对手登场）。",
  "Act 2：马库斯凭借自学的金融知识和过人的商业直觉，一步步将公司起死回生。每一次翻盘都令昔日鄙视他的人瞠目结舌。索菲亚开始主动示好；投行女高管艾琳被他的魄力吸引，暗中为他提供核心情报；性感的商业律师娜塔莎在并购案合作中对他倾心。马库斯在商场与情场同时开挂，享受着逆袭带来的巨大快感（一系列努力）。然而，布莱克联合华尔街大鳄发起恶意做空，马库斯的公司股价一夜崩盘，面临倾家荡产。更致命的是，马库斯发现一直为他出谋划策的艾琳竟是布莱克安插的间谍，所有商业机密早已泄露。马库斯众叛亲离，跌回谷底（灵魂黑夜）。",
  "Act 3：马库斯不再依赖任何人的施舍与情报，决定靠自己的头脑正面迎战（主角改变）。他利用布莱克做空的致命破绽反手做多，上演了一场华尔街史诗级绞杀。在最终的股东大会上，马库斯当众揭露布莱克的内幕交易罪证，一举将其送进监狱，同时完成了对整栋投行大楼的反向收购（大决战）。索菲亚跪求复合被冷漠拒绝。马库斯选择了自始至终真心相待的娜塔莎，站在自己曾经拖地的大楼顶层，俯瞰整条华尔街（故事收尾）。",
  "世界观设定：当代纽约华尔街金融生态——西装精英、对冲基金、并购律所、清洁工与门卫构成的森严阶层。投行大楼是权力中心，电梯按工牌分层、餐厅按职级分区，金钱与人脉是唯一硬通货。继承条款、家族信托与 SEC 监管构成主角逆袭和反派翻车的制度土壤。",
  "视觉基调：金融蓝灰冷色调 + 高对比夜景霓虹；早段大量俯视清洁工的低机位 + 西装精英仰拍，凸显阶层落差；中后段切换为玻璃幕墙反射、股东大会大全景与并购室单点光，参考《华尔街之狼》《亿万》冷硬质感。",
  "核心主题：底层被金融秩序碾压后的反噬与重塑——身份不是别人施舍的，是自己从对手手里夺回来的；爽点根植于『曾经踩过你的人，最终在你的舞台上被审判』。",
  "",
  "【交付协议（仅本工作流，覆盖通用『输出要求』里的格式部分）】",
  "三幕创意只交付【结构与节奏】，不是分集大纲。每一 Act 用一段话写清上面【输出要求】里列出的内容点即可，**不要枚举具体反转揭晓时刻、不要给具体证据/账本/录音名、不要排集数**——这些都属于后面的大纲与剧本阶段。",
  "篇幅参照上面 Wall Street Janitor 模板：每一 Act 一段话，建议 120-220 字、最多不超过 280 字；少于 100 字不合格，超过 300 字属于把大纲细节灌进创意阶段。",
  "下游解析器只识别 12 个中文 label：新剧名 / 第一主角 / 叙事视角 / 受众 / 故事类型 / 故事背景 / 故事梗概（含 Act 1: / Act 2: / Act 3:）/ 世界观设定 / 视觉基调 / 核心主题。这 12 段对应你看到的【输出要求】中『一、题材与三幕大纲』+『二、世界观设定』+『三、视觉基调』+『四、核心主题』四个一级章节，缺一不可。",
  "因此最终交付**不要输出 Optional Upgrade、不要写额外标题或编号、不要把『一、二、三、四』写到正文里**；只用上面 12 个 label 平铺成行；其他【输出要求】关于内容点的硬性约束（开场爆点、Act 1-3 必须命中的结构点、结尾钩子、闭环规则）请全部遵守。",
  "user 消息会再次给出 12-label 的精确模板，请严格按 user 消息中的模板输出。",
].join("\n");

export function buildCreativeMessages(project: BatchProject, item: BatchItem): LLMMessage[] {
  const complex = project.useComplexReversal;
  const overseas = project.targetMarket === "overseas";
  const sampleTitle = overseas ? "GLASS PRISON" : "玄医逆凡尘";
  const sampleProtagonist = overseas
    ? "Lucas——28 岁，瘦削敏感的记忆架构师，黑框眼镜下藏着忧郁的眼神，总是穿着灰色毛衣，手指修长适合键盘操作，看起来既脆弱又坚韧"
    : "林夏——27 岁，清冷利落的女法医，齐肩短发束成低马尾，常穿白色衬衫与黑色西裤，眼神锋利却藏着克制的善意，看起来沉稳到近乎冷漠";

  const oneLiner = (item.oneLiner || item.sourceText || item.sourceSummary || "").trim();

  const userLines = [
    `【目标市场】${marketLabel(project.targetMarket)}`,
    marketRules(project.targetMarket),
    `【总集数】${project.totalEpisodes}`,
    "",
    "【一句话题材】",
    oneLiner || "（题材未填，请要求重新输入）",
    "",
    "请基于以上一句话题材，输出 1 部新剧的三幕创意。所有人物、关系、爽点都从这一句话内化推导，不能照搬已有作品的剧名/人物名/桥段。",
    "",
    "【交付格式硬性要求 —— 严格 12 段，必须使用以下中文 label，每段一行，缺一不可，禁止额外的 Markdown 标题、序号、加粗、Optional Upgrade、第二季钩子】",
    "新剧名: <一句话剧名>",
    "第一主角: <主角姓名——年龄、外貌、穿着、气质、整体印象一句话，五要素必须齐全且写在同一段>",
    "叙事视角: <第几人称 + 限制/全知/多视角，括号注明跟随谁>",
    "受众: <男性/女性/全年龄>",
    "故事类型: <用 + 连接 3–4 个核心标签，例如 科幻+记忆+身份质疑>",
    "故事背景: <用 + 连接 2–3 个设定要素，例如 2050年+记忆科技+监狱系统>",
    "故事梗概: Act 1: <一段话 120–220 字，命中开场爆点 / 关系建立 / 主角处境 / 第一轮羞辱·误会·危机 / 进入故事 / 小反转 / 结尾钩子。不要枚举具体反转桥段、证据、人物花名册、集数。>",
    "Act 2: <一段话 120–220 字，命中追查/逃避·敌人升级·真相揭示·关系升级·持续压迫·内外冲突·中段大反转方向·主角反击/站队/护短·结尾钩子。点出大反转打在哪个维度（身份/孩子/血统/证据/婚姻真相/家族真相）即可，不必交代具体揭晓桥段。>",
    "Act 3: <一段话 120–220 字，命中真相揭晓方向·公开对决场合·反派打脸/失势·情感回收·权力重置·终局爽点。必须有公开打脸 + 情感回收 + 权力关系重置。闭环、反派处罚明确、核心谜团全部揭晓。>",
    "世界观设定: <一段话 60–140 字，写清世界规则、时代/地域、阶层与权力结构、关键制度/组织。要服务剧情冲突，不要堆百科。>",
    "视觉基调: <一段话 40–100 字，写清色彩、光线、镜头风格、参考片或参考美学（如『北欧冷冽 + 高对比金融蓝灰 + 手持跟拍』）。>",
    "核心主题: <一段话 30–80 字，写清本剧情绪母题与价值取向（底层被制度献祭 / 身份剥夺 / 真相反噬 / 复仇与救赎 等），一句话能概括。>",
    "",
    "【格式示例（仅供格式参照，内容请根据题材重新构思，禁止抄袭）】",
    `新剧名: ${sampleTitle}`,
    `第一主角: ${sampleProtagonist}`,
    "叙事视角: 第三人称限制视角（跟随主角）",
    overseas ? "受众: 男性" : "受众: 全年龄",
    "故事类型: <类型1>+<类型2>+<类型3>",
    "故事背景: <要素1>+<要素2>+<要素3>",
    "故事梗概: Act 1: ……（具体情节）",
    "Act 2: ……（具体情节）",
    "Act 3: ……（具体情节）",
    "世界观设定: ……（一段话，世界规则与冲突土壤）",
    "视觉基调: ……（一段话，色彩 / 光线 / 镜头 / 参考美学）",
    "核心主题: ……（一段话，情绪母题与价值取向）",
    "",
    "【硬性标准】",
    "- 新剧名必须独立成行，不要 Markdown 标题、不要书名号、不要数字序号。",
    overseas
      ? "- 海外向：新剧名必须为全英文（推荐 4 个单词以内全大写）；主角姓名一律纯英文。"
      : "- 国内向：新剧名建议 4-6 字中文、强冲突感。",
    "- 前 30 秒必须有开场爆点。",
    complex
      ? "- 复杂反转模式：在三幕中点出 5–7 层反转的【类型分布】（身份/关系/动机/现实/存在/世界观/元叙事），不要枚举每一层的具体揭晓桥段——具体揭晓留给后续大纲与剧本阶段。"
      : "- Act 2 必须有足以推动付费的大反转方向（点出方向即可，不必交代具体桥段）。",
    "- Act 3 必须闭环，反派处罚明确，核心谜团全部揭晓。",
    "- 12 段都必须有内容（含 世界观设定 / 视觉基调 / 核心主题），不允许写「待补充」「TBD」或留空。",
    "- 严禁输出 Optional Upgrade、升级建议、第二季伏笔等额外段落——下游解析器只识别上述 9 个 label。",
    "- 三幕段落严禁超过 280 字 / 段；超过即视为把大纲细节灌进创意阶段。",
  ];

  if (complex) {
    userLines.push("", COMPLEX_REVERSAL_BATCH_RULES);
  }

  return [
    { role: "system", content: CREATIVE_SYSTEM_PROMPT },
    { role: "user", content: userLines.join("\n") },
  ];
}

export function buildScreenplayMessages(project: BatchProject, item: BatchItem): LLMMessage[] {
  return buildScreenplayChunkMessages(project, item, 1, project.totalEpisodes, "");
}

// ---------------------------------------------------------------------------
// Synopsis stage —— 在 creative 之后、screenplay 之前生成两块产物：
//   1) 人物小传（5-8 个主要人物，每人 80-150 字）
//   2) 分集大纲（共 totalEpisodes 集，每集 60-100 字 + 钩子）
// 输出一个 markdown 文本，强制使用两个二级标题作为分隔锚点：
//   ## 人物小传
//   ## 分集大纲
// 解析器只检查这两个锚点，剩下的文本自由组织（人物用三级标题、大纲用「第 N
// 集：…… / 钩子：……」格式），保证模型有空间发挥但下游能稳定切片。
// ---------------------------------------------------------------------------
export function buildSynopsisMessages(project: BatchProject, item: BatchItem): LLMMessage[] {
  const overseas = project.targetMarket === "overseas";
  const creativeBlock = renderCreativeBlockForPrompt(item);
  const total = project.totalEpisodes;
  const sampleName = overseas ? "Lucas Reed" : "林夏";

  return [
    {
      role: "system",
      content:
        "你是 Drama Studio 红果批量工厂里的资深短剧策划。给定一个三幕创意，你需要在不展开为完整剧本的前提下，"
        + "输出两块产物：① 人物小传（让选角/编剧/美术能立刻理解每个主要人物的差异）；"
        + "② 分集大纲（把三幕展开成精确到每集的故事线索，让 Writer 可以照着写完整剧本）。"
        + "严格按 user 消息中的二级标题模板输出，不要写前言、不要复述创意、不要在末尾加总结。",
    },
    {
      role: "user",
      content: [
        `【目标市场】${marketLabel(project.targetMarket)}`,
        marketRules(project.targetMarket),
        `【总集数】${total}`,
        "",
        "【三幕创意】",
        creativeBlock,
        "",
        "【输出格式 —— 严格使用以下两个二级标题，缺一不可，禁止额外的一级标题或前后说明】",
        "",
        "## 人物小传",
        "",
        `### ${sampleName}`,
        "- 身份：<一句话身份+阶层>",
        "- 性格：<3-5 个关键词或短句>",
        "- 背景：<1-2 句过去经历，影响主线行为的核心创伤/秘密/野心>",
        "- 与主角的关系：<对位/盟友/反派/暗线，第一主角自己这一段写「主角自身」>",
        "- 关键弧光：<这部戏里他/她从什么状态走到什么状态>",
        "",
        "（重复以上结构，输出 5-8 位主要人物：第一主角、第二主角/恋人、主反派、关键盟友、关键家人/旧相识、可选的第二反派/真相揭露者。每位 80-150 字。）",
        "",
        "## 分集大纲",
        "",
        "第 1 集：<这一集的核心冲突 + 关键事件 60-100 字。必须命中『当集要发生什么』，不要复述创意。>",
        "钩子：<1 句话，过渡到下一集的悬念>",
        "",
        "第 2 集：<同上>",
        "钩子：<同上>",
        "",
        `（一直写到第 ${total} 集；每集都必须有「第 N 集：……」一行 + 「钩子：……」一行；最后一集的钩子用作终章余韵。）`,
        "",
        "【硬性标准】",
        "- 人物小传至少 5 位、最多 8 位；不能只写主角一人。",
        `- 分集大纲必须从第 1 集连续写到第 ${total} 集，集号不能跳、不能合并（不允许「第 5-7 集」这种合并写法）。`,
        "- 每集大纲必须有「钩子：」一行；最后一集（第 " + total + " 集）的钩子是终章余韵，不是新悬念。",
        "- 不要在大纲里写完整对白、不要写镜头号、不要写场号——这些留给后面的剧本与分镜阶段。",
        "- 三幕的覆盖比例参考：Act 1 占前 25-30%；Act 2 占中段 50% 左右；Act 3 占最后 20-25%。",
        overseas
          ? "- 海外向：人名/地名全部用纯英文，**严禁**任何亚裔元素和中文/拼音名。其余文本仍用中文便于中文审核。"
          : "- 国内向：人名地名全部中文，使用国内短剧表达。",
      ].join("\n"),
    },
  ];
}

// 把 synopsis 阶段返回的 markdown 拆成 charactersMd / outlineMd 两段。
// 锚点固定为「## 人物小传」/「## 分集大纲」，缺失任意一个时把整个 raw 当作
// 对应字段保留，避免内容被丢弃。
export function splitSynopsis(raw: string): { charactersMd: string; outlineMd: string } {
  const text = (raw || "").trim();
  if (!text) return { charactersMd: "", outlineMd: "" };
  const charIdx = text.search(/^##\s*人物小传\s*$/m);
  const outIdx = text.search(/^##\s*分集大纲\s*$/m);
  // Both anchors found in normal order — split cleanly.
  if (charIdx >= 0 && outIdx > charIdx) {
    const charBody = text.slice(charIdx).split(/^##\s*分集大纲\s*$/m)[0] ?? "";
    const outBody = text.slice(outIdx);
    return {
      charactersMd: stripHeading(charBody, "人物小传"),
      outlineMd: stripHeading(outBody, "分集大纲"),
    };
  }
  // Reversed order — outline first, characters second. Rare but tolerate.
  if (outIdx >= 0 && charIdx > outIdx) {
    const outBody = text.slice(outIdx).split(/^##\s*人物小传\s*$/m)[0] ?? "";
    const charBody = text.slice(charIdx);
    return {
      charactersMd: stripHeading(charBody, "人物小传"),
      outlineMd: stripHeading(outBody, "分集大纲"),
    };
  }
  // Only one anchor present — assign the whole content to that side.
  if (charIdx >= 0) return { charactersMd: stripHeading(text.slice(charIdx), "人物小传"), outlineMd: "" };
  if (outIdx >= 0) return { charactersMd: "", outlineMd: stripHeading(text.slice(outIdx), "分集大纲") };
  // No anchors — fall back to splitting on the first `第 1 集：` so a
  // mis-formatted response still produces some outline content.
  const epIdx = text.search(/^第\s*1\s*集[:：]/m);
  if (epIdx > 0) {
    return {
      charactersMd: text.slice(0, epIdx).trim(),
      outlineMd: text.slice(epIdx).trim(),
    };
  }
  return { charactersMd: text, outlineMd: "" };
}

function stripHeading(block: string, heading: string): string {
  return block.replace(new RegExp(`^##\\s*${heading}\\s*$`, "m"), "").trim();
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
        `【已写过的集（共 ${startEp - 1} 集，禁止重写、禁止再次输出）】`,
        `已存在第 1 集 至 第 ${startEp - 1} 集 的完整剧本（含钩子）。本次输出必须直接从「第 ${startEp} 集」开始。`,
        "",
        `【上一集结尾（仅供你延续剧情节奏，禁止复制重写）】`,
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
  const charactersBlock = item.charactersMd?.trim()
    ? ["", "【人物表（必须严格使用以下姓名、身份、关系；不得新增主要人物或改名）】", item.charactersMd.trim()].join("\n")
    : "";
  const outlineSlice = sliceOutlineByEpisodes(item.outlineMd, startEp, endEp);
  const outlineBlock = outlineSlice
    ? [
        "",
        `【分集大纲（仅本批次第 ${startEp}-${endEp} 集，剧本必须严格按这里的核心冲突 + 钩子展开）】`,
        outlineSlice,
      ].join("\n")
    : "";
  return [
    {
      role: "system",
      content: overseas
        ? "你是 Drama Studio 红果批量工厂里的专业海外短剧 Writer。请严格按 docx 交付格式输出剧本：每集若干个 N-M 子场次，每个子场次必须包含「场景 / 人物 / 过程描写」三个 label，过程描写内部把动作（△）与台词逐行交错。台词必须双语：先英文后中文，二者皆用中文圆角双引号 “...”。本集最后一个子场次必须额外加「钩子」。语言克制、台词短狠，每场至少发生一次局势变化。**人物姓名必须严格使用 user 消息【人物表】中给定的姓名，禁止改名或新增主要人物。**"
        : "你是 Drama Studio 红果批量工厂里的专业短剧 Writer。请严格按 docx 交付格式输出剧本：每集若干个 N-M 子场次，每个子场次必须包含「场景 / 人物 / 过程描写」三个 label，过程描写内部把动作（△）与台词逐行交错。本集最后一个子场次必须额外加「钩子」。语言克制、台词短狠，每场至少发生一次局势变化（信息释放/情绪转折/权力转移/关系变化/威胁升级/决策形成/谎言暴露）。**人物姓名必须严格使用 user 消息【人物表】中给定的姓名，禁止改名或新增主要人物。**",
    },
    {
      role: "user",
      content: [
        `【目标市场】${marketLabel(project.targetMarket)}`,
        marketRules(project.targetMarket),
        `【全剧总集数】${project.totalEpisodes}`,
        `【本次只输出区间】第 ${startEp} 集 至 第 ${endEp} 集（共 ${endEp - startEp + 1} 集）`,
        startEp > 1
          ? `【硬性铁则】你的输出必须以「第 ${startEp} 集」这一行作为第一个集数标题。**禁止**重写第 1 集到第 ${startEp - 1} 集中的任何一集，**禁止**重新介绍人物或重复上文剧情。如果你写了第 ${startEp - 1} 集或之前的内容，整批将被丢弃。`
          : "",
        "",
        "【三幕创意】",
        creativeBlock,
        charactersBlock,
        outlineBlock,
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
        item.charactersMd?.trim()
          ? "- 角色姓名必须与【人物表】完全一致；如果该集没有列出的次要人物登场，可创建路人但不能给路人分配主线戏份。"
          : "",
        outlineSlice
          ? "- 每一集必须命中【分集大纲】里这一集对应行的『核心冲突 + 钩子』；不允许偏离大纲安排剧情或自创新主线。"
          : "",
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

// Cut a `第 N 集：……` / `钩子：……` style outline down to just the rows that
// match [startEp, endEp]. Used to keep the screenplay chunk prompt focused on
// the slice it's actually writing — feeding all 30 episodes of outline every
// chunk both wastes tokens and tempts the model to "re-establish" earlier
// episodes inside the current chunk.
//
// Tolerant of either CJK colon (：) or ASCII colon (:) and of `第 N 集` with
// or without a bullet. Falls back to returning "" if the outline isn't
// shaped this way (e.g. legacy items without an outline_md column).
export function sliceOutlineByEpisodes(outline: string, startEp: number, endEp: number): string {
  if (!outline?.trim()) return "";
  const lines = outline.split(/\r?\n/);
  const out: string[] = [];
  let keeping = false;
  for (const line of lines) {
    const head = line.trim().match(/^第\s*(\d+)\s*集[:：]/);
    if (head) {
      const n = Number(head[1]);
      keeping = n >= startEp && n <= endEp;
    }
    if (keeping) out.push(line);
  }
  return out.join("\n").trim();
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
  const overseas = project.targetMarket === "overseas";
  const charactersBlock = item.charactersMd?.trim()
    ? ["", "【人物表（分镜里出现的人物姓名/称呼必须严格使用以下命名）】", item.charactersMd.trim()].join("\n")
    : "";
  const outlineSlice = sliceOutlineByEpisodes(item.outlineMd, startEp, endEp);
  const outlineBlock = outlineSlice
    ? ["", `【分集大纲（仅本批次第 ${startEp}-${endEp} 集，分镜镜头序列必须能对应到大纲核心冲突 + 钩子）】`, outlineSlice].join("\n")
    : "";
  return [
    {
      role: "system",
      content:
        "你是 Drama Studio 主链路里的分镜导演。请按红果短剧拍摄用的逐秒分镜表输出：每个镜头一行，固定七列「镜头号 | 逐秒分镜画面描述 | 中英双语台词 | 运镜方式/景别 | 人物图/场景图 | 备注 | 时长」，每镜默认 4 秒，整集累计约 60–66 秒。**台词列里出现的角色名必须与 user 消息【人物表】完全一致；分镜镜头序列要让大纲里这一集的核心冲突 + 钩子有明确的镜头落地。**",
    },
    {
      role: "user",
      content: [
        `【目标市场】${marketLabel(project.targetMarket)}`,
        `【全剧总集数】${project.totalEpisodes}`,
        `【本次只输出区间】第 ${startEp} 集 至 第 ${endEp} 集（共 ${endEp - startEp + 1} 集）`,
        startEp > 1
          ? `【硬性铁则】你的输出必须以「## 第 ${startEp} 集分镜（约 X s）」作为第一个标题。**禁止**重写第 1 集到第 ${startEp - 1} 集分镜中的任何一集。如果你写了第 ${startEp - 1} 集或之前的分镜，整批将被丢弃。`
          : "",
        charactersBlock,
        outlineBlock,
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
