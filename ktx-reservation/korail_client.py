"""
코레일 모바일 API 직접 호출 클라이언트 (korail2 의존성 제거)
- 로그인 실패 시 코레일이 돌려준 실제 메시지(h_msg_txt)를 예외에 포함
- 회원번호(10자리) / 이메일 / 전화번호 자동 감지
- KTX 조회/예약만 지원 (심플함 우선)
"""
from __future__ import annotations

import json
import random
import re
import time
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

import requests

# ---------------------------------------------------------------------------
# 상수
# ---------------------------------------------------------------------------
BASE = "https://smart.letskorail.com/classes/com.korail.mobile."
URL_LOGIN = BASE + "login.Login"
URL_LOGOUT = BASE + "common.logout"
URL_SEARCH = BASE + "seatMovie.ScheduleView"
URL_RESERVE = BASE + "certification.TrainPsrmSales"

DEFAULT_DEVICE = "AD"        # Android
DEFAULT_VERSION = "250901001"    # 2025.09.01 빌드 (최신에 가깝게)
DEFAULT_APP_VER = "6.7.1"
DEFAULT_OS_VER = "14"


# KTX 역 코드 (2024~2026 기준, korail2 내장 매핑과 동일)
STATION_CODES: Dict[str, str] = {
    "서울": "0001",
    "용산": "0104",
    "영등포": "0025",
    "광명": "0038",
    "수원": "0013",
    "평택": "0075",
    "천안": "0022",
    "천안아산": "0502",
    "오송": "0297",
    "대전": "0010",
    "김천구미": "0507",
    "동대구": "0015",
    "경주": "0508",
    "울산": "0509",
    "부산": "0020",
    "익산": "0030",
    "정읍": "0110",
    "광주송정": "0036",
    "목포": "0041",
    "전주": "0045",
    "순천": "0051",
    "여수EXPO": "0500",
    "강릉": "0515",
    "동해": "0540",
    "포항": "0514",
}


# 좌석 등급
SEAT_GENERAL = "1"  # 일반실
SEAT_SPECIAL = "2"  # 특실


# ---------------------------------------------------------------------------
# 예외
# ---------------------------------------------------------------------------
class KorailError(Exception):
    """기본 Korail 예외"""


class LoginFailError(KorailError):
    """로그인 실패 — 코레일이 돌려준 메시지를 args[0]에 포함"""


class NeedToLoginError(KorailError):
    """세션 만료 / 로그인 필요"""


class SoldOutError(KorailError):
    """매진"""


class NoResultsError(KorailError):
    """조회 결과 없음"""


# ---------------------------------------------------------------------------
# 데이터 클래스
# ---------------------------------------------------------------------------
@dataclass
class Train:
    train_type: str              # 열차 종류 코드 (05=KTX)
    train_type_name: str         # 'KTX'
    train_no: str                # 열차 번호 '101'
    train_group: str             # 그룹 코드
    dep_name: str
    dep_code: str
    arr_name: str
    arr_code: str
    dep_date: str                # YYYYMMDD
    dep_time: str                # HHMMSS
    arr_time: str                # HHMMSS
    general_seat_state: str      # "11"=가능, 그 외=불가
    special_seat_state: str
    run_date: str
    raw: Dict[str, Any] = field(default_factory=dict)

    @property
    def has_general_seat(self) -> bool:
        return self.general_seat_state in ("11", "13")  # 11=예약가능, 13=좌석많음

    @property
    def has_special_seat(self) -> bool:
        return self.special_seat_state in ("11", "13")


# ---------------------------------------------------------------------------
# 유틸
# ---------------------------------------------------------------------------
def _detect_input_flag(identifier: str) -> str:
    """
    코레일 로그인 txtInputFlg:
    1 = 회원번호 (10자리 숫자)
    2 = 이메일
    3 = 전화번호
    """
    s = identifier.strip()
    if "@" in s:
        return "2"
    # 전화번호: 01x-xxxx-xxxx (하이픈 제거 후 10~11자리 숫자로 0으로 시작)
    digits = re.sub(r"\D", "", s)
    if digits.startswith("01") and 10 <= len(digits) <= 11:
        return "3"
    # 회원번호: 10자리 숫자
    if re.fullmatch(r"\d{10}", digits):
        return "1"
    # 그 외엔 회원번호로 간주
    return "1"


