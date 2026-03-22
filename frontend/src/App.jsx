/**
 * ============================================================================
 *  AI PRODUCT ADVISOR — Frontend React
 * ============================================================================
 *  Corrections apportées :
 *  - Proxy Vite configuré dans vite.config.js (voir ce fichier)
 *  - Bouton "Analyser avec l'IA" explicite sur la page produit
 *  - Rechargement stats + recommandations automatique après chaque avis
 *  - Gestion d'erreur si le backend est éteint
 * ============================================================================
 */

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Package, MessageSquare, BarChart3, Sparkles, Plus, Trash2,
  Star, ChevronRight, ArrowLeft, TrendingUp, TrendingDown,
  Minus, AlertTriangle, CheckCircle, Search, X,
  Loader2, Send, Filter, SlidersHorizontal, Home, RefreshCw,
  Zap, ServerCrash,
} from "lucide-react";

// ─── Palette sentiments ───────────────────────────────────────────────────────
const SENTIMENT_COLORS = {
  positive: "#22c55e",
  neutral:  "#f59e0b",
  negative: "#ef4444",
};

const CATEGORIES = ["Audio", "Sport", "Maison", "Tech", "Mode", "Beauté"];

// ─── Appels API centralisés ───────────────────────────────────────────────────
// Toutes les fonctions qui parlent au backend Flask sont ici.
// Si l'URL change, tu ne touches qu'à cet endroit.
const api = {
  getProducts:        ()          => axios.get("/api/products"),
  createProduct:      (data)      => axios.post("/api/products", data),
  deleteProduct:      (id)        => axios.delete(`/api/products/${id}`),
  getReviews:         (pid)       => axios.get(`/api/products/${pid}/reviews`),
  createReview:       (pid, data) => axios.post(`/api/products/${pid}/reviews`, data),
  getStats:           (pid)       => axios.get(`/api/products/${pid}/stats`),
  getRecommendations: (pid)       => axios.get(`/api/products/${pid}/recommendations`),
};

// ─── Composants UI ────────────────────────────────────────────────────────────

function SentimentBadge({ sentiment, score }) {
  const config = {
    positive: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", icon: <TrendingUp size={13} />,  label: "Positif" },
    neutral:  { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   icon: <Minus size={13} />,       label: "Neutre"  },
    negative: { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700",     icon: <TrendingDown size={13} />, label: "Négatif" },
  };
  const c = config[sentiment] ?? config.neutral;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${c.bg} ${c.border} ${c.text}`}>
      {c.icon} {c.label}
      {score != null && <span className="opacity-60">({Math.round(score * 100)}%)</span>}
    </span>
  );
}

function StarRating({ rating, size = 14, editable = false, onChange }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i} size={size}
          className={`${i <= rating ? "text-amber-400 fill-amber-400" : "text-gray-200"} ${editable ? "cursor-pointer hover:scale-110 transition-transform" : ""}`}
          onClick={() => editable && onChange?.(i)}
        />
      ))}
    </div>
  );
}

function StatCard({ icon, label, value, sublabel, color = "blue" }) {
  const gradients = {
    blue:   "from-blue-500 to-blue-600",
    green:  "from-emerald-500 to-emerald-600",
    amber:  "from-amber-500 to-amber-600",
    red:    "from-red-500 to-red-600",
    purple: "from-violet-500 to-violet-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg transition-shadow duration-300">
      <div className={`inline-flex p-2.5 rounded-xl bg-gradient-to-br ${gradients[color]} text-white shadow-sm mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      {sublabel && <p className="text-xs text-gray-400 mt-1">{sublabel}</p>}
    </div>
  );
}

function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 bg-gray-50 rounded-2xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs mb-4">{description}</p>
      {action}
    </div>
  );
}

