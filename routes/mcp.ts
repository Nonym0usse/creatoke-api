import express, { type Request, type Response } from "express";
import cors from "cors";
import {
  createOAuthMetadata,
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js";
import { clientRegistrationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/register.js";
import { revocationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/revoke.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { execute, selectOne } from "../database/mysql.ts";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
  verifyAgainstDummy,
  verifyPassword,
} from "../services/auth.ts";
import { CreatokeOAuthProvider, MCP_SCOPE } from "../mcp/oauth.ts";
import { renderLoginPage } from "../mcp/login-page.ts";
import { buildMcpServer } from "../mcp/tools.ts";

// Connecteur MCP pour assistants IA (ChatGPT, Claude…) : https://api.creatoke.fr/mcp
// Monté à la racine de l'application (les descriptions /.well-known/… y sont).

const baseUrl = new URL(process.env.MCP_PUBLIC_URL || process.env.BASE_PUBLIC_URL || "http://localhost:3001");
const mcpUrl = new URL("/mcp", baseUrl);
const provider = new CreatokeOAuthProvider();
const RATE_LIMIT = { validate: { trustProxy: false } };

const router = express.Router();

// Adresses OAuth regroupées sous /mcp/oauth/ (au lieu de /authorize, /token,
// /register… à la racine, valeurs par défaut du SDK) : chez o2switch, un filtre
// anti-robots bloque les POST sur « /register » après quelques inscriptions.
// Les assistants lisent ces adresses dans la description publiée (RFC 8414).
const oauthUrl = (path: string): string => new URL(`/mcp/oauth/${path}`, baseUrl).href;
const oauthMetadata = {
  ...createOAuthMetadata({ provider, issuerUrl: baseUrl, baseUrl, scopesSupported: [MCP_SCOPE] }),
  authorization_endpoint: oauthUrl("authorize"),
  token_endpoint: oauthUrl("token"),
  registration_endpoint: oauthUrl("clients"),
  revocation_endpoint: oauthUrl("revoke"),
};

router.use(
  mcpAuthMetadataRouter({ oauthMetadata, resourceServerUrl: mcpUrl, scopesSupported: [MCP_SCOPE], resourceName: "Créatoké" }),
);
// L'application fait confiance à X-Forwarded-For (« trust proxy ») : la limite
// par IP du SDK est contournable et le signale à chaque requête. La page de
// connexion limite de toute façon les essais par e-mail (services/auth.ts).
router.use("/mcp/oauth/authorize", authorizationHandler({ provider, rateLimit: RATE_LIMIT }));
router.use("/mcp/oauth/token", tokenHandler({ provider, rateLimit: RATE_LIMIT }));
router.use("/mcp/oauth/clients", clientRegistrationHandler({ clientsStore: provider.clientsStore, rateLimit: RATE_LIMIT }));
router.use("/mcp/oauth/revoke", revocationHandler({ provider, rateLimit: RATE_LIMIT }));

type AdminRow = { id: string; email: string; password_hash: string };

const field = (req: Request, name: string): string => (typeof req.body?.[name] === "string" ? req.body[name] : "");

// Formulaire de la page de connexion (affichée par provider.authorize).
router.post("/mcp/login", express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
  const client = await provider.clientsStore.getClient(field(req, "client_id"));
  const redirectUri = field(req, "redirect_uri");
  const codeChallenge = field(req, "code_challenge");
  // Les champs cachés peuvent être modifiés : on revérifie l'adresse de retour.
  if (!client || !client.redirect_uris.includes(redirectUri) || !codeChallenge) {
    res.status(400).type("text").send("Demande de connexion invalide. Relancez la connexion depuis votre assistant.");
    return;
  }

  const state = field(req, "state") || undefined;
  const scopes = field(req, "scope").split(" ").filter(Boolean);
  const resource = field(req, "resource") || undefined;
  const params = {
    redirectUri,
    codeChallenge,
    state,
    scopes,
    ...(resource ? { resource: new URL(resource) } : {}),
  };
  const email = field(req, "email").trim().toLowerCase();
  const password = field(req, "password");
  const retry = (status: number, error: string) =>
    res.status(status).type("html").send(renderLoginPage({ client, params, email, error }));

  const keys = [`email:${email}`, `ip:${req.ip}`];
  if (isLoginBlocked(keys)) return retry(429, "Trop de tentatives. Réessayez dans 15 minutes.");

  try {
    const admin = email
      ? await selectOne<AdminRow>("SELECT id, email, password_hash FROM admins WHERE email = ?", [email])
      : null;
    const valid = admin ? await verifyPassword(password, admin.password_hash) : await verifyAgainstDummy(password);
    if (!admin || !valid) {
      recordLoginFailure(keys);
      return retry(401, "E-mail ou mot de passe incorrect.");
    }
    clearLoginFailures(keys);
    await execute("UPDATE admins SET last_login_at = NOW() WHERE id = ?", [admin.id]);

    const code = await provider.issueAuthorizationCode({
      clientId: client.client_id,
      adminId: admin.id,
      redirectUri,
      codeChallenge,
      scopes: scopes.length ? scopes : [MCP_SCOPE],
      resource,
    });
    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    if (state) target.searchParams.set("state", state);
    res.redirect(302, target.href);
  } catch (error) {
    console.error("MCP login failed:", error instanceof Error ? error.message : error);
    retry(500, "Connexion impossible pour le moment. Réessayez dans un instant.");
  }
});

// En-têtes MCP autorisés pour les clients qui tournent dans un navigateur (inspecteur MCP…).
router.use(
  "/mcp",
  cors({
    origin: "*",
    allowedHeaders: ["Content-Type", "Authorization", "Mcp-Protocol-Version", "Mcp-Session-Id", "Last-Event-ID"],
    exposedHeaders: ["WWW-Authenticate", "Mcp-Session-Id"],
  }),
);

const bearer = requireBearerAuth({
  verifier: provider,
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
});

// Mode sans session : chaque requête crée son serveur (Passenger peut répartir
// les requêtes sur plusieurs processus).
router.post("/mcp", bearer, express.json({ limit: "1mb" }), async (req: Request, res: Response) => {
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error instanceof Error ? error.message : error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Erreur interne" }, id: null });
    }
  }
});

// Pas de flux serveur → client ni de session à fermer en mode sans session.
router.all("/mcp", bearer, (_req: Request, res: Response) => {
  res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Méthode non autorisée" }, id: null });
});

export default router;
