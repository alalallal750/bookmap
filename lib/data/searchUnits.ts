/**
 * 전국 시군구 "검색 단위" 표 — 정보나루 dtl_region 잎 코드 기준.
 * 생성 스크립트로 재생성 — 수동 편집 금지.
 *
 * 코드 출처: data4library.kr 사이트 세부지역 드롭다운 실데이터(/dtlAreaJson).
 * 실측 확정 규칙(2026-07-18): 색인은 잎 코드 단위(구 있는 시는 구 코드),
 * 부천시만 예외로 부모 코드 31050. 인천 신설 구(검단·서해)는 서구 23080.
 * lat/lng는 그 시군구 정보나루 참여관 좌표 평균(도서관 밀집 지점 근사).
 *
 * 재생성: "지금빌려 claude code" 폴더에서 node gen_nationwide_libraries.mjs
 * 생성일: 2026-07-18 (단위 250개)
 */

export type SearchUnit = {
  /** 정보나루 dtl_region 코드 (5자리) */
  code: string;
  /** 정보나루 region 코드 (시도 2자리) */
  region: string;
  province: string;
  district: string;
  /** 정보나루 참여관 수 (0이면 검색해도 결과 없음 — UI 안내용) */
  libCount: number;
  lat?: number;
  lng?: number;
};

