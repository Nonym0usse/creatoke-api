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
  contract_mp3 MEDIUMTEXT  NULL
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
