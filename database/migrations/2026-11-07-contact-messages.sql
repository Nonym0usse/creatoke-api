-- Messages du formulaire de contact, conservés 3 ans maximum (page RGPD) :
-- les plus anciens sont supprimés à l'arrivée de chaque nouveau message.
-- email_status : envoi de la copie à l'équipe (pending, sent, failed).
-- handled_at : message marqué comme traité (depuis l'assistant IA).
CREATE TABLE IF NOT EXISTS contact_messages (
  id           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255)  NOT NULL DEFAULT '',
  email        VARCHAR(255)  NOT NULL DEFAULT '',
  tel          VARCHAR(64)   NOT NULL DEFAULT '',
  message      TEXT          NOT NULL,
  email_status VARCHAR(16)   NOT NULL DEFAULT 'pending',
  handled_at   DATETIME      NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_contact_messages_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
