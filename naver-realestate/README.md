# 네이버 부동산 급매 검색기

> 다주택자 매물 / 급매 가격대 검색 도구
> Naver Real Estate Urgent-Sale Finder

비공식 네이버 부동산 API 를 호출하여 매물 목록을 가져오고,
"급매" 키워드와 가격대 조건으로 필터링해 보여주는 웹 도구입니다.

## 특징

- **의존성 0**: Node.js 내장 모듈만 사용 (`npm install` 필요 없음)
- **가격대 필터**: 만원 단위 최소/최대 가격 지정
- **급매 판정**: `급매 / 급급매 / 급처분 / 시세이하 / 특가` 등 키워드 기반
- **다주택자 추정**: `갭투자 / 전세끼고 / 임대중 / 임차인 / 투자` 등 키워드 휴리스틱
- **거래 유형**: 매매(A1) / 전세(B1) / 월세(B2)
- **지역 자동 검색**: 키워드 → cortarNo (네이버 지역코드) 자동 변환

## 폴더 구조

```
naver-realestate/
├── server.js          # Node.js HTTP 서버 + 네이버 API 프록시 + 필터 로직
├── public/
│   └── index.html     # 단일 페이지 UI (vanilla JS)
├── package.json
└── README.md
```

## 실행

```bash
cd naver-realestate
npm start              # node server.js
# → http://localhost:4000
```

포트 변경:

```bash
PORT=5000 npm start
```

## API

| 메서드 | 경로                              | 설명                         |
|--------|-----------------------------------|------------------------------|
| GET    | `/api/region?q=강남구`             | 지역 키워드 → cortarNo 검색  |
| GET    | `/api/search-urgent?cortarNo=...` | 급매 매물 검색 (필터 적용)   |
| GET    | `/api/health`                     | 헬스체크                     |

### `/api/search-urgent` 쿼리 파라미터

| 파라미터          | 기본값  | 설명                                    |
|-------------------|---------|-----------------------------------------|
| `cortarNo`        | (필수)  | 네이버 지역코드 (10자리)                |
| `tradeType`       | `A1`    | A1=매매, B1=전세, B2=월세               |
| `minPrice`        | `0`     | 최소 가격 (만원)                        |
| `maxPrice`        | 무제한  | 최대 가격 (만원)                        |
| `pages`           | `3`     | 스캔 페이지 수 (1~10, 페이지당 ~20건)   |
| `multiOwnerOnly`  | `0`     | `1` 이면 다주택자 키워드 매물만         |

### 응답 예시

```json
{
  "cortarNo": "1168010800",
  "tradeType": "A1",
  "totalScanned": 60,
  "matched": 4,
  "items": [
    {
      "articleNo": "230xxxxxxx",
      "buildingName": "역삼래미안",
      "tradeType": "매매",
      "priceText": "12억 5,000",
      "priceManwon": 125000,
      "area2": 84.9,
      "floor": "12/20",
      "isUrgent": true,
      "isMultiOwner": true,
      "tags": ["역세권", "급매"],
      "featureDesc": "갭투자 급매물 시세대비 5천 저렴",
      "detailUrl": "https://new.land.naver.com/houses?articleNo=230xxxxxxx"
    }
  ]
}
```

## 사용 흐름

1. **지역 검색**: 상단 입력창에 `강남구 역삼동` 등 입력 → 후보 클릭 → cortarNo 선택
2. **조건 입력**: 거래유형 / 최소·최대 가격 / 페이지 수 / 다주택자 필터 설정
3. **급매 검색** 버튼 클릭 → 결과 표 출력
4. 결과의 **상세** 링크로 네이버 부동산 원본 페이지 이동

## 판정 로직

### 급매 판정 (`isUrgent`)

`articleFeatureDesc`, `articleName`, `tagList` 중 어느 곳에든 다음 키워드가 포함되면 급매로 판정:

```
급매, 급급매, 급처분, 급매물, 초급매, 시세이하, 시세이하급매, 저렴, 특가
```

### 다주택자 판정 (`isMultiOwner`)

네이버는 매도자 보유 주택 수를 노출하지 않으므로,
다음 키워드 휴리스틱으로 다주택자/투자자 매물 가능성만 추정:

```
갭투자, 갭, 전세끼고, 전세 끼고, 임대중, 임차인, 월세세팅,
세입자, 투자, 임대수익, 임대
```

## 한계 및 주의사항

- 네이버 부동산 API 는 **비공식**입니다. 약관 위반 소지가 있어 **개인 학습/조사 용도**로만 사용하세요.
- 과도한 요청은 IP 차단을 유발할 수 있으니, 페이지 수를 보수적으로 설정하세요.
- "다주택자" 정보는 네이버에서 제공되지 않습니다. 본 도구는 매물 설명 문구 기반의 휴리스틱일 뿐 정확한 소유자 분류가 아닙니다.
- API 응답 스키마는 네이버 사정에 따라 변경될 수 있습니다.

## 라이선스

MIT
