// Obtient les autorisations YouTube ou LinkedIn pour publier les vidéos.
//
//   npm run social:auth youtube    → affiche YOUTUBE_REFRESH_TOKEN
//   npm run social:auth linkedin   → affiche LINKEDIN_ACCESS_TOKEN et LINKEDIN_AUTHOR_URN
//
// À lancer sur votre ordinateur : le script ouvre une page de connexion dans le navigateur,
// puis affiche les valeurs à copier dans le .env du serveur.
// Prérequis : YOUTUBE_CLIENT_ID/SECRET ou LINKEDIN_CLIENT_ID/SECRET dans le .env.
import "dotenv/config";
import axios from "axios";
import crypto from "node:crypto";
import http from "node:http";
import { execFile } from "node:child_process";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

interface Provider {
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  scope: string;
  extraParams: Record<string, string>;
  exchange: (code: string) => Promise<void>;
}

const providers: Record<string, Provider> = {
  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    // offline + consent : Google renvoie un refresh token à chaque autorisation
    extraParams: { access_type: "offline", prompt: "consent" },
    async exchange(code) {
      const { data } = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          code,
          client_id: this.clientId as string,
          client_secret: this.clientSecret as string,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      );
      if (!data.refresh_token) throw new Error("Google n'a pas renvoyé de refresh token.");
      console.log("\nAjoutez cette ligne au .env du serveur :\n");
      console.log(`YOUTUBE_REFRESH_TOKEN=${data.refresh_token}\n`);
    },
  },
  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    scope: "openid profile w_member_social",
    extraParams: {},
    async exchange(code) {
      const { data } = await axios.post(
        "https://www.linkedin.com/oauth/v2/accessToken",
        new URLSearchParams({
          code,
          client_id: this.clientId as string,
          client_secret: this.clientSecret as string,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      );
      const { data: me } = await axios.get("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const expires = new Date(Date.now() + Number(data.expires_in) * 1000).toLocaleDateString("fr-FR");
      console.log(`\nCompte : ${me.name}. Jeton valable jusqu'au ${expires}.`);
      console.log("Ajoutez ces lignes au .env du serveur :\n");
      console.log(`LINKEDIN_ACCESS_TOKEN=${data.access_token}`);
      console.log(`LINKEDIN_AUTHOR_URN=urn:li:person:${me.sub}\n`);
    },
  },
};

const name = process.argv[2];
const provider = providers[name ?? ""];
if (!provider) {
  console.error("Usage : npm run social:auth youtube|linkedin");
  process.exit(1);
}
if (!provider.clientId || !provider.clientSecret) {
  const prefix = name.toUpperCase();
  console.error(`${prefix}_CLIENT_ID et ${prefix}_CLIENT_SECRET doivent être définis dans le .env.`);
  process.exit(1);
}

const state = crypto.randomBytes(16).toString("hex");
const url = new URL(provider.authorizeUrl);
url.search = new URLSearchParams({
  client_id: provider.clientId,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: provider.scope,
  state,
  ...provider.extraParams,
}).toString();

const server = http.createServer(async (req, res) => {
  const params = new URL(req.url ?? "/", REDIRECT_URI).searchParams;
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404).end();
    return;
  }
  const finish = (message: string, code = 0) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end(message);
    server.close();
    process.exitCode = code;
  };
  if (params.get("state") !== state) return finish("Réponse inattendue (state invalide).", 1);
  if (params.get("error")) return finish(`Autorisation refusée : ${params.get("error")}`, 1);

  try {
    await provider.exchange(params.get("code") ?? "");
    finish("Autorisation enregistrée : vous pouvez fermer cet onglet et revenir au terminal.");
  } catch (error) {
    const detail = axios.isAxiosError(error) ? JSON.stringify(error.response?.data) : String(error);
    console.error("Échec :", detail);
    finish("Échec de l'autorisation : voir le terminal.", 1);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Ouvrez cette adresse si le navigateur ne s'ouvre pas :\n\n${url}\n`);
  if (process.platform === "darwin") execFile("open", [url.toString()]);
});
