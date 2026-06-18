# نشر SysBot على Railway

## 1) إنشاء المشروع

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → اختر `sysbot`.
2. من المشروع: **+ New** → **Database** → **PostgreSQL**.
3. افتح خدمة **البوت** (ليس Postgres) → **Variables** → **Add Reference** → اختر `DATABASE_URL` من خدمة PostgreSQL.

## 2) متغيرات البيئة (انسخ كل سطر)

| المتغير | القيمة |
|---------|--------|
| `DISCORD_TOKEN` | توكن البوت من [Discord Developer Portal](https://discord.com/developers/applications) → Bot → Reset Token / Copy |
| `GLOBAL_OWNERS` | `461673385567584285` |
| `DEVELOPER_ID` | `461673385567584285` |
| `DATABASE_URL` | **مرجع تلقائي** من خدمة PostgreSQL (لا تكتب يدوياً إن أمكن) |
| `DEFAULT_PREFIX` | `!` |
| `CMD_RATE_LIMIT_MAX` | `3` |
| `CMD_RATE_LIMIT_WINDOW_MS` | `5000` |
| `SHARD_COUNT` | `0` |
| `LOG_LEVEL` | `info` |
| `LOG_PRETTY` | `false` |

### ملاحظات

- **لا تضف** `DATABASE_URL=file:...` — البوت يستخدم PostgreSQL فقط.
- احذف أي Volume قديم كان مخصصاً لـ SQLite على `/data` إن وُجد من نشر سابق.
- لا حاجة لـ **Public Networking** أو فتح منفذ — البوت يتصل بـ Discord فقط.

## 3) النشر

- كل `git push` إلى `master` يعيد البناء تلقائياً.
- في **Logs** انتظر:
  - `Connected to database` مع `kind: postgresql`
  - `Bot is ready`

## 4) بيانات SQLite القديمة (اختياري)

البيانات في `data/sysbot.db` **لا تنتقل تلقائياً**. بعد أول نشر ناجح:

1. نزّل نسخة من `sysbot.db` إن كانت على Railway Volume قديم، أو استخدم الملف المحلي.
2. شغّل مرة واحدة من جهازك:

```bash
SQLITE_SOURCE_URL=file:../data/sysbot.db DATABASE_URL="<رابط Railway Postgres>" npm run migrate:sqlite-to-pg
```

3. أعد تشغيل خدمة البوت من Railway.

بدون ترحيل: البوت يعمل لكن كل سيرفر يحتاج `!vip` إعداداً من جديد.

## 5) أوامر مفيدة بعد التشغيل

- `!sysctrl` — لوحة المطوّر (فقط لـ `DEVELOPER_ID`)
- `!vip` — الإعداد الأولي في السيرفر
- `!lsetup sync` — إصلاح اللوقات والصلاحيات
