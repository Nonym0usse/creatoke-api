-- Schéma MySQL / MariaDB de creatoke-api.
-- Les identifiants restent des chaînes : les IDs Firestore existants sont
-- conservés tels quels lors de la migration, les nouveaux sont des UUID.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS musics (
  id                     VARCHAR(64)   NOT NULL PRIMARY KEY,
  slug                   VARCHAR(255)  NOT NULL DEFAULT '',
  title                  VARCHAR(255)  NOT NULL DEFAULT '',
  artist                 VARCHAR(255)  NOT NULL DEFAULT '',
  category               VARCHAR(100)  NOT NULL DEFAULT '',
  description            MEDIUMTEXT    NULL,
  lyrics                 MEDIUMTEXT    NULL,
  message                TEXT          NULL,
  price_base             DECIMAL(10,2) NULL,
  price_premium          DECIMAL(10,2) NULL,
  price_base_creatoke    DECIMAL(10,2) NULL,
  price_premium_creatoke DECIMAL(10,2) NULL,
  exclu                  VARCHAR(10)   NOT NULL DEFAULT 'non',
  isHeartStroke          VARCHAR(10)   NOT NULL DEFAULT 'non',
  isLicenceBase          VARCHAR(10)   NOT NULL DEFAULT 'non',
  isPremium              VARCHAR(10)   NOT NULL DEFAULT 'non',
  isLicenceBaseCreatoke  VARCHAR(10)   NOT NULL DEFAULT 'non',
  isPremiumCreatoke      VARCHAR(10)   NOT NULL DEFAULT 'non',
  promotion              MEDIUMTEXT    NULL,
  url                    VARCHAR(1024) NULL,
  creatoke               VARCHAR(1024) NULL,
  chanson_mp3            VARCHAR(1024) NULL,
  chanson_wav            VARCHAR(1024) NULL,
  creatoke_mp3           VARCHAR(1024) NULL,
  creatoke_wav           VARCHAR(1024) NULL,
  image                  VARCHAR(1024) NULL,
  youtubeURL             VARCHAR(1024) NULL,
  spotifyURL             VARCHAR(1024) NULL,
  -- Date au format YYYY-MM-DD telle qu'envoyée par l'admin.
  created_at             VARCHAR(32)   NOT NULL DEFAULT '',
  KEY idx_musics_slug (slug),
  KEY idx_musics_category (category),
  KEY idx_musics_title (title),
  KEY idx_musics_heart (isHeartStroke, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS category (
  id           VARCHAR(64)   NOT NULL PRIMARY KEY,
  category     VARCHAR(100)  NOT NULL DEFAULT '',
  title_fr     VARCHAR(255)  NOT NULL DEFAULT '',
  picture      VARCHAR(1024) NULL,
  picture_name VARCHAR(255)  NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS background (
  id           VARCHAR(64)   NOT NULL PRIMARY KEY,
  picture      VARCHAR(1024) NULL,
  picture_name VARCHAR(255)  NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS texts (
  id   VARCHAR(64) NOT NULL PRIMARY KEY,
  text MEDIUMTEXT  NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comment (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  music_id   VARCHAR(64)  NOT NULL DEFAULT '',
  name       VARCHAR(255) NOT NULL DEFAULT '',
  email      VARCHAR(255) NOT NULL DEFAULT '',
  ratings    TINYINT      NULL,
  comment    TEXT         NULL,
  created_at VARCHAR(32)  NOT NULL DEFAULT '',
  KEY idx_comment_music (music_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS licence (
  id           VARCHAR(64) NOT NULL PRIMARY KEY,
  basic        MEDIUMTEXT  NULL,
  base_plus    MEDIUMTEXT  NULL,
  premium      MEDIUMTEXT  NULL,
  premiulm     MEDIUMTEXT  NULL,
  contract_mp3 MEDIUMTEXT  NULL,
  contract_wav MEDIUMTEXT  NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS selling (
  id              VARCHAR(64)   NOT NULL PRIMARY KEY,
  date            VARCHAR(32)   NOT NULL DEFAULT '',
  month           VARCHAR(2)    NOT NULL DEFAULT '',
  year            INT           NULL,
  email_client    VARCHAR(255)  NOT NULL DEFAULT '',
  nom_client      VARCHAR(255)  NOT NULL DEFAULT '',
  id_song         VARCHAR(64)   NOT NULL DEFAULT '',
  titre_chanson   VARCHAR(255)  NOT NULL DEFAULT '',
  licence_name    VARCHAR(100)  NOT NULL DEFAULT '',
  price           DECIMAL(10,2) NULL,
  songUrlDownload VARCHAR(1024) NULL,
  KEY idx_selling_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
  invoiceNumber VARCHAR(32)   NOT NULL PRIMARY KEY,
  sellingId     VARCHAR(64)   NOT NULL DEFAULT '',
  id_song       VARCHAR(64)   NOT NULL DEFAULT '',
  nom_client    VARCHAR(255)  NOT NULL DEFAULT '',
  email_client  VARCHAR(255)  NOT NULL DEFAULT '',
  titre_chanson VARCHAR(255)  NOT NULL DEFAULT '',
  licence_name  VARCHAR(100)  NOT NULL DEFAULT '',
  price         DECIMAL(10,2) NULL,
  date          VARCHAR(32)   NOT NULL DEFAULT '',
  month         VARCHAR(2)    NULL,
  year          INT           NULL,
  storagePath   VARCHAR(255)  NOT NULL DEFAULT '',
  emailStatus   VARCHAR(16)   NOT NULL DEFAULT 'pending',
  emailError    TEXT          NULL,
  createdAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Compteurs séquentiels (ex. invoice-2026), incrémentés atomiquement.
CREATE TABLE IF NOT EXISTS counters (
  name VARCHAR(64) NOT NULL PRIMARY KEY,
  seq  INT         NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Prospects (ex-collection Firestore `contacts`).
CREATE TABLE IF NOT EXISTS prospects (
  id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
  nom                VARCHAR(255) NOT NULL DEFAULT '',
  prenom             VARCHAR(255) NOT NULL DEFAULT '',
  email              VARCHAR(255) NOT NULL,
  societe            VARCHAR(255) NOT NULL DEFAULT '',
  id_song            VARCHAR(64)  NOT NULL DEFAULT '',
  lien_musique       VARCHAR(1024) NOT NULL DEFAULT '',
  titre_chanson      VARCHAR(255) NOT NULL DEFAULT '',
  notes              TEXT         NULL,
  sequenceStatus     VARCHAR(16)  NOT NULL DEFAULT 'draft',
  currentStep        INT          NOT NULL DEFAULT 0,
  presentationSentAt DATETIME     NULL,
  createdAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_prospects_status (sequenceStatus),
  KEY idx_prospects_created (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historique des envois de la séquence (ex-tableau `history` du document).
CREATE TABLE IF NOT EXISTS prospect_history (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  prospect_id VARCHAR(64)  NOT NULL,
  step        INT          NOT NULL,
  label       VARCHAR(255) NOT NULL DEFAULT '',
  sentAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ok          TINYINT(1)   NOT NULL DEFAULT 1,
  error       TEXT         NULL,
  KEY idx_history_prospect (prospect_id, id),
  CONSTRAINT fk_history_prospect FOREIGN KEY (prospect_id)
    REFERENCES prospects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Personnalisations des emails de la séquence (absence de ligne = texte par défaut).
CREATE TABLE IF NOT EXISTS prospect_templates (
  template_key VARCHAR(32) NOT NULL PRIMARY KEY,
  subject      TEXT        NOT NULL,
  body         MEDIUMTEXT  NOT NULL,
  updatedAt    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comptes administrateurs (remplace Firebase Auth). Mot de passe haché en scrypt.
CREATE TABLE IF NOT EXISTS admins (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME     NULL,
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Connecteur MCP (assistants IA) : connexion OAuth des administrateurs.
-- Les codes et jetons sont stockés hachés (SHA-256), jamais en clair.

-- Applications clientes (ChatGPT, Claude…) inscrites automatiquement (RFC 7591).
CREATE TABLE IF NOT EXISTS mcp_clients (
  client_id  VARCHAR(64) NOT NULL PRIMARY KEY,
  data       TEXT        NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Codes d'autorisation (10 minutes, usage unique).
CREATE TABLE IF NOT EXISTS mcp_codes (
  code_hash      CHAR(64)      NOT NULL PRIMARY KEY,
  client_id      VARCHAR(64)   NOT NULL,
  admin_id       VARCHAR(64)   NOT NULL,
  redirect_uri   VARCHAR(2048) NOT NULL,
  code_challenge VARCHAR(255)  NOT NULL,
  scopes         VARCHAR(255)  NOT NULL DEFAULT '',
  resource       VARCHAR(512)  NULL,
  expires_at     DATETIME      NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Jetons d'accès (1 heure) et de renouvellement (30 jours).
CREATE TABLE IF NOT EXISTS mcp_tokens (
  token_hash CHAR(64)     NOT NULL PRIMARY KEY,
  kind       VARCHAR(8)   NOT NULL,
  client_id  VARCHAR(64)  NOT NULL,
  admin_id   VARCHAR(64)  NOT NULL,
  scopes     VARCHAR(255) NOT NULL DEFAULT '',
  resource   VARCHAR(512) NULL,
  expires_at DATETIME     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mcp_tokens_admin (admin_id),
  KEY idx_mcp_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Connecteur MCP, phase 2 : journal des actions faites par un assistant IA
-- (qui, quand, quel outil, avec quels paramètres, réussite ou erreur).
CREATE TABLE IF NOT EXISTS mcp_actions (
  id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_id   VARCHAR(64)  NOT NULL,
  client_id  VARCHAR(64)  NOT NULL,
  tool       VARCHAR(64)  NOT NULL,
  params     TEXT         NULL,
  ok         TINYINT(1)   NOT NULL,
  result     TEXT         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mcp_actions_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rubriques du catalogue (« Chansons à chanter », « Instrumentaux »…), jusqu'ici
-- écrites en dur dans le front. slug = valeur de musics.category.
-- has_creatoke : la rubrique propose une version créatoké (fichiers et prix) ;
-- has_lyrics : les paroles sont proposées ; item_label : « Acheter <item_label> ».
CREATE TABLE IF NOT EXISTS sections (
  slug         VARCHAR(100) NOT NULL PRIMARY KEY,
  label        VARCHAR(100) NOT NULL,
  icon         VARCHAR(64)  NOT NULL DEFAULT 'ri-music-2-line',
  description  VARCHAR(500) NOT NULL DEFAULT '',
  item_label   VARCHAR(100) NOT NULL DEFAULT 'la chanson',
  has_creatoke TINYINT(1)   NOT NULL DEFAULT 0,
  has_lyrics   TINYINT(1)   NOT NULL DEFAULT 1,
  position     INT          NOT NULL DEFAULT 100,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO sections (slug, label, icon, description, item_label, has_creatoke, has_lyrics, position) VALUES
 ('chansons-a-chanter', 'Chansons à chanter', 'ri-mic-line', 'Des chansons originales à interpréter, avec leur version créatoké pour chanter dessus.', 'la chanson à chanter', 1, 1, 10),
 ('chansons-cherche-auteur', 'Chanson(s) cherche auteur', 'ri-quill-pen-line', 'Des chansons en quête d''auteur.', 'la chanson cherche auteur', 1, 1, 20),
 ('instrumentaux', 'Instrumentaux', 'ri-music-2-line', 'Des compositions instrumentales originales.', 'l''instrumental', 0, 0, 30),
 ('musique-de-contenus', 'Musique de contenus', 'ri-film-line', 'Des musiques pour habiller vos vidéos, podcasts et contenus.', 'la musique de contenu', 0, 0, 40),
 ('creacourcis', 'Créacourcis', 'ri-flashlight-line', 'Des créations courtes et originales.', 'le créacourcis', 0, 1, 50),
 ('virgules-sonores', 'Virgules sonores', 'ri-sound-module-line', 'De courtes signatures sonores pour ponctuer vos contenus.', 'la virgule sonore', 0, 1, 60);

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
