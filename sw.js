const CACHE_NAME = 'logprime-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './inicial.html',
  './agendamento.html',
  './cadastro-cooperados.html',
  './cargas-do-dia.html',
  './consulta-notas.html',
  './gestao-notas.html',
  './historico.html',
  './monitoramento.html',
  './primeiro-acesso.html',
  './recebimento-do-dia.html',
  './relatorio-cooperados.html',
  './usuarios.html',
  './js/main.js',
  './js/auth.js',
  './js/firebase-config.js',
  './js/agendamento.js',
  './js/cadastro-cooperados.js',
  './js/cargas-do-dia.js',
  './js/consulta-notas.js',
  './js/gestao-notas.js',
  './js/historico.js',
  './js/monitoramento.js',
  './js/primeiro-acesso.js',
  './js/recebimento-do-dia.js',
  './js/relatorio-cooperados.js',
  './js/usuarios.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon.ico'
];

// Instalação do Service Worker e Cache dos arquivos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell and assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia de Fetch: Network First com Fallback para Cache
self.addEventListener('fetch', (event) => {
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  }
});
