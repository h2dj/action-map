# action-map

활동 지도 — 활동·협력·목적·순환을 탐색하는 시각적 사고 도구.

- 개발 계획: [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)
- 원본 기획자료: [docs/planning/](docs/planning/)

## 개발

```bash
npm install
npm test          # 단위 테스트
npm run test:e2e  # 브라우저 시나리오 테스트 (Playwright)
npm run dev     # 개발 서버
npm run build   # 타입 검사 + 빌드
```

## 배포 (GitHub Pages)

`main` 브랜치에 푸시되면 `.github/workflows/deploy.yml`이 단위 테스트 → 빌드 → GitHub Pages 배포를 진행합니다.
처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿔야 합니다.
배포 주소: `https://h2dj.github.io/action-map/`

모든 브랜치 푸시와 PR에는 `.github/workflows/ci.yml`이 타입 검사·단위 테스트·브라우저 시나리오 테스트를 실행합니다.

데이터는 서버로 보내지 않고 각자의 브라우저(IndexedDB)에 저장됩니다. 같은 주소의 다른 도구(예: SysMap)와 저장 공간 이름이 겹치지 않습니다.
