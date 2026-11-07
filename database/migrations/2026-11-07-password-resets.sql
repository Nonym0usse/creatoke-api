-- Réinitialisation du mot de passe des administrateurs (« mot de passe oublié »).
-- Seule l'empreinte SHA-256 du lien est stockée ; un lien sert une fois et
-- expire au bout d'une heure. used_at sert aussi à fermer les sessions
-- ouvertes avant le changement de mot de passe.
CREATE TABLE IF NOT EXISTS admin_password_resets (
  token_hash CHAR(64)     NOT NULL PRIMARY KEY,
  admin_id   VARCHAR(64)  NOT NULL,
  expires_at DATETIME     NOT NULL,
  used_at    DATETIME     NULL,
  ip         VARCHAR(64)  NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_password_resets_admin (admin_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
