# Люди / People

Low-poly animated characters by **Quaternius** (https://quaternius.com), via poly.pizza.
License: **CC0 1.0** (public domain) — free to use, modify and redistribute.

| File | Source |
|---|---|
| `man.glb` | "Man" — https://poly.pizza/m/HMnuH5geEG |
| `woman.glb` | "Woman" — https://poly.pizza/m/AQsd9ngvKU |
| `woman-dress.glb` | "Woman in Dress" — https://poly.pizza/m/zMyPlQXBzq |

In the game the materials are recoloured and the figures dressed with procedural
90s accessories (GAI caps and belts, headscarves, aprons, flat caps, baton).

## `timur.glb` — Тимур от первого лица (руки и ноги водителя)

Модель сгенерирована нейросетью по промту автора игры (T-поза, PS2-стиль): сетка упрощена с 50 000 до 2 500 треугольников,
кисти рук упрощены бережнее (`scripts/models/simplify-hands.mjs`) — они нужны крупным планом от первого лица.
Одна цветовая текстура 512×512. Посажена на скелет Quaternius BaseHuman с 11 анимациями
(`scripts/models/rig-character.mjs`, `HAND=0.112 CROTCH=0.5 ARM=1.3` — руки удлинены, чтобы водитель доставал до руля):
у этого скелета есть кости пальцев, они сжимаются на руле (`src/vehicle/Hands.ts`).

## Персонажи на скелете Mixamo: `hero-mx.glb`, `muha-mx.glb`, `kartatay-mx.glb`, `gai-mx.glb`, `mixamo-clips.glb`

Тимур со стороны (кепка, олимпийка), Женька Муха (майка, цепочка с крестиком, трико), Урал-картатай (кепка, усы, пиджак
поверх свитера с узором, сапоги) и сержант Кузьмин (форма ГАИ, фуражка с красным околышем). Модели сгенерированы нейросетью
по промту автора игры и посажены на скелет Mixamo (25 костей, без пальцев) автором игры; анимации — из библиотеки Mixamo
(Adobe; анимации и автоматический риг Mixamo разрешено использовать в играх).

Обработка — `scripts/models/mixamo-people.mjs` (из FBX, в браузере): сетка сварена и упрощена meshoptimizer с 50 000 до
3 800–5 200 треугольников (у Кузьмина бережнее: мелкие острова текстуры формы иначе расползаются по брюкам), текстура
4096² уменьшена до 512². У Мухи на текстуре закрашены фирменные полоски на кроссовках и трико: в игре нет чужих логотипов.
Анимации собраны в один файл на голом скелете и подходят всем четырём (движение таза масштабируется по высоте таза в покое):

| Клип | Откуда | Где в игре |
|---|---|---|
| `Idle` | Standing Idle | стоят: картатай у крыльца, Муха у магазина, Кузьмин на посту |
| `Talking`, `Talking2` | Talking | когда персонаж говорит реплику (Муха, картатай, Кузьмин у окна) |
| `Walk`, `OldWalk` | Walk, походка картатая | ходьба (картатай ходит своей, стариковской) |
| `Sitting` | Sitting Idle | картатай в кабине на пассажирском, Тимур на ведре у колеса в катсцене |
| `Driving` | Driving | инспектор за рулём патрульной машины |
| `Waving` | Waving | Муха машет буханке обеими руками |
| `Handshake` | Shaking Hands | Муха при первой встрече; «без квитанции» — деньги из рук в руки в катсцене |
| `Texting` | Texting While Standing | Кузьмин у окна выписывает квитанцию в папке |
