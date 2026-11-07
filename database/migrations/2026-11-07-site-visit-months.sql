-- Nombre de visites par mois (voir 2026-11-07-site-visit-days.sql)
CREATE TABLE IF NOT EXISTS site_visit_months (
  month       CHAR(7)   NOT NULL PRIMARY KEY, -- AAAA-MM
  visits      INT       NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
