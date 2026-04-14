/**
 * 네이버 부동산 급매 검색 서버
 *
 * - Node.js 내장 모듈만 사용 (의존성 0)
 * - 네이버 부동산 비공식 API를 프록시
 * - 매물 목록을 받아 "급매" 키워드 + 가격대 필터링
 *
 * 주의: 네이버 부동산 API는 비공식이며 개인 학습/조사 용도로만 사용하세요.
 *      과도한 요청은 IP 차단을 유발할 수 있습니다.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 4000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * 네이버 부동산 호출 시 사용하는 기본 헤더.
 * User-Agent 와 Referer 가 없으면 차단되는 경우가 많다.
 */
function naverHeaders(extra = {}) {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    Referer: 'https://new.land.naver.com/',
    Origin: 'https://new.land.naver.com',
    ...extra,
  };
}

/**
 * https.request 를 Promise 로 감싼 헬퍼.
 */
function httpsGetJson(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: naverHeaders(headers),
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve({ status: res.statusCode, json: JSON.parse(body) });
            } catch (e) {
              resolve({ status: res.statusCode, raw: body });
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(10_000, () => req.destroy(new Error('Naver API timeout')));
    req.end();
  });
}

/* -------------------------------------------------------------------------- */
/*  엔드포인트 핸들러                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 지역 검색: 키워드 → cortarNo (지역코드) 후보 목록.
 * 네이버 통합검색의 region 자동완성을 사용한다.
 */
async function searchRegion(keyword) {
  const url = `https://new.land.naver.com/api/search?keyword=${encodeURIComponent(
    keyword
  )}&page=1`;
  const { json } = await httpsGetJson(url);
  // json.regions 가 없는 경우 빈 배열 반환
  return (json && json.regions) || [];
}

/**
 * 매물 목록 조회.
 *
 * @param {Object} opts
 * @param {string} opts.cortarNo  지역코드 (10자리)
 * @param {string} opts.tradeType A1=매매, B1=전세, B2=월세
 * @param {number} opts.page
 */
async function fetchArticles({ cortarNo, tradeType = 'A1', page = 1 }) {
  const params = new URLSearchParams({
    cortarNo,
    order: 'rank',
    realEstateType: 'APT:OPST:VL:DDDGG:JWJT', // 아파트/오피스텔/빌라/단독다가구/주거형주택
    tradeType,
    page: String(page),
    articleState: '',
  });
  const url = `https://new.land.naver.com/api/articles?${params.toString()}`;
  const { json } = await httpsGetJson(url);
  return json || {};
}

/**
 * 매물 가격 문자열 → 만원 단위 숫자.
 *   예) "12억 5,000" → 125000
 *       "9억"        →  90000
 *       "8,500"      →   8500
 */
function parseKoreanPrice(priceStr) {
  if (!priceStr) return 0;
  const s = String(priceStr).replace(/,/g, '').trim();
  let total = 0;
  const eok = s.match(/(\d+)\s*억/);
  if (eok) total += parseInt(eok[1], 10) * 10000;
  const tail = s.replace(/\d+\s*억/, '').trim();
  if (tail) {
    const n = parseInt(tail, 10);
    if (!isNaN(n)) total += n;
  }
  if (total === 0) {
    const n = parseInt(s, 10);
    if (!isNaN(n)) total = n;
  }
  return total;
}

/**
 * "급매" 매물 판정.
 *  - tagList / articleFeatureDesc 에 급매/급급매/급처분/즉시입주가능 등 키워드 포함
 *  - 또는 동일 단지/동일 면적 평균 대비 가격이 일정 비율 이하 (옵션)
 */
const URGENT_KEYWORDS = [
  '급매', '급급매', '급처분', '급매물', '초급매',
  '시세이하', '시세이하급매', '저렴', '특가',
];

