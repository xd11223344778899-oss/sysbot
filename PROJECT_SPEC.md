# SysBot — مواصفات بوت نظام Discord متكامل

> ملف مرجعي دائم. يحتوي كل المتطلبات وقائمة الأوامر الكاملة حتى لا يُنسى أي شيء أثناء التطوير.

## القرارات التقنية

| الطبقة | الاختيار |
|--------|----------|
| اللغة | TypeScript (Node 20+) |
| مكتبة Discord | discord.js v14 |
| قاعدة البيانات | SQLite محلية (ملف واحد) عبر Prisma ORM — بدون خدمة خارجية |
| الطوابير | داخل العملية (in-process) لـ rolemulti وجدولة العقوبات — بدون Redis |
| الاستضافة | Railway (Nixpacks + Volume للحفظ) أو Docker، مع إعادة تشغيل حقيقية |

- متعدد السيرفرات: لكل سيرفر إعداداته المنفصلة في جدول `Guild`.
- **لا Slash Commands إطلاقاً.** كل التفاعل عبر الرسائل النصية + القوائم التفاعلية (Select Menus / Buttons / Modals).
- نظام أوامر مزدوج:
  - أوامر ببرفكس افتراضي `!` (قابل للتغيير عبر `setprefix`).
  - أوامر بدون برفكس إطلاقاً (تُعرَف باسمها فقط في كل مكان، حتى القنوات النصية المدمجة بالرومات الصوتية).
- مبدأ التوسع: كل أمر = ملف واحد يُصدّر تعريفاً موحداً ويُسجَّل تلقائياً. إضافة أمر = ملف جديد فقط.

## نظام الصلاحيات

ترتيب الفحص: Bot Owner ← deny list ← allow list ← admin/per-command perms.

- Bot Owners: مستقلون عن مالك Discord، يُدارون عبر `setowner` / `owners`.
- `allow` / `deny` / `list`: السماح أو المنع لمستخدم/رول من استخدام الأوامر.
- `cmd`: تفعيل/تعطيل/تعديل صلاحيات كل أمر على حدة.
- إعدادات حصرية: فك العقوبة على المُعطي فقط (باستثناء الـ owners)، حماية حذف الرولات/القنوات، إلخ.

## الإعداد الأولي التلقائي (`lsetup` / setup)

ينشئ تلقائياً عند أول تشغيل في سيرفر:
1. كاتيجوري للوقات + كاتيجوري للعقوبات/النيو.
2. جميع قنوات اللوق الممكنة بدون استثناء.
3. رولات النظام: Muted, Prison, New, Unverified (رول Voice-Muted اختياري/legacy — `vmute` لا يستخدمه).
4. تطبيق Permission Overwrites تلقائياً على كل القنوات (منع الكتابة لرول الاسكات في كل القنوات ما عدا المستثناة، حجب القنوات لرولات New/Unverified ما عدا القناة المخصصة).
5. زرع أسباب العقوبات الافتراضية في `punishReasons`.
6. حفظ كل المعرفات في `GuildConfig`.

## أسماء الأوامر البديلة (Command Aliases)

- لكل أمر اسم إنجليزي أساسي + alias عربي مختصر افتراضي من `default-command-aliases.ar.ts`.
- تخصيص لكل سيرفر عبر `doadd` / `dochange` / `doremove` / `dolist`، مخزّن في جدول `CommandAlias`.
- `command-parser` يحل الـ alias بعد فشل البحث بالاسم الأساسي؛ `permission-engine` يفحص دائماً على الاسم الأساسي.

## قوائم أسباب العقوبات

- عند استدعاء `mute` / `prison` / `vmute` / `ban` / `kick` مع `@user` فقط → `punishment-flow` يرسل Select Menu + Modal للسبب المخصص.
- الأسباب في `Guild.punishReasons` (JSON): `{ id, label, durationMs, types[] }`.
- إدارة عبر `resons add|remove|edit|list`؛ ترحيل تلقائي من `reasons` القديم.
- الإدخال اليدوي `mute @user 10m سبب` يبقى كما هو.

## أنظمة رئيسية

- **الاسكات الكتابي (`mute`)**: يمنح رول **Muted** — يمنع الكتابة في كل القنوات النصية (عامة، خاصة، مدمجة بالصوت) عبر Permission Overwrites. لا يمنع التحدث في الصوت.
- **كتم صوتي (`vmute`)**: Server Mute فقط (`member.voice.setMute`). `vmute-guard` يعيد الكتم عند فك يدوي أو دخول صوتي طوال مدة العقوبة. يحتاج صلاحية Mute Members.
- **`rolemulti`**: إعطاء رول للكل / الأعضاء فقط / البوتات فقط عبر طابور BullMQ لتجنّب rate limits.
- **`autorole`**: رول تلقائي لكل عضو جديد.
- **نظام `new`**: حسابات أقل من عمر محدد تأخذ رول New وتُحجب عنها كل القنوات عدا قناة `new`، مع رسالة مخصصة.
- **تفعيل الحساب (verification)**: رول Unverified يحجب كل القنوات عدا قناة التفعيل، مع رسالة/زر تفعيل.
- **اللوقات**: وضع مفصل (قناة لكل حدث) أو مختصر (تجميع الأحداث القريبة). كل الأحداث بدون استثناء.
- **تخصيص البوت**: اسم، أفاتار، بنر، لعب (playing/listening/streaming/watching)، حالة (online/idle/dnd/invisible)، برفكس، owners، restart حقيقي.

