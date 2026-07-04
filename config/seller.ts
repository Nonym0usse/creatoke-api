// Coordonnées du vendeur utilisées sur les factures.
// Surchargeables via variables d'environnement (SELLER_*).
export const seller = {
  name: process.env.SELLER_NAME ?? "CREATOKE",
  address: process.env.SELLER_ADDRESS ?? "Arcades des Citeaux, Le Sénanque, 13127 Vitrolles, France",
  siret: process.env.SELLER_SIRET ?? "",
  email: process.env.SELLER_EMAIL ?? "contact@creatoke.fr",
};

// Franchise en base de TVA : aucune TVA facturée, prix TTC = HT.
export const VAT_NOTICE = "TVA non applicable, art. 293 B du CGI";
