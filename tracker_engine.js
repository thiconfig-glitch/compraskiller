const fs = require('fs');
const path = require('path');
const { searchOlxBh } = require('./olx_crawler');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Garante que o diretório de dados existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Estrutura padrão inicial do banco
const DEFAULT_DB = {
  trackers: [],
  items: [],
  favorites: [],
  settings: {
    checkIntervalMinutes: 30,
    autoCheckEnabled: true,
    notifyOpportunities: true
  }
};

/**
 * Lê o banco de dados local
 */
function getDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
      return DEFAULT_DB;
    }
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return {
      trackers: Array.isArray(parsed.trackers) ? parsed.trackers : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      settings: { ...DEFAULT_DB.settings, ...(parsed.settings || {}) }
    };
  } catch (err) {
    console.error('Erro ao ler database.json:', err.message);
    return DEFAULT_DB;
  }
}

/**
 * Salva o banco de dados no disco
 */
function saveDatabase(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Erro ao salvar database.json:', err.message);
    return false;
  }
}

/**
 * Lista todos os rastreadores
 */
function getTrackers() {
  const db = getDatabase();
  return db.trackers;
}

/**
 * Cria um novo rastreador de produto
 */
function addTracker(trackerData) {
  const db = getDatabase();
  const now = new Date().toISOString();

  const newTracker = {
    id: 'trk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    name: (trackerData.name || trackerData.query || '').trim(),
    query: (trackerData.query || '').trim(),
    targetPrice: trackerData.targetPrice ? Number(trackerData.targetPrice) : null,
    minPrice: trackerData.minPrice ? Number(trackerData.minPrice) : null,
    maxPrice: trackerData.maxPrice ? Number(trackerData.maxPrice) : null,
    negativeKeywords: trackerData.negativeKeywords || '',
    municipality: trackerData.municipality || '',
    enabled: trackerData.enabled !== false,
    createdAt: now,
    lastChecked: null,
    adsCount: 0,
    lowestPrice: null,
    averagePrice: null,
    opportunitiesCount: 0
  };

  db.trackers.push(newTracker);
  saveDatabase(db);
  exportTrackersToConfig();
  return newTracker;
}

/**
 * Atualiza um rastreador existente
 */
function updateTracker(id, trackerData) {
  const db = getDatabase();
  const index = db.trackers.findIndex(t => t.id === id);
  if (index === -1) return null;

  const current = db.trackers[index];
  const updated = {
    ...current,
    name: trackerData.name !== undefined ? trackerData.name.trim() : current.name,
    query: trackerData.query !== undefined ? trackerData.query.trim() : current.query,
    targetPrice: trackerData.targetPrice !== undefined ? (trackerData.targetPrice ? Number(trackerData.targetPrice) : null) : current.targetPrice,
    minPrice: trackerData.minPrice !== undefined ? (trackerData.minPrice ? Number(trackerData.minPrice) : null) : current.minPrice,
    maxPrice: trackerData.maxPrice !== undefined ? (trackerData.maxPrice ? Number(trackerData.maxPrice) : null) : current.maxPrice,
    negativeKeywords: trackerData.negativeKeywords !== undefined ? trackerData.negativeKeywords : current.negativeKeywords,
    municipality: trackerData.municipality !== undefined ? trackerData.municipality : current.municipality,
    enabled: trackerData.enabled !== undefined ? !!trackerData.enabled : current.enabled,
    updatedAt: new Date().toISOString()
  };

  db.trackers[index] = updated;
  saveDatabase(db);
  exportTrackersToConfig();
  return updated;
}

/**
 * Exclui um rastreador e limpa itens associados
 */
function deleteTracker(id) {
  const db = getDatabase();
  db.trackers = db.trackers.filter(t => t.id !== id);
  db.items = db.items.filter(i => i.trackerId !== id);
  saveDatabase(db);
  exportTrackersToConfig();
  return true;
}

/**
 * Executa checagem e coleta para um rastreador específico
 */