export const SEARCH_UNITS: SearchUnit[] = [
  { code: "11010", region: "11", province: "서울특별시", district: "종로구", libCount: 3, lat: 37.577938, lng: 126.972549 },
  { code: "11020", region: "11", province: "서울특별시", district: "중구", libCount: 9, lat: 37.557712, lng: 126.996261 },
  { code: "11030", region: "11", province: "서울특별시", district: "용산구", libCount: 18, lat: 37.538242, lng: 126.976190 },
  { code: "11040", region: "11", province: "서울특별시", district: "성동구", libCount: 7, lat: 37.557543, lng: 127.033275 },
  { code: "11050", region: "11", province: "서울특별시", district: "광진구", libCount: 8, lat: 37.546968, lng: 127.086523 },
  { code: "11060", region: "11", province: "서울특별시", district: "동대문구", libCount: 25, lat: 37.581809, lng: 127.058007 },
  { code: "11070", region: "11", province: "서울특별시", district: "중랑구", libCount: 7, lat: 37.600190, lng: 127.088984 },
  { code: "11080", region: "11", province: "서울특별시", district: "성북구", libCount: 14, lat: 37.605688, lng: 127.028026 },
  { code: "11090", region: "11", province: "서울특별시", district: "강북구", libCount: 7, lat: 37.622675, lng: 127.023588 },
  { code: "11100", region: "11", province: "서울특별시", district: "도봉구", libCount: 29, lat: 37.658949, lng: 127.036270 },
  { code: "11110", region: "11", province: "서울특별시", district: "노원구", libCount: 36, lat: 37.645427, lng: 127.066171 },
  { code: "11120", region: "11", province: "서울특별시", district: "은평구", libCount: 18, lat: 37.608138, lng: 126.920697 },
  { code: "11130", region: "11", province: "서울특별시", district: "서대문구", libCount: 16, lat: 37.579625, lng: 126.941893 },
  { code: "11140", region: "11", province: "서울특별시", district: "마포구", libCount: 17, lat: 37.553430, lng: 126.931514 },
  { code: "11150", region: "11", province: "서울특별시", district: "양천구", libCount: 10, lat: 37.524821, lng: 126.854028 },
  { code: "11160", region: "11", province: "서울특별시", district: "강서구", libCount: 10, lat: 37.551818, lng: 126.849131 },
  { code: "11170", region: "11", province: "서울특별시", district: "구로구", libCount: 15, lat: 37.494539, lng: 126.865502 },
  { code: "11180", region: "11", province: "서울특별시", district: "금천구", libCount: 4, lat: 37.462529, lng: 126.900653 },
  { code: "11190", region: "11", province: "서울특별시", district: "영등포구", libCount: 8, lat: 37.516125, lng: 126.902301 },
  { code: "11200", region: "11", province: "서울특별시", district: "동작구", libCount: 12, lat: 37.496190, lng: 126.945550 },
  { code: "11210", region: "11", province: "서울특별시", district: "관악구", libCount: 8, lat: 37.479317, lng: 126.942764 },
  { code: "11220", region: "11", province: "서울특별시", district: "서초구", libCount: 24, lat: 37.488345, lng: 127.013077 },
  { code: "11230", region: "11", province: "서울특별시", district: "강남구", libCount: 31, lat: 37.494903, lng: 127.062388 },
  { code: "11240", region: "11", province: "서울특별시", district: "송파구", libCount: 13, lat: 37.501372, lng: 127.116635 },
  { code: "11250", region: "11", province: "서울특별시", district: "강동구", libCount: 10, lat: 37.545421, lng: 127.145513 },
  { code: "21010", region: "21", province: "부산광역시", district: "중구", libCount: 1, lat: 35.110143, lng: 129.027160 },
  { code: "21020", region: "21", province: "부산광역시", district: "서구", libCount: 2, lat: 35.111669, lng: 129.016430 },
  { code: "21030", region: "21", province: "부산광역시", district: "동구", libCount: 3, lat: 35.132368, lng: 129.044729 },
  { code: "21040", region: "21", province: "부산광역시", district: "영도구", libCount: 2, lat: 35.082056, lng: 129.052821 },
  { code: "21050", region: "21", province: "부산광역시", district: "부산진구", libCount: 6, lat: 35.166239, lng: 129.052746 },
  { code: "21060", region: "21", province: "부산광역시", district: "동래구", libCount: 3, lat: 35.201649, lng: 129.103058 },
  { code: "21070", region: "21", province: "부산광역시", district: "남구", libCount: 3, lat: 35.128917, lng: 129.095344 },
  { code: "21080", region: "21", province: "부산광역시", district: "북구", libCount: 4, lat: 35.224013, lng: 129.014932 },
  { code: "21090", region: "21", province: "부산광역시", district: "해운대구", libCount: 6, lat: 35.194010, lng: 129.141517 },
  { code: "21100", region: "21", province: "부산광역시", district: "사하구", libCount: 3, lat: 35.085079, lng: 128.971924 },
  { code: "21110", region: "21", province: "부산광역시", district: "금정구", libCount: 3, lat: 35.243826, lng: 129.096505 },
  { code: "21120", region: "21", province: "부산광역시", district: "강서구", libCount: 5, lat: 35.121319, lng: 128.898449 },
  { code: "21130", region: "21", province: "부산광역시", district: "연제구", libCount: 3, lat: 35.176756, lng: 129.093392 },
  { code: "21140", region: "21", province: "부산광역시", district: "수영구", libCount: 3, lat: 35.159154, lng: 129.105178 },
  { code: "21150", region: "21", province: "부산광역시", district: "사상구", libCount: 3, lat: 35.165729, lng: 128.992519 },
  { code: "21510", region: "21", province: "부산광역시", district: "기장군", libCount: 8, lat: 35.264750, lng: 129.201716 },
  { code: "22010", region: "22", province: "대구광역시", district: "중구", libCount: 9, lat: 35.864072, lng: 128.597189 },
  { code: "22020", region: "22", province: "대구광역시", district: "동구", libCount: 24, lat: 35.882162, lng: 128.656931 },
  { code: "22030", region: "22", province: "대구광역시", district: "서구", libCount: 6, lat: 35.875152, lng: 128.560263 },
  { code: "22040", region: "22", province: "대구광역시", district: "남구", libCount: 5, lat: 35.843294, lng: 128.584702 },
  { code: "22050", region: "22", province: "대구광역시", district: "북구", libCount: 12, lat: 35.903528, lng: 128.575279 },
  { code: "22060", region: "22", province: "대구광역시", district: "수성구", libCount: 9, lat: 35.841382, lng: 128.646955 },
  { code: "22070", region: "22", province: "대구광역시", district: "달서구", libCount: 14, lat: 35.839193, lng: 128.534278 },
  { code: "22510", region: "22", province: "대구광역시", district: "달성군", libCount: 14, lat: 35.776463, lng: 128.468833 },
  { code: "22520", region: "22", province: "대구광역시", district: "군위군", libCount: 1, lat: 36.239461, lng: 128.572527 },
  { code: "23010", region: "23", province: "인천광역시", district: "중구", libCount: 4, lat: 37.483123, lng: 126.577408 },
  { code: "23020", region: "23", province: "인천광역시", district: "동구", libCount: 1, lat: 37.481832, lng: 126.628346 },
  { code: "23040", region: "23", province: "인천광역시", district: "연수구", libCount: 3, lat: 37.404055, lng: 126.663915 },
  { code: "23050", region: "23", province: "인천광역시", district: "남동구", libCount: 5, lat: 37.427240, lng: 126.720984 },
  { code: "23060", region: "23", province: "인천광역시", district: "부평구", libCount: 8, lat: 37.502176, lng: 126.728752 },
  { code: "23070", region: "23", province: "인천광역시", district: "계양구", libCount: 1, lat: 37.546017, lng: 126.730172 },
  { code: "23080", region: "23", province: "인천광역시", district: "서구", libCount: 10, lat: 37.550064, lng: 126.664650 },
  { code: "23090", region: "23", province: "인천광역시", district: "미추홀구", libCount: 2, lat: 37.459168, lng: 126.679774 },
  { code: "23510", region: "23", province: "인천광역시", district: "강화군", libCount: 0 },
  { code: "23520", region: "23", province: "인천광역시", district: "옹진군", libCount: 0 },
  { code: "24010", region: "24", province: "광주광역시", district: "동구", libCount: 4, lat: 35.138928, lng: 126.928172 },
  { code: "24020", region: "24", province: "광주광역시", district: "서구", libCount: 6, lat: 35.140938, lng: 126.872641 },
  { code: "24030", region: "24", province: "광주광역시", district: "남구", libCount: 6, lat: 35.126491, lng: 126.904810 },
  { code: "24040", region: "24", province: "광주광역시", district: "북구", libCount: 7, lat: 35.533361, lng: 126.913236 },
  { code: "24050", region: "24", province: "광주광역시", district: "광산구", libCount: 6, lat: 35.176234, lng: 126.812733 },
  { code: "25010", region: "25", province: "대전광역시", district: "동구", libCount: 7, lat: 36.328848, lng: 127.449145 },
  { code: "25020", region: "25", province: "대전광역시", district: "중구", libCount: 3, lat: 36.311551, lng: 127.401821 },
  { code: "25030", region: "25", province: "대전광역시", district: "서구", libCount: 5, lat: 36.333192, lng: 127.370761 },
  { code: "25040", region: "25", province: "대전광역시", district: "유성구", libCount: 9, lat: 36.378441, lng: 127.362952 },
  { code: "25050", region: "25", province: "대전광역시", district: "대덕구", libCount: 3, lat: 36.391805, lng: 127.426697 },
  { code: "26010", region: "26", province: "울산광역시", district: "중구", libCount: 10, lat: 35.564629, lng: 129.325356 },
  { code: "26020", region: "26", province: "울산광역시", district: "남구", libCount: 6, lat: 35.538822, lng: 129.300465 },
  { code: "26030", region: "26", province: "울산광역시", district: "동구", libCount: 6, lat: 35.518095, lng: 129.423606 },
  { code: "26040", region: "26", province: "울산광역시", district: "북구", libCount: 22, lat: 35.609851, lng: 129.353924 },
  { code: "26510", region: "26", province: "울산광역시", district: "울주군", libCount: 1, lat: 35.558850, lng: 129.137378 },
  { code: "29010", region: "29", province: "세종특별자치시", district: "세종특별자치시", libCount: 17, lat: 36.505507, lng: 127.262961 },
  { code: "31011", region: "31", province: "경기도", district: "수원시 장안구", libCount: 5, lat: 37.297308, lng: 126.999417 },
  { code: "31012", region: "31", province: "경기도", district: "수원시 권선구", libCount: 7, lat: 37.254691, lng: 127.002199 },
  { code: "31013", region: "31", province: "경기도", district: "수원시 팔달구", libCount: 5, lat: 37.281444, lng: 127.016352 },
  { code: "31014", region: "31", province: "경기도", district: "수원시 영통구", libCount: 8, lat: 37.261773, lng: 127.056741 },
  { code: "31021", region: "31", province: "경기도", district: "성남시 수정구", libCount: 6, lat: 37.439392, lng: 127.102056 },
  { code: "31022", region: "31", province: "경기도", district: "성남시 중원구", libCount: 3, lat: 37.435478, lng: 127.152276 },
  { code: "31023", region: "31", province: "경기도", district: "성남시 분당구", libCount: 10, lat: 37.374066, lng: 127.113031 },
  { code: "31030", region: "31", province: "경기도", district: "의정부시", libCount: 7, lat: 37.743234, lng: 127.055558 },
  { code: "31041", region: "31", province: "경기도", district: "안양시 만안구", libCount: 5, lat: 37.396852, lng: 126.916722 },
  { code: "31042", region: "31", province: "경기도", district: "안양시 동안구", libCount: 6, lat: 37.394611, lng: 126.957858 },
  { code: "31050", region: "31", province: "경기도", district: "부천시", libCount: 36, lat: 37.500458, lng: 126.785178 },
  { code: "31060", region: "31", province: "경기도", district: "광명시", libCount: 6, lat: 37.462022, lng: 126.872426 },
  { code: "31070", region: "31", province: "경기도", district: "평택시", libCount: 15, lat: 37.025814, lng: 127.035930 },
  { code: "31080", region: "31", province: "경기도", district: "동두천시", libCount: 3, lat: 37.899033, lng: 127.051270 },
  { code: "31091", region: "31", province: "경기도", district: "안산시 상록구", libCount: 12, lat: 37.310481, lng: 126.858310 },
  { code: "31092", region: "31", province: "경기도", district: "안산시 단원구", libCount: 15, lat: 37.325859, lng: 126.795019 },
  { code: "31101", region: "31", province: "경기도", district: "고양시 덕양구", libCount: 14, lat: 37.650450, lng: 126.856673 },
  { code: "31103", region: "31", province: "경기도", district: "고양시 일산동구", libCount: 7, lat: 37.671100, lng: 126.798402 },
  { code: "31104", region: "31", province: "경기도", district: "고양시 일산서구", libCount: 6, lat: 37.686204, lng: 126.754293 },
  { code: "31110", region: "31", province: "경기도", district: "과천시", libCount: 2, lat: 37.425496, lng: 126.993142 },
  { code: "31120", region: "31", province: "경기도", district: "구리시", libCount: 4, lat: 37.604438, lng: 127.135887 },
  { code: "31130", region: "31", province: "경기도", district: "남양주시", libCount: 13, lat: 37.661252, lng: 127.201659 },
  { code: "31140", region: "31", province: "경기도", district: "오산시", libCount: 10, lat: 37.152816, lng: 127.064559 },
  { code: "31150", region: "31", province: "경기도", district: "시흥시", libCount: 12, lat: 37.389827, lng: 126.776922 },
  { code: "31160", region: "31", province: "경기도", district: "군포시", libCount: 1, lat: 37.355134, lng: 126.915744 },
  { code: "31170", region: "31", province: "경기도", district: "의왕시", libCount: 12, lat: 37.366139, lng: 126.979228 },
  { code: "31180", region: "31", province: "경기도", district: "하남시", libCount: 8, lat: 37.509714, lng: 127.180332 },
  { code: "31191", region: "31", province: "경기도", district: "용인시 처인구", libCount: 6, lat: 37.229478, lng: 127.221811 },
  { code: "31192", region: "31", province: "경기도", district: "용인시 기흥구", libCount: 9, lat: 37.276849, lng: 127.115937 },
  { code: "31193", region: "31", province: "경기도", district: "용인시 수지구", libCount: 6, lat: 37.321670, lng: 127.089590 },
  { code: "31200", region: "31", province: "경기도", district: "파주시", libCount: 22, lat: 37.792644, lng: 126.787391 },
  { code: "31210", region: "31", province: "경기도", district: "이천시", libCount: 14, lat: 37.245660, lng: 127.462407 },
  { code: "31220", region: "31", province: "경기도", district: "안성시", libCount: 13, lat: 37.024176, lng: 127.257686 },
  { code: "31230", region: "31", province: "경기도", district: "김포시", libCount: 12, lat: 37.609143, lng: 126.711772 },
  { code: "31240", region: "31", province: "경기도", district: "화성시", libCount: 32, lat: 37.188879, lng: 126.963694 },
  { code: "31250", region: "31", province: "경기도", district: "광주시", libCount: 11, lat: 37.390023, lng: 127.260388 },
  { code: "31260", region: "31", province: "경기도", district: "양주시", libCount: 10, lat: 37.813507, lng: 127.037567 },
  { code: "31270", region: "31", province: "경기도", district: "포천시", libCount: 8, lat: 37.922466, lng: 127.215594 },
  { code: "31280", region: "31", province: "경기도", district: "여주시", libCount: 9, lat: 37.304663, lng: 127.587426 },
  { code: "31550", region: "31", province: "경기도", district: "연천군", libCount: 6, lat: 38.072353, lng: 127.048904 },
  { code: "31570", region: "31", province: "경기도", district: "가평군", libCount: 4, lat: 37.766490, lng: 127.443689 },
  { code: "31580", region: "31", province: "경기도", district: "양평군", libCount: 0 },
  { code: "32010", region: "32", province: "강원특별자치도", district: "춘천시", libCount: 10, lat: 37.875325, lng: 127.724270 },
  { code: "32020", region: "32", province: "강원특별자치도", district: "원주시", libCount: 8, lat: 37.343686, lng: 127.920090 },
  { code: "32030", region: "32", province: "강원특별자치도", district: "강릉시", libCount: 2, lat: 37.816358, lng: 128.863198 },
  { code: "32040", region: "32", province: "강원특별자치도", district: "동해시", libCount: 7, lat: 37.518700, lng: 129.103410 },
  { code: "32050", region: "32", province: "강원특별자치도", district: "태백시", libCount: 3, lat: 37.145810, lng: 128.998723 },
  { code: "32060", region: "32", province: "강원특별자치도", district: "속초시", libCount: 5, lat: 38.199050, lng: 128.582890 },
  { code: "32070", region: "32", province: "강원특별자치도", district: "삼척시", libCount: 1, lat: 37.445145, lng: 129.165007 },
  { code: "32510", region: "32", province: "강원특별자치도", district: "홍천군", libCount: 1, lat: 37.691686, lng: 127.883998 },
  { code: "32520", region: "32", province: "강원특별자치도", district: "횡성군", libCount: 1, lat: 37.487159, lng: 127.979505 },
  { code: "32530", region: "32", province: "강원특별자치도", district: "영월군", libCount: 1, lat: 37.180300, lng: 128.458822 },
  { code: "32540", region: "32", province: "강원특별자치도", district: "평창군", libCount: 5, lat: 37.566316, lng: 128.494372 },
  { code: "32550", region: "32", province: "강원특별자치도", district: "정선군", libCount: 3, lat: 37.327991, lng: 128.719467 },
  { code: "32560", region: "32", province: "강원특별자치도", district: "철원군", libCount: 1, lat: 38.210621, lng: 127.212238 },
  { code: "32570", region: "32", province: "강원특별자치도", district: "화천군", libCount: 1, lat: 38.107492, lng: 127.704292 },
  { code: "32580", region: "32", province: "강원특별자치도", district: "양구군", libCount: 1, lat: 38.101864, lng: 127.987426 },
  { code: "32590", region: "32", province: "강원특별자치도", district: "인제군", libCount: 1, lat: 38.070227, lng: 128.170671 },
  { code: "32600", region: "32", province: "강원특별자치도", district: "고성군", libCount: 1, lat: 38.439261, lng: 128.450089 },
  { code: "32610", region: "32", province: "강원특별자치도", district: "양양군", libCount: 1, lat: 38.075895, lng: 128.618285 },
  { code: "33020", region: "33", province: "충청북도", district: "충주시", libCount: 8, lat: 36.985918, lng: 127.899829 },
  { code: "33030", region: "33", province: "충청북도", district: "제천시", libCount: 5, lat: 37.140740, lng: 128.209327 },
  { code: "33041", region: "33", province: "충청북도", district: "청주시 상당구", libCount: 4, lat: 36.625854, lng: 127.543135 },
  { code: "33042", region: "33", province: "충청북도", district: "청주시 서원구", libCount: 3, lat: 36.619831, lng: 127.483289 },
  { code: "33043", region: "33", province: "충청북도", district: "청주시 흥덕구", libCount: 6, lat: 36.635939, lng: 127.401949 },
  { code: "33044", region: "33", province: "충청북도", district: "청주시 청원구", libCount: 5, lat: 36.705669, lng: 127.473658 },
  { code: "33520", region: "33", province: "충청북도", district: "보은군", libCount: 2, lat: 36.485708, lng: 127.719593 },
  { code: "33530", region: "33", province: "충청북도", district: "옥천군", libCount: 3, lat: 36.301395, lng: 127.569069 },
  { code: "33540", region: "33", province: "충청북도", district: "영동군", libCount: 1, lat: 36.171384, lng: 127.772262 },
  { code: "33550", region: "33", province: "충청북도", district: "진천군", libCount: 4, lat: 36.901272, lng: 127.460695 },
  { code: "33560", region: "33", province: "충청북도", district: "괴산군", libCount: 2, lat: 36.807130, lng: 127.788764 },
  { code: "33570", region: "33", province: "충청북도", district: "음성군", libCount: 6, lat: 36.991674, lng: 127.574996 },
  { code: "33580", region: "33", province: "충청북도", district: "단양군", libCount: 3, lat: 36.999295, lng: 128.341567 },
  { code: "33590", region: "33", province: "충청북도", district: "증평군", libCount: 2, lat: 36.784124, lng: 127.585066 },
  { code: "34011", region: "34", province: "충청남도", district: "천안시 동남구", libCount: 2, lat: 36.790326, lng: 127.180993 },
  { code: "34012", region: "34", province: "충청남도", district: "천안시 서북구", libCount: 2, lat: 36.856684, lng: 127.118540 },
  { code: "34020", region: "34", province: "충청남도", district: "공주시", libCount: 4, lat: 36.480163, lng: 127.078541 },
  { code: "34030", region: "34", province: "충청남도", district: "보령시", libCount: 3, lat: 36.308722, lng: 126.602406 },
  { code: "34040", region: "34", province: "충청남도", district: "아산시", libCount: 8, lat: 36.807441, lng: 127.038152 },
  { code: "34050", region: "34", province: "충청남도", district: "서산시", libCount: 9, lat: 36.771326, lng: 126.476914 },
  { code: "34060", region: "34", province: "충청남도", district: "논산시", libCount: 4, lat: 36.169564, lng: 127.077641 },
  { code: "34070", region: "34", province: "충청남도", district: "계룡시", libCount: 0 },
  { code: "34080", region: "34", province: "충청남도", district: "당진시", libCount: 13, lat: 36.909781, lng: 126.662582 },
  { code: "34510", region: "34", province: "충청남도", district: "금산군", libCount: 6, lat: 36.126110, lng: 127.466291 },
  { code: "34530", region: "34", province: "충청남도", district: "부여군", libCount: 2, lat: 36.250255, lng: 126.838191 },
  { code: "34540", region: "34", province: "충청남도", district: "서천군", libCount: 2, lat: 36.045427, lng: 126.695542 },
  { code: "34550", region: "34", province: "충청남도", district: "청양군", libCount: 1, lat: 36.452762, lng: 126.800398 },
  { code: "34560", region: "34", province: "충청남도", district: "홍성군", libCount: 3, lat: 36.575292, lng: 126.650745 },
  { code: "34570", region: "34", province: "충청남도", district: "예산군", libCount: 3, lat: 36.692620, lng: 126.806834 },
  { code: "34580", region: "34", province: "충청남도", district: "태안군", libCount: 2, lat: 36.758604, lng: 126.296299 },
  { code: "35011", region: "35", province: "전북특별자치도", district: "전주시 완산구", libCount: 7, lat: 35.810397, lng: 127.121189 },
  { code: "35012", region: "35", province: "전북특별자치도", district: "전주시 덕진구", libCount: 7, lat: 35.846602, lng: 127.137048 },
  { code: "35020", region: "35", province: "전북특별자치도", district: "군산시", libCount: 8, lat: 35.961845, lng: 126.738124 },
  { code: "35030", region: "35", province: "전북특별자치도", district: "익산시", libCount: 9, lat: 35.973458, lng: 126.974775 },
  { code: "35040", region: "35", province: "전북특별자치도", district: "정읍시", libCount: 1, lat: 35.571274, lng: 126.851892 },
  { code: "35050", region: "35", province: "전북특별자치도", district: "남원시", libCount: 5, lat: 35.416058, lng: 127.413199 },
  { code: "35060", region: "35", province: "전북특별자치도", district: "김제시", libCount: 11, lat: 35.793930, lng: 126.888999 },
  { code: "35510", region: "35", province: "전북특별자치도", district: "완주군", libCount: 6, lat: 35.920245, lng: 127.128591 },
  { code: "35520", region: "35", province: "전북특별자치도", district: "진안군", libCount: 1, lat: 35.789337, lng: 127.422116 },
  { code: "35530", region: "35", province: "전북특별자치도", district: "무주군", libCount: 2, lat: 36.006345, lng: 127.661516 },
  { code: "35540", region: "35", province: "전북특별자치도", district: "장수군", libCount: 1, lat: 35.651032, lng: 127.521415 },
  { code: "35550", region: "35", province: "전북특별자치도", district: "임실군", libCount: 1, lat: 35.613882, lng: 127.278782 },
  { code: "35560", region: "35", province: "전북특별자치도", district: "순창군", libCount: 2, lat: 35.375062, lng: 127.142348 },
  { code: "35570", region: "35", province: "전북특별자치도", district: "고창군", libCount: 1, lat: 35.434142, lng: 126.703975 },
  { code: "35580", region: "35", province: "전북특별자치도", district: "부안군", libCount: 1, lat: 35.730732, lng: 126.734897 },
  { code: "36010", region: "36", province: "전라남도", district: "목포시", libCount: 5, lat: 34.811672, lng: 126.405094 },
  { code: "36020", region: "36", province: "전라남도", district: "여수시", libCount: 8, lat: 34.906679, lng: 127.603002 },
  { code: "36030", region: "36", province: "전라남도", district: "순천시", libCount: 9, lat: 34.946259, lng: 127.515602 },
  { code: "36040", region: "36", province: "전라남도", district: "나주시", libCount: 2, lat: 35.036008, lng: 126.781269 },
  { code: "36060", region: "36", province: "전라남도", district: "광양시", libCount: 8, lat: 34.959069, lng: 127.664962 },
  { code: "36510", region: "36", province: "전라남도", district: "담양군", libCount: 1, lat: 35.312044, lng: 126.983942 },
  { code: "36520", region: "36", province: "전라남도", district: "곡성군", libCount: 3, lat: 35.279541, lng: 127.242330 },
  { code: "36530", region: "36", province: "전라남도", district: "구례군", libCount: 2, lat: 35.206332, lng: 127.462091 },
  { code: "36550", region: "36", province: "전라남도", district: "고흥군", libCount: 4, lat: 34.630000, lng: 127.259682 },
  { code: "36560", region: "36", province: "전라남도", district: "보성군", libCount: 2, lat: 34.806298, lng: 127.210259 },
  { code: "36570", region: "36", province: "전라남도", district: "화순군", libCount: 1, lat: 35.062277, lng: 126.981921 },
  { code: "36580", region: "36", province: "전라남도", district: "장흥군", libCount: 1, lat: 34.681419, lng: 126.910425 },
  { code: "36590", region: "36", province: "전라남도", district: "강진군", libCount: 1, lat: 34.640635, lng: 126.769571 },
  { code: "36600", region: "36", province: "전라남도", district: "해남군", libCount: 2, lat: 34.574251, lng: 126.597102 },
  { code: "36610", region: "36", province: "전라남도", district: "영암군", libCount: 1, lat: 34.799854, lng: 126.694384 },
  { code: "36620", region: "36", province: "전라남도", district: "무안군", libCount: 2, lat: 34.896566, lng: 126.465017 },
  { code: "36630", region: "36", province: "전라남도", district: "함평군", libCount: 1, lat: 35.067022, lng: 126.518958 },
  { code: "36640", region: "36", province: "전라남도", district: "영광군", libCount: 1, lat: 35.273545, lng: 126.504670 },
  { code: "36650", region: "36", province: "전라남도", district: "장성군", libCount: 1, lat: 35.304598, lng: 126.784688 },
  { code: "36660", region: "36", province: "전라남도", district: "완도군", libCount: 0 },
  { code: "36670", region: "36", province: "전라남도", district: "진도군", libCount: 1, lat: 34.485795, lng: 126.266835 },
  { code: "36680", region: "36", province: "전라남도", district: "신안군", libCount: 1, lat: 34.862626, lng: 126.317799 },
  { code: "37011", region: "37", province: "경상북도", district: "포항시 남구", libCount: 20, lat: 36.000171, lng: 129.387693 },
  { code: "37012", region: "37", province: "경상북도", district: "포항시 북구", libCount: 24, lat: 36.083375, lng: 129.352268 },
  { code: "37020", region: "37", province: "경상북도", district: "경주시", libCount: 7, lat: 35.842925, lng: 129.249519 },
  { code: "37030", region: "37", province: "경상북도", district: "김천시", libCount: 0 },
  { code: "37040", region: "37", province: "경상북도", district: "안동시", libCount: 6, lat: 36.562940, lng: 128.701399 },
  { code: "37050", region: "37", province: "경상북도", district: "구미시", libCount: 15, lat: 36.136645, lng: 128.360108 },
  { code: "37060", region: "37", province: "경상북도", district: "영주시", libCount: 2, lat: 36.845363, lng: 128.562951 },
  { code: "37070", region: "37", province: "경상북도", district: "영천시", libCount: 2, lat: 35.954902, lng: 128.906722 },
  { code: "37080", region: "37", province: "경상북도", district: "상주시", libCount: 2, lat: 36.427231, lng: 128.052143 },
  { code: "37090", region: "37", province: "경상북도", district: "문경시", libCount: 2, lat: 36.626464, lng: 128.133194 },
  { code: "37100", region: "37", province: "경상북도", district: "경산시", libCount: 3, lat: 35.850059, lng: 128.762761 },
  { code: "37520", region: "37", province: "경상북도", district: "의성군", libCount: 3, lat: 36.345939, lng: 128.572681 },
  { code: "37530", region: "37", province: "경상북도", district: "청송군", libCount: 1, lat: 36.436649, lng: 129.055235 },
  { code: "37540", region: "37", province: "경상북도", district: "영양군", libCount: 1, lat: 36.660696, lng: 129.110825 },
  { code: "37550", region: "37", province: "경상북도", district: "영덕군", libCount: 1, lat: 36.414687, lng: 129.368070 },
  { code: "37560", region: "37", province: "경상북도", district: "청도군", libCount: 1, lat: 35.645298, lng: 128.740068 },
  { code: "37570", region: "37", province: "경상북도", district: "고령군", libCount: 2, lat: 35.776553, lng: 128.347433 },
  { code: "37580", region: "37", province: "경상북도", district: "성주군", libCount: 1, lat: 35.927579, lng: 128.283582 },
  { code: "37590", region: "37", province: "경상북도", district: "칠곡군", libCount: 4, lat: 36.027622, lng: 128.390202 },
  { code: "37600", region: "37", province: "경상북도", district: "예천군", libCount: 2, lat: 36.614900, lng: 128.471280 },
  { code: "37610", region: "37", province: "경상북도", district: "봉화군", libCount: 1, lat: 36.888393, lng: 128.740127 },
  { code: "37620", region: "37", province: "경상북도", district: "울진군", libCount: 10, lat: 36.896373, lng: 129.405251 },
  { code: "37630", region: "37", province: "경상북도", district: "울릉군", libCount: 1, lat: 37.499388, lng: 130.901446 },
  { code: "38030", region: "38", province: "경상남도", district: "진주시", libCount: 8, lat: 35.180466, lng: 128.107215 },
  { code: "38050", region: "38", province: "경상남도", district: "통영시", libCount: 5, lat: 34.800522, lng: 128.383643 },
  { code: "38060", region: "38", province: "경상남도", district: "사천시", libCount: 2, lat: 35.018307, lng: 128.082375 },
  { code: "38070", region: "38", province: "경상남도", district: "김해시", libCount: 48, lat: 35.235370, lng: 128.837240 },
  { code: "38080", region: "38", province: "경상남도", district: "밀양시", libCount: 4, lat: 35.437499, lng: 128.765794 },
  { code: "38090", region: "38", province: "경상남도", district: "거제시", libCount: 13, lat: 34.885992, lng: 128.646739 },
  { code: "38100", region: "38", province: "경상남도", district: "양산시", libCount: 11, lat: 35.390278, lng: 129.068640 },
  { code: "38111", region: "38", province: "경상남도", district: "창원시 의창구", libCount: 5, lat: 35.262488, lng: 128.641822 },
  { code: "38112", region: "38", province: "경상남도", district: "창원시 성산구", libCount: 2, lat: 35.213169, lng: 128.685618 },
  { code: "38113", region: "38", province: "경상남도", district: "창원시 마산합포구", libCount: 3, lat: 35.171814, lng: 128.545799 },
  { code: "38114", region: "38", province: "경상남도", district: "창원시 마산회원구", libCount: 2, lat: 35.240688, lng: 128.585633 },
  { code: "38115", region: "38", province: "경상남도", district: "창원시 진해구", libCount: 2, lat: 35.126353, lng: 128.742346 },
  { code: "38510", region: "38", province: "경상남도", district: "의령군", libCount: 1, lat: 35.319722, lng: 128.266948 },
  { code: "38520", region: "38", province: "경상남도", district: "함안군", libCount: 2, lat: 35.288200, lng: 128.461848 },
  { code: "38530", region: "38", province: "경상남도", district: "창녕군", libCount: 3, lat: 35.459246, lng: 128.501782 },
  { code: "38540", region: "38", province: "경상남도", district: "고성군", libCount: 1, lat: 34.979207, lng: 128.326348 },
  { code: "38550", region: "38", province: "경상남도", district: "남해군", libCount: 2, lat: 34.836626, lng: 127.892789 },
  { code: "38560", region: "38", province: "경상남도", district: "하동군", libCount: 1, lat: 35.063874, lng: 127.744767 },
  { code: "38570", region: "38", province: "경상남도", district: "산청군", libCount: 2, lat: 35.359134, lng: 127.925456 },
  { code: "38580", region: "38", province: "경상남도", district: "함양군", libCount: 1, lat: 35.521112, lng: 127.727066 },
  { code: "38590", region: "38", province: "경상남도", district: "거창군", libCount: 2, lat: 35.688158, lng: 127.907646 },
  { code: "38600", region: "38", province: "경상남도", district: "합천군", libCount: 1, lat: 35.564310, lng: 128.168973 },
  { code: "39010", region: "39", province: "제주특별자치도", district: "제주시", libCount: 8, lat: 33.475571, lng: 126.470148 },
  { code: "39020", region: "39", province: "제주특별자치도", district: "서귀포시", libCount: 8, lat: 33.287159, lng: 126.593958 },
];

