import { formatDistance } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { enUS } from "date-fns/locale/en-US";

export function jobDistance(value: string | null, now: number, language: string) {
  return value && Number.isFinite(Date.parse(value))
    ? formatDistance(new Date(value), new Date(now), {
        addSuffix: true,
        locale: language === "en-US" ? enUS : ptBR,
      })
    : "—";
}
