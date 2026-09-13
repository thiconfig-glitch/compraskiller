const fs = require('fs');
const path = require('path');
const { runAllTrackersCheck, getDatabase, getStats } = require('../tracker_engine');

async function main() {
  console.log('====================================================');
  console.log('📡 RADAR OLX BH — INICIANDO VARREDURA AUTÔNOMA');
  console.log(`⏰ Data/Hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log('====================================================');

  const rootDir = path.resolve(__dirname, '..');
  const dataDir = path.join(rootDir, 'data');
  const publicDataDir = path.join(rootDir, 'public', 'data');
  const dbFile = path.join(dataDir, 'database.json');
  const publicDbFile = path.join(publicDataDir, 'database.json');

  // Garante que o diretório public/data existe
  if (!fs.existsSync(publicDataDir)) {
    fs.mkdirSync(publicDataDir, { recursive: true });
  }

  // Executa a varredura em todos os rastreadores ativos
  const results = await runAllTrackersCheck();
  console.log(`\n✅ Varredura concluída para ${results.length} rastreadores.`);

  // Atualiza metadados com data e hora da última varredura
  const db = getDatabase();
  db.lastUpdate = new Date().toISOString();
  db.lastUpdateFormatted = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Salva no banco principal e na pasta pública
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.writeFileSync(publicDbFile, JSON.stringify(db, null, 2), 'utf-8');

  // Estatísticas finais
  const stats = getStats();
  console.log('----------------------------------------------------');
  console.log('📊 RESUMO DA ATUALIZAÇÃO:');
  console.log(`- Rastreadores Ativos: ${stats.totalTrackers}`);
  console.log(`- Total de Anúncios no Radar: ${stats.totalItems}`);
  console.log(`- 🔥 Oportunidades Identificadas: ${stats.opportunities}`);
  console.log(`- 📉 Anúncios que Baixaram Preço: ${stats.priceDrops}`);
  console.log('----------------------------------------------------');
  console.log(`📁 Arquivos sincronizados em:\n  - ${dbFile}\n  - ${publicDbFile}`);
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('❌ Erro fatal na varredura:', err);
  process.exit(1);
});
