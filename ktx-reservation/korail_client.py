"""
코레일 모바일 API 직접 호출 클라이언트 (강화판)
- TLS 핑거프린트 회피: curl_cffi 있으면 Chrome/Safari 흉내, 없으면 requests 폴백
- 세션 워밍업: 메인 페이지 먼저 방문해 쿠키 확보
- 사람같은 지연: 각 요청 사이 랜덤 sleep
- 완전한 모바일 헤더 세트
- 로그인 실패 시 코레일 실제 메시지 노출
- MACRO 감지 시 자동 재시도 + 웹 로그인 폴백
"""
from __future__ import annotations

import json
import random
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple

# curl_cffi 가 있으면 사용 (TLS 핑거프린트 회피), 없으면 requests 폴백
_USE_CFFI = False
try:
    from curl_cffi import requests as _http  # type: ignore
    _USE_CFFI = True
except Exception:
    import requests as _http  # type: ignore


# ---------------------------------------------------------------------------
# 상수
# ---------------------------------------------------------------------------
SMART_BASE = "https://smart.letskorail.com/"
MOBILE_BASE = SMART_BASE + "classes/com.korail.mobile."
WEB_BASE = "https://www.letskorail.com/"

URL_LOGIN_MOBILE = MOBILE_BASE + "login.Login"
URL_LOGOUT = MOBILE_BASE + "common.logout"
URL_SEARCH = MOBILE_BASE + "seatMovie.ScheduleView"
URL_RESERVE = MOBILE_BASE + "certification.TrainPsrmSales"

URL_WEB_LOGIN = WEB_BASE + "korail/com/loginProc.do"
URL_WEB_LOGIN_PAGE = WEB_BASE + "korail/com/login.do"
URL_WEB_HOME = WEB_BASE

DEFAULT_DEVICE = "AD"
DEFAULT_OS_VER = "14"
DEFAULT_APP_VER = "6.7.1"

# 시도할 앱 버전 목록 (신→구)
APP_VERSIONS = [
    "260301001",
    "251201001",
    "250901001",
    "240826001",
    "230918001",
    "220608001",
    "190606001",
    "150718001",
]

# KTX 역 코드
STATION_CODES: Dict[str, str] = {
    "서울": "0001", "용산": "0104", "영등포": "0025", "광명": "0038",
    "수원": "0013", "평택": "0075", "천안": "0022", "천안아산": "0502",
    "오송": "0297", "대전": "0010", "김천구미": "0507", "동대구": "0015",
    "경주": "0508", "울산": "0509", "부산": "0020", "익산": "0030",
    "정읍": "0110", "광주송정": "0036", "목포": "0041", "전주": "0045",
    "순천": "0051", "여수EXPO": "0500", "강릉": "0515", "동해": "0540",
    "포항": "0514",
}

SEAT_GENERAL = "1"
SEAT_SPECIAL = "2"


# ---------------------------------------------------------------------------
# 예외
# ---------------------------------------------------------------------------
class KorailError(Exception):
    pass


class LoginFailError(KorailError):
    pass


class MacroDetectedError(KorailError):
    """MACRO 감지 전용"""


class NeedToLoginError(KorailError):
    pass


class SoldOutError(KorailError):
    pass


class NoResultsError(KorailError):
    pass


# ---------------------------------------------------------------------------
# 데이터 클래스
# ---------------------------------------------------------------------------
@dataclass
class Train:
    train_type: str
    train_type_name: str
    train_no: str
    train_group: str
    dep_name: str
    dep_code: str
    arr_name: str
    arr_code: str
    dep_date: str
    dep_time: str
    arr_time: str
    general_seat_state: str
    special_seat_state: str
    run_date: str
    raw: Dict[str, Any] = field(default_factory=dict)

    @property
    def has_general_seat(self) -> bool:
        return self.general_seat_state in ("11", "13")

    @property
    def has_special_seat(self) -> bool:
        return self.special_seat_state in ("11", "13")


# ---------------------------------------------------------------------------
# 유틸
# ---------------------------------------------------------------------------
def _detect_input_flag(identifier: str) -> str:
    s = identifier.strip()
    if "@" in s:
        return "2"
    digits = re.sub(r"\D", "", s)
    if digits.startswith("01") and 10 <= len(digits) <= 11:
        return "3"
    if re.fullmatch(r"\d{10}", digits):
        return "1"
    return "1"


