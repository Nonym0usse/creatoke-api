import cron from "node-cron";
import { previousMonth, sendMonthlyReport } from "../services/monthlyReport.ts";

// Bilan mensuel des ventes : chaque jour à 8 h (Paris), envoie le bilan du mois
// précédent s'il n'est pas encore parti. En pratique il part le 1er du mois ;
// un serveur arrêté ou en veille ce jour-là le rattrape au passage suivant.
// Également vérifié deux minutes après le démarrage, pour la même raison.
// MONTHLY_REPORT_CRON=off désactive l'envoi automatique.
async function run(): Promise<void> {
  try {
    const outcome = await sendMonthlyReport(previousMonth());
    if (outcome.status === "sent") {
      console.log(`[monthly-report] bilan ${outcome.period} envoyé à ${outcome.recipients.join(", ")}`);
    } else if (outcome.status === "no_recipients") {
      console.warn(`[monthly-report] bilan ${outcome.period} non envoyé : aucun destinataire (MONTHLY_REPORT_TO ou comptes administrateurs).`);
    }
  } catch (error) {
    console.error("[monthly-report] échec :", error instanceof Error ? error.message : error);
  }
}

export function startMonthlyReportJob(): void {
  const schedule = process.env.MONTHLY_REPORT_CRON ?? "0 8 * * *";
  if (schedule === "off") {
    console.log("⏸️ Bilan mensuel automatique désactivé (MONTHLY_REPORT_CRON=off)");
    return;
  }
  cron.schedule(schedule, run, { timezone: "Europe/Paris" });
  setTimeout(run, 2 * 60 * 1000).unref();
  console.log(`⏰ Bilan mensuel planifié (${schedule}, Europe/Paris)`);
}
