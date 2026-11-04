# Автопрохождение (playtest)

Играет настоящую игру в безголовом Chromium день за днём и записывает всё, что видел: утро и «неделю спустя», путевой лист и взятые просьбы, пост ГАИ, сцены Мухи, «случаи», попутчиков и просьбы на обочине, «тормозят на дороге», пилораму, развоз с ритуалом у адресата, вечерний журнал и ремонт. Отвечает на всё по стратегии: `yes` (первый ответ — «помочь»), `no` (последний — «отказать»), `mix` (случайный, по зерну).

Машину он не ведёт, а ставит туда, где должна быть сцена (на дорогу у цели, на ручник); только пост ГАИ проезжает на настоящей физике, 30–38 км/ч, — и останавливается, если Кузьмин машет жезлом. Конец дня после последнего вручения он не ждёт девять секунд (попутчик в кабине всё равно держит день).

## Запуск

```sh
# сборка с отладочным window.__uaz, без HMR (правки кода не перезапускают страницу посреди прохождения)
node_modules/.bin/vite build --mode development --outDir /tmp/playtest/dist
node_modules/.bin/vite preview --outDir /tmp/playtest/dist --port 4180 &

echo "window.__P = { policy: 'yes', days: 10, fresh: true };" > /tmp/playtest/yes.js
node scripts/playtest/cdp.mjs scripts/playtest/autopilot.js /tmp/playtest/yes.js > /tmp/playtest/run.txt
```

- `fresh: true` — «Новая игра» (пролог, первое утро); без него — «Продолжить» с того дня, где кончил прошлый прогон (профиль браузера — `/tmp/playtest/profile`, его localStorage переживает запуски).
- **С середины сезона.** Прелюдия выполняется до кода игры, поэтому может один раз записать профиль на нужный день — и прогон начнётся с него («Продолжить»), без часа езды с первого дня:

  ```js
  window.__P = { policy: 'no', days: 6, seed: 5 };
  if (!localStorage.getItem('pt-jumped-13')) {           // один раз: дальше профиль живёт сам
    localStorage.setItem('pt-jumped-13', '1');
    localStorage.removeItem('uaz-zarechye-day');           // без сохранения середины дня
    localStorage.setItem('uaz-zarechye-profile', JSON.stringify({
      season: 1998, rub: 1997, money: 800000, runs: 12, day: 13, trust: 60, fuel: 0.8, damage: 0, talons: 25, garage: 6, prologue: true,
      muha: { step: 'end', day: 11, bond: 2, outcome: 'delivered', saw: 'asked', warned: true, pressed: 'hospital', ending: 'quit' },
      letters: { done: ['rashit', 'fedor', 'sabira'], next: 14 },
      cases: { 'mityai-seedlings': 'done', 'mityai-moto': 'done', bees: 'done', birth: 'done', wedding: 'done' },
      roadStop: { done: true, day: 9, outcome: 'gave' },
      // the salary book: what is paid already (May here), or the first day collects all the back pay
      pay: { premium: 0, at: {}, paid: ['1998-4-A', '1998-4-B'] },
    }));
  }
  ```

  Без `pay` первый же день выплатит все авансы и получки с мая (деньги в копилке тогда не показательны). Состояние сюжетов — какое нужно проверить: Муха «завязал» (`ending: 'quit'`) — зимой в котельной, весной грузчик на почте; `'jailed'` / `'north'` — его нет.
- В выводе по ходу: `>> DAY`, `CHOICE`, `PAGE`, `FADE`, `BOARD`, `GAI`, `EVENING`, `PROBLEM`. В конце `RESULT:` — JSON: дни (журнал, состояние сюжетов), все вопросы и ответы, все прозвучавшие строки (`heard` — их можно положить в `docs/voice/heard.json` для сценария озвучки) и список проблем.
- `PROBLEM` — то, что надо смотреть: строка с остатками кода (`undefined`, `{to}`), застрял на цели, попутчик не вышел, день не кончился. «Застрял» — шесть попыток на одну цель за один день (счёт попыток начинается заново с каждым днём; `days` — это игровые дни, по вечерам).
- Один день — 1,5–3 минуты (программная отрисовка без видеокарты).
