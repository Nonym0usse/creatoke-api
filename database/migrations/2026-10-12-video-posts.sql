-- Historique des vidéos publiées sur les réseaux (page « Publier une vidéo » et
-- assistant IA) : titre, texte, vidéo, résultat de chaque réseau.
-- status : running (en cours, publication lancée en arrière-plan), done, failed.
CREATE TABLE IF NOT EXISTS video_posts (
  id          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(255)  NOT NULL DEFAULT '',
  description TEXT          NULL,
  video_url   VARCHAR(1024) NULL,
  source      VARCHAR(16)   NOT NULL DEFAULT 'site',
  status      VARCHAR(16)   NOT NULL DEFAULT 'running',
  results     TEXT          NULL,
  error       TEXT          NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME      NULL,
  KEY idx_video_posts_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
