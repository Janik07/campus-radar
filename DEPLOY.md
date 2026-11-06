# Как выложить Campus Radar в интернет (бесплатно, ~30 минут)

Понадобятся четыре бесплатных аккаунта: GitHub, Neon (база данных), Render (сервер) и cron-job.org (будильник для напоминаний). Плюс Telegram для создания бота.

## 1. Код на GitHub
1. Создай пустой репозиторий на github.com, например `campus-radar`.
2. Загрузи туда содержимое папки проекта (кнопка **Add file → Upload files** или через git).

## 2. База данных — Neon
1. Зарегистрируйся на https://neon.tech и создай проект (регион ближе всего — Frankfurt).
2. Скопируй **Connection string** — строка вида `postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.

Таблицы и 46 клубов из таблицы создадутся сами при первом запуске сервера.

## 3. Telegram-бот
1. В Telegram открой **@BotFather** → `/newbot`.
2. Имя: `Campus Radar`, username: например `campus_radar_aitu_bot`.
3. Скопируй **токен** (вида `123456:ABC...`).

## 4. Сервер — Render
1. Зарегистрируйся на https://render.com через GitHub.
2. **New → Blueprint** → выбери репозиторий. Render прочитает `render.yaml` сам.
3. Заполни переменные:
   - `DATABASE_URL` — строка из Neon
   - `TELEGRAM_BOT_TOKEN` — токен из BotFather
   - `ADMIN_EMAILS` — твоя почта `@astanait.edu.kz` (станешь админом)
   - `PUBLIC_URL` — пока оставь пустым
4. Нажми **Apply**. Через 3–5 минут появится адрес вида `https://campus-radar-xxxx.onrender.com`.
5. Вернись в **Environment** сервиса, впиши этот адрес в `PUBLIC_URL` и сохрани. Сервер перезапустится и подключит бота через webhook.

Проверка: открой `https://…onrender.com/api/health` — должно быть `{"ok":true}`.

## 5. Будильник — cron-job.org
Бесплатный Render «засыпает» через 15 минут без запросов, тогда напоминания не уйдут вовремя.
1. Зарегистрируйся на https://cron-job.org → **Create cronjob**.
2. URL: `https://…onrender.com/api/cron/tick?key=ВАШ_CRON_SECRET` (значение `CRON_SECRET` смотри в Environment на Render).
3. Расписание: каждые 5 минут.

Это и будит сервер, и запускает рассылку напоминаний.

## 6. Первая настройка
1. Зайди на сайт со своей почтой — ты админ.
2. **Admin** → добавь почты организаторов к их клубам.
3. **Settings → Connect Telegram** → нажми Start в боте.
4. Создай событие в **Organiser** и зарегистрируйся на него — придёт напоминание.

## Перед защитой
- За 2–3 минуты до показа открой сайт, чтобы сервер точно проснулся (cron обычно уже держит его бодрым).
- `DEMO_MODE=true` показывает код входа на экране — так можно войти без доступа к почте. Если подключите Resend с доменом, поставьте `DEMO_MODE=false`.
