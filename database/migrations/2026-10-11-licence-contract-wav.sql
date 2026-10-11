-- Contrat de licence WAV, édité depuis l'admin mais absent du schéma initial.
ALTER TABLE licence ADD COLUMN contract_wav MEDIUMTEXT NULL AFTER contract_mp3;
