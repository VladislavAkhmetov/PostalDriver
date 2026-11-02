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

## `militsioner.glb` — инспектор ГАИ, 1997

Модель сгенерирована нейросетью по промту автора игры (T-поза, PS2-стиль) и обработана для игры:
сетка упрощена с 50 000 до 2 000 треугольников, оставлена одна цветовая текстура 512×512 (вместо трёх PBR-карт 4096²),
модель посажена на скелет Quaternius «BaseHuman» из `man.glb` (31 кость) с его 11 анимациями (CC0).
Скрипты: `scripts/models/simplify.mjs`, `scripts/models/rig-militsioner.mjs`.

## `timur.glb` — Тимур, главный герой; `muha.glb` — его друг Женька Муха

Модели сгенерированы нейросетью по промту автора игры (T-поза, PS2-стиль) и обработаны так же, как инспектор:
сетка упрощена с 50 000 до 2 500 треугольников, причём кисти рук упрощены бережнее (`scripts/models/simplify-hands.mjs`):
они нужны крупным планом от первого лица. Одна цветовая текстура 512×512. Модели посажены на тот же скелет BaseHuman
с 11 анимациями (`scripts/models/rig-character.mjs`; Тимур: `HAND=0.112 CROTCH=0.5 ARM=1.3` — руки удлинены, чтобы водитель доставал до руля, Муха: `HAND=0.108 CROTCH=0.47`).
У Мухи на текстуре закрашены фирменные полоски на штанах и кроссовках: в игре нет чужих логотипов и знаков.

## `kartatay.glb` — Урал-картатай, дед Тимура

Модель сгенерирована нейросетью по промту автора игры (T-поза, PS2-стиль: кепка, усы, старый пиджак поверх свитера с узором, сапоги)
и обработана так же, как Тимур и Муха: сетка упрощена с 50 000 до 2 500 треугольников с бережными кистями
(`scripts/models/simplify-hands.mjs`), одна цветовая текстура 512×512, посажена на скелет BaseHuman с 11 анимациями
(`scripts/models/rig-character.mjs`, `CROTCH=0.45 HAND=0.105` — развилка ног под пиджаком задана вручную: измеренная 0.36 ломала посадку).
В кабине (`src/vehicle/Passenger.ts`) он сидит сутулясь на палку и подогнан под низкую крышу: высота кепки меряется на позе сидя,
фигура уменьшается до того, чтобы под обшивкой оставалось не меньше 3 см.
