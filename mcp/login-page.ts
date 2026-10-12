import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

// Page de connexion affichée quand un assistant IA demande l'accès à Créatoké.

const escape = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface LoginPageInput {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  email?: string;
  error?: string;
}

export function renderLoginPage({ client, params, email, error }: LoginPageInput): string {
  const appName = client.client_name?.trim() || "Votre assistant IA";
  const hidden: Record<string, string | undefined> = {
    client_id: client.client_id,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    state: params.state,
    scope: params.scopes?.join(" "),
    resource: params.resource?.href,
  };

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connecter ${escape(appName)} à Créatoké</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #131416; color: #e9e9ef; }
  .card { width: min(440px, 100%); padding: 32px 28px; border-radius: 16px; background: #1d1e22;
    border: 1px solid rgba(255,255,255,.1); position: relative; overflow: hidden; }
  .card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; background: linear-gradient(90deg,#5438d1,#8938d1 60%); }
  h1 { font-size: 21px; margin: 0 0 8px; color: #fff; }
  p { margin: 0 0 14px; line-height: 1.55; font-size: 15px; color: rgba(255,255,255,.75); }
  ul { margin: 0 0 20px; padding-left: 20px; font-size: 14px; line-height: 1.6; color: rgba(255,255,255,.75); }
  strong { color: #fff; }
  label { display: block; font-size: 14px; font-weight: 600; margin: 14px 0 6px; }
  input[type=email], input[type=password] { width: 100%; padding: 12px 14px; border-radius: 10px; font-size: 16px;
    border: 1px solid rgba(255,255,255,.18); background: #131416; color: #fff; }
  input:focus { outline: 2px solid #8938d1; outline-offset: 1px; }
  button { width: 100%; margin-top: 22px; padding: 13px; border: 0; border-radius: 999px; font-size: 16px; font-weight: 700;
    color: #fff; background: linear-gradient(90deg,#5438d1,#8938d1 60%); cursor: pointer; }
  .error { padding: 10px 12px; border-radius: 8px; background: rgba(255,91,77,.12); border-left: 4px solid #ff5b4d;
    color: #ffb4ac; font-size: 14px; margin-bottom: 6px; }
  .small { font-size: 13px; color: rgba(255,255,255,.55); margin: 18px 0 0; }
</style>
</head>
<body>
<main class="card">
  <h1>Connecter ${escape(appName)} à Créatoké</h1>
  <p><strong>${escape(appName)}</strong> demande l'accès à Créatoké. Il pourra :</p>
  <ul>
    <li>consulter le catalogue, les ventes, les factures, les prospects et les vidéos publiées ;</li>
    <li>avec <strong>votre accord à chaque fois</strong> : ajouter, modifier ou supprimer des chansons et des rubriques,
      modifier les licences, le texte d'accueil et l'image de fond, publier des vidéos sur les réseaux sociaux, gérer les
      prospects et leur envoyer des e-mails, modérer les commentaires.</li>
  </ul>
  <p>Il ne pourra ni encaisser, ni rembourser, ni modifier les mots de passe ou les comptes administrateurs. Chaque action est
    enregistrée. Connectez-vous avec votre compte administrateur pour accepter.</p>
  ${error ? `<div class="error" role="alert">${escape(error)}</div>` : ""}
  <form method="post" action="/mcp/login">
    ${Object.entries(hidden)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([name, value]) => `<input type="hidden" name="${name}" value="${escape(value)}">`)
      .join("\n    ")}
    <label for="email">Adresse e-mail</label>
    <input id="email" name="email" type="email" autocomplete="username" required value="${escape(email)}">
    <label for="password">Mot de passe</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Se connecter et autoriser</button>
  </form>
  <p class="small">Pour retirer l'accès plus tard, déconnectez le connecteur dans ${escape(appName)}.</p>
</main>
</body>
</html>`;
}
