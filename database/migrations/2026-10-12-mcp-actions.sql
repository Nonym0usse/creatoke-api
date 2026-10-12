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