function isUrgentSale(article) {
  const haystacks = [
    article.articleFeatureDesc,
    article.articleName,
    Array.isArray(article.tagList) ? article.tagList.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ');
  return URGENT_KEYWORDS.some((kw) => haystacks.includes(kw));
}

/**
 * 다주택자 매물 추정.
 *  - 네이버는 소유자 정보를 노출하지 않으므로,
 *    "임대등록", "투자", "전세끼고", "갭투자", "임차인" 등 키워드로 휴리스틱 판단.
 *  - 향후 확장 포인트 (LLM 분석 등) 로 분리.
 */
const MULTI_OWNER_KEYWORDS = [
  '갭투자', '갭', '전세끼고', '전세 끼고', '임대중', '임차인',
  '월세세팅', '세입자', '투자', '임대수익', '임대',
];

function isMultiOwnerCandidate(article) {
  const haystacks = [
    article.articleFeatureDesc,
    Array.isArray(article.tagList) ? article.tagList.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ');
  return MULTI_OWNER_KEYWORDS.some((kw) => haystacks.includes(kw));
}

/**
 * 검색 + 필터: /api/search-urgent
 *   query: cortarNo, minPrice(만원), maxPrice(만원), tradeType, multiOwnerOnly, pages
 */
async function searchUrgent(query) {
  const cortarNo = query.get('cortarNo');
  if (!cortarNo) throw new Error('cortarNo is required');

  const minPrice = parseInt(query.get('minPrice') || '0', 10);
  const maxPrice = parseInt(query.get('maxPrice') || '999999999', 10);
  const tradeType = query.get('tradeType') || 'A1';
  const multiOwnerOnly = query.get('multiOwnerOnly') === '1';
  const pages = Math.min(parseInt(query.get('pages') || '3', 10), 10);

  const collected = [];
  for (let p = 1; p <= pages; p++) {
    const data = await fetchArticles({ cortarNo, tradeType, page: p });
    const list = Array.isArray(data.articleList) ? data.articleList : [];
    if (list.length === 0) break;
    collected.push(...list);
    if (data.isMoreData === false) break;
  }

  const enriched = collected.map((a) => {
    const priceManwon = parseKoreanPrice(a.dealOrWarrantPrc);
    return {
      articleNo: a.articleNo,
      name: a.articleName,
      buildingName: a.buildingName,
      areaName: a.areaName,
      tradeType: a.tradeTypeName,
      priceText: a.dealOrWarrantPrc,
      priceManwon,
      floor: a.floorInfo,
      direction: a.direction,
      area1: a.area1, // 공급면적 (㎡)
      area2: a.area2, // 전용면적 (㎡)
      confirmDate: a.articleConfirmYmd,
      tags: a.tagList || [],
      featureDesc: a.articleFeatureDesc,
      realtorName: a.realtorName,
      isUrgent: isUrgentSale(a),
      isMultiOwner: isMultiOwnerCandidate(a),
      detailUrl: `https://new.land.naver.com/houses?articleNo=${a.articleNo}`,
    };
  });

  const filtered = enriched.filter((a) => {
    if (!a.isUrgent) return false;
    if (a.priceManwon < minPrice) return false;
    if (a.priceManwon > maxPrice) return false;
    if (multiOwnerOnly && !a.isMultiOwner) return false;
    return true;
  });

  filtered.sort((a, b) => a.priceManwon - b.priceManwon);

  return {
    cortarNo,
    tradeType,
    totalScanned: enriched.length,
    matched: filtered.length,
    items: filtered,
  };
}

/* -------------------------------------------------------------------------- */
/*  HTTP 라우팅                                                               */
/* -------------------------------------------------------------------------- */

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function serveStatic(req, res) {
  let filePath = req.url.split('?')[0];
  if (filePath === '/' || filePath === '') filePath = '/index.html';
  const fullPath = path.join(__dirname, 'public', filePath);
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (url.pathname === '/api/region' && req.method === 'GET') {
      const keyword = url.searchParams.get('q') || '';
      if (!keyword) return sendJson(res, 400, { error: 'q is required' });
      const regions = await searchRegion(keyword);
      return sendJson(res, 200, { regions });
    }

    if (url.pathname === '/api/search-urgent' && req.method === 'GET') {
      const result = await searchUrgent(url.searchParams);
      return sendJson(res, 200, result);
    }

    if (url.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, ts: new Date().toISOString() });
    }

    return serveStatic(req, res);
  } catch (err) {
    console.error('[ERROR]', err.message);
    return sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  네이버 부동산 급매 검색기                            ║
║  Naver Real Estate Urgent-Sale Finder                 ║
╠══════════════════════════════════════════════════════╣
║  http://localhost:${PORT}                                ║
║  GET /api/region?q=강남구                             ║
║  GET /api/search-urgent?cortarNo=...&minPrice=...     ║
╚══════════════════════════════════════════════════════╝
`);
});
