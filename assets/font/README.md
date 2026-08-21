# 폰트 폴더

첫 화면 **MIRACLE** 제목에 쓰는 서체입니다.

## 지금 상태

```
archivo-black.woff2   ← 지금 쓰이는 대체 서체 (Archivo Black, 무료/OFL)
```

포스터 서체인 **BD Plakatbau** 는 Büro Destruct 의 **유료 서체**라 파일을 함께
넣을 수 없습니다. 그래서 비슷한 느낌의 무료 서체(Archivo Black)를 받아 두었고,
인터넷 연결 없이도 나오도록 파일을 프로젝트 안에 두었습니다.

## 진짜 BD Plakatbau 를 쓰려면

폰트 파일을 이 폴더에 아래 이름으로 넣어주세요. 하나만 있어도 됩니다.

```
assets/font/bd-plakatbau.woff2   (가장 권장 — 용량이 가장 작음)
assets/font/bd-plakatbau.woff
assets/font/bd-plakatbau.otf
```

넣기만 하면 자동으로 그 서체가 우선 적용됩니다. (CSS 수정 불필요)

- 파일이 없어도 **기기에 BD Plakatbau 가 설치돼 있으면** 그 폰트로 나옵니다.
- 파일도 없고 설치도 안 돼 있으면 Archivo Black 으로 나옵니다.
- `.otf` / `.ttf` 만 있으시면 woff2 로 변환해서 넣는 편이 훨씬 가볍습니다.

> 웹에 올려 쓰려면 **웹폰트 라이선스**가 필요한지 구매처 조건을 확인해 주세요.

## 라이선스

- **Archivo Black** — SIL Open Font License 1.1 (상업적 사용·웹 배포 가능)
  https://fonts.google.com/specimen/Archivo+Black
