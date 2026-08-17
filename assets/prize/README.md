# 선물 사진 폴더

"짜잔!" 선물 공개 화면에 크게 보여줄 사진을 여기에 넣어주세요.

`js/config.js` 의 `prizes` 에 적힌 파일명과 같아야 합니다. 기본값은 아래와 같습니다.

```
assets/prize/water.png    💧 물
assets/prize/fire.png     🔥 불
assets/prize/wind.png     🍃 바람
assets/prize/earth.png    🪨 땅
assets/prize/sky.png      ☁️ 하늘
assets/prize/light.png    ✨ 빛
```

- png / jpg / svg / webp 모두 됩니다. 확장자를 바꾸면 `config.js` 의 `image` 경로도 함께 바꿔주세요.
- 가로:세로 **4:3** 정도가 가장 잘 맞습니다. (예: 800×600) 다른 비율이어도 잘리지 않고 안에 맞춰 들어갑니다.
- 파일이 없으면 화면에 이모지와 함께 **넣어야 할 파일 경로**가 표시됩니다.

## 상자 선택 화면 아이콘

선택 화면의 동그란 아이콘은 지금 이모지(💧 🔥 🍃 🪨 ☁️ ✨)를 쓰고 있습니다.
따로 만든 아이콘이 있으면 `icon/` 안에 넣고 `config.js` 의 `icon` 경로를 채워주세요.

```js
{ id: 'water', emoji: '💧', name: '물', icon: 'assets/prize/icon/water.svg', ... }
```

정사각형 투명 배경(svg 또는 png)이 가장 잘 맞습니다.
