/** Stable, secret-free lifecycle errors; callers must not guess from upstream bodies. */
export class OAuthCredentialError extends Error {
  constructor(
    public readonly code:
      | "disconnected"
      | "invalid_token"
      | "missing_refresh"
      | "invalid_grant"
      | "refresh_uncertain"
      | "refresh_busy"
      | "refresh_cooldown"
      | "credential_changed"
      | "store_unavailable"
      | "provider_configuration",
    public readonly retryable: boolean,
  ) {
    const messages = {
      disconnected: "Canal sem autorização OAuth ativa — reconecte o canal.",
      invalid_token: "A credencial ou validade recebida é inválida — reconecte o canal.",
      missing_refresh: "Token expirado sem renovação disponível — reconecte o canal.",
      invalid_grant: "A autorização foi recusada pelo provedor — reconecte o canal.",
      refresh_uncertain:
        "O resultado da renovação é incerto. Por segurança, não repetiremos o grant — reconecte o canal.",
      refresh_busy:
        "A autorização já está sendo renovada por outro processo. Tente novamente em instantes.",
      refresh_cooldown: "A renovação está em espera temporária. Tente novamente mais tarde.",
      credential_changed: "A autorização mudou durante a operação. Atualize e tente novamente.",
      store_unavailable:
        "Não foi possível confirmar a autorização no banco. Tente novamente mais tarde.",
      provider_configuration: "A renovação depende de uma configuração do provedor no servidor.",
    };
    super(messages[code]);
    this.name = "OAuthCredentialError";
  }
}
