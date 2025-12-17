엑셀 파일을 자동으로 앱 기본 종 목록으로 변환하는 방법

1) Node와 npm이 설치되어 있어야 합니다. (설치가 어려우면 VS Code Live Server + 브라우저 방식으로 수동 업로드 사용 가능)

2) 종 변환 스크립트 사용법

  터미널에서 프로젝트 폴더로 이동:
  ```bash
  cd "/Volumes/ParkSubeom_MAIN_HDD/1_Class/2025-2/5 미디어아트/기말과제/1209_2"
  ```

  필요 패키지 설치:
  ```bash
  npm install xlsx
  ```

  스크립트 실행 (엑셀 파일 이름은 실제 파일명으로 변경):
  ```bash
  node scripts/convert_xlsx_to_species.js "2023 야조회 종목목록.xlsx"
  ```

  성공하면 프로젝트 루트에 `species-data.js` 파일이 생성됩니다. 이 파일은 `index.html`에서 자동으로 로드되어 앱이 초기화될 때 기본 종 목록으로 사용됩니다.

3) 주의사항
  - 생성된 `species-data.js`는 `window.EMBEDDED_DEFAULT_SPECIES`를 설정합니다.
  - 영명(English) 컬럼이 엑셀에 없으면 빈 문자열로 채워집니다.
  - 변환 후 브라우저에서 앱을 새로고침하면 전체 종 목록이 엑셀 내용으로 채워집니다.

문제가 발생하면 터미널 출력(에러)을 복사해서 알려주시면 도와드리겠습니다.
