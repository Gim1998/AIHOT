// 当前信源的业务分类、需求标签与软件身份词典。
export const CATEGORIES = [
  {"key": "print-signage", "label": "印刷标识", "section": "印刷与标识", "guide": "印刷店、招牌制作、印前、报价排产、RIP、MIS 与 ERP 工作流"},
  {"key": "bookkeeping", "label": "财务记账", "section": "财务与记账", "guide": "记账、对账、发票、收款、财务软件与会计团队流程"},
  {"key": "property-rentals", "label": "房产短租", "section": "房产与短租", "guide": "物业、租赁、短租房东、房客沟通、清洁维护与渠道管理"},
  {"key": "photography", "label": "婚礼摄影", "section": "婚礼与摄影", "guide": "婚礼摄影业务、预约、合同、选片、修图、交付与客户协作"},
  {"key": "ecommerce", "label": "电商卖家", "section": "电商与卖家", "guide": "Etsy、独立站、商品刊登、库存订单、客服与配送"},
  {"key": "automation", "label": "业务自动化", "section": "跨行业自动化", "guide": "跨行业重复劳动、软件替代、系统集成、数据整理与自动化外包需求；按具体业务优先归前五类"},
] as const;

export const ITEM_TYPES = ["workflow_pain", "software_update", "automation_recipe", "cost_evidence", "platform_change", "experience_report", "how_to"] as const;
export const CATEGORY_TAGS = ["流程痛点", "软件更新", "自动化方案", "成本证据", "平台规则", "经验复盘", "操作教程", "工具选型", "其他"] as const;
export const TOPIC_TAGS = ["印刷标识", "财务记账", "房产短租", "婚礼摄影", "电商经营", "跨行业流程", "重复劳动", "报价计费", "排期预约", "客户沟通", "账务对账", "库存订单", "数据导出", "系统集成", "软件替代", "付费需求", "成本压力", "交付协作"] as const;
export const ENTITY_TAGS = ["QuickBooks", "Xero", "Airbnb", "Vrbo", "Guesty", "Lightroom", "Photoshop", "Etsy", "Shopify", "Printavo", "shopVOX", "Zapier", "Make"] as const;
export const TAG_SYNONYMS: Readonly<Record<string,string>> = {"痛点": "流程痛点", "求助": "流程痛点", "重复操作": "重复劳动", "自动化": "自动化方案", "工具": "工具选型", "软件推荐": "工具选型", "替代工具": "软件替代", "价格": "报价计费", "收费": "报价计费", "对账": "账务对账", "导出": "数据导出", "教程": "操作教程", "经验": "经验复盘", "平台政策": "平台规则", "产品更新": "软件更新"};
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string,string>> = {"workflow_pain": "流程痛点", "software_update": "软件更新", "automation_recipe": "自动化方案", "cost_evidence": "成本证据", "platform_change": "平台规则", "experience_report": "经验复盘", "how_to": "操作教程"};
export const ENTITIES: Record<string,{name:string;displayTag:string|null;aliases:string[]}> = {"quickbooks": {"name": "QuickBooks", "displayTag": "QuickBooks", "aliases": ["QuickBooks", "Intuit"]}, "xero": {"name": "Xero", "displayTag": "Xero", "aliases": ["Xero"]}, "airbnb": {"name": "Airbnb", "displayTag": "Airbnb", "aliases": ["Airbnb", "爱彼迎"]}, "vrbo": {"name": "Vrbo", "displayTag": "Vrbo", "aliases": ["Vrbo"]}, "guesty": {"name": "Guesty", "displayTag": "Guesty", "aliases": ["Guesty"]}, "lightroom": {"name": "Lightroom", "displayTag": "Lightroom", "aliases": ["Lightroom"]}, "photoshop": {"name": "Photoshop", "displayTag": "Photoshop", "aliases": ["Photoshop"]}, "etsy": {"name": "Etsy", "displayTag": "Etsy", "aliases": ["Etsy"]}, "shopify": {"name": "Shopify", "displayTag": "Shopify", "aliases": ["Shopify"]}, "printavo": {"name": "Printavo", "displayTag": "Printavo", "aliases": ["Printavo"]}, "shopvox": {"name": "shopVOX", "displayTag": "shopVOX", "aliases": ["shopVOX"]}, "zapier": {"name": "Zapier", "displayTag": "Zapier", "aliases": ["Zapier"]}, "make": {"name": "Make", "displayTag": "Make", "aliases": ["Make.com"]}};
export const IDENTITY_LEXICON: ReadonlyArray<{id:string;name:string;patterns:RegExp[]}> = [
  { id: "quickbooks", name: "QuickBooks", patterns: [/QuickBooks|Intuit/i] },
  { id: "xero", name: "Xero", patterns: [/Xero/i] },
  { id: "airbnb", name: "Airbnb", patterns: [/Airbnb|爱彼迎/i] },
  { id: "vrbo", name: "Vrbo", patterns: [/Vrbo/i] },
  { id: "guesty", name: "Guesty", patterns: [/Guesty/i] },
  { id: "lightroom", name: "Lightroom", patterns: [/Lightroom/i] },
  { id: "photoshop", name: "Photoshop", patterns: [/Photoshop/i] },
  { id: "etsy", name: "Etsy", patterns: [/Etsy/i] },
  { id: "shopify", name: "Shopify", patterns: [/Shopify/i] },
  { id: "printavo", name: "Printavo", patterns: [/Printavo/i] },
  { id: "shopvox", name: "shopVOX", patterns: [/shopVOX/i] },
  { id: "zapier", name: "Zapier", patterns: [/Zapier/i] },
  { id: "make", name: "Make", patterns: [/Make\.com/i] },
];
export const PUBLISHER_DOMAINS: ReadonlyArray<{entityId:string;domains:readonly string[]}> = [{"entityId": "quickbooks", "domains": ["quickbooks.intuit.com"]}, {"entityId": "xero", "domains": ["xero.com"]}, {"entityId": "airbnb", "domains": ["airbnb.com"]}, {"entityId": "vrbo", "domains": ["vrbo.com"]}, {"entityId": "guesty", "domains": ["guesty.com"]}, {"entityId": "etsy", "domains": ["etsy.com"]}, {"entityId": "shopify", "domains": ["shopify.com"]}, {"entityId": "printavo", "domains": ["printavo.com"]}, {"entityId": "shopvox", "domains": ["shopvox.com"]}, {"entityId": "zapier", "domains": ["zapier.com"]}, {"entityId": "make", "domains": ["make.com"]}];
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{entityId:string;pattern:RegExp}> = [];
