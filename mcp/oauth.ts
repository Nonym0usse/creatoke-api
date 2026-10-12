import crypto from "node:crypto";
import type { Response } from "express";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { execute, selectOne } from "../database/mysql.ts";
import { renderLoginPage } from "./login-page.ts";

// Connexion des assistants IA (ChatGPT, Claude…) au connecteur MCP.
// OAuth 2.1 avec PKCE : l'assistant envoie l'administrateur sur une page de
// connexion Créatoké (email + mot de passe du compte admin), puis reçoit des
// jetons. Codes et jetons sont stockés hachés en base (Passenger peut
// redémarrer ou multiplier les processus : rien n'est gardé en mémoire).

const CODE_TTL_S = 10 * 60;
const ACCESS_TTL_S = 60 * 60;
const REFRESH_TTL_S = 30 * 24 * 60 * 60;

export const MCP_SCOPE = "creatoke:read";
export const MCP_WRITE_SCOPE = "creatoke:write";

const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");
const randomToken = (): string => crypto.randomBytes(32).toString("base64url");
const inSeconds = (seconds: number): Date => new Date(Date.now() + seconds * 1000);

type CodeRow = {
  client_id: string;
  admin_id: string;
  redirect_uri: string;
  code_challenge: string;
  scopes: string;
  resource: string | null;
  expires_at: Date;
};

type TokenRow = {
  kind: string;
  client_id: string;
  admin_id: string;
  scopes: string;
  resource: string | null;
  expires_at: Date;
  email: string | null;
};

// Applications clientes inscrites automatiquement (inscription dynamique RFC 7591).
class ClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const row = await selectOne<{ data: string }>("SELECT data FROM mcp_clients WHERE client_id = ?", [clientId]);
    return row ? (JSON.parse(row.data) as OAuthClientInformationFull) : undefined;
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): Promise<OAuthClientInformationFull> {
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: crypto.randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    await execute("INSERT INTO mcp_clients (client_id, data) VALUES (?, ?)", [full.client_id, JSON.stringify(full)]);
    return full;
  }
}

export class CreatokeOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new ClientsStore();

  // Étape 1 : la page de connexion (le formulaire est traité par handleLogin).
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    res.status(200).type("html").send(renderLoginPage({ client, params }));
  }

  // Étape 2 : identifiants vérifiés par la route de connexion → code d'autorisation.
  async issueAuthorizationCode(input: {
    clientId: string;
    adminId: string;
    redirectUri: string;
    codeChallenge: string;
    scopes: string[];
    resource?: string;
  }): Promise<string> {
    await this.purgeExpired();
    const code = randomToken();
    await execute(
      `INSERT INTO mcp_codes (code_hash, client_id, admin_id, redirect_uri, code_challenge, scopes, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sha256(code),
        input.clientId,
        input.adminId,
        input.redirectUri,
        input.codeChallenge,
        input.scopes.join(" "),
        input.resource ?? null,
        inSeconds(CODE_TTL_S),
      ],
    );
    return code;
  }

  private async findCode(client: OAuthClientInformationFull, code: string): Promise<CodeRow> {
    const row = await selectOne<CodeRow>(
      "SELECT client_id, admin_id, redirect_uri, code_challenge, scopes, resource, expires_at FROM mcp_codes WHERE code_hash = ?",
      [sha256(code)],
    );
    if (!row || row.client_id !== client.client_id || new Date(row.expires_at) < new Date()) {
      throw new InvalidGrantError("Code d'autorisation invalide ou expiré");
    }
    return row;
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    return (await this.findCode(client, authorizationCode)).code_challenge;
  }

  // Étape 3 : code (vérifié par PKCE dans le SDK) → jetons. Le code ne sert qu'une fois.
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const row = await this.findCode(client, authorizationCode);
    if (redirectUri && redirectUri !== row.redirect_uri) {
      throw new InvalidGrantError("redirect_uri différent de celui de la demande");
    }
    await execute("DELETE FROM mcp_codes WHERE code_hash = ?", [sha256(authorizationCode)]);
    return this.issueTokens(client.client_id, row.admin_id, row.scopes, row.resource);
  }

  // Renouvellement : l'ancien jeton de renouvellement est remplacé (rotation).
  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string): Promise<OAuthTokens> {
    const row = await this.findToken(refreshToken, "refresh");
    if (!row || row.client_id !== client.client_id) throw new InvalidGrantError("Jeton de renouvellement invalide");
    await execute("DELETE FROM mcp_tokens WHERE token_hash = ?", [sha256(refreshToken)]);
    return this.issueTokens(client.client_id, row.admin_id, row.scopes, row.resource);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = await this.findToken(token, "access");
    if (!row) throw new InvalidTokenError("Jeton invalide ou expiré");
    return {
      token,
      clientId: row.client_id,
      scopes: row.scopes ? row.scopes.split(" ") : [],
      expiresAt: Math.floor(new Date(row.expires_at).getTime() / 1000),
      ...(row.resource ? { resource: new URL(row.resource) } : {}),
      extra: { adminId: row.admin_id, email: row.email ?? "" },
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    await execute("DELETE FROM mcp_tokens WHERE token_hash = ?", [sha256(request.token)]);
  }

  // Le compte administrateur doit toujours exister : le supprimer coupe l'accès.
  private async findToken(token: string, kind: "access" | "refresh"): Promise<TokenRow | null> {
    const row = await selectOne<TokenRow>(
      `SELECT t.kind, t.client_id, t.admin_id, t.scopes, t.resource, t.expires_at, a.email
         FROM mcp_tokens t JOIN admins a ON a.id = t.admin_id
        WHERE t.token_hash = ? AND t.kind = ?`,
      [sha256(token), kind],
    );
    if (!row || new Date(row.expires_at) < new Date()) return null;
    return row;
  }

  private async issueTokens(clientId: string, adminId: string, scopes: string, resource: string | null): Promise<OAuthTokens> {
    const access = randomToken();
    const refresh = randomToken();
    const insert = `INSERT INTO mcp_tokens (token_hash, kind, client_id, admin_id, scopes, resource, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`;
    await execute(insert, [sha256(access), "access", clientId, adminId, scopes, resource, inSeconds(ACCESS_TTL_S)]);
    await execute(insert, [sha256(refresh), "refresh", clientId, adminId, scopes, resource, inSeconds(REFRESH_TTL_S)]);
    return {
      access_token: access,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_S,
      refresh_token: refresh,
      ...(scopes ? { scope: scopes } : {}),
    };
  }

  private async purgeExpired(): Promise<void> {
    await execute("DELETE FROM mcp_codes WHERE expires_at < UTC_TIMESTAMP()");
    await execute("DELETE FROM mcp_tokens WHERE expires_at < UTC_TIMESTAMP()");
  }
}