async function runTrackerCheck(trackerId) {
  const db = getDatabase();
  const tracker = db.trackers.find(t => t.id === trackerId);
  if (!tracker) throw new Error('Rastreador não encontrado.');

  // Limpa do banco itens que violam as palavras negativas atuais
  if (tracker.negativeKeywords) {
    const negatives = tracker.negativeKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    db.items = db.items.filter(item => {
      if (item.trackerId !== tracker.id) return true;
      const titleLower = (item.title || '').toLowerCase();
      return !negatives.some(neg => titleLower.includes(neg));
    });
  }

  const ads = await searchOlxBh(tracker.query, {
    minPrice: tracker.minPrice,
    maxPrice: tracker.maxPrice,
    negativeKeywords: tracker.negativeKeywords,
    municipality: tracker.municipality
  });

  const now = new Date().toISOString();
  let opportunitiesCount = 0;
  let newAdsCount = 0;
  let priceDropsCount = 0;

  const validPrices = [];

  ads.forEach(ad => {
    if (ad.price !== null) validPrices.push(ad.price);

    const isBelowTarget = !!(tracker.targetPrice && ad.price !== null && ad.price <= tracker.targetPrice);
    if (isBelowTarget) opportunitiesCount++;

    const existingIndex = db.items.findIndex(item => item.id === ad.id && item.trackerId === tracker.id);

    if (existingIndex !== -1) {
      const existing = db.items[existingIndex];
      let dropped = existing.hasPriceDrop;

      // Detecta se houve redução de preço em relação ao valor anterior conhecido
      if (ad.price !== null && existing.price !== null && ad.price < existing.price) {
        dropped = true;
        priceDropsCount++;
      }

      const history = Array.isArray(existing.priceHistory) ? existing.priceHistory : [];
      if (ad.price !== null && (history.length === 0 || history[history.length - 1].price !== ad.price)) {
        history.push({ price: ad.price, date: now });
      }

      db.items[existingIndex] = {
        ...existing,
        title: ad.title,
        price: ad.price,
        priceFormatted: ad.priceFormatted,
        oldPrice: ad.oldPrice || (existing.price && ad.price < existing.price ? existing.priceFormatted : null),
        hasPriceDrop: dropped || ad.hasPriceDrop,
        url: ad.url,
        thumb: ad.thumb || existing.thumb,
        city: ad.city,
        neighborhood: ad.neighborhood,
        category: ad.category,
        acceptsExchange: !!ad.acceptsExchange,
        exchangeDetails: ad.exchangeDetails || null,
        lastSeen: now,
        isOpportunity: isBelowTarget,
        isNew: false, // já existia
        priceHistory: history
      };
    } else {
      // Anúncio novo descoberto!
      newAdsCount++;
      const priceHistory = ad.price !== null ? [{ price: ad.price, date: now }] : [];

      db.items.push({
        id: ad.id,
        trackerId: tracker.id,
        trackerName: tracker.name,
        title: ad.title,
        price: ad.price,
        priceFormatted: ad.priceFormatted,
        oldPrice: ad.oldPrice,
        hasPriceDrop: ad.hasPriceDrop,
        acceptsExchange: !!ad.acceptsExchange,
        exchangeDetails: ad.exchangeDetails || null,
        url: ad.url,
        thumb: ad.thumb,
        imagesCount: ad.imagesCount,
        city: ad.city,
        neighborhood: ad.neighborhood,
        uf: ad.uf,
        date: ad.date,
        category: ad.category,
        firstSeen: now,
        lastSeen: now,
        isNew: true,
        isOpportunity: isBelowTarget,
        priceHistory
      });
    }
  });

  // Atualiza métricas do rastreador
  tracker.lastChecked = now;
  tracker.adsCount = ads.length;
  tracker.opportunitiesCount = opportunitiesCount;
  tracker.lowestPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
  tracker.averagePrice = validPrices.length > 0 ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length) : null;

  saveDatabase(db);

  return {
    tracker,
    totalFound: ads.length,
    newAdsCount,
    opportunitiesCount,
    priceDropsCount
  };
}

/**
 * Executa a varredura de todos os rastreadores ativos sequencialmente
 */
