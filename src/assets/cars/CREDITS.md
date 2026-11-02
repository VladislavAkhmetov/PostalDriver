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

## `vaz2106-gai.glb`, `niva-gai.glb` — машины ГАИ, 1997

ВАЗ-2106 и ВАЗ-2121 «Нива» в белой окраске с синей полосой и «люстрой» на крыше. Модели сгенерированы
нейросетью по промту автора игры и подготовлены скриптом `scripts/models/prep-car.mjs`: 50 000 → ~7 000 / ~8 700
треугольников, одна текстура 1024² вместо трёх PBR-карт 4096², метры, колёса отдельными узлами на осях,
плафоны мигалки и стёкла — отдельными материалами. На капоте шестёрки закрашена нечитаемая надпись,
номера в игре — свои, синие милицейские (Patrol.ts).
