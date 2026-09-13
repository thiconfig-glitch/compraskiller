document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // ESTADO GLOBAL DO APLICATIVO
  // ==========================================
  let currentTab = 'view-feed';
  let currentFilter = 'all';
  let currentSort = 'opportunity';
  let feedSearchTerm = '';
  
  let trackersData = [];
  let feedData = [];
  let favoritesData = [];
  let statsData = {};
  let deferredInstallPrompt = null;

  // ==========================================
  // ELEMENTOS DO DOM
  // ==========================================
  // Navegação
  const navItems = document.querySelectorAll('.nav-item');
  const viewPanels = document.querySelectorAll('.view-panel');
  
  // Header e Métricas
  const statTotalTrackers = document.getElementById('stat-total-trackers');
  const statOpportunities = document.getElementById('stat-opportunities');
  const statPriceDrops = document.getElementById('stat-price-drops');
  const btnCheckAll = document.getElementById('btn-check-all');
  const btnInstallPwa = document.getElementById('btn-install-pwa');
  const quickStatPills = document.querySelectorAll('.stat-pill');

  // Badges da Bottom Nav
  const badgeRadar = document.getElementById('badge-radar');
  const badgeTrackers = document.getElementById('badge-trackers');
  const badgeFavorites = document.getElementById('badge-favorites');

  // Feed
  const feedContainer = document.getElementById('feed-container');
  const feedSearchInput = document.getElementById('feed-search-input');
  const btnClearFeedSearch = document.getElementById('btn-clear-feed-search');
  const filterChips = document.querySelectorAll('.chip-btn');
  const feedSortSelect = document.getElementById('feed-sort-select');

  // Rastreadores
  const trackersGrid = document.getElementById('trackers-grid');
  const btnOpenNewTracker = document.getElementById('btn-open-new-tracker');

  // Busca Rápida
  const quickSearchForm = document.getElementById('quick-search-form');
  const liveSearchQuery = document.getElementById('live-search-query');
  const liveSearchMinPrice = document.getElementById('live-search-min-price');
  const liveSearchMaxPrice = document.getElementById('live-search-max-price');
  const liveSearchNegatives = document.getElementById('live-search-negatives');
  const btnLiveSearch = document.getElementById('btn-live-search');
  const searchResultsSummary = document.getElementById('search-results-summary');
  const searchSummaryText = document.getElementById('search-summary-text');
  const btnConvertSearchTracker = document.getElementById('btn-convert-search-tracker');
  const searchResultsContainer = document.getElementById('search-results-container');

  // Favoritos
  const favoritesContainer = document.getElementById('favorites-container');

  // Modal de Rastreador
  const trackerModal = document.getElementById('tracker-modal');
  const trackerForm = document.getElementById('tracker-form');
  const modalTitle = document.getElementById('modal-title');
  const modalTrackerId = document.getElementById('modal-tracker-id');
  const trackerNameInput = document.getElementById('tracker-name-input');
  const trackerQueryInput = document.getElementById('tracker-query-input');
  const trackerTargetPrice = document.getElementById('tracker-target-price');
  const trackerMaxPrice = document.getElementById('tracker-max-price');
  const trackerMinPrice = document.getElementById('tracker-min-price');
  const trackerMunicipality = document.getElementById('tracker-municipality');
  const trackerNegatives = document.getElementById('tracker-negatives');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');

  // Toast Container
  const toastContainer = document.getElementById('toast-container');

  // ==========================================
  // REGISTRO DE SERVICE WORKER & PWA INSTALL
  // ==========================================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(
        reg => console.log('ServiceWorker registrado:', reg.scope),
        err => console.warn('Falha ao registrar ServiceWorker:', err)
      );
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btnInstallPwa) {
      btnInstallPwa.style.display = 'inline-flex';
    }
  });

  if (btnInstallPwa) {
    btnInstallPwa.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('Aplicativo instalado com sucesso!', 'success');
      }
      deferredInstallPrompt = null;
      btnInstallPwa.style.display = 'none';
    });
  }

  // ==========================================
  // NAVEGAÇÃO DE ABAS
  // ==========================================
  function switchTab(tabId) {
    currentTab = tabId;
    navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tabId);
    });
    viewPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === tabId);
    });

    if (tabId === 'view-feed') loadFeed();
    else if (tabId === 'view-trackers') loadTrackers();
    else if (tabId === 'view-favorites') loadFavorites();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });

  // Cliques nas pílulas de estatísticas do topo
  quickStatPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const filter = pill.dataset.filter;
      if (currentTab !== 'view-feed') {
        switchTab('view-feed');
      }
      setFeedFilter(filter);
    });
  });

  // ==========================================
  // FEED: FILTROS & ORDENAÇÃO
  // ==========================================
  function setFeedFilter(filter) {
    currentFilter = filter;
    filterChips.forEach(chip => {
      chip.classList.toggle('active', chip.dataset.filter === filter);
    });
    loadFeed();
  }

  filterChips.forEach(chip => {
    chip.addEventListener('click', () => setFeedFilter(chip.dataset.filter));
  });

  if (feedSortSelect) {
    feedSortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      loadFeed();
    });
  }

  if (feedSearchInput) {
    feedSearchInput.addEventListener('input', (e) => {
      feedSearchTerm = e.target.value.trim().toLowerCase();
      if (btnClearFeedSearch) {
        btnClearFeedSearch.style.display = feedSearchTerm ? 'block' : 'none';
      }
      filterAndRenderFeed();
    });
  }

  if (btnClearFeedSearch) {
    btnClearFeedSearch.addEventListener('click', () => {
      feedSearchInput.value = '';
      feedSearchTerm = '';
      btnClearFeedSearch.style.display = 'none';
      filterAndRenderFeed();
    });
  }

  // ==========================================
  // MODO ESTÁTICO / GITHUB PAGES & CACHE LOCAL
  // ==========================================
  const isStaticHost = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
  let isStaticMode = isStaticHost;
  let staticDb = null;

  const syncBanner = document.getElementById('sync-banner');
  const syncText = document.getElementById('sync-text');

  function getLocalFavorites() {
    try {
      return JSON.parse(localStorage.getItem('radar_olx_favs') || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveLocalFavorites(favs) {
    try {
      localStorage.setItem('radar_olx_favs', JSON.stringify(favs));
    } catch (e) {}
  }

  function toggleLocalFavorite(adId) {
    const favs = getLocalFavorites();
    const idx = favs.indexOf(adId);
    let isFav = false;
    if (idx >= 0) {
      favs.splice(idx, 1);
      isFav = false;
    } else {
      favs.push(adId);
      isFav = true;
    }
    saveLocalFavorites(favs);
    return isFav;
  }

  async function getStaticDatabase(forceReload = false) {
    if (staticDb && !forceReload) return staticDb;
    try {
      const res = await fetch('./data/database.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      staticDb = await res.json();
      return staticDb;
    } catch (err) {
      console.warn('Falha ao carregar ./data/database.json:', err);
      return { trackers: [], items: [], favorites: [], settings: {} };
    }
  }

  function updateSyncBanner(dateStr) {
    if (!syncBanner) return;
    syncBanner.style.display = 'flex';
    if (syncText) {
      syncText.textContent = dateStr 
        ? `Última varredura no GitHub: ${dateStr}` 
        : `Radar OLX BH • Atualizado via GitHub Actions`;
    }
  }

  function updateStatsUI() {
    if (statTotalTrackers) statTotalTrackers.textContent = statsData.totalTrackers || 0;
    if (statOpportunities) statOpportunities.textContent = statsData.opportunities || 0;
    if (statPriceDrops) statPriceDrops.textContent = statsData.priceDrops || 0;

    if (badgeRadar) {
      if (statsData.opportunities > 0) {
        badgeRadar.textContent = statsData.opportunities;
        badgeRadar.style.display = 'flex';
      } else {
        badgeRadar.style.display = 'none';
      }
    }
    if (badgeFavorites) {
      if (statsData.favorites > 0) {
        badgeFavorites.textContent = statsData.favorites;
        badgeFavorites.style.display = 'flex';
      } else {
        badgeFavorites.style.display = 'none';
      }
    }
  }

  // ==========================================
  // CARREGAR DADOS DA API OU DO BANCO ESTÁTICO
  // ==========================================
  async function loadStats() {
    try {
      if (isStaticMode) {
        const db = await getStaticDatabase();
        const localFavs = getLocalFavorites();
        const opps = (db.items || []).filter(i => i.isOpportunity).length;
        const drops = (db.items || []).filter(i => i.hasPriceDrop).length;
        statsData = {
          totalTrackers: (db.trackers || []).filter(t => t.enabled !== false).length,
          opportunities: opps,
          priceDrops: drops,
          favorites: Math.max(localFavs.length, (db.favorites || []).length)
        };
        updateStatsUI();
        updateSyncBanner(db.lastUpdateFormatted || db.lastUpdate);
        return;
      }

      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        statsData = data.data;
        updateStatsUI();
      }
    } catch (err) {
      console.warn('Erro ao carregar estatísticas via API, ativando modo estático:', err.message);
      isStaticMode = true;
      const db = await getStaticDatabase();
      updateSyncBanner(db.lastUpdateFormatted || db.lastUpdate);
      loadStats();
    }
  }

  async function loadFeed() {
    if (!feedContainer) return;
    feedContainer.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Buscando oportunidades na Grande BH...</p>
      </div>
    `;

    try {
      if (isStaticMode) {
        const db = await getStaticDatabase();
        const localFavs = getLocalFavorites();
        let items = (db.items || []).map(item => ({
          ...item,
          isFavorite: localFavs.includes(item.id) || (db.favorites || []).includes(item.id)
        }));

        // Filtros
        if (currentFilter === 'opportunities') items = items.filter(i => i.isOpportunity);
        else if (currentFilter === 'drops') items = items.filter(i => i.hasPriceDrop);
        else if (currentFilter === 'new') items = items.filter(i => i.isNew);

        // Ordenação
        if (currentSort === 'opportunity') {
          items.sort((a, b) => {
            if (a.isOpportunity && !b.isOpportunity) return -1;
            if (!a.isOpportunity && b.isOpportunity) return 1;
            if (a.hasPriceDrop && !b.hasPriceDrop) return -1;
            if (!a.hasPriceDrop && b.hasPriceDrop) return 1;
            return (a.price || Infinity) - (b.price || Infinity);
          });
        } else if (currentSort === 'price-asc') {
          items.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
        } else if (currentSort === 'price-desc') {
          items.sort((a, b) => (b.price || 0) - (a.price || 0));
        } else if (currentSort === 'recent') {
          items.sort((a, b) => new Date(b.date || b.firstSeen || 0) - new Date(a.date || a.firstSeen || 0));
        }

        feedData = items;
        filterAndRenderFeed();
        loadStats();
        return;
      }

      const params = new URLSearchParams();
      if (currentFilter === 'opportunities') params.append('onlyOpportunities', 'true');
      if (currentFilter === 'drops') params.append('onlyDrops', 'true');
      if (currentFilter === 'new') params.append('onlyNew', 'true');
      params.append('sortBy', currentSort);

      const res = await fetch(`/api/feed?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (json.status === 'success') {
        feedData = json.data || [];
        filterAndRenderFeed();
        loadStats();
      }
    } catch (err) {
      if (!isStaticMode) {
        console.warn('Falha na API feed, ativando modo estático:', err.message);
        isStaticMode = true;
        loadFeed();
        return;
      }
      feedContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <h3>Não foi possível carregar o feed</h3>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  function filterAndRenderFeed() {
    let items = feedData;
    if (feedSearchTerm) {
      items = items.filter(item => 
        (item.title && item.title.toLowerCase().includes(feedSearchTerm)) ||
        (item.neighborhood && item.neighborhood.toLowerCase().includes(feedSearchTerm)) ||
        (item.city && item.city.toLowerCase().includes(feedSearchTerm)) ||
        (item.trackerName && item.trackerName.toLowerCase().includes(feedSearchTerm))
      );
    }
    renderAdCards(feedContainer, items, 'Nenhum anúncio encontrado com os filtros atuais.');
  }

  async function loadTrackers() {
    if (!trackersGrid) return;
    trackersGrid.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Carregando seus produtos monitorados...</p>
      </div>
    `;

    try {
      if (isStaticMode) {
        const db = await getStaticDatabase();
        const trackers = (db.trackers || []).map(t => {
          const trackerAds = (db.items || []).filter(i => i.trackerId === t.id);
          const opps = trackerAds.filter(i => i.isOpportunity).length;
          const prices = trackerAds.map(i => i.price).filter(p => p > 0);
          const lowest = prices.length ? Math.min(...prices) : null;
          const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
          return {
            ...t,
            adsCount: trackerAds.length,
            opportunitiesCount: opps,
            lowestPrice: lowest,
            averagePrice: avg
          };
        });
        trackersData = trackers;
        renderTrackersList(trackersData);
        if (badgeTrackers) {
          badgeTrackers.textContent = trackersData.length;
          badgeTrackers.style.display = trackersData.length > 0 ? 'flex' : 'none';
        }
        return;
      }

      const res = await fetch('/api/trackers');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status === 'success') {
        trackersData = json.data || [];
        renderTrackersList(trackersData);
        if (badgeTrackers) {
          badgeTrackers.textContent = trackersData.length;
          badgeTrackers.style.display = trackersData.length > 0 ? 'flex' : 'none';
        }
      }
    } catch (err) {
      if (!isStaticMode) {
        isStaticMode = true;
        loadTrackers();
        return;
      }
      trackersGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <h3>Erro ao carregar rastreadores</h3>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  async function loadFavorites() {
    if (!favoritesContainer) return;
    favoritesContainer.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Carregando seus favoritos...</p>
      </div>
    `;

    try {
      if (isStaticMode) {
        const db = await getStaticDatabase();
        const localFavs = getLocalFavorites();
        const favAds = (db.items || [])
          .filter(i => localFavs.includes(i.id) || (db.favorites || []).includes(i.id))
          .map(i => ({ ...i, isFavorite: true }));

        favoritesData = favAds;
        renderAdCards(favoritesContainer, favoritesData, 'Você ainda não salvou nenhum anúncio como favorito.');
        if (badgeFavorites) {
          badgeFavorites.textContent = favoritesData.length;
          badgeFavorites.style.display = favoritesData.length > 0 ? 'flex' : 'none';
        }
        return;
      }

      const res = await fetch('/api/favorites');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status === 'success') {
        favoritesData = json.data || [];
        renderAdCards(favoritesContainer, favoritesData, 'Você ainda não salvou nenhum anúncio como favorito.');
        if (badgeFavorites) {
          badgeFavorites.textContent = favoritesData.length;
          badgeFavorites.style.display = favoritesData.length > 0 ? 'flex' : 'none';
        }
      }
    } catch (err) {
      if (!isStaticMode) {
        isStaticMode = true;
        loadFavorites();
        return;
      }
      favoritesContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <h3>Erro ao carregar favoritos</h3>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  // ==========================================
  // RENDERIZADORES DE CARDS
  // ==========================================
  function renderAdCards(container, ads, emptyMessage) {
    if (!container) return;

    if (!ads || ads.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎯</div>
          <h3>Nenhum anúncio para exibir</h3>
          <p>${escapeHtml(emptyMessage || 'Nenhum resultado disponível.')}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';

    ads.forEach(ad => {
      const card = document.createElement('div');
      card.className = `ad-card ${ad.isOpportunity ? 'is-opportunity' : ''} ${ad.hasPriceDrop ? 'has-price-drop' : ''}`;

      const locationStr = [ad.neighborhood, ad.city].filter(Boolean).join(' • ') || 'Belo Horizonte e região';
      const formattedDate = formatRelativeTime(ad.date || ad.firstSeen);

      let badgesHtml = '';
      if (ad.isOpportunity) {
        badgesHtml += `<span class="badge-tag badge-tag-opportunity">🔥 Oportunidade</span>`;
      }
      if (ad.hasPriceDrop) {
        badgesHtml += `<span class="badge-tag badge-tag-drop">📉 Baixou</span>`;
      }
      if (ad.isNew) {
        badgesHtml += `<span class="badge-tag badge-tag-new">✨ Novo</span>`;
      }

      card.innerHTML = `
        <div class="ad-thumb-wrap">
          <div class="ad-badges-top">${badgesHtml}</div>
          <button type="button" class="btn-fav-card ${ad.isFavorite ? 'active' : ''}" data-id="${ad.id}" title="${ad.isFavorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'}">
            ${ad.isFavorite ? '★' : '☆'}
          </button>
          ${ad.thumb 
            ? `<img src="${ad.thumb}" class="ad-thumb" alt="${escapeHtml(ad.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'ad-thumb-placeholder\\'>📦</div>'">`
            : `<div class="ad-thumb-placeholder">📦</div>`
          }
        </div>

        <div class="ad-content">
          <div class="ad-price-row">
            <span class="ad-price">${escapeHtml(ad.priceFormatted || 'Sob consulta')}</span>
            ${ad.oldPrice ? `<span class="ad-old-price">${escapeHtml(ad.oldPrice)}</span>` : ''}
          </div>

          <h4 class="ad-title" title="${escapeHtml(ad.title)}">${escapeHtml(ad.title)}</h4>

          <div class="ad-meta-row">
            <span class="ad-location" title="${escapeHtml(locationStr)}">
              <span>📍</span> ${escapeHtml(locationStr)}
            </span>
            <span class="ad-date">${formattedDate}</span>
          </div>

          <div class="ad-actions">
            <a href="${ad.url}" target="_blank" rel="noopener noreferrer" class="btn-open-olx">
              <span>Abrir no OLX</span>
              <span>↗</span>
            </a>
          </div>
        </div>
      `;

      // Listener de Favorito
      const btnFav = card.querySelector('.btn-fav-card');
      if (btnFav) {
        btnFav.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            if (isStaticMode) {
              const isFav = toggleLocalFavorite(ad.id);
              ad.isFavorite = isFav;
              btnFav.classList.toggle('active', isFav);
              btnFav.textContent = isFav ? '★' : '☆';
              showToast(isFav ? 'Salvo nos favoritos! ⭐' : 'Removido dos favoritos.', 'info');
              loadStats();
              if (currentTab === 'view-favorites') {
                loadFavorites();
              }
              return;
            }

            const res = await fetch('/api/favorites/toggle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ adId: ad.id })
            });
            const json = await res.json();
            if (json.status === 'success') {
              ad.isFavorite = json.data.isFavorite;
              btnFav.classList.toggle('active', ad.isFavorite);
              btnFav.textContent = ad.isFavorite ? '★' : '☆';
              showToast(ad.isFavorite ? 'Salvo nos favoritos! ⭐' : 'Removido dos favoritos.', 'info');
              loadStats();
              if (currentTab === 'view-favorites') {
                loadFavorites();
              }
            }
          } catch(err) {
            const isFav = toggleLocalFavorite(ad.id);
            ad.isFavorite = isFav;
            btnFav.classList.toggle('active', isFav);
            btnFav.textContent = isFav ? '★' : '☆';
            showToast(isFav ? 'Salvo nos favoritos! ⭐' : 'Removido dos favoritos.', 'info');
            loadStats();
          }
        });
      }

      container.appendChild(card);
    });
  }

  function renderTrackersList(trackers) {
    if (!trackersGrid) return;

    if (!trackers || trackers.length === 0) {
      trackersGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎯</div>
          <h3>Nenhum produto cadastrado ainda</h3>
          <p>Cadastre um produto para monitorar preços e receber alertas de oportunidades em Belo Horizonte.</p>
        </div>
      `;
      return;
    }

    trackersGrid.innerHTML = '';

    trackers.forEach(t => {
      const card = document.createElement('div');
      card.className = `tracker-card ${t.enabled ? '' : 'disabled'}`;

      const targetPriceText = t.targetPrice ? `Meta: até R$ ${t.targetPrice.toLocaleString('pt-BR')}` : 'Sem meta';
      const lowestPriceText = t.lowestPrice ? `Menor: R$ ${t.lowestPrice.toLocaleString('pt-BR')}` : 'Ainda não checado';

      card.innerHTML = `
        <div class="tracker-card-header">
          <div>
            <h4 class="tracker-card-title">${escapeHtml(t.name)}</h4>
            <span class="tracker-card-query">🔎 "${escapeHtml(t.query)}"</span>
          </div>
          <button type="button" class="btn-delete-tracker" data-id="${t.id}" title="Excluir rastreador">🗑️</button>
        </div>

        <div class="tracker-stats-row">
          <span class="tracker-stat-pill stat-target">🎯 ${targetPriceText}</span>
          <span class="tracker-stat-pill stat-lowest">🏷️ ${lowestPriceText}</span>
          <span class="tracker-stat-pill">📦 ${t.adsCount || 0} anúncios</span>
          ${t.opportunitiesCount > 0 ? `<span class="tracker-stat-pill" style="background: rgba(245,158,11,0.2); color: #f59e0b; font-weight:800;">🔥 ${t.opportunitiesCount} na meta</span>` : ''}
        </div>

        <div class="tracker-card-footer">
          <div class="tracker-actions-left">
            <button type="button" class="btn-check-tracker" data-id="${t.id}" title="Verificar anúncios agora na OLX">
              <span>⚡</span> Verificar Agora
            </button>
          </div>
          <span style="font-size: 10.5px; color: var(--text-dim);">
            ${t.lastChecked ? `Última checagem: ${formatRelativeTime(t.lastChecked)}` : 'Aguardando 1ª varredura'}
          </span>
        </div>
      `;

      // Listener de Varredura Individual
      const btnScan = card.querySelector('.btn-check-tracker');
      if (btnScan) {
        btnScan.addEventListener('click', async () => {
          if (isStaticMode) {
            const go = confirm(`⚡ No GitHub Pages, a varredura é executada pelo robô do GitHub Actions.\n\nDeseja abrir o GitHub Actions para rodar a varredura com 1 clique?`);
            if (go) {
              window.open('https://github.com/thiconfig-glitch/compraskiller/actions', '_blank');
            }
            return;
          }

          btnScan.disabled = true;
          btnScan.innerHTML = '<span>⏳</span> Verificando...';
          try {
            const res = await fetch(`/api/trackers/${t.id}/check`, { method: 'POST' });
            const json = await res.json();
            if (json.status === 'success') {
              showToast(json.message, 'success');
              loadTrackers();
              loadStats();
            } else {
              throw new Error(json.error || 'Erro na verificação.');
            }
          } catch(err) {
            showToast(err.message, 'error');
          } finally {
            btnScan.disabled = false;
            btnScan.innerHTML = '<span>⚡</span> Verificar Agora';
          }
        });
      }

      // Listener de Exclusão
      const btnDel = card.querySelector('.btn-delete-tracker');
      if (btnDel) {
        btnDel.addEventListener('click', async () => {
          if (isStaticMode) {
            alert('💡 No GitHub Pages, os rastreadores ativos são definidos no arquivo data/database.json do seu repositório.');
            return;
          }
          if (!confirm(`Deseja realmente excluir o rastreador "${t.name}"?`)) return;
          try {
            const res = await fetch(`/api/trackers/${t.id}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.status === 'success') {
              showToast('Rastreador excluído.', 'info');
              loadTrackers();
              loadStats();
            }
          } catch(err) {
            showToast('Erro ao excluir rastreador.', 'error');
          }
        });
      }

      trackersGrid.appendChild(card);
    });
  }

  // ==========================================
  // VARREDURA GERAL
  // ==========================================
  if (btnCheckAll) {
    btnCheckAll.addEventListener('click', async () => {
      if (isStaticMode) {
        const go = confirm('⚡ No GitHub Pages, a varredura completa da OLX é executada pelo robô no GitHub Actions.\n\nDeseja abrir a página do GitHub Actions para iniciar a varredura agora?');
        if (go) {
          window.open('https://github.com/thiconfig-glitch/compraskiller/actions', '_blank');
        }
        return;
      }

      btnCheckAll.classList.add('loading');
      btnCheckAll.disabled = true;
      showToast('⚡ Iniciando varredura geral na OLX BH...', 'info');

      try {
        const res = await fetch('/api/trackers/check-all', { method: 'POST' });
        const json = await res.json();
        if (json.status === 'success') {
          showToast(json.message, 'success');
          loadFeed();
          loadTrackers();
          loadStats();
        } else {
          throw new Error(json.error || 'Erro na varredura.');
        }
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnCheckAll.classList.remove('loading');
        btnCheckAll.disabled = false;
      }
    });
  }

  // ==========================================
  // BUSCA RÁPIDA INSTANTÂNEA
  // ==========================================
  if (quickSearchForm) {
    quickSearchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = liveSearchQuery.value.trim();
      if (!query) return;

      const minPrice = liveSearchMinPrice.value.trim();
      const maxPrice = liveSearchMaxPrice.value.trim();
      const negatives = liveSearchNegatives.value.trim();

      searchResultsContainer.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Consultando a OLX em Belo Horizonte e região para "${escapeHtml(query)}"...</p>
        </div>
      `;
      btnLiveSearch.disabled = true;
      btnLiveSearch.textContent = 'Buscando...';

      if (isStaticMode) {
        try {
          const db = await getStaticDatabase();
          const qLower = query.toLowerCase();
          const matched = (db.items || []).filter(i => 
            (i.title && i.title.toLowerCase().includes(qLower)) ||
            (i.trackerName && i.trackerName.toLowerCase().includes(qLower))
          );
          const olxUrl = `https://www.olx.com.br/estado-mg/belo-horizonte-e-regiao?q=${encodeURIComponent(query)}`;

          if (searchResultsSummary && searchSummaryText) {
            searchResultsSummary.style.display = 'flex';
            searchSummaryText.innerHTML = `${matched.length} anúncio(s) no banco local para "${escapeHtml(query)}" • <a href="${olxUrl}" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; text-decoration: underline; font-weight: 600;">Buscar ao vivo na OLX BH ↗</a>`;
          }

          if (btnConvertSearchTracker) {
            btnConvertSearchTracker.onclick = () => {
              openTrackerModal({
                name: query.toUpperCase(),
                query: query,
                minPrice: minPrice,
                maxPrice: maxPrice,
                negativeKeywords: negatives
              });
            };
          }

          renderAdCards(searchResultsContainer, matched, `Nenhum anúncio salvo no histórico para "${query}". Utilize o link acima para consultar ao vivo na OLX BH.`);
        } catch (e) {
          showToast('Erro na pesquisa local.', 'error');
        } finally {
          btnLiveSearch.disabled = false;
          btnLiveSearch.textContent = 'Buscar';
        }
        return;
      }

      try {
        const params = new URLSearchParams();
        params.append('q', query);
        if (minPrice) params.append('minPrice', minPrice);
        if (maxPrice) params.append('maxPrice', maxPrice);
        if (negatives) params.append('negativeKeywords', negatives);

        const res = await fetch(`/api/search?${params.toString()}`);
        const json = await res.json();

        if (json.status === 'success') {
          const ads = json.data || [];
          if (searchResultsSummary && searchSummaryText) {
            searchResultsSummary.style.display = 'flex';
            searchSummaryText.textContent = `${ads.length} anúncios encontrados para "${query}"`;
          }

          if (btnConvertSearchTracker) {
            btnConvertSearchTracker.onclick = () => {
              openTrackerModal({
                name: query.toUpperCase(),
                query: query,
                minPrice: minPrice,
                maxPrice: maxPrice,
                negativeKeywords: negatives
              });
            };
          }

          renderAdCards(searchResultsContainer, ads, `Nenhum anúncio encontrado para "${query}" na Grande BH.`);
        } else {
          throw new Error(json.error || 'Falha ao buscar anúncios.');
        }
      } catch (err) {
        searchResultsContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <h3>Erro ao realizar busca</h3>
            <p>${escapeHtml(err.message)}</p>
          </div>
        `;
      } finally {
        btnLiveSearch.disabled = false;
        btnLiveSearch.textContent = 'Buscar';
      }
    });
  }

  // ==========================================
  // MODAL DE RASTREADOR
  // ==========================================
  function openTrackerModal(prefill = {}) {
    if (!trackerModal) return;
    modalTrackerId.value = prefill.id || '';
    modalTitle.textContent = prefill.id ? 'Editar Rastreador' : 'Novo Rastreador de Oferta';
    trackerNameInput.value = prefill.name || '';
    trackerQueryInput.value = prefill.query || '';
    trackerTargetPrice.value = prefill.targetPrice || '';
    trackerMaxPrice.value = prefill.maxPrice || '';
    trackerMinPrice.value = prefill.minPrice || '';
    trackerMunicipality.value = prefill.municipality || '';
    trackerNegatives.value = prefill.negativeKeywords || '';

    trackerModal.style.display = 'flex';
    trackerNameInput.focus();
  }

  function closeTrackerModal() {
    if (trackerModal) trackerModal.style.display = 'none';
    if (trackerForm) trackerForm.reset();
    modalTrackerId.value = '';
  }

  if (btnOpenNewTracker) {
    btnOpenNewTracker.addEventListener('click', () => openTrackerModal());
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeTrackerModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeTrackerModal);

  if (trackerModal) {
    trackerModal.addEventListener('click', (e) => {
      if (e.target === trackerModal) closeTrackerModal();
    });
  }

  if (trackerForm) {
    trackerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = modalTrackerId.value;
      const payload = {
        name: trackerNameInput.value.trim(),
        query: trackerQueryInput.value.trim(),
        targetPrice: trackerTargetPrice.value ? Number(trackerTargetPrice.value) : null,
        maxPrice: trackerMaxPrice.value ? Number(trackerMaxPrice.value) : null,
        minPrice: trackerMinPrice.value ? Number(trackerMinPrice.value) : null,
        municipality: trackerMunicipality.value.trim(),
        negativeKeywords: trackerNegatives.value.trim()
      };

      const btnSave = document.getElementById('btn-save-tracker');
      btnSave.disabled = true;
      btnSave.textContent = 'Salvando...';

      if (isStaticMode) {
        alert('💡 No modo GitHub Pages, seus rastreadores ativos ficam gravados no arquivo data/database.json do repositório no GitHub.\n\nPara adicionar novos rastreadores fixos, basta editar o database.json no GitHub ou cadastrar rodando localmente no seu PC e fazer git push.');
        btnSave.disabled = false;
        btnSave.textContent = 'Salvar e Rastrear';
        closeTrackerModal();
        return;
      }

      try {
        const url = id ? `/api/trackers/${id}` : '/api/trackers';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();

        if (json.status === 'success') {
          showToast(json.message || 'Rastreador salvo!', 'success');
          closeTrackerModal();
          switchTab('view-trackers');
          loadTrackers();
          loadStats();
          loadFeed();
        } else {
          throw new Error(json.error || 'Erro ao salvar.');
        }
      } catch(err) {
        showToast(err.message, 'error');
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = 'Salvar e Rastrear';
      }
    });
  }

  // ==========================================
  // HELPERS
  // ==========================================
  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMinutes < 1) return 'Agora mesmo';
      if (diffMinutes < 60) return `Há ${diffMinutes} min`;
      if (diffHours < 24) return `Hoje às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      if (diffDays === 1) return `Ontem às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch(e) {
      return '';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Inicialização do app
  loadStats();
  loadFeed();
});