## قائمة الأوامر الكاملة

sticker — Add sticker to server
check — Get role members
checkvc — Get role members and voice status
adminlist — Get all admins in server
disapplay — Disapplay mentions and pic in chat
applay — Applay mentions and pic in chat
hide — Hide the chat
server — Server info
lock — Lock the chat
slowmode — Applay slowmode in chat
unhide — Un hide the chat
rooms — Get admins out of rooms
unlock — Un lock the chat
commands — Show commands list
restart — Restart the bot
setowner — Add or remove owner to bot
setname — Change bot name
setnprefix — Use mods command without prefix
setavatar — Change bot avatar
setbanner — Change bot banner
owners — Show owners list
vip — Edit Bot
allow — Allow user or role to use commands
deny — Deny user or role to use commands
list — Show allow list
settings — Set server settings
blackchat — Set blacklist chat
logs — Set logs channels
lremove — Delete all logs
cmd — Edit command settings
lsetup — Create all logs
setbanmsg — Set the ban message
setchannel — Set prison and new channel
setpadmin — Set only admin remove the punishment
resons — Manage punishment reason presets (add/remove/edit/list with duration)
doadd — Add custom command alias
dochange — Replace primary command alias
doremove — Remove custom command alias
dolist — List command aliases
pallow — Allow or deny admin from remove the punishment
plist — Show punishment-permission list
callow — Allow user to join a channel
setrole — Set pic, here, live roles
cdeny — Deny user to join a channel
chide — Hide voice channel on the member
wantilist — Allow or deny user to delete roles or channels (list)
cunhide — Unhide voice channel on the member
wanti — Allow or deny user to delete roles or channels
mypenalties — User penalties
mymute — User text mute info
pcontinue — Continuation of punishment
myprison — User prison info
myvmute — User voice mute info
penalties — Edit user penalties
records — User records
setline — Auto line in chat
unclear — Disable auto clear in chat
unline — Disable auto line in chat
setclear — Auto clear in chat
unreact — Disable auto react in chat
setpcolor — Set embed color
setreact — Auto react in chat
setpic — Embed pic in chat
unpic — Disable embed pic in chat
clist — List deny users of channels
dm — Send message to member in dm
color — Change your color
mcolors — Get colors menu
colors — Get colors list
createlimit — Set the auto protection limit
trustuser — Add or remove user to trustlist
setcolors — Set colors settings
avatar — Get user avatar
trustlist — Show trust list
change — Change avatar to greyscale
restore — Restore roles
help — Bot connection speed / help
ping — Bot connection speed
user — Get user info
ban — Ban user from server
black — Blacklist user from server
banner — Get user banner
kick — Kick user from server
say — Send message
block — Block user from role
move — Move user to your channel
moveme — Move you to another channel
addemoji — Add emoji to server
clear — Clear messages from chat
procedure — Remove an exemption from user
unban — Un ban user in server
prison — Prison user from typing in chat
mute — Mute user from typing in chat
unblack — Un blacklist user
unblock — Un block user
unprison — Un prison user
unmute — Un mute user
unvmute — Un vmute user
vkick — Vkick user from voice
vmute — Server-mute user in voice (re-applied while penalty active)
myinv — Your invites
link — Get server link
topinvite — Top server invites
info — User points
apoint — Add point
points — Points settings
rpoint — Remove point
setlink — Set link info
preset — Reset point
antijoin — Ban or prison new accounts
setrjoin — Set new accounts action
reset — Reset points
protection — Set protection settings
antidelete — Anti delete channels or roles
antilinks — Disallow links from chat
antiperms — Protection from edit roles permissions
antibots — If bot joins server the bot is kicked
collection — Edit anti role settings
bblack — Block user from joining server
antiword — Text mute for inappropriate words
spam — Set spam limits
role — Add role to user
rolemulti — Add role to all members
myrole — Edit your special role
dsrole — Delete a special role
srole — Create a special role
here — Add here role to user
addrole — Create a new role
autorole — Add role to new members
live — Add live role to user
pic — Add pic role to user
reactrole — Make reaction role
irole — Add or change role img
settask — Set task for mods
unnew — Remove new role from user
task — Get task for mods
warn — Add warn to member
wremove — Remove warn from member
wlist — Get warn list
ecollection — Edit collections
exemption — Add an exemption to user

## أفكار احترافية إضافية

1. نظام استئناف العقوبات (زر في DM).
2. جدولة العقوبات المؤقتة (انتهاء تلقائي عبر BullMQ).
3. نسخ احتياطي لإعدادات السيرفر (export/import JSON).
4. وضع Anti-raid تلقائي عند موجة انضمامات.
5. Command cooldowns لمنع السبام.
6. Audit trail داخلي (من نفّذ ماذا ومتى).
7. Webhook fallback للوقات.
8. Dashboard ويب (مرحلة لاحقة).
9. نقطة ربط لنظام التذاكر لاحقاً.
10. i18n: عربي افتراضي مع قابلية إضافة لغات.

## خارطة المراحل

- المرحلة 1: Core + database + VIP/setup + moderation أساسي + logging.
- المرحلة 2: channels + roles + autorole/new/verification + allow/deny.
- المرحلة 3: protection + points + warns + auto features + colors.
- المرحلة 4: باقي الأوامر + التلميع + الاختبار + النشر.
