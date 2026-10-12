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
