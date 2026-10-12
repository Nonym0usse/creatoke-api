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
