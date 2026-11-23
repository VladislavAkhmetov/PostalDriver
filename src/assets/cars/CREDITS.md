# Машины / Cars

Low-poly cars from the "Cars" pack by **Quaternius** (https://quaternius.com), via poly.pizza.
License: **CC0 1.0** (public domain) — free to use, modify and redistribute.

| File | Source |
|---|---|
| `sedan.glb` | "Car" — https://poly.pizza/m/Cz6yDaUcM9 |
| `compact.glb` | "Car" — https://poly.pizza/m/unqqkULtRU |
| `suv.glb` | "SUV" — https://poly.pizza/m/xsMtZhBkxL |
| `taxi.glb` | "Taxi" — https://poly.pizza/m/x43lOScTpN |

In the game the paint is recoloured per car and the bodies carry procedural
90s liveries and decals (taxi chequers, militia stripe, shop vans, plates).

## `paz.glb` — white and blue route bus

Derived from the user-supplied `pazik.glb`; the supplied original is unchanged.
This generated source is separate from the CC0 Quaternius pack above.
Prepared with `scripts/models/prep-paz.mjs` and `paz-wheels.mjs`: roughly 24.1k triangles, 1024 px
body atlas, shared wheel atlas and rotating wheel nodes. Separate user-supplied
`pazik_wheel_front.glb` and `pazik_wheel_back.glb` replace the embedded wheels,
with matched matte rubber and neutral grey steel. The bus has repaired
front grille/hatch/lenses, and a baked `КЛЮЧЕВСК-УФА` windscreen card.
Runtime integration and reproduction notes: `docs/paz-bus.md`.

## `vaz2106-gai.glb`, `niva-gai.glb` — машины ГАИ, 1997

«Шестёрка» (2106) и «Нива» (2121) в белой окраске с синей полосой и «люстрой» на крыше. Модели сгенерированы
нейросетью по промту автора игры и подготовлены скриптом `scripts/models/prep-car.mjs`: 50 000 → ~7 000 / ~8 700
треугольников, одна текстура 1024² вместо трёх PBR-карт 4096², метры, колёса отдельными узлами на осях,
плафоны мигалки и стёкла — отдельными материалами. На капоте шестёрки закрашена нечитаемая надпись,
номера в игре рисует общий модуль `Plates.ts`.

## `devyatka.glb` — «девятка» Женьки Мухи

ВАЗ-2109, тёмно-зелёная, с тонированными стёклами. Модель сгенерирована по промту автора и подготовлена
`scripts/models/prep-car.mjs`: около 13 500 треугольников, одна текстура 1024², длина 4,01 м, колёса
отдельными узлами на осях. Стоит у магазина «Продукты», не доезжая до фонарного столба. Номер — `Plates.ts`.

## `kosmich404.glb` — Космич 404

Исходная модель предоставлена для проекта. Игровая версия использует около 6 800 треугольников,
текстуру 1024² и четыре колеса с отдельными осями. Номер наносится в игре на обе площадки.