async function runAllTrackersCheck() {
  syncTrackersFromConfig();
  const db = getDatabase();
  const enabledTrackers = db.trackers.filter(t => t.enabled);
  const results = [];

  for (const tracker of enabledTrackers) {
    try {
      const res = await runTrackerCheck(tracker.id);
      results.push(res);
      // Intervalo de cortesia de 1.5s entre requisições
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (err) {
      console.error(`Falha ao checar rastreador ${tracker.name}:`, err.message);
    }
  }

  return results;
}

/**
 * Retorna o feed de produtos monitorados com opções de filtro e ordenação
 */
function getFeed(filters = {}) {
  const db = getDatabase();
  let items = [...db.items];

  // Filtro por rastreador específico
  if (filters.trackerId) {
    items = items.filter(i => i.trackerId === filters.trackerId);
  }

  // Filtro: Apenas Oportunidades (<= preço alvo)
  if (filters.onlyOpportunities === true || filters.onlyOpportunities === 'true') {
    items = items.filter(i => i.isOpportunity);
  }

  // Filtro: Apenas com redução de preço
  if (filters.onlyDrops === true || filters.onlyDrops === 'true') {
    items = items.filter(i => i.hasPriceDrop);
  }

  // Filtro: Apenas anúncios novos
  if (filters.onlyNew === true || filters.onlyNew === 'true') {
    items = items.filter(i => i.isNew);
  }

  // Filtro: Apenas anúncios com aceite de troca
  if (filters.onlyExchange === true || filters.onlyExchange === 'true') {
    items = items.filter(i => i.acceptsExchange);
  }

  // Filtro por busca textual no título ou bairro
  if (filters.search && filters.search.trim()) {
    const term = filters.search.trim().toLowerCase();
    items = items.filter(i => 
      i.title.toLowerCase().includes(term) || 
      (i.neighborhood && i.neighborhood.toLowerCase().includes(term)) ||
      (i.city && i.city.toLowerCase().includes(term))
    );
  }

  // Ordenação (padrão: menor preço primeiro / mais perto do preço alvo)
  const sortBy = filters.sortBy || 'price-asc';
  if (sortBy === 'price-asc') {
    items.sort((a, b) => {
      const pA = (typeof a.price === 'number' && a.price > 0) ? a.price : 9999999;
      const pB = (typeof b.price === 'number' && b.price > 0) ? b.price : 9999999;
      return pA - pB;
    });
  } else if (sortBy === 'opportunity') {
    items.sort((a, b) => {
      if (a.isOpportunity && !b.isOpportunity) return -1;
      if (!a.isOpportunity && b.isOpportunity) return 1;
      const pA = (typeof a.price === 'number' && a.price > 0) ? a.price : 9999999;
      const pB = (typeof b.price === 'number' && b.price > 0) ? b.price : 9999999;
      return pA - pB;
    });
  } else if (sortBy === 'price-desc') {
    items.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (sortBy === 'recent') {
    items.sort((a, b) => new Date(b.date || b.firstSeen) - new Date(a.date || a.firstSeen));
  }

  // Marcação de favoritos
  const favSet = new Set(db.favorites);
  return items.map(item => ({
    ...item,
    isFavorite: favSet.has(item.id)
  }));
}

/**
 * Alterna favorito (salvar / remover)
 */
function toggleFavorite(adId) {
  const db = getDatabase();
  const index = db.favorites.indexOf(adId);
  let isFavorite = false;

  if (index === -1) {
    db.favorites.push(adId);
    isFavorite = true;
  } else {
    db.favorites.splice(index, 1);
    isFavorite = false;
  }

  saveDatabase(db);
  return { adId, isFavorite };
}

/**
 * Retorna lista de anúncios favoritos
 */
function getFavorites() {
  const db = getDatabase();
  const favSet = new Set(db.favorites);
  return db.items.filter(item => favSet.has(item.id)).map(item => ({
    ...item,
    isFavorite: true
  }));
}

/**
 * Retorna estatísticas gerais do painel
 */
function getStats() {
  const db = getDatabase();
  const totalTrackers = db.trackers.length;
  const activeTrackers = db.trackers.filter(t => t.enabled).length;
  const totalItems = db.items.length;
  const opportunities = db.items.filter(i => i.isOpportunity).length;
  const priceDrops = db.items.filter(i => i.hasPriceDrop).length;
  const favorites = db.favorites.length;

  return {
    totalTrackers,
    activeTrackers,
    totalItems,
    opportunities,
    priceDrops,
    favorites,
    lastGlobalCheck: db.trackers.reduce((latest, t) => {
      if (!t.lastChecked) return latest;
      return !latest || new Date(t.lastChecked) > new Date(latest) ? t.lastChecked : latest;
    }, null)
  };
}

/**
 * Sincroniza rastreadores a partir de rastreadores.json
 */
function syncTrackersFromConfig() {
  const configPath = path.join(__dirname, 'rastreadores.json');
  if (!fs.existsSync(configPath)) {
    exportTrackersToConfig();
    return;
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return;

    const db = getDatabase();
    let modified = false;

    for (const item of list) {
      if (!item.query || !item.query.trim()) continue;
      const normalizedQuery = item.query.trim().toLowerCase();
      let existing = db.trackers.find(t => t.query && t.query.trim().toLowerCase() === normalizedQuery);

      if (!existing) {
        const newTracker = {
          id: 'trk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          name: (item.name || item.query).trim(),
          query: item.query.trim(),
          targetPrice: item.targetPrice ? Number(item.targetPrice) : null,
          minPrice: item.minPrice ? Number(item.minPrice) : null,
          maxPrice: item.maxPrice ? Number(item.maxPrice) : null,
          negativeKeywords: item.negativeKeywords || '',
          municipality: item.municipality || '',
          enabled: item.enabled !== false,
          createdAt: new Date().toISOString(),
          lastChecked: null,
          adsCount: 0,
          lowestPrice: null,
          averagePrice: null,
          opportunitiesCount: 0
        };
        db.trackers.push(newTracker);
        modified = true;
      } else {
        if (item.name && existing.name !== item.name) { existing.name = item.name; modified = true; }
        if (item.targetPrice !== undefined && existing.targetPrice !== (item.targetPrice ? Number(item.targetPrice) : null)) { 
          existing.targetPrice = item.targetPrice ? Number(item.targetPrice) : null; 
          modified = true; 
          db.items.forEach(it => {
            if (it.trackerId === existing.id) {
              it.isOpportunity = !!(existing.targetPrice && it.price !== null && it.price <= existing.targetPrice);
            }
          });
          existing.opportunitiesCount = db.items.filter(it => it.trackerId === existing.id && it.isOpportunity).length;
        }
        if (item.minPrice !== undefined && existing.minPrice !== (item.minPrice ? Number(item.minPrice) : null)) { existing.minPrice = item.minPrice ? Number(item.minPrice) : null; modified = true; }
        if (item.maxPrice !== undefined && existing.maxPrice !== (item.maxPrice ? Number(item.maxPrice) : null)) { existing.maxPrice = item.maxPrice ? Number(item.maxPrice) : null; modified = true; }
        if (item.negativeKeywords !== undefined && existing.negativeKeywords !== item.negativeKeywords) { existing.negativeKeywords = item.negativeKeywords; modified = true; }
        if (item.enabled !== undefined && existing.enabled !== (item.enabled !== false)) { existing.enabled = item.enabled !== false; modified = true; }
      }
    }

    // Remove rastreadores que foram excluídos do rastreadores.json
    const activeQueries = new Set(list.map(i => (i.query || '').trim().toLowerCase()).filter(Boolean));
    const removedTrackerIds = db.trackers
      .filter(t => !activeQueries.has(t.query.trim().toLowerCase()))
      .map(t => t.id);

    if (removedTrackerIds.length > 0) {
      db.trackers = db.trackers.filter(t => !removedTrackerIds.includes(t.id));
      db.items = db.items.filter(i => !removedTrackerIds.includes(i.trackerId));
      modified = true;
    }

    if (modified) {
      saveDatabase(db);
    }
  } catch (err) {
    console.error('Erro ao sincronizar rastreadores.json:', err.message);
  }
}

/**
 * Exporta os rastreadores do banco para rastreadores.json
 */
function exportTrackersToConfig() {
  const configPath = path.join(__dirname, 'rastreadores.json');
  try {
    const db = getDatabase();
    const cleanList = db.trackers.map(t => ({
      name: t.name,
      query: t.query,
      targetPrice: t.targetPrice,
      minPrice: t.minPrice,
      maxPrice: t.maxPrice,
      negativeKeywords: t.negativeKeywords,
      municipality: t.municipality || '',
      enabled: t.enabled !== false
    }));
    fs.writeFileSync(configPath, JSON.stringify(cleanList, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao exportar rastreadores.json:', err.message);
  }
}

module.exports = {
  getDatabase,
  saveDatabase,
  getTrackers,
  addTracker,
  updateTracker,
  deleteTracker,
  runTrackerCheck,
  runAllTrackersCheck,
  getFeed,
  toggleFavorite,
  getFavorites,
  getStats,
  syncTrackersFromConfig,
  exportTrackersToConfig
};

