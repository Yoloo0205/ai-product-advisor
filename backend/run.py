"""
AI Product Advisor — Backend Flask
Lancer : pip install flask flask-cors transformers torch && python app.py
Modèle : cmarkea/distilcamembert-base-sentiment (français natif, 5 classes)
         + guard note/IA pour corriger les contradictions
"""

import re
import os
import sys
import io
import sqlite3

# Force UTF-8 sur Windows pour les emojis dans les logs
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

os.environ["USE_TF"] = "0"
os.environ["USE_TORCH"] = "1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TRANSFORMERS_NO_ADVISORY_WARNINGS"] = "1"

from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from transformers import pipeline, AutoTokenizer

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173"])
DB_PATH = "advisor.db"


@app.route("/favicon.ico")
def favicon():
    return make_response("", 204)


# ── Base de données ────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS products (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    NOT NULL,
                category   TEXT    NOT NULL,
                created_at TEXT    DEFAULT (date('now'))
            );
            CREATE TABLE IF NOT EXISTS reviews (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id      INTEGER NOT NULL REFERENCES products(id),
                text            TEXT    NOT NULL,
                rating          INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
                sentiment       TEXT,
                sentiment_score REAL,
                created_at      TEXT DEFAULT (date('now'))
            );
        """)


def row_to_dict(row):
    return dict(row)


# ── Analyse de sentiment ───────────────────────────────────────────────────────

_nlp = None

# distilcamembert est entraîné sur des avis FR (Amazon/Allociné) — 5 classes 1★→5★
STAR_TO_LABEL = {
    "1 star": "negative", "2 stars": "negative",
    "3 stars": "neutral",
    "4 stars": "positive", "5 stars": "positive",
}

def get_pipeline():
    global _nlp
    if _nlp is None:
        print("⏳ Chargement du modèle...")
        _tokenizer = AutoTokenizer.from_pretrained(
            "cmarkea/distilcamembert-base-sentiment", use_fast=False
        )
        _nlp = pipeline(
            "sentiment-analysis",
            model="cmarkea/distilcamembert-base-sentiment",
            tokenizer=_tokenizer,
            framework="pt",
        )
        print("✅ Prêt !")
    return _nlp


def analyze_sentiment(text, rating=None):
    try:
        # Normalise les répétitions ("nulllll" → "null")
        clean = re.sub(r'(.)\1{2,}', r'\1\1', text)
        res   = get_pipeline()(clean, truncation=True, max_length=512)
        print(f"🔎 label brut : {res[0]['label']} | score : {res[0]['score']:.2f}")  # à retirer après vérification
        label = STAR_TO_LABEL.get(res[0]["label"], "neutral")
        score = round(res[0]["score"], 4)

        # Guard : si la note contredit franchement le modèle, on fait confiance à la note
        if rating is not None:
            if rating <= 2 and label == "positive" and score < 0.90:
                label = "negative"
            elif rating >= 4 and label == "negative" and score < 0.90:
                label = "positive"

        return {"label": label, "score": score}
    except Exception as e:
        print(f"⚠️ Sentiment error: {e}")
        return {"label": "neutral", "score": 0.0}


# ── Recommandations ────────────────────────────────────────────────────────────

THEMES = {
    "Autonomie / Batterie":   (["batterie", "autonomie", "charge", "recharge", "lâche", "tient"],
                                "Améliorer l'autonomie — viser 8h minimum."),
    "Qualité de fabrication": (["qualité", "déchire", "casse", "fragile", "usure", "défaut"],
                                "Renforcer la durabilité et le contrôle qualité."),
    "Livraison":              (["livraison", "délai", "retard", "semaines", "attente"],
                                "Optimiser la logistique pour livrer sous 5 jours."),
    "Microphone / Audio":     (["micro", "microphone", "entendent", "voix", "grésille"],
                                "Intégrer un micro à réduction de bruit."),
    "Application / Logiciel": (["application", "app", "bug", "buguée", "plante", "crash"],
                                "Corriger les bugs de l'application mobile en priorité."),
    "Prix":                   (["prix", "cher", "coût", "tarif"],
                                "Revoir le positionnement tarifaire."),
    "Bruit":                  (["bruyant", "bruit", "silencieux", "fort"],
                                "Proposer une version silencieuse."),
    "Confort":                (["confort", "inconfortable", "ergonomie", "lourd", "poids"],
                                "Réduire le poids et améliorer l'ergonomie."),
    "Odeur":                  (["odeur", "chimique", "sent"],
                                "Utiliser des matériaux certifiés sans COV."),
}


def generate_recommendations(reviews):
    total, negative = len(reviews), [r for r in reviews if r["sentiment"] == "negative"]
    neg_count = len(negative)

    if total == 0:
        return {"summary": "Aucun avis disponible.", "negative_count": 0,
                "total_count": 0, "weaknesses": [], "recommendations": []}

    if neg_count == 0:
        return {"summary": f"Les {total} avis sont positifs ou neutres.",
                "negative_count": 0, "total_count": total,
                "weaknesses": [], "recommendations": ["Maintenir la qualité actuelle."]}

    all_text = " ".join(r["text"] for r in negative).lower()
    found = sorted(
        [{"theme": name, "recommendation": reco, "score": sum(1 for kw in kws if kw in all_text)}
         for name, (kws, reco) in THEMES.items()],
        key=lambda x: x["score"], reverse=True
    )
    found = [t for t in found if t["score"] > 0]

    weaknesses = [t["theme"] for t in found]
    recommendations = [t["recommendation"] for t in found[:5]] or ["Analyser chaque retour négatif individuellement."]

    pct = round(neg_count / total * 100)
    summary = f"{neg_count} avis négatif(s) sur {total} ({pct}% d'insatisfaction)."
    if weaknesses:
        summary += f" Points critiques : {', '.join(weaknesses[:3]).lower()}."

    return {"summary": summary, "negative_count": neg_count, "total_count": total,
            "weaknesses": weaknesses, "recommendations": recommendations}


# ── Routes produits ────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return jsonify({"status": "ok", "message": "AI Product Advisor API"})


@app.route("/api/products", methods=["GET"])
def get_products():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM products ORDER BY id DESC").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/products", methods=["POST"])
def create_product():
    data = request.get_json() or {}
    name, category = data.get("name", "").strip(), data.get("category", "").strip()
    if not name or not category:
        return jsonify({"error": "Nom et catégorie obligatoires."}), 400
    with get_db() as conn:
        cur = conn.execute("INSERT INTO products (name, category) VALUES (?, ?)", (name, category))
        conn.commit()
        row = conn.execute("SELECT * FROM products WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@app.route("/api/products/<int:pid>", methods=["GET"])
def get_product(pid):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    return jsonify(row_to_dict(row)) if row else (jsonify({"error": "Produit non trouvé."}), 404)


@app.route("/api/products/<int:pid>", methods=["PUT"])
def update_product(pid):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
        if not row:
            return jsonify({"error": "Produit non trouvé."}), 404
        data = request.get_json() or {}
        name = data.get("name", row["name"]).strip() or row["name"]
        category = data.get("category", row["category"]).strip() or row["category"]
        conn.execute("UPDATE products SET name = ?, category = ? WHERE id = ?", (name, category, pid))
        conn.commit()
        updated = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    return jsonify(row_to_dict(updated))


@app.route("/api/products/<int:pid>", methods=["DELETE"])
def delete_product(pid):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
        if not row:
            return jsonify({"error": "Produit non trouvé."}), 404
        conn.execute("DELETE FROM reviews WHERE product_id = ?", (pid,))
        conn.execute("DELETE FROM products WHERE id = ?", (pid,))
        conn.commit()
    return jsonify({"message": f"Produit '{row['name']}' supprimé."})


# ── Routes avis ───────────────────────────────────────────────────────────────

@app.route("/api/products/<int:pid>/reviews", methods=["GET"])
def get_reviews(pid):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM products WHERE id = ?", (pid,)).fetchone():
            return jsonify({"error": "Produit non trouvé."}), 404
        rows = conn.execute(
            "SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC", (pid,)
        ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/products/<int:pid>/reviews", methods=["POST"])
def create_review(pid):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM products WHERE id = ?", (pid,)).fetchone():
            return jsonify({"error": "Produit non trouvé."}), 404
        data = request.get_json() or {}
        text, rating = data.get("text", "").strip(), data.get("rating")
        if not text:
            return jsonify({"error": "Le texte est obligatoire."}), 400
        if not isinstance(rating, (int, float)) or not (1 <= rating <= 5):
            return jsonify({"error": "Note entre 1 et 5 obligatoire."}), 400

        result = analyze_sentiment(text, rating=int(rating))
        cur = conn.execute(
            "INSERT INTO reviews (product_id, text, rating, sentiment, sentiment_score) VALUES (?, ?, ?, ?, ?)",
            (pid, text, int(rating), result["label"], result["score"]),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM reviews WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@app.route("/api/products/<int:pid>/reviews/<int:rid>", methods=["DELETE"])
def delete_review(pid, rid):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM reviews WHERE id = ? AND product_id = ?", (rid, pid)
        ).fetchone()
        if not row:
            return jsonify({"error": "Avis non trouvé."}), 404
        conn.execute("DELETE FROM reviews WHERE id = ?", (rid,))
        conn.commit()
    return jsonify({"message": "Avis supprimé."})


# ── Stats & recommandations ────────────────────────────────────────────────────

@app.route("/api/products/<int:pid>/stats", methods=["GET"])
def get_stats(pid):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM products WHERE id = ?", (pid,)).fetchone():
            return jsonify({"error": "Produit non trouvé."}), 404
        reviews = [row_to_dict(r) for r in conn.execute(
            "SELECT * FROM reviews WHERE product_id = ?", (pid,)
        ).fetchall()]

    total = len(reviews)
    if total == 0:
        return jsonify({"total_reviews": 0, "average_rating": 0,
                        "sentiments": {"positive": 0, "neutral": 0, "negative": 0},
                        "rating_distribution": {str(i): 0 for i in range(1, 6)}})

    sentiments = {"positive": 0, "neutral": 0, "negative": 0}
    distribution = {str(i): 0 for i in range(1, 6)}
    for r in reviews:
        sentiments[r["sentiment"]] = sentiments.get(r["sentiment"], 0) + 1
        distribution[str(r["rating"])] += 1

    avg_rating = round(sum(r["rating"] for r in reviews) / total, 1)
    positive_ratio = sentiments["positive"] / total
    # Score composite /10 : 60 % note moyenne + 40 % ratio avis positifs
    score = round((avg_rating / 5 * 0.6 + positive_ratio * 0.4) * 10, 1)

    return jsonify({"total_reviews": total,
                    "average_rating": avg_rating,
                    "score": score,
                    "sentiments": sentiments, "rating_distribution": distribution})


@app.route("/api/products/<int:pid>/recommendations", methods=["GET"])
def get_recommendations(pid):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM products WHERE id = ?", (pid,)).fetchone():
            return jsonify({"error": "Produit non trouvé."}), 404
        reviews = [row_to_dict(r) for r in conn.execute(
            "SELECT * FROM reviews WHERE product_id = ?", (pid,)
        ).fetchall()]
    return jsonify(generate_recommendations(reviews))


# ── Seed ──────────────────────────────────────────────────────────────────────

def seed_data():
    with get_db() as conn:
        if conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] > 0:
            print("📦 Base déjà remplie.")
            return

        print("🌱 Insertion des données de test...")
        products = [
            ("Casque Bluetooth ProX", "Audio"),
            ("Tapis de Yoga Premium", "Sport"),
            ("Lampe Connectée Luna",  "Maison"),
            ("Clavier Mécanique K90", "Tech"),
        ]
        ids = []
        for name, cat in products:
            cur = conn.execute("INSERT INTO products (name, category) VALUES (?, ?)", (name, cat))
            ids.append(cur.lastrowid)
        conn.commit()

        reviews = [
            (0, "Son excellent, très confortable pour de longues sessions d'écoute.", 5),
            (0, "La batterie ne tient que 3 heures, décevant pour ce prix.", 2),
            (0, "Bon produit dans l'ensemble, rien de spectaculaire.", 3),
            (0, "La qualité audio est incroyable ! Basses profondes et aigus clairs.", 5),
            (0, "Le micro est de mauvaise qualité, mes collègues ne m'entendent pas.", 1),
            (0, "Confortable mais la batterie lâche trop vite. Dommage.", 2),
            (1, "Très bon grip, ne glisse pas du tout. Parfait pour le hot yoga.", 5),
            (1, "L'odeur chimique est forte au début mais part après quelques jours.", 3),
            (1, "Se déchire après 2 mois d'utilisation. Qualité décevante.", 1),
            (1, "Épaisseur parfaite, mes genoux ne souffrent plus. Je recommande !", 4),
            (2, "Design magnifique, lumière chaude agréable.", 5),
            (2, "L'application est buguée, impossible de changer la couleur.", 2),
            (2, "La livraison a pris 3 semaines, beaucoup trop long.", 3),
            (3, "Les switches sont parfaits, toucher agréable. Idéal pour coder.", 5),
            (3, "Trop bruyant pour un bureau open space. Mes collègues se plaignent.", 2),
            (3, "Le rétroéclairage RGB est superbe mais consomme beaucoup.", 3),
        ]
        for idx, text, rating in reviews:
            print(f"   🔍 \"{text[:50]}...\"")
            result = analyze_sentiment(text, rating=rating)
            conn.execute(
                "INSERT INTO reviews (product_id, text, rating, sentiment, sentiment_score) VALUES (?, ?, ?, ?, ?)",
                (ids[idx], text, rating, result["label"], result["score"]),
            )
        conn.commit()
        print(f"✅ {len(products)} produits, {len(reviews)} avis insérés.")


# ── Lancement ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    seed_data()
    get_pipeline()  # précharge le modèle au démarrage
    print("🚀 http://localhost:5000")
    app.run(debug=True, port=5000, use_reloader=False)
