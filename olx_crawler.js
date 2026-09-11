const { execSync } = require('child_process');

/**
 * Normaliza e limpa string de preço (ex: "R$ 1.500" -> 1500)
 */
function parseNumericPrice(priceStr) {
  if (!priceStr) return null;
  const digits = priceStr.replace(/[^\d]/g, '');
  if (!digits) return null;
  return parseInt(digits, 10);
}

/**
 * Extrai os anúncios a partir do HTML retornado pela OLX (Next.js App Router payload)
 */
function extractOlxAds(html) {
  if (!html) return [];

  const nextChunks = [];
  const regex = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
  let m;

  while ((m = regex.exec(html)) !== null) {
    try {
      const unescaped = JSON.parse('"' + m[1] + '"');
      nextChunks.push(unescaped);
    } catch (e) {
      // Pula chunk corrompido
    }
  }

  const payload = nextChunks.join('');

  // Procura por "ads":[
  const adsStart = payload.indexOf('"ads":[');
  if (adsStart === -1) {
    return [];
  }

  const startArr = adsStart + 6;
  let depth = 0;
  let endArr = startArr;

  for (let i = startArr; i < payload.length; i++) {
    if (payload[i] === '[') depth++;
    else if (payload[i] === ']') {
      depth--;
      if (depth === 0) {
        endArr = i + 1;
        break;
      }
    }
  }

  const jsonStr = payload.slice(startArr, endArr);
  try {
    const rawAds = JSON.parse(jsonStr);
    if (!Array.isArray(rawAds)) return [];

    return rawAds.map(ad => {
      const priceNum = parseNumericPrice(ad.priceValue || ad.price);
      const oldPriceNum = parseNumericPrice(ad.oldPrice);

      let thumb = null;
      if (ad.images && Array.isArray(ad.images) && ad.images.length > 0) {
        thumb = ad.images[0].originalWebp || ad.images[0].original || ad.images[0].thumbnail;
      } else if (ad.image) {
        thumb = typeof ad.image === 'string' ? ad.image : (ad.image.originalWebp || ad.image.original);
      }

      return {
        id: String(ad.listId || ad.adId || Math.random().toString(36).substring(2, 10)),
        title: (ad.subject || ad.title || '').trim(),
        price: priceNum,
        priceFormatted: ad.priceValue || (priceNum !== null ? `R$ ${priceNum.toLocaleString('pt-BR')}` : 'Sob consulta'),
        oldPrice: ad.oldPrice || null,
        oldPriceNum: oldPriceNum,
        hasPriceDrop: !!(oldPriceNum && priceNum && oldPriceNum > priceNum),
        url: ad.url || '',
        thumb: thumb,
        imagesCount: ad.images && Array.isArray(ad.images) ? ad.images.length : (thumb ? 1 : 0),
        city: ad.locationDetails?.municipality || 'Belo Horizonte e região',
        neighborhood: ad.locationDetails?.neighbourhood || '',
        uf: ad.locationDetails?.uf || 'MG',
        date: ad.date ? new Date(ad.date * 1000).toISOString() : new Date().toISOString(),
        category: ad.categoryName || ad.category || 'Geral',
        isFeatured: !!ad.fixedOnTop
      };
    });
  } catch (err) {
    console.error('Erro ao fazer parse do array de anúncios:', err.message);
    return [];
  }
}

/**
 * Executa busca na OLX em Belo Horizonte e Região (DDD 31 / MG)
 * @param {string} query - Termo de busca (ex: "iphone 13")
 * @param {Object} options - Filtros adicionais (minPrice, maxPrice, negativeKeywords, municipality)
 */
async function searchOlxBh(query, options = {}) {
  if (!query || !query.trim()) return [];

  const cleanQuery = query.trim();
  let url = `https://www.olx.com.br/estado-mg/belo-horizonte-e-regiao?q=${encodeURIComponent(cleanQuery)}`;

  if (options.minPrice && Number(options.minPrice) > 0) {
    url += `&ps=${Math.round(Number(options.minPrice))}`;
  }
  if (options.maxPrice && Number(options.maxPrice) > 0) {
    url += `&pe=${Math.round(Number(options.maxPrice))}`;
  }

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  const accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

  const cmd = `curl.exe -s -L "${url}" -H "User-Agent: ${ua}" -H "Accept: ${accept}" -H "Accept-Language: pt-BR,pt;q=0.9"`;

  try {
    const html = execSync(cmd, { 
      maxBuffer: 35 * 1024 * 1024, 
      encoding: 'utf-8',
      timeout: 20000 
    });

    let ads = extractOlxAds(html);

    // 1. Filtrar palavras negativas (ex: "defeito", "quebrado", "bloqueado", "troca")
    const negativeKeywords = [];
    if (options.negativeKeywords) {
      if (Array.isArray(options.negativeKeywords)) {
        negativeKeywords.push(...options.negativeKeywords.map(k => k.trim().toLowerCase()));
      } else if (typeof options.negativeKeywords === 'string') {
        negativeKeywords.push(...options.negativeKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean));
      }
    }

    if (negativeKeywords.length > 0) {
      ads = ads.filter(ad => {
        const titleLower = ad.title.toLowerCase();
        return !negativeKeywords.some(neg => titleLower.includes(neg));
      });
    }

    // 2. Filtrar por preço mínimo e máximo em memória (garantia extra)
    if (options.minPrice && Number(options.minPrice) > 0) {
      ads = ads.filter(ad => ad.price === null || ad.price >= Number(options.minPrice));
    }
    if (options.maxPrice && Number(options.maxPrice) > 0) {
      ads = ads.filter(ad => ad.price === null || ad.price <= Number(options.maxPrice));
    }

    // 3. Filtrar por município se solicitado
    if (options.municipality && options.municipality.trim()) {
      const targetMun = options.municipality.trim().toLowerCase();
      ads = ads.filter(ad => ad.city && ad.city.toLowerCase().includes(targetMun));
    }

    return ads;
  } catch (err) {
    console.error(`Erro ao consultar OLX para "${query}":`, err.message);
    return [];
  }
}

module.exports = {
  searchOlxBh,
  extractOlxAds,
  parseNumericPrice
};