// ─── Bannière d'erreur backend ────────────────────────────────────────────────
function BackendError({ onRetry }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 mb-6">
      <ServerCrash size={18} className="flex-shrink-0" />
      <div className="flex-1">
        <span className="font-semibold">Impossible de contacter le backend.</span>
        <span className="ml-1 text-red-600">Vérifie que Flask tourne sur le port 5000.</span>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors">
          <RefreshCw size={12} /> Réessayer
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE PRODUITS
// ═══════════════════════════════════════════════════════════════════════════════
function ProductsPage({ products, onAdd, onDelete, onSelect }) {
  const [showForm, setShowForm]   = useState(false);
  const [name, setName]           = useState("");
  const [category, setCategory]   = useState(CATEGORIES[0]);
  const [search, setSearch]       = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState(null);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await onAdd({ name: name.trim(), category });
      setName("");
      setShowForm(false);
    } catch (err) {
      setFormError(err.response?.data?.error ?? "Erreur serveur. Vérifie que Flask est démarré.");
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat    = filterCat === "all" || p.category === filterCat;
    return matchSearch && matchCat;
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Produits</h1>
          <p className="text-gray-500 mt-1">
            {products.length} produit{products.length > 1 ? "s" : ""} enregistré{products.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setFormError(null); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors shadow-sm"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? "Annuler" : "Nouveau produit"}
        </button>
      </div>

      {/* Formulaire ajout */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Ajouter un produit</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text" placeholder="Nom du produit..." value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition"
            />
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Ajout...</> : "Ajouter"}
            </button>
          </div>
          {formError && <p className="text-sm text-red-600 mt-2">{formError}</p>}
        </div>
      )}

      {/* Recherche + filtre */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Rechercher un produit..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-gray-400" />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="all">Toutes catégories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Grille produits */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package size={32} className="text-gray-300" />}
          title="Aucun produit trouvé"
          description="Ajoutez votre premier produit ou modifiez vos filtres."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(product => (
            <div
              key={product.id}
              onClick={() => onSelect(product)}
              className="group bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg hover:border-gray-200 transition-all duration-300 cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="px-2.5 py-1 bg-gray-50 text-gray-600 text-xs font-medium rounded-lg">
                  {product.category}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(product.id); }}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                {product.name}
              </h3>
              <p className="text-xs text-gray-400 mb-4">Ajouté le {product.created_at}</p>
              <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                <span className="text-xs text-gray-400">Voir avis & analyse</span>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE DÉTAIL PRODUIT
// ═══════════════════════════════════════════════════════════════════════════════
function ProductDetailPage({ product, onBack }) {
  const [tab, setTab]                     = useState("reviews");
  const [text, setText]                   = useState("");
  const [rating, setRating]               = useState(0);
  const [analyzing, setAnalyzing]         = useState(false);
  const [reviewError, setReviewError]     = useState(null);
  const [filterSentiment, setFilterSentiment] = useState("all");
  const [reviews, setReviews]             = useState([]);
  const [stats, setStats]                 = useState(null);
  const [recs, setRecs]                   = useState(null);
  const [loadingData, setLoadingData]     = useState(true);
  const [backendError, setBackendError]   = useState(false);

  // ─── Chargement initial ───────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoadingData(true);
    setBackendError(false);
    try {
      const [revRes, statsRes, recsRes] = await Promise.all([
        api.getReviews(product.id),
        api.getStats(product.id),
        api.getRecommendations(product.id),
      ]);
      setReviews(revRes.data);
      setStats(statsRes.data);
      setRecs(recsRes.data);
    } catch {
      setBackendError(true);
    } finally {
      setLoadingData(false);
    }
  }, [product.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Rechargement stats + recs seulement (après ajout d'avis) ────────────
  const refreshAnalysis = useCallback(async () => {
    try {
      const [statsRes, recsRes] = await Promise.all([
        api.getStats(product.id),
        api.getRecommendations(product.id),
      ]);
      setStats(statsRes.data);
      setRecs(recsRes.data);
    } catch {
      // silencieux — l'avis a déjà été ajouté
    }
  }, [product.id]);

  // ─── Soumettre un avis ────────────────────────────────────────────────────
  // POST /api/products/:id/reviews
  // → Le backend analyse AUTOMATIQUEMENT le sentiment (HuggingFace)
  //   et renvoie l'avis avec son sentiment + score déjà calculés.
  const handleAddReview = async () => {
    if (!text.trim() || rating === 0) return;
    setAnalyzing(true);
    setReviewError(null);
    try {
      const res = await api.createReview(product.id, { text: text.trim(), rating });
      // L'avis retourné contient déjà sentiment + sentiment_score calculés par Flask
      setReviews(prev => [res.data, ...prev]);
      setText("");
      setRating(0);
      // On recharge stats et recommandations pour refléter le nouvel avis
      await refreshAnalysis();
    } catch (err) {
      setReviewError(
        err.response?.data?.error
          ?? "Erreur lors de l'envoi. Vérifie que le serveur Flask est démarré sur le port 5000."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  // ─── Données dérivées ─────────────────────────────────────────────────────
  const displayedReviews = filterSentiment === "all"
    ? reviews
    : reviews.filter(r => r.sentiment === filterSentiment);

  const totalReviews     = stats?.total_reviews ?? 0;
  const avgRating        = stats?.average_rating ? stats.average_rating.toFixed(1) : "—";
  const sentimentCounts  = stats?.sentiments ?? { positive: 0, neutral: 0, negative: 0 };

  const pieData = [
    { name: "Positif", value: sentimentCounts.positive },
    { name: "Neutre",  value: sentimentCounts.neutral  },
    { name: "Négatif", value: sentimentCounts.negative },
  ].filter(d => d.value > 0);

  const ratingDist = [1, 2, 3, 4, 5].map(n => ({
    note:  `${n}★`,
    count: stats?.rating_distribution?.[String(n)] ?? 0,
  }));

  const tabs = [
    { id: "reviews",         label: "Avis",            icon: <MessageSquare size={15} /> },
    { id: "stats",           label: "Statistiques",    icon: <BarChart3 size={15} />     },
    { id: "recommendations", label: "Recommandations", icon: <Sparkles size={15} />      },
  ];

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loadingData) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 size={32} className="animate-spin text-gray-400" />
    </div>
  );

  return (
    <div>
      {/* Erreur backend */}
      {backendError && <BackendError onRetry={loadAll} />}

      {/* En-tête */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft size={15} /> Retour aux produits
        </button>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{product.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg">
                {product.category}
              </span>
              <span className="text-sm text-gray-400">
                {totalReviews} avis · {avgRating} ★ moyenne
              </span>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════
           *  BOUTON "RELANCER L'ANALYSE IA"
           *  Ce bouton appelle explicitement :
           *    GET /api/products/:id/stats
           *    GET /api/products/:id/recommendations
           *  et met à jour l'onglet Stats + Recommandations.
           * ════════════════════════════════════════════════════ */}
          <button
            onClick={async () => {
              setAnalyzing(true);
              await refreshAnalysis();
              setAnalyzing(false);
              setTab("recommendations");
            }}
            disabled={analyzing || totalReviews === 0}
            style={{ backgroundColor: "#7c3aed", color: "#fff" }}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-sm"
          >
            {analyzing
              ? <><Loader2 size={15} className="animate-spin" /> Analyse en cours...</>
              : <><Zap size={15} /> Relancer l'analyse IA</>
            }
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
       *  ONGLET 1 — AVIS
       * ══════════════════════════════════════════════════════════ */}
      {tab === "reviews" && (
        <div>
          {/* Formulaire d'ajout */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">Ajouter un avis</h3>
            <textarea
              value={text} onChange={e => setText(e.target.value)}
              placeholder="Décrivez votre expérience avec ce produit..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 transition"
            />
            <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">Note :</span>
                <StarRating rating={rating} size={20} editable onChange={setRating} />
                {rating > 0 && <span className="text-sm font-medium text-gray-700">{rating}/5</span>}
              </div>

              {/* ════════════════════════════════════════════════════
               *  BOUTON "ENVOYER & ANALYSER"
               *  POST /api/products/:id/reviews
               *  → Flask reçoit { text, rating }
               *  → Analyse HuggingFace automatique côté serveur
               *  → Retourne l'avis avec sentiment + score
               *  → On met à jour la liste + stats + recommandations
               * ════════════════════════════════════════════════════ */}
              <button
                onClick={handleAddReview}
                disabled={!text.trim() || rating < 1 || analyzing}
                style={{ backgroundColor: "#111827", color: "#fff" }}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {analyzing ? (
                  <><Loader2 size={15} className="animate-spin" /> Analyse IA en cours...</>
                ) : (
                  <><Send size={15} /> Envoyer & Analyser</>
                )}
              </button>
            </div>
            {reviewError && <p className="text-sm text-red-600 mt-2">{reviewError}</p>}
            <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
              <Sparkles size={11} />
              Le sentiment est analysé automatiquement par HuggingFace côté serveur.
            </p>
          </div>

          {/* Filtre sentiment */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Filter size={14} className="text-gray-400" />
            {["all", "positive", "neutral", "negative"].map(s => (
              <button
                key={s}
                onClick={() => setFilterSentiment(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  filterSentiment === s
                    ? "bg-gray-900 text-white"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {{ all: "Tous", positive: "Positifs", neutral: "Neutres", negative: "Négatifs" }[s]}
              </button>
            ))}
            <span className="text-xs text-gray-400 ml-1">{displayedReviews.length} résultat(s)</span>
          </div>

          {/* Liste des avis */}
          {displayedReviews.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={32} className="text-gray-300" />}
              title="Aucun avis"
              description="Soyez le premier à laisser un avis sur ce produit."
            />
          ) : (
            <div className="space-y-3">
              {displayedReviews.map(review => (
                <div key={review.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <StarRating rating={review.rating} />
                      <SentimentBadge sentiment={review.sentiment} score={review.sentiment_score} />
                    </div>
                    <span className="text-xs text-gray-400">{review.created_at}</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{review.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
       *  ONGLET 2 — STATISTIQUES
       * ══════════════════════════════════════════════════════════ */}
      {tab === "stats" && (
        <div>
          {totalReviews === 0 ? (
            <EmptyState
              icon={<BarChart3 size={32} className="text-gray-300" />}
              title="Pas encore de données"
              description="Ajoutez des avis pour voir les statistiques."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard icon={<MessageSquare size={18} />} label="Total avis"    value={totalReviews} color="blue" />
                <StatCard icon={<Star size={18} />}          label="Note moyenne"  value={`${avgRating} ★`} color="amber" />
                <StatCard
                  icon={<TrendingUp size={18} />} label="Avis positifs" color="green"
                  value={`${totalReviews > 0 ? Math.round((sentimentCounts.positive / totalReviews) * 100) : 0}%`}
                  sublabel={`${sentimentCounts.positive} sur ${totalReviews}`}
                />
                <StatCard
                  icon={<TrendingDown size={18} />} label="Avis négatifs" color="red"
                  value={`${totalReviews > 0 ? Math.round((sentimentCounts.negative / totalReviews) * 100) : 0}%`}
                  sublabel={`${sentimentCounts.negative} sur ${totalReviews}`}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Répartition des sentiments</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={100} paddingAngle={4} dataKey="value" stroke="none">
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={
                            entry.name === "Positif" ? SENTIMENT_COLORS.positive
                            : entry.name === "Neutre" ? SENTIMENT_COLORS.neutral
                            : SENTIMENT_COLORS.negative
                          } />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, n) => [`${v} avis`, n]} contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "13px" }} />
                      <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: "13px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Distribution des notes</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={ratingDist} barCategoryGap="20%">
                      <XAxis dataKey="note" tick={{ fontSize: 13, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 13, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip formatter={v => [`${v} avis`]} contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "13px" }} />
                      <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
       *  ONGLET 3 — RECOMMANDATIONS IA
       * ══════════════════════════════════════════════════════════ */}
      {tab === "recommendations" && (
        <div>
          {!recs || totalReviews === 0 ? (
            <EmptyState
              icon={<Sparkles size={32} className="text-gray-300" />}
              title="Pas assez de données"
              description="Ajoutez des avis puis cliquez sur « Relancer l'analyse IA »."
            />
          ) : (
            <div className="space-y-6">
              {/* Résumé */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-violet-50 rounded-lg">
                    <Sparkles size={16} className="text-violet-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Résumé de l'analyse</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{recs.summary}</p>

                {/* Mini stats inline */}
                <div className="flex gap-4 mt-4 pt-4 border-t border-gray-50">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{recs.total_count}</p>
                    <p className="text-xs text-gray-400">avis analysés</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-500">{recs.negative_count}</p>
                    <p className="text-xs text-gray-400">avis négatifs</p>
                  </div>
                  {recs.total_count > 0 && (
                    <div className="text-center">
                      <p className="text-2xl font-bold text-amber-500">
                        {Math.round((recs.negative_count / recs.total_count) * 100)}%
                      </p>
                      <p className="text-xs text-gray-400">insatisfaction</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Points faibles */}
              {recs.weaknesses?.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-red-50 rounded-lg">
                      <AlertTriangle size={16} className="text-red-500" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Points faibles détectés</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recs.weaknesses.map((w, i) => (
                      <span key={i} className="px-3 py-1.5 bg-red-50 text-red-700 text-sm font-medium rounded-lg border border-red-100">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommandations */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <CheckCircle size={16} className="text-emerald-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Actions recommandées</h3>
                </div>
                <div className="space-y-3">
                  {recs.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-3 p-3.5 bg-gray-50 rounded-xl">
                      <span className="flex-shrink-0 w-6 h-6 bg-gray-900 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-gray-700 leading-relaxed">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  APP PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [products, setProducts]               = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [page, setPage]                       = useState("products");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [backendError, setBackendError]       = useState(false);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setBackendError(false);
    try {
      const res = await api.getProducts();
      setProducts(res.data);
    } catch {
      setBackendError(true);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const addProduct = useCallback(async ({ name, category }) => {
    const res = await api.createProduct({ name, category });
    setProducts(prev => [res.data, ...prev]);
  }, []);

  const deleteProduct = useCallback(async (id) => {
    await api.deleteProduct(id);
    setProducts(prev => prev.filter(p => p.id !== id));
    if (selectedProduct?.id === id) {
      setPage("products");
      setSelectedProduct(null);
    }
  }, [selectedProduct]);

  const selectProduct = useCallback((product) => {
    setSelectedProduct(product);
    setPage("detail");
  }, []);

  const goHome = useCallback(() => {
    setPage("products");
    setSelectedProduct(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3 cursor-pointer" onClick={goHome}>
              <div className="p-2 bg-gray-900 rounded-xl">
                <Sparkles size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-none tracking-tight">AI Product Advisor</h1>
                <p className="text-xs text-gray-400 mt-0.5">Analyse intelligente des avis</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={goHome}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  page === "products" ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Home size={14} /> Produits
              </button>
              {selectedProduct && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 text-gray-900 font-medium rounded-lg">
                  <Package size={14} /> {selectedProduct.name}
                </span>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Contenu */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {backendError && <BackendError onRetry={loadProducts} />}

        {loadingProducts ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={32} className="animate-spin text-gray-400" />
          </div>
        ) : page === "products" ? (
          <ProductsPage products={products} onAdd={addProduct} onDelete={deleteProduct} onSelect={selectProduct} />
        ) : (
          <ProductDetailPage product={selectedProduct} onBack={goHome} />
        )}
      </main>

      <footer className="border-t border-gray-100 py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs text-gray-400">
            AI Product Advisor · Analyse de sentiments HuggingFace · Projet Bachelor IA
          </p>
        </div>
      </footer>
    </div>
  );
}
