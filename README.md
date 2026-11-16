# Читинг

Обучение детей 10 лет настоящему чтению по М. Адлеру («Как читать книги»): ребёнок читает короткий текст, отвечает на вопросы **своими словами** (антикопипаст, проверка YandexGPT), проходит рефлексию — и получает купон на ставку, которую сам «поставил» на честный проход.

## Архитектура

- **Бэкенд**: Yandex Cloud Function `chiting-api` (`d4e52ejg9kvu9arsc2kd`), Node.js 18, без фреймворков — один `index.handler` с маршрутизацией по `?a=...`.
- **БД**: serverless YDB `chiting` (таблицы: users, invites, attempts, answers, llm_reviews, socratic_turns, reflection_answers, coupons, events, texts, levels, rules, answer_bases, waitlist). Схема — `api/schema.yql`, посев контента — `api/seed.js`.
- **ЛЛМ**: YandexGPT Lite оценивает пакет ответов (рубрика в `api/lib/rubric.js`, промпты в `api/lib/prompts.js`), ведёт сократовский диалог и рефлексию; каждый вызов пишется в `llm_reviews` с токенами и стоимостью.
- **Фронт**: статика `app/` (vanilla JS, без сборки), ходит в функцию по `X-Auth-Token` (JWT).
- **Админка**: эндпоинты `admin/*` (роль admin), в т.ч. экономика ЛЛМ в рублях.

## Запуск локально

```bash
python3 -m http.server 8000   # из корня репо
# открыть http://localhost:8000/app/
```

Бэкенд при этом боевой (Yandex Cloud). Регистрация — по инвайт-коду.

## Деплой бэкенда

```bash
bash api/deploy.sh   # берёт env из корневого .env, собирает zip, создаёт новую версию функции
```

Первичный посев БД: `set -a; source .env; set +a; YDB_ACCESS_TOKEN_CREDENTIALS=$(yc iam create-token) node api/seed.js`.

## Переменные окружения (.env)

`YDB_ENDPOINT`, `YDB_DATABASE`, `SECRET` (JWT), `YANDEX_GPT_API_KEY`, `YANDEX_GPT_FOLDER_ID`, `YANDEX_GPT_MODEL`, `ADMIN_PASSWORD`. Опционально: `LLM_CALLS_LIMIT`, `SPLIT_THRESHOLD`, `SOCRATIC_MAX_STEPS`, `TOKEN_PRICE`, `DAILY_ALERT_RUB`.

## Основные эндпоинты

| a= | Назначение |
|---|---|
| `register` / `login` | регистрация по инвайту / вход, отдают JWT |
| `levels` | список уровней: правило, текст, доступность |
| `attempt-create` / `attempt-get` | создать попытку / текст+вопросы попытки |
| `attempt-answers` / `attempt-event` | ответы (с античит-статистикой) / события чтения |
| `review` | оценка пакета ЛЛМ → `socratic` (нули + сократ) или `reflection` |
| `socratic-ask` / `socratic-answer` | наводящий вопрос / ответ ребёнка в сократовском диалоге |
| `hint` / `next` | подсказка-крючок (всегда) / лестница итераций, на пороге — разбивка текста на фрагмент |
| `reflect` / `approve` / `coupons` | рефлексия / апрув + купон / кабинет ребёнка |
| `admin/users` `admin/report` `admin/economy` `admin/waitlist(-approve)` | админка (только role=admin) |
| `export` | выгрузка отчёта по попытке (admin или владелец) |

## Документы

- `docs/TZ.md` — техническое задание
- `docs/metodologiya.html` — методология обучения чтению
- `docs/proektirovanie.html` — проектирование системы
