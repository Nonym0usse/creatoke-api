-- Bilans mensuels envoyés par e-mail (un par mois, le mois précédent).
-- La ligne est réservée avant l'envoi : deux processus ne peuvent pas envoyer
-- le même bilan, et un bilan manqué (serveur arrêté le 1er) est rattrapé.
CREATE TABLE IF NOT EXISTS monthly_reports (
  period     CHAR(7)       NOT NULL PRIMARY KEY,  -- AAAA-MM
  status     VARCHAR(16)   NOT NULL DEFAULT 'sending',
  recipients VARCHAR(1024) NULL,
  sent_at    DATETIME      NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
