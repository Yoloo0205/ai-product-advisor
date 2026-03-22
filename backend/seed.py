"""
seed.py — Remplit la base avec des données de test.
⚠️  Vide la base existante avant de la remplir.

Lancer : python seed.py
"""

import sys
import os

# S'assure que app.py est trouvable depuis ce script
sys.path.insert(0, os.path.dirname(__file__))

from run import init_db, get_db, analyze_sentiment

PRODUCTS = [
    ("Casque Bluetooth ProX", "Audio"),
    ("Tapis de Yoga Premium", "Sport"),
    ("Lampe Connectée Luna",  "Maison"),
    ("Clavier Mécanique K90", "Tech"),
]

REVIEWS = [
    (0, "Son excellent, très confortable pour de longues sessions d'écoute. Le Bluetooth est stable.", 5),
    (0, "La batterie ne tient que 3 heures, c'est décevant pour ce prix. Autonomie insuffisante.", 2),
    (0, "Bon produit dans l'ensemble, rien de spectaculaire. Fait le job.", 3),
    (0, "La qualité audio est incroyable pour le prix ! Basses profondes et aigus clairs.", 5),
    (0, "Le micro est de mauvaise qualité, mes collègues ne m'entendent pas en visio.", 1),
    (0, "Confortable mais la batterie lâche trop vite. Dommage.", 2),
    (1, "Très bon grip, ne glisse pas du tout. Parfait pour le hot yoga.", 5),
    (1, "L'odeur chimique est forte au début mais part après quelques jours.", 3),
    (1, "Se déchire après 2 mois d'utilisation intensive. Qualité décevante.", 1),
    (1, "Épaisseur parfaite, mes genoux ne souffrent plus. Je recommande !", 4),
    (2, "Design magnifique, s'intègre parfaitement dans mon salon. Lumière chaude agréable.", 5),
    (2, "L'application est buguée, impossible de changer la couleur parfois. Frustrant.", 2),
    (2, "La livraison a pris 3 semaines, beaucoup trop long. Le produit est correct.", 3),
    (3, "Les switches sont parfaits, toucher agréable et réactif. Idéal pour coder.", 5),
    (3, "Trop bruyant pour un bureau open space. Mes collègues se plaignent.", 2),
    (3, "Le rétroéclairage RGB est superbe mais consomme beaucoup de batterie.", 3),
]


def seed():
    init_db()

    with get_db() as conn:
        print("🗑️  Nettoyage de la base...")
        conn.execute("DELETE FROM reviews")
        conn.execute("DELETE FROM products")
        conn.commit()

        print("📦 Création des produits...")
        ids = []
        for name, cat in PRODUCTS:
            cur = conn.execute(
                "INSERT INTO products (name, category) VALUES (?, ?)", (name, cat)
            )
            ids.append(cur.lastrowid)
        conn.commit()

        print("💬 Analyse IA + insertion des avis...")
        for idx, text, rating in REVIEWS:
            print(f"   🔍 \"{text[:55]}...\"")
            result = analyze_sentiment(text, rating=rating)
            print(f"       → {result['label']} ({result['score']*100:.0f}%)")
            conn.execute(
                "INSERT INTO reviews (product_id, text, rating, sentiment, sentiment_score) "
                "VALUES (?, ?, ?, ?, ?)",
                (ids[idx], text, rating, result["label"], result["score"]),
            )
        conn.commit()

    print(f"\n✅ Seed terminé : {len(PRODUCTS)} produits, {len(REVIEWS)} avis.")


if __name__ == "__main__":
    seed()
