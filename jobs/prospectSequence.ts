import cron from "node-cron";
import { Prospect } from "../middleware/admin/Prospect.ts";

// Job quotidien de relances éditeurs (9h, heure de Paris).
// L'idempotence est garantie par l'état en base (currentStep + seuils de
// jours) : un redémarrage ou un jour manqué est rattrapé au run suivant.
// ⚠️ pm2 : mode fork / 1 instance obligatoire, sinon envois dupliqués.
export function startProspectSequenceJob(): void {
  const prospect = new Prospect();
  cron.schedule(
    process.env.PROSPECT_CRON ?? "0 9 * * *",
    async () => {
      try {
        const result = await prospect.runSequence();
        console.log(
          `[prospect-sequence] traités: ${result.processed}, envoyés: ${result.sent}, clôturés: ${result.closed}, erreurs: ${result.errors}`,
        );
      } catch (error) {
        console.error("[prospect-sequence] échec du job:", error);
      }
    },
    { timezone: "Europe/Paris" },
  );
  console.log("⏰ Job de relances éditeurs planifié (0 9 * * *, Europe/Paris)");
}
