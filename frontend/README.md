# AI Product Advisor — Frontend

Interface React pour analyser les avis clients avec un modèle NLP français (DistilCamemBERT).

---

## Stack

| Couche | Technologie |
|---|---|
| Framework UI | React 19 + Vite |
| Styles | Tailwind CSS v4 |
| Routing | React Router v7 |
| Graphiques | Recharts |
| Icônes | Lucide React |
| HTTP | Axios |

---

## Prérequis

- Node.js ≥ 18
- Le backend Flask doit tourner sur `http://localhost:5000` (voir [../backend](../backend))

---

## Installation & démarrage

```bash
# Depuis le dossier frontend/
npm install
npm run dev
```

L'app est accessible sur [http://localhost:5173](http://localhost:5173).

Le proxy Vite redirige automatiquement les appels `/api/*` vers `http://localhost:5000`.

---

## Structure du projet

```
frontend/
├── src/
│   ├── App.jsx          # App entière (composants + logique + appels API)
│   ├── App.css          # Styles globaux
│   ├── main.jsx         # Point d'entrée React
│   └── index.css        # Reset / Tailwind base
├── public/
├── index.html
├── vite.config.js       # Config Vite + proxy API
├── eslint.config.js
└── package.json
```

> Toute la logique est dans `App.jsx` : composants, gestion d'état, et appels API centralisés dans l'objet `api`.

---

## Fonctionnalités

- **Liste des produits** — Recherche, filtrage par catégorie, ajout / suppression
- **Page produit** — Avis clients avec note (1–5 étoiles) et texte libre
- **Analyse IA** — Sentiment automatique (positif / neutre / négatif) via le backend Flask
- **Dashboard stats** — Répartition des sentiments (camembert), distribution des notes (barres), score composite /10
- **Recommandations** — Points critiques détectés automatiquement à partir des avis négatifs

---

## Backend Flask

Le backend est dans [../backend/run.py](../backend/run.py). Pour le lancer :

```bash
cd ../backend

# Créer un environnement virtuel (recommandé)
python -m venv .venv
source .venv/bin/activate      # Windows : .venv\Scripts\activate

# Installer les dépendances
pip install -r requirements.txt

# Lancer le serveur (initialise la base + charge le modèle NLP)
python run.py
```

> Au premier démarrage, le modèle `cmarkea/distilcamembert-base-sentiment` (~260 Mo) est téléchargé depuis HuggingFace. Une base SQLite (`advisor.db`) est créée avec des données de démonstration.

### API endpoints

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/products` | Liste des produits |
| POST | `/api/products` | Créer un produit |
| DELETE | `/api/products/:id` | Supprimer un produit |
| GET | `/api/products/:id/reviews` | Avis d'un produit |
| POST | `/api/products/:id/reviews` | Ajouter un avis (analyse auto) |
| DELETE | `/api/products/:id/reviews/:rid` | Supprimer un avis |
| GET | `/api/products/:id/stats` | Stats & score composite |
| GET | `/api/products/:id/recommendations` | Recommandations IA |

---

## Scripts disponibles

```bash
npm run dev       # Serveur de développement avec HMR
npm run build     # Build de production (dist/)
npm run preview   # Prévisualiser le build de production
npm run lint      # Vérification ESLint
```
