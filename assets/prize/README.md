# 선물 사진 폴더

"짜잔!" 선물 공개 화면에 크게 보여줄 사진입니다. 지금 들어있는 파일은 아래와 같습니다.

```
assets/prize/water.jpg    💧 물     → 참붕어빵
assets/prize/fire.jpg     🔥 불     → 불닭볶음면
assets/prize/wind.jpg     🍃 바람   → 솜사탕
assets/prize/earth.jpg    🪨 땅     → 석기시대 초콜릿
assets/prize/sky.jpg      ☁️ 하늘   → 별뽀빠이
assets/prize/light.jpg    ✨ 빛     → 아이셔
```

- 사진을 바꾸려면 같은 이름으로 덮어쓰면 됩니다.
- **정사각형**(지금은 492×492)으로 만들어주세요. 다른 비율이어도 잘리지 않고 정사각 칸 안에 맞춰 들어갑니다.
- png / jpg / svg / webp 모두 됩니다. 확장자를 바꾸면 `js/config.js` 의 `image` 경로도 함께 바꿔주세요.
- 파일이 없으면 화면에 이모지와 함께 **넣어야 할 파일 경로**가 표시됩니다.

## 상자 선택 화면 아이콘

선택 화면의 동그란 아이콘은 지금 이모지(💧 🔥 🍃 🪨 ☁️ ✨)를 쓰고 있습니다.
따로 만든 아이콘이 있으면 `icon/` 안에 넣고 `config.js` 의 `icon` 경로를 채워주세요.

```js
{ id: 'water', emoji: '💧', name: '물', icon: 'assets/prize/icon/water.svg', ... }
```

정사각형 투명 배경(svg 또는 png)이 가장 잘 맞습니다.