const byCode = new Map<string, SearchUnit>();
for (const u of SEARCH_UNITS) byCode.set(u.code, u);

export function getSearchUnit(code: string): SearchUnit | undefined {
  return byCode.get(code);
}

export function getUnitsByRegion(region: string): SearchUnit[] {
  return SEARCH_UNITS.filter((u) => u.region === region);
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * 좌표에서 가까운 검색 단위 n개 (참여관 있는 곳만).
 * 전국판 자동 검색: 현재 시군구 + 인접 시군구 — 기본 3개.
 */
export function getNearbyUnits(lat: number, lng: number, n = 3): SearchUnit[] {
  return SEARCH_UNITS.filter((u) => u.libCount > 0 && u.lat !== undefined)
    .map((u) => ({ u, d: distanceKm(lat, lng, u.lat!, u.lng!) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.u);
}

/**
 * 카카오 행정구역 변환 결과(시도명, 시군구명)로 검색 단위 찾기.
 * 카카오 region_2depth_name 예: "수원시 장안구", "부천시 원미구", "청주시 상당구".
 * 부천은 구가 색인에 없으므로 시 단위(31050)로 흡수.
 */
export function findUnitByKakaoRegion(
  depth1: string,
  depth2: string
): SearchUnit | undefined {
  const d2 = depth2.trim();
  if (d2.startsWith("부천시")) return byCode.get("31050");
  // 시도명 앞 2글자 매칭 (카카오 "서울"/"서울특별시", "전북특별자치도" 등 표기 편차 흡수)
  const head = depth1.slice(0, 2);
  const candidates = SEARCH_UNITS.filter((u) => u.province.startsWith(head));
  // 완전 일치 우선, 다음 토큰 포함 일치
  return (
    candidates.find((u) => u.district === d2) ??
    candidates.find((u) => {
      const tokens = u.district.split(/\s+/);
      return tokens.every((t) => d2.includes(t));
    })
  );
}
