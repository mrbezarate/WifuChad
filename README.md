<div align="center">
  
# 🌸 WaifuChad
**Next-Generation AI Anime Companion Platform**

[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5-purple.svg)](https://vitejs.dev/)
[![Vertex AI](https://img.shields.io/badge/Google%20Cloud-Vertex%20AI-orange.svg)](https://cloud.google.com/vertex-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

*WaifuChad — это не просто чат-бот. Это высокотехнологичная платформа для иммерсивного ролевого общения с вашими любимыми 2D-персонажами, использующая передовые модели LLM, динамическую долгосрочную память и генерацию голоса в реальном времени.*

</div>

---

## ✨ Ключевые возможности (Features)

*   🧠 **Generational Context Memory**: Инновационная архитектура управления памятью. ИИ не просто читает текст, он *запоминает* важные факты о вас и переносит их в долгосрочный буфер (LSM-Merge & TinyLFU фильтрация).
*   🎭 **Adaptive Persona Engine**: Персонажи меняют своё поведение (Affinity System) в зависимости от ваших отношений (Lovers / Strangers) и сказанных вами слов.
*   🎧 **Gapless Audio TTS**: Нативная интеграция с мультимодальной генерацией аудио от Gemini. Плавное проигрывание голоса вайфу через Web Audio API без пауз и заиканий.
*   🚀 **Extreme Token Optimization**: Продвинутый Sliding Window для истории чата, Regex-эвристика и использование сверхдешевых фоновых агентов (`gemini-2.5-flash-lite`) сокращают потребление токенов на **85%**.
*   🛡️ **Enterprise Security (BFF)**: Никаких открытых API-ключей в браузере. Все запросы перехватываются "умным шимом" и проксируются через защищенный Node.js сервер с Rate Limiting и валидацией хостов.

---

## 🛠 Технологический стек

*   **Frontend**: React, TypeScript, Vite, TailwindCSS (glassmorphism design).
*   **Backend**: Node.js, Express, `google-auth-library`, `express-rate-limit`.
*   **AI Models**: `gemini-2.5-flash` (Основной чат и Голос), `gemini-2.5-flash-lite` (Фоновые агенты памяти).

---

## 🚀 Быстрый старт (Установка и запуск)

Для работы приложения на вашем компьютере должен быть настроен доступ к Google Cloud Vertex AI.

### 1. Предварительные требования (Prerequisites)

*   **Node.js**: Убедитесь, что установлен Node.js (v18+).
*   **Google Cloud SDK (gcloud CLI)**: [Скачайте и установите gcloud](https://cloud.google.com/sdk/docs/install).

### 2. Аутентификация в Google Cloud

Откройте терминал и выполните инициализацию, а затем получите токен приложения (Application Default Credentials), чтобы Node.js сервер мог вызывать ИИ без явной передачи паролей в коде:

```bash
# 1. Авторизация в вашем аккаунте
gcloud init

# 2. Получение ключа доступа для кода (ОБЯЗАТЕЛЬНО!)
gcloud auth application-default login
```

### 3. Установка и запуск проекта

Склонируйте репозиторий и запустите одной командой. Скрипт установит зависимости и поднимет сразу оба сервера (Frontend на `localhost:5173` и Backend на `localhost:5000`).

```bash
npm install
npm run dev
```

---

## 🏗 Архитектура проекта

Проект спроектирован как монорепозиторий (Workspaces):

```text
├── backend/                  # Безопасный BFF-прокси 
│   ├── server.js             # Защита от SSRF, Rate Limit, трансляция SSE-потоков
│   └── .env.local            # Автогенерируемые настройки GCP
└── frontend/                 # Пользовательский интерфейс React
    ├── src/App.tsx           # Оркестратор состояний и таймеров активности
    ├── services/             # Модули памяти (DoorkeeperFilter), ИИ и Аудио
    └── vertex-ai-...js       # Monkey-Patch скрипт для перехвата fetch от SDK
```

> **Примечание по безопасности:** Ваш файл `backend/.env.local` уже содержит `GOOGLE_CLOUD_PROJECT` и привязан к вашей инфраструктуре. 

---

## 🧠 Deep Dive: Под капотом памяти (Token-Efficient Architecture)

Чтобы ИИ не терял контекст при долгих беседах и не сжигал бюджет на токены, мы используем алгоритмы из мира высоконагруженных СУБД:

```text
[ Ваш ввод ] ──► [ Doorkeeper Filter (TinyLFU) ] 
                         │ (Пропускает только частые/важные факты о вас)
                         ▼
[ Краткосрочная память ] ──► [ BBR Pacing ] ──► [ Фоновая Эвакуация ]
(Sliding Window - 20)                                      │
                                                           ▼
[ Системный промпт ИИ ] ◄── [ Подмешивание ] ◄── [ Долгосрочная память ]
```

1. **Doorkeeper Filter (TinyLFU):** Отсеивает "мусорные" факты. Если вы сказали "я сейчас пью чай", фильтр не пустит это в долгосрочную память, пока вы не упомянете это несколько раз. Это защищает ИИ от переполнения ненужной информацией.
2. **Generational Context:** Память делится на "молодое поколение" (последние 20 сообщений) и "старое поколение" (структурированные выжимки). Специальный фоновый агент на дешевой модели (`gemini-2.5-flash-lite`) периодически сжимает переписку и обновляет вашу карточку.
3. **BBR Context Pacing:** Динамически контролирует "пропускную способность" контекста. Если текущий разговор очень активный, система временно подмешивает меньше старых фактов, чтобы модель не теряла фокус (Bufferbloat protection).

---

<div align="center">
  <i>Разработано с ❤️ для тех, кто ищет идеальную виртуальную компанию.</i>
</div>
