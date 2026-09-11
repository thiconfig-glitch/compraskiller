const {
  addTracker,
  getTrackers,
  runTrackerCheck,
  getFeed,
  toggleFavorite,
  getFavorites,
  getStats,
  deleteTracker
} = require('./tracker_engine');

async function runE2ETest() {
  console.log('--- TESTE E2E: RADAR OLX BH ---');

  // 1. Cadastrar rastreador
  console.log('1. Cadastrando rastreador "RTX 3060"...');
  const tracker = addTracker({
    name: 'RTX 3060',
    query: 'rtx 3060',
    targetPrice: 1600,
    minPrice: 800,
    maxPrice: 2500,
    negativeKeywords: 'defeito, quebrado, ventilador apenas'
  });
  console.log('   Rastreador criado:', tracker.id, tracker.name);

  // 2. Executar varredura
  console.log('2. Executando varredura na OLX BH...');
  const result = await runTrackerCheck(tracker.id);
  console.log('   Total de anúncios encontrados:', result.totalFound);
  console.log('   Novos anúncios:', result.newAdsCount);
  console.log('   Oportunidades (<= R$ 1600):', result.opportunitiesCount);

  // 3. Consultar Feed
  console.log('3. Consultando feed ordenado por melhores ofertas...');
  const feed = getFeed({ sortBy: 'opportunity' });
  console.log('   Total de itens no feed:', feed.length);
  if (feed.length > 0) {
    const top = feed[0];
    console.log('   Melhor oferta encontrada:');
    console.log(`     Título: ${top.title}`);
    console.log(`     Preço: ${top.priceFormatted} (Alvo: R$ 1.600)`);
    console.log(`     Local: ${top.neighborhood} • ${top.city} - ${top.uf}`);
    console.log(`     Oportunidade: ${top.isOpportunity}`);
    console.log(`     Link: ${top.url}`);

    // 4. Testar Favoritar
    console.log('4. Testando favoritar anúncio...');
    const favRes = toggleFavorite(top.id);
    console.log('   Item favoritado:', favRes);
    const favs = getFavorites();
    console.log('   Total de favoritos:', favs.length);
  }

  // 5. Consultar Estatísticas
  console.log('5. Consultando estatísticas gerais...');
  const stats = getStats();
  console.log('   Stats:', stats);

  console.log('--- TESTE E2E FINALIZADO COM SUCESSO TOTAL! ---');
}

runE2ETest().catch(err => {
  console.error('Falha no teste E2E:', err);
  process.exit(1);
});
