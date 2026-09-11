const express = require('express');
const cors = require('cors');
const path = require('path');
const { searchOlxBh } = require('./olx_crawler');
const {
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
  getDatabase
} = require('./tracker_engine');

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir frontend estático PWA
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
}));

// ==========================================
// ROTAS DA API
// ==========================================

// 1. Estatísticas gerais
app.get('/api/stats', (req, res) => {
  try {
    const stats = getStats();
    res.json({ status: 'success', data: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Listar rastreadores
app.get('/api/trackers', (req, res) => {
  try {
    const trackers = getTrackers();
    res.json({ status: 'success', data: trackers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Cadastrar novo rastreador
app.post('/api/trackers', async (req, res) => {
  try {
    const { name, query, targetPrice, minPrice, maxPrice, negativeKeywords, municipality, runInitialCheck } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'O termo de busca (query) é obrigatório.' });
    }

    const tracker = addTracker({
      name: name || query,
      query,
      targetPrice,
      minPrice,
      maxPrice,
      negativeKeywords,
      municipality
    });

    let checkResult = null;
    if (runInitialCheck !== false) {
      try {
        checkResult = await runTrackerCheck(tracker.id);
      } catch (cErr) {
        console.warn('Aviso: falha na varredura inicial do rastreador:', cErr.message);
      }
    }

    res.json({
      status: 'success',
      message: `Rastreador "${tracker.name}" cadastrado com sucesso!`,
      data: tracker,
      checkResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Atualizar rastreador
app.put('/api/trackers/:id', (req, res) => {
  try {
    const updated = updateTracker(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Rastreador não encontrado.' });
    res.json({ status: 'success', message: 'Rastreador atualizado!', data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Excluir rastreador
app.delete('/api/trackers/:id', (req, res) => {
  try {
    const ok = deleteTracker(req.params.id);
    res.json({ status: 'success', message: 'Rastreador e itens removidos.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Forçar varredura de um rastreador específico
app.post('/api/trackers/:id/check', async (req, res) => {
  try {
    const result = await runTrackerCheck(req.params.id);
    res.json({
      status: 'success',
      message: `Varredura concluída! ${result.totalFound} anúncios encontrados (${result.newAdsCount} novos, ${result.opportunitiesCount} oportunidades).`,
      data: result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Forçar varredura de TODOS os rastreadores ativos
app.post('/api/trackers/check-all', async (req, res) => {
  try {
    console.log('⚡ Iniciando varredura geral de todos os rastreadores ativos...');
    const results = await runAllTrackersCheck();
    const totalFound = results.reduce((acc, r) => acc + (r.totalFound || 0), 0);
    const newAds = results.reduce((acc, r) => acc + (r.newAdsCount || 0), 0);
    const opportunities = results.reduce((acc, r) => acc + (r.opportunitiesCount || 0), 0);

    res.json({
      status: 'success',
      message: `Varredura geral concluída em ${results.length} rastreadores! ${totalFound} anúncios avaliados (${newAds} novos, ${opportunities} oportunidades).`,
      data: results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Feed de anúncios monitorados
app.get('/api/feed', (req, res) => {
  try {
    const { trackerId, onlyOpportunities, onlyDrops, onlyNew, sortBy, search } = req.query;
    const feed = getFeed({
      trackerId,
      onlyOpportunities: onlyOpportunities === 'true',
      onlyDrops: onlyDrops === 'true',
      onlyNew: onlyNew === 'true',
      sortBy,
      search
    });

    res.json({
      status: 'success',
      count: feed.length,
      data: feed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Favoritos
app.get('/api/favorites', (req, res) => {
  try {
    const favorites = getFavorites();
    res.json({ status: 'success', count: favorites.length, data: favorites });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/favorites/toggle', (req, res) => {
  try {
    const { adId } = req.body;
    if (!adId) return res.status(400).json({ error: 'adId é obrigatório.' });
    const result = toggleFavorite(adId);
    res.json({ status: 'success', data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Busca Rápida ao Vivo (sem salvar no banco)
app.get('/api/search', async (req, res) => {
  try {
    const { q, minPrice, maxPrice, negativeKeywords, municipality } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Parâmetro de busca "q" é obrigatório.' });
    }

    const ads = await searchOlxBh(q, {
      minPrice,
      maxPrice,
      negativeKeywords,
      municipality
    });

    res.json({
      status: 'success',
      count: ads.length,
      query: q,
      data: ads
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// AGENDADOR DE VARREDURA EM SEGUNDO PLANO
// ==========================================
function startBackgroundScheduler() {
  const db = getDatabase();
  const intervalMinutes = db.settings?.checkIntervalMinutes || 30;
  const intervalMs = Math.max(5, intervalMinutes) * 60 * 1000;

  console.log(`⏰ Agendador de varredura automática ativo a cada ${intervalMinutes} minutos.`);

  setInterval(async () => {
    try {
      const currentDb = getDatabase();
      if (!currentDb.settings?.autoCheckEnabled) {
        return;
      }
      console.log('🔄 Executando varredura periódica de rastreadores...');
      await runAllTrackersCheck();
      console.log('✅ Varredura periódica finalizada com sucesso!');
    } catch (schedErr) {
      console.error('Erro na varredura automática periódica:', schedErr.message);
    }
  }, intervalMs);
}

// Inicia servidor
app.listen(PORT, () => {
  console.log('================================================================');
  console.log(`📡 RADAR OLX BH — RASTREADOR DE PRODUTOS E PREÇOS ONLINE`);
  console.log(`🌐 Acesso Local: http://localhost:${PORT}`);
  console.log(`📱 Acesso no Celular (mesma rede Wi-Fi): http://[SEU-IP-LOCAL]:${PORT}`);
  console.log('================================================================');
  startBackgroundScheduler();
});
