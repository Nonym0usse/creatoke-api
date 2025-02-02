#!/bin/bash

# Variables de configuration
SERVER_USER="vecy3980"               # Remplace par ton nom d'utilisateur SSH
SERVER_IP="109.234.166.20"        # Remplace par l'adresse IP de ton serveur
SSH_KEY="~/.ssh/github-actions-key"          # Chemin de ta clé privée SSH (modifie si nécessaire)
REMOTE_DIR="www/creatoke-api"   # Dossier distant de l'application

# Commande SSH pour se connecter au serveur et exécuter git pull
ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP << EOF
  cd $REMOTE_DIR
  git pull origin master
EOF