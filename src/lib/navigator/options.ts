/** Stable persisted values preserve existing profile/Brain consumers. Labels live in PT/EN resources. */
export const NAVIGATOR_EXPERIENCE = ["beginner", "intermediate", "advanced"] as const;
export const NAVIGATOR_PATHS = [
  "local_business",
  "content_creator",
  "affiliate",
  "digital_services",
  "saas_builder",
  "agency",
  "freelancer",
  "ecommerce",
] as const;
export const NAVIGATOR_MATURITY = ["seed", "sprout", "growth", "established", "scaling"] as const;
export const NAVIGATOR_GOALS = [
  { id: "firstClients", value: "Primeiros clientes" },
  { id: "audience", value: "Construir audiência" },
  { id: "launch", value: "Lançar produto" },
  { id: "sales", value: "Aumentar vendas" },
  { id: "presence", value: "Crescer presença" },
  { id: "automate", value: "Automatizar processos" },
  { id: "validate", value: "Validar ideia" },
  { id: "costs", value: "Reduzir custos" },
] as const;
export const NAVIGATOR_CHANNELS = [
  { id: "instagram", value: "Instagram" },
  { id: "facebook", value: "Facebook" },
  { id: "tiktok", value: "TikTok" },
  { id: "youtube", value: "YouTube" },
  { id: "linkedin", value: "LinkedIn" },
  { id: "whatsapp", value: "WhatsApp" },
  { id: "googleBusiness", value: "Google Business" },
  { id: "x", value: "X / Twitter" },
  { id: "email", value: "Email" },
] as const;
export const NAVIGATOR_CONTENT = [
  { id: "posts", value: "Posts" },
  { id: "reels", value: "Reels" },
  { id: "longVideo", value: "Vídeos longos" },
  { id: "carousels", value: "Carrosséis" },
  { id: "stories", value: "Stories" },
  { id: "live", value: "Lives" },
  { id: "newsletter", value: "Newsletter" },
] as const;
export const NAVIGATOR_MODEL = "velt-navigator-v2" as const;
export const NAVIGATOR_ACTIONS = {
  reviewBrand: { title: "Revisar o cadastro da sua marca", href: "/app/brands" },
  draftContent: { title: "Preparar um rascunho de conteúdo", href: "/app/content" },
  considerChannels: { title: "Avaliar canais opcionais para sua operação", href: "/app/channels" },
  reviewChannels: { title: "Revisar suas preferências de canais", href: "/app/channels" },
  learnBasics: { title: "Explorar uma trilha introdutória de conteúdo", href: "/app/learning" },
} as const;
export type NavigatorActionCode = keyof typeof NAVIGATOR_ACTIONS;
