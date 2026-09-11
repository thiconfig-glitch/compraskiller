# 📡 Radar OLX BH — Rastreador de Produtos e Preços (PWA)

Aplicativo PWA (Progressive Web App) desenvolvido para celular e desktop, focado em monitorar e rastrear anúncios e preços de produtos na **OLX em Belo Horizonte e região (Grande BH / DDD 31)** com alerta de oportunidades.

---

## 🚀 Funcionalidades

- **📡 Feed / Radar de Oportunidades:**
  - Exibe anúncios com destaque para itens abaixo do preço meta (`🔥 Oportunidade`), reduções de preço feitas pelo vendedor (`📉 Baixou Preço`) e anúncios recém-publicados (`✨ Novo`).
- **🎯 Meus Rastreadores:**
  - Cadastro de buscas contínuas com preço alvo, preço mínimo (evita capinhas/acessórios), preço máximo e exclusão de palavras negativas (ex: `defeito, quebrado, bloqueado, peças`).
  - Métricas em tempo real: menor preço encontrado, preço médio e quantidade de anúncios na meta.
- **🔍 Busca Rápida Instantânea:**
  - Pesquise qualquer produto na OLX BH em tempo real e transforme a busca em um rastreador fixo com 1 clique (`🔔 Rastrear esta busca`).
- **⭐ Favoritos:**
  - Salve anúncios interessantes para negociar com o vendedor.
- **📱 PWA Completo:**
  - Instale no celular (Android ou iPhone) como um app nativo através de **"Adicionar à Tela Inicial"**.
  - Funciona em tela cheia (standalone) com ícone próprio e navegação mobile-first com barra inferior ergonômica.
- **⚡ Varredura Automatizada:**
  - Botão de varredura geral em 1 toque (`⚡ Verificar Tudo`).
  - Agendador automático em segundo plano a cada 30 minutos.

---

## 🛠️ Como Iniciar

1. Abra a pasta `C:\Projetos\compras`.
2. Dê dois cliques em **`iniciar_radar.bat`** (ou execute `npm start` no terminal).
3. O servidor estará rodando em:
   - **No PC:** `http://localhost:3333`
   - **No Celular (conectado na mesma rede Wi-Fi):** `http://[IP-DO-SEU-PC]:3333` (ex: `http://192.168.1.100:3333`).

---

## 📲 Como Instalar no Celular

### No Android (Google Chrome):
1. Acesse o endereço do app no Chrome do celular.
2. Toque no botão **"📲 Instalar App"** no topo da tela (ou no menu de 3 pontinhos do Chrome ➔ **"Instalar aplicativo"** ou **"Adicionar à tela inicial"**).
3. O ícone do **Radar OLX** será adicionado à sua tela de aplicativos.

### No iPhone / iOS (Safari):
1. Abra o link no Safari.
2. Toque no botão de compartilhamento (ícone de quadrado com seta para cima).
3. Selecione **"Adicionar à Tela de Início"**.