def _normalize_id(identifier: str, flag: str) -> str:
    """입력된 아이디를 API 요구 형식으로 정규화"""
    s = identifier.strip()
    if flag == "2":  # 이메일은 그대로
        return s
    # 회원번호/전화번호는 숫자만
    return re.sub(r"\D", "", s)


def _station_code(name: str) -> str:
    if name not in STATION_CODES:
        raise KorailError(f"지원하지 않는 역: {name}")
    return STATION_CODES[name]


# ---------------------------------------------------------------------------
# 메인 클라이언트
# ---------------------------------------------------------------------------
class KorailMobile:
    """코레일 모바일 API 클라이언트 (KTX 특화)"""

    def __init__(self, korail_id: str, password: str, device: str = DEFAULT_DEVICE,
                 version: str = DEFAULT_VERSION):
        self.korail_id = korail_id
        self.password = password
        self.device = device
        self.version = version
        self.session = requests.Session()
        self._apply_ua()

        # 로그인 후 채워지는 값
        self.logined: bool = False
        self.key: Optional[str] = None
        self.membership_number: Optional[str] = None
        self.name: Optional[str] = None
        self.email: Optional[str] = None

        # 디버그용 - 마지막 응답 원문 일부
        self.last_response_text: Optional[str] = None
        self.last_response_status: Optional[int] = None
        self.last_url: Optional[str] = None

    # ------------------------ 공통 ------------------------
    def _apply_ua(self):
        # 코레일 공식 안드로이드 앱 형식의 User-Agent (MACRO 검출 회피)
        self.session.headers.update({
            "User-Agent": f"Dalvik/2.1.0 (Linux; U; Android {DEFAULT_OS_VER}; "
                          f"SM-S918N Build/UP1A.231005.007)",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "Keep-Alive",
        })

    def _post(self, url: str, data: Dict[str, Any], timeout: int = 15) -> Dict[str, Any]:
        self.last_url = url
        try:
            r = self.session.post(url, data=data, timeout=timeout)
        except requests.RequestException as e:
            raise KorailError(f"네트워크 오류: {type(e).__name__}: {e}") from e
        self.last_response_status = r.status_code
        self.last_response_text = (r.text or "")[:1500]
        try:
            return r.json()
        except json.JSONDecodeError:
            raise KorailError(
                f"코레일이 JSON이 아닌 응답 반환 (HTTP {r.status_code}) "
                f"본문 일부: {self.last_response_text[:300]}"
            )

    # ------------------------ 로그인 ------------------------
    def login(self) -> bool:
        """성공 시 True, 실패 시 LoginFailError."""
        flag = _detect_input_flag(self.korail_id)
        normalized = _normalize_id(self.korail_id, flag)

        # MACRO 검출 회피용: 여러 버전 시도 (최신→구버전 순)
        versions_to_try = [
            self.version,     # 기본 (DEFAULT_VERSION)
            "240826001",      # 2024.08.26
            "230918001",      # 2023.09.18 (구 ver, 종종 통과)
            "190606001",      # 오래된 안정 ver
        ]

        last_msg = ""
        last_code = ""
        for ver in versions_to_try:
            self.version = ver
            payload = self._build_login_payload(flag, normalized, ver)
            data = self._post(URL_LOGIN, payload)

            result = data.get("strResult")
            if result == "SUCC":
                self.logined = True
                self.key = data.get("Key") or data.get("key")
                self.membership_number = data.get("strMbCrdNo")
                self.name = data.get("strCustNm")
                self.email = data.get("strEmailAddr")
                return True

            code = (data.get("h_msg_cd") or "").strip()
            msg = (data.get("h_msg_txt") or "").strip()
            last_msg, last_code = msg, code

            # MACRO/버전 관련 에러면 다음 버전 시도
            if "MACRO" in code.upper() or "업데이트" in msg or "앱을" in msg:
                continue
            # 그 외 에러는 자격증명 문제일 가능성 — 즉시 실패
            break

        detail = (
            f"입력유형={flag}("
            f"{ {'1':'회원번호','2':'이메일','3':'전화번호'}.get(flag, '?') }"
            f"), 정규화된ID={normalized}"
        )
        raise LoginFailError(
            f"{last_msg or '알 수 없는 코레일 응답'} | {detail} | 코드={last_code}"
        )

    def _build_login_payload(self, flag: str, normalized: str, version: str) -> Dict[str, Any]:
        """MACRO 검출 회피를 위해 실제 앱과 최대한 비슷한 payload 생성"""
        # 가짜 FCM 토큰 (길이/형식만 비슷하게)
        fake_token = "".join(
            random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
            for _ in range(152)
        )
        return {
            "Device": self.device,
            "Version": version,
            "Passtype": "KR",
            "Id_Type": "HFN",
            "Id_Dev": "RX" + "".join(random.choices("0123456789ABCDEF", k=14)),
            "Id_Os": DEFAULT_OS_VER,
            "Id_Mac": "02:00:00:" + ":".join(
                "".join(random.choices("0123456789ABCDEF", k=2)) for _ in range(3)
            ),
            "Id_Manu": "samsung",
            "Id_Ven": "SM-S918N",
            "Id_Tk": fake_token,
            "Id_Token": fake_token,
            "txtInputFlg": flag,
            "txtMemberNo": normalized,
            "txtPwd": self.password,
            "hidMemberFlg": "1",
            "hidAppVer": DEFAULT_APP_VER,
            "checkFlag": "Y",
            "LoginFlag": "N",
            "loginType": "HFN",
        }

    # ------------------------ 열차 조회 ------------------------
    def search_train(self, dep: str, arr: str, date: str, time_: str,
                     adult: int = 1, child: int = 0) -> List[Train]:
        """
        date: YYYYMMDD
        time_: HHMMSS
        """
        if len(time_) == 4:
            time_ = time_ + "00"

        payload = {
            "Device": self.device,
            "radJobId": "1",  # 1=조회
            "selGoTrain": "05",  # KTX
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
            "txtTrnGpCd": "05",  # KTX
            "Version": self.version,
            "Key": self.key or "",
            "h_abrd_dt": date,
            "h_dpt_rs_stn_cd": _station_code(dep),
            "h_arv_rs_stn_cd": _station_code(arr),
        }

        data = self._post(URL_SEARCH, payload)
        result = data.get("strResult")
        if result != "SUCC":
            code = data.get("h_msg_cd") or ""
            msg = data.get("h_msg_txt") or ""
            # 결과 없음
            if "P058" in code or "조회된" in msg or "없습니다" in msg:
                return []
            # 세션 만료
            if "S111" in code or "로그인" in msg:
                raise NeedToLoginError(msg)
            raise KorailError(f"조회 실패: {msg} (code={code})")

        train_infos = data.get("trn_infos", {}).get("trn_info", [])
        if isinstance(train_infos, dict):
            train_infos = [train_infos]

        trains: List[Train] = []
        for t in train_infos:
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

    # ------------------------ 예약 ------------------------
    def reserve(self, train: Train, seat_class: str = "ANY",
                adult: int = 1, child: int = 0) -> Dict[str, Any]:
        """
        seat_class: 'GENERAL' | 'SPECIAL' | 'ANY'
        """
        # 좌석 등급 결정
        if seat_class == "GENERAL":
            seat_code = SEAT_GENERAL
        elif seat_class == "SPECIAL":
            seat_code = SEAT_SPECIAL
        else:
            # ANY: 일반 우선
            seat_code = SEAT_GENERAL if train.has_general_seat else SEAT_SPECIAL

        payload = {
            "Device": self.device,
            "Version": self.version,
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
        }

        data = self._post(URL_RESERVE, payload)
        result = data.get("strResult")
        if result == "SUCC":
            return data

        code = data.get("h_msg_cd") or ""
        msg = data.get("h_msg_txt") or ""
        if "WRG000000" in code or "매진" in msg or "잔여석" in msg:
            raise SoldOutError(msg)
        if "S111" in code or "로그인" in msg:
            raise NeedToLoginError(msg)
        raise KorailError(f"예약 실패: {msg} (code={code})")


# 하위 호환용 별칭
Korail = KorailMobile
