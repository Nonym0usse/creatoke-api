// Vérifie la connexion à Upload-Post sans rien publier.
//
//   npm run social:check
//
// Affiche le profil utilisé, les réseaux connectés et la consommation du mois.
import "dotenv/config";
import { NETWORK_NAMES } from "../services/social/common.ts";
import { networkStatus, uploadPostConfigured, uploadPostProfile } from "../services/social/uploadPost.ts";

if (!uploadPostConfigured()) {
  console.error("UPLOAD_POST_API_KEY absent du .env");
  process.exit(1);
}

try {
  const profile = await uploadPostProfile(true);
  console.log(`Profil Upload-Post : ${profile.username}\n`);
  for (const n of await networkStatus()) {
    const state = n.configured ? "✅ connecté" : n.reauthRequired ? "⚠️  à reconnecter" : "—  non connecté";
    console.log(`${NETWORK_NAMES[n.id].padEnd(18)} ${state}${n.account ? ` (${n.account})` : ""}`);
  }
  const me = await fetch("https://api.upload-post.com/api/uploadposts/me", {
    headers: { Authorization: `Apikey ${process.env.UPLOAD_POST_API_KEY}` },
  }).then((r) => r.json() as Promise<any>);
  const usage = me?.api_usage ?? me?.usage;
  if (usage) console.log(`\nEnvois ce mois-ci : ${usage.count ?? "?"}${usage.limit ? ` / ${usage.limit}` : ""}`);
  if (me?.plan) console.log(`Formule : ${me.plan}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
