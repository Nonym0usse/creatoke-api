-- Compteur de visites du site, sans cookie (page Statistiques).
-- Une visite = un visiteur par jour. Le visiteur est reconnu par une empreinte anonyme
-- (IP + navigateur hachés avec une clé qui change chaque jour), gardée deux jours au plus :
-- l'IP n'est jamais enregistrée et on ne peut pas suivre quelqu'un d'un jour à l'autre.
CREATE TABLE IF NOT EXISTS site_visit_days (
  day         DATE      NOT NULL,
  visitor     CHAR(64)  NOT NULL,
  PRIMARY KEY (day, visitor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