def _normalize_id(identifier: str, flag: str) -> str:
    s = identifier.strip()
    if flag == "2":
        return s
    return re.sub(r"\D", "", s)


def _station_code(name: str) -> str:
    if name not in STATION_CODES:
        raise KorailError(f"지원하지 않는 역: {name}")
    return STATION_CODES[name]


def _human_pause(min_s: float = 0.4, max_s: float = 1.3):
    """사람같은 지연"""
    time.sleep(random.uniform(min_s, max_s))


def _gen_device_id() -> str:
    """안드로이드 Device ID 형식 (16자리 헥스)"""
    return uuid.uuid4().hex[:16].upper()


def _gen_mac() -> str:
    return "02:00:00:" + ":".join(
        "".join(random.choices("0123456789ABCDEF", k=2)) for _ in range(3)
    )


def _gen_fcm_token() -> str:
    """FCM 푸시 토큰 형식 (152자 영문숫자)"""
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_:"
    return "".join(random.choices(chars, k=152))


# ---------------------------------------------------------------------------
# 메인 클라이언트
# ---------------------------------------------------------------------------
class KorailMobile:
    """코레일 모바일 API + 웹 폴백 클라이언트"""

    # 영속 디바이스 식별자 (인스턴스별로 고정 유지)
    def __init__(self, korail_id: str, password: str,
                 device: str = DEFAULT_DEVICE,
                 version: str = APP_VERSIONS[0]):
        self.korail_id = korail_id
        self.password = password
        self.device = device
        self.version = version

        # 디바이스 일관성 (한 세션 내 같은 값 유지)
        self.device_id = _gen_device_id()
        self.mac_addr = _gen_mac()
        self.fcm_token = _gen_fcm_token()

        # curl_cffi 세션 (Chrome120 TLS 흉내) 또는 requests 세션
        if _USE_CFFI:
            self.session = _http.Session(impersonate=random.choice([
                "chrome120", "chrome123", "safari17_0", "safari17_2_ios"
            ]))
        else:
            self.session = _http.Session()
        self._apply_common_headers()

        # 상태
        self.logined: bool = False
        self.login_method: str = ""  # 'mobile' | 'web' | ''
        self.key: Optional[str] = None
        self.membership_number: Optional[str] = None
        self.name: Optional[str] = None
        self.email: Optional[str] = None
        self._warmed_up = False

        # 디버그
        self.last_response_text: Optional[str] = None
        self.last_response_status: Optional[int] = None
        self.last_url: Optional[str] = None

    # ------------------------ 헤더 / 세션 ------------------------
    def _apply_common_headers(self):
        """실제 Korail 모바일 앱에 가까운 헤더"""
        ua = (
            "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 "
            "Chrome/120.0.6099.210 Mobile Safari/537.36"
        )
        self.session.headers.update({
            "User-Agent": ua,
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "X-Requested-With": "com.korail.mobile",
        })

    def _warm_up(self):
        """최초 호출 전 메인 페이지를 한 번 찍어 쿠키 확보"""
        if self._warmed_up:
            return
        try:
            self.session.get(URL_WEB_HOME, timeout=10)
            _human_pause(0.3, 0.9)
            # 모바일 메인도 한번 더
            self.session.get(SMART_BASE, timeout=10)
            _human_pause(0.3, 0.9)
        except Exception:
            pass
        self._warmed_up = True

    def _post_mobile(self, url: str, data: Dict[str, Any], timeout: int = 20) -> Dict[str, Any]:
        self.last_url = url
        _human_pause(0.3, 1.0)
        try:
            r = self.session.post(url, data=data, timeout=timeout)
        except Exception as e:
            raise KorailError(f"네트워크 오류: {type(e).__name__}: {e}") from e
        self.last_response_status = getattr(r, "status_code", None)
        self.last_response_text = (getattr(r, "text", "") or "")[:2000]
        try:
            return r.json()
        except Exception:
            raise KorailError(
                f"JSON이 아닌 응답 (HTTP {self.last_response_status}) "
                f"본문: {self.last_response_text[:300]}"
            )

    # ------------------------ 로그인 ------------------------
    def login(self) -> bool:
        self._warm_up()

        flag = _detect_input_flag(self.korail_id)
        normalized = _normalize_id(self.korail_id, flag)

        last_msg = ""
        last_code = ""
        macro_hit = False

        for idx, ver in enumerate(APP_VERSIONS):
            # 매 시도마다 사람같은 지연 (재시도는 더 길게)
            if idx > 0:
                _human_pause(1.5, 3.5)

            self.version = ver
            payload = self._build_login_payload(flag, normalized, ver)
            try:
                data = self._post_mobile(URL_LOGIN_MOBILE, payload)
            except KorailError as e:
                last_msg = str(e)
                continue

            if data.get("strResult") == "SUCC":
                self.logined = True
                self.login_method = "mobile"
                self.key = data.get("Key") or data.get("key")
                self.membership_number = data.get("strMbCrdNo")
                self.name = data.get("strCustNm")
                self.email = data.get("strEmailAddr")
                return True

            code = (data.get("h_msg_cd") or "").strip()
            msg = (data.get("h_msg_txt") or "").strip()
            last_msg, last_code = msg, code

            if ("MACRO" in code.upper() or "업데이트" in msg
                    or "앱을" in msg or "안정적인" in msg):
                macro_hit = True
                continue
            # 자격증명 문제 — 즉시 실패
            break

        # 모바일 API 전부 실패. 웹 로그인 폴백 시도
        if macro_hit:
            try:
                if self._web_login(flag, normalized):
                    return True
            except Exception as e:
                last_msg = f"{last_msg} / 웹로그인도 실패: {type(e).__name__}: {e}"

        detail = (
            f"입력유형={flag}("
            f"{ {'1':'회원번호','2':'이메일','3':'전화번호'}.get(flag, '?') }"
            f"), 정규화된ID={normalized}, "
            f"curl_cffi={_USE_CFFI}, 시도버전={len(APP_VERSIONS)}개"
        )
        if macro_hit:
            raise MacroDetectedError(
                f"{last_msg or 'MACRO 감지'} | {detail} | 코드={last_code}"
            )
        raise LoginFailError(
            f"{last_msg or '알 수 없는 응답'} | {detail} | 코드={last_code}"
        )

    def _device_fields(self) -> Dict[str, Any]:
        """로그인 외 모든 모바일 API 호출에도 실제 앱처럼 디바이스 필드 포함"""
        return {
            "Device": self.device,
            "Version": self.version,
            "Passtype": "KR",
            "Id_Type": "HFN",
            "Id_Dev": "RX" + self.device_id,
            "Id_Os": DEFAULT_OS_VER,
            "Id_Mac": self.mac_addr,
            "Id_Manu": "samsung",
            "Id_Ven": "SM-S918N",
            "Id_Tk": self.fcm_token,
            "Id_Token": self.fcm_token,
            "hidAppVer": DEFAULT_APP_VER,
        }

    def _build_login_payload(self, flag: str, normalized: str, version: str) -> Dict[str, Any]:
        base = self._device_fields()
        base["Version"] = version  # 로그인은 지정된 버전으로
        base.update({
            "txtInputFlg": flag,
            "txtMemberNo": normalized,
            "txtPwd": self.password,
            "hidMemberFlg": "1",
            "checkFlag": "Y",
            "LoginFlag": "N",
            "loginType": "HFN",
            "langDvsnCd": "KR",
        })
        return base

    # ------------------------ 웹 로그인 폴백 ------------------------
    def _web_login(self, flag: str, normalized: str) -> bool:
        """
        모바일 API가 MACRO로 막힐 때 letskorail.com 웹 로그인 폼 사용.
        성공 시 쿠키만 확보하고 self.logined=True 로 표시.
        (검색/예약은 여전히 모바일 API 쓰지만 쿠키 공유로 통과할 수 있음)
        """
        # 1) 로그인 페이지 방문 (CSRF/쿠키)
        try:
            self.session.get(URL_WEB_LOGIN_PAGE, timeout=15)
        except Exception:
            pass
        _human_pause(0.5, 1.4)

        # 2) 로그인 POST
        input_flg_map = {"1": "2", "2": "1", "3": "3"}  # 웹 폼은 flg 체계가 다름
        web_flg = input_flg_map.get(flag, "2")
        payload = {
            "selInputFlg": web_flg,
            "txtMemberNo": normalized,
            "txtPwd": self.password,
            "hidAutoLogin": "N",
            "returnUrl": "/index.jsp",
        }
        headers = {
            "Referer": URL_WEB_LOGIN_PAGE,
            "Origin": "https://www.letskorail.com",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        try:
            r = self.session.post(
                URL_WEB_LOGIN, data=payload, headers=headers, timeout=20,
                allow_redirects=True,
            )
            text = (getattr(r, "text", "") or "")
        except Exception as e:
            raise KorailError(f"웹로그인 네트워크 오류: {e}")

        # 성공 판정: 로그인 실패 문구가 없고 쿠키에 세션 ID 존재
        if "로그인 정보가" in text or "비밀번호" in text or "일치하지" in text:
            raise LoginFailError(
                "웹 로그인 거부 — 아이디/비밀번호 확인 필요"
            )

        # 쿠키 검사 — requests / curl_cffi 양쪽 API 지원
        cookie_names: List[str] = []
        try:
            jar = self.session.cookies
            # requests CookieJar 이면 Cookie 객체, curl_cffi 이면 dict 또는 str
            if hasattr(jar, "get_dict"):
                cookie_names = list(jar.get_dict().keys())
            elif hasattr(jar, "keys"):
                cookie_names = list(jar.keys())
            else:
                for c in jar:
                    if hasattr(c, "name"):
                        cookie_names.append(c.name)
                    else:
                        cookie_names.append(str(c))
        except Exception:
            pass

        cookies_ok = any(
            ("JSESSIONID" in n or "WMONID" in n or "SESSION" in n.upper())
            for n in cookie_names
        )
        if cookies_ok:
            self.logined = True
            self.login_method = "web"
            return True
        raise LoginFailError(
            f"웹 로그인 결과 불명확. 쿠키={cookie_names[:5]} 본문일부: {text[:250]}"
        )

    # ------------------------ 열차 조회 ------------------------
    def search_train(self, dep: str, arr: str, date: str, time_: str,
                     adult: int = 1, child: int = 0) -> List[Train]:
        if len(time_) == 4:
            time_ = time_ + "00"

        # 웹 로그인 경로였으면 모바일 API 조회는 바로 실패시키는 대신 웹 조회로
        if self.login_method == "web":
            return self._web_search(dep, arr, date, time_, adult, child)

        payload = self._device_fields()
        payload.update({
            "radJobId": "1",
            "selGoTrain": "05",
            "txtCardPsgCnt": "0",
            "txtGdNo": "",
            "txtGoAbrdDt": date,
            "txtGoEndCode": _station_code(arr),
            "txtGoHour": time_,
            "txtGoStartCode": _station_code(dep),
            "txtJobId": "1",
            "txtMenuId": "11",
            "txtPsgFlg_1": str(adult),
            "txtPsgFlg_2": str(child),
            "txtPsgFlg_3": "0",
            "txtPsgFlg_4": "0",
            "txtPsgFlg_5": "0",
            "txtPsgFlg_8": "0",
            "txtSeatAttCd1": "000",
            "txtSeatAttCd2": "000",
            "txtSeatAttCd3": "000",
            "txtSeatAttCd4": "015",
            "txtSeatAttCd5": "000",
            "txtTrnGpCd": "05",
            "Key": self.key or "",
            "h_abrd_dt": date,
            "h_dpt_rs_stn_cd": _station_code(dep),
            "h_arv_rs_stn_cd": _station_code(arr),
        })

        data = self._post_mobile(URL_SEARCH, payload)
        if data.get("strResult") != "SUCC":
            code = data.get("h_msg_cd") or ""
            msg = data.get("h_msg_txt") or ""
            if "P058" in code or "조회된" in msg or "없습니다" in msg:
                return []
            if "S111" in code or "로그인" in msg:
                raise NeedToLoginError(msg)
            # MACRO 감지 시 웹 조회로 폴백
            if "MACRO" in code.upper() or "업데이트" in msg or "안정적인" in msg:
                return self._web_search(dep, arr, date, time_, adult, child)
            raise KorailError(f"조회 실패: {msg} (code={code})")

        infos = data.get("trn_infos", {}).get("trn_info", [])
        if isinstance(infos, dict):
            infos = [infos]

        trains: List[Train] = []
        for t in infos:
            trains.append(Train(
                train_type=t.get("h_trn_clsf_cd", "05"),
                train_type_name=t.get("h_trn_clsf_nm", "KTX"),
                train_no=t.get("h_trn_no", ""),
                train_group=t.get("h_trn_gp_cd", ""),
                dep_name=t.get("h_dpt_rs_stn_nm", dep),
                dep_code=t.get("h_dpt_rs_stn_cd", ""),
                arr_name=t.get("h_arv_rs_stn_nm", arr),
                arr_code=t.get("h_arv_rs_stn_cd", ""),
                dep_date=t.get("h_dpt_dt", date),
                dep_time=t.get("h_dpt_tm", ""),
                arr_time=t.get("h_arv_tm", ""),
                general_seat_state=t.get("h_rsv_psb_flg", ""),
                special_seat_state=t.get("h_spe_rsv_cd", ""),
                run_date=t.get("h_run_dt", date),
                raw=t,
            ))
        return trains

    # ------------------------ 웹 기반 조회 (모바일 API 차단 시) ------------------------
    def _web_search(self, dep: str, arr: str, date: str, time_: str,
                    adult: int = 1, child: int = 0) -> List[Train]:
        """
        letskorail.com 의 공개 조회 페이지 사용.
        - URL: ebizprd/EbizPrdTkpr01100W_pr11100.do
        - HTML 응답을 정규표현식으로 최소 파싱
        """
        url = WEB_BASE + "ebizprd/EbizPrdTkpr01100W_pr11100.do"
        payload = {
            "srcplandAndMdlCheck": "Y",
            "txtPsgFlg_1": str(adult),
            "txtPsgFlg_2": str(child),
            "txtPsgFlg_3": "0",
            "txtPsgFlg_7": "0",
            "txtPsgFlg_8": "0",
            "txtTrnGpCd": "05",      # KTX
            "selGoTrain": "05",
            "radJobId": "1",
            "txtGoStart": dep,
            "txtGoEnd": arr,
            "txtGoAbrdDt": date,
            "txtGoHour": time_[:2],
            "txtGoMinute": time_[2:4] if len(time_) >= 4 else "00",
            "selGoSeat1": "015",
            "selGoSeat2": "000",
            "adjcCheckYn": "N",
            "selGoSeat": "015",
            "chkStnConstraint": "000000",
            "txtMenuId": "11",
        }
        headers = {
            "Referer": WEB_BASE + "korail/com/login.do",
            "Origin": WEB_BASE.rstrip("/"),
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
        }
        _human_pause(0.4, 1.2)
        try:
            r = self.session.post(url, data=payload, headers=headers, timeout=20)
            text = getattr(r, "text", "") or ""
        except Exception as e:
            raise KorailError(f"웹 조회 네트워크 오류: {e}")

        self.last_response_text = text[:2000]
        self.last_url = url

        # MACRO 같은 차단이면 메시지 유지
        if "MACRO" in text.upper() or "업데이트한 뒤" in text:
            raise KorailError(
                f"웹 조회도 차단됨 (MACRO 의심). 본문일부: {text[:300]}"
            )

        # 열차 행 추출 (간단 파싱)
        # letskorail.com 응답은 JS 변수 혹은 테이블. 공통 필드들이 input hidden 으로
        # 들어감. h_trn_no, h_dpt_tm, h_arv_tm, h_rsv_psb_flg, h_spe_rsv_cd 등을 찾음.
        trains: List[Train] = []

        # 패턴: name="h_trn_no" value="101" 같은 hidden input 블록 반복
        # 열차별로 tr 블록이 반복되므로, 한 블록을 잡는 패턴으로.
        # 간단히 각 key별 value 리스트를 추출해 index로 묶는다.
        def _extract_all(name: str) -> List[str]:
            return re.findall(
                rf'name="{re.escape(name)}"\s+value="([^"]*)"',
                text,
            )

        train_nos = _extract_all("h_trn_no")
        dep_tms = _extract_all("h_dpt_tm")
        arv_tms = _extract_all("h_arv_tm")
        dep_dts = _extract_all("h_dpt_dt") or [date] * len(train_nos)
        dep_codes = _extract_all("h_dpt_rs_stn_cd") or [_station_code(dep)] * len(train_nos)
        arv_codes = _extract_all("h_arv_rs_stn_cd") or [_station_code(arr)] * len(train_nos)
        gen_flags = _extract_all("h_rsv_psb_flg") or ["00"] * len(train_nos)
        spe_flags = _extract_all("h_spe_rsv_cd") or ["00"] * len(train_nos)
        trn_clsf = _extract_all("h_trn_clsf_cd") or ["05"] * len(train_nos)
        trn_gp = _extract_all("h_trn_gp_cd") or ["109"] * len(train_nos)
        run_dts = _extract_all("h_run_dt") or [date] * len(train_nos)

        n = len(train_nos)
        for i in range(n):
            trains.append(Train(
                train_type=trn_clsf[i] if i < len(trn_clsf) else "05",
                train_type_name="KTX",
                train_no=train_nos[i],
                train_group=trn_gp[i] if i < len(trn_gp) else "109",
                dep_name=dep,
                dep_code=dep_codes[i] if i < len(dep_codes) else _station_code(dep),
                arr_name=arr,
                arr_code=arv_codes[i] if i < len(arv_codes) else _station_code(arr),
                dep_date=dep_dts[i] if i < len(dep_dts) else date,
                dep_time=dep_tms[i] if i < len(dep_tms) else "",
                arr_time=arv_tms[i] if i < len(arv_tms) else "",
                general_seat_state=gen_flags[i] if i < len(gen_flags) else "00",
                special_seat_state=spe_flags[i] if i < len(spe_flags) else "00",
                run_date=run_dts[i] if i < len(run_dts) else date,
                raw={"source": "web", "index": i},
            ))
        return trains

    # ------------------------ 예약 ------------------------
    def reserve(self, train: Train, seat_class: str = "ANY",
                adult: int = 1, child: int = 0) -> Dict[str, Any]:
        if seat_class == "GENERAL":
            seat_code = SEAT_GENERAL
        elif seat_class == "SPECIAL":
            seat_code = SEAT_SPECIAL
        else:
            seat_code = SEAT_GENERAL if train.has_general_seat else SEAT_SPECIAL

        payload = self._device_fields()
        payload.update({
            "Key": self.key or "",
            "txtGdNo": "",
            "txtJobId": "1101",
            "txtMenuId": "11",
            "txtTotPsgCnt": str(adult + child),
            "txtPsgTpCd1": "1",
            "txtPsgCnt1": str(adult),
            "txtPsgTpCd2": "3",
            "txtPsgCnt2": str(child),
            "txtSeatAttCd1": "000",
            "txtSeatAttCd2": "000",
            "txtSeatAttCd3": "000",
            "txtSeatAttCd4": "015",
            "txtSeatAttCd5": "000",
            "txtStndFlg": "N",
            "txtStlbTrnClsfCd": train.train_type,
            "txtTrnGpCd": train.train_group or "109",
            "txtTrnNo": train.train_no,
            "txtRunDt": train.run_date,
            "txtDptDt": train.dep_date,
            "txtDptTm": train.dep_time,
            "txtArvTm": train.arr_time,
            "txtDptRsStnCd": train.dep_code,
            "txtArvRsStnCd": train.arr_code,
            "txtDptStnConsOrdr": train.raw.get("h_dpt_stn_cons_ordr", ""),
            "txtArvStnConsOrdr": train.raw.get("h_arv_stn_cons_ordr", ""),
            "txtDptStnRunOrdr": train.raw.get("h_dpt_stn_run_ordr", ""),
            "txtArvStnRunOrdr": train.raw.get("h_arv_stn_run_ordr", ""),
            "txtCompaCnt1": "0",
            "txtCompaCnt2": "0",
            "txtCompaCnt3": "0",
            "txtCompaCnt4": "0",
            "txtCompaCnt5": "0",
            "txtCompaCnt6": "0",
            "txtCompaCnt7": "0",
            "txtCompaCnt8": "0",
            "txtSeatAttCd": seat_code,
            "txtChgFlg": "",
        })

        data = self._post_mobile(URL_RESERVE, payload)
        if data.get("strResult") == "SUCC":
            return data

        code = data.get("h_msg_cd") or ""
        msg = data.get("h_msg_txt") or ""
        if "WRG000000" in code or "매진" in msg or "잔여석" in msg:
            raise SoldOutError(msg)
        if "S111" in code or "로그인" in msg:
            raise NeedToLoginError(msg)
        raise KorailError(f"예약 실패: {msg} (code={code})")


# 하위 호환
Korail = KorailMobile
