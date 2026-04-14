let rawData = [];
let headers = [];
let API_KEY = "";

// DOM Elements
const fileInput = document.getElementById('fileInput');
const columnSelect = document.getElementById('columnSelect');
const processBtn = document.getElementById('processBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressStatus = document.getElementById('progressStatus');
const tableHeader = document.getElementById('tableHeader');
const tableBody = document.getElementById('tableBody');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const downloadBtn = document.getElementById('downloadBtn');

// Initial setup
window.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
});

async function loadConfig() {
    try {
        const response = await fetch('config.json');
        const config = await response.json();
        API_KEY = config.jusoApiKey;
    } catch (e) {
        console.warn("Could not load config.json. Using hardcoded/manual entry if available.");
    }
}

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Display file name
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    fileNameDisplay.textContent = `선택된 파일: ${file.name}`;

    const reader = new FileReader();
    reader.onload = (event) => {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rawData = XLSX.utils.sheet_to_json(firstSheet);
        
        if (rawData.length > 0) {
            headers = Object.keys(rawData[0]);
            populateColumnSelect();
            step2.classList.remove('hidden');
        }
    };
    reader.readAsArrayBuffer(file);
});

function populateColumnSelect() {
    columnSelect.innerHTML = '<option value="">필드를 선택해 주세요</option>';
    headers.forEach(header => {
        const option = document.createElement('option');
        option.value = header;
        option.textContent = header;
        columnSelect.appendChild(option);
    });
}

processBtn.addEventListener('click', async () => {
    const selectedField = columnSelect.value;
    if (!selectedField) {
        alert("주소가 포함된 필드를 선택해 주세요.");
        return;
    }

    if (!API_KEY) {
        alert("API 키가 설정되지 않았습니다. config.json을 확인해 주세요.");
        return;
    }

    processBtn.disabled = true;
    progressContainer.style.display = 'block';
    
    const results = [];
    const total = rawData.length;

    for (let i = 0; i < total; i++) {
        const address = rawData[i][selectedField];
        progressStatus.textContent = `처리 중... (${i + 1} / ${total})`;
        progressFill.style.width = `${((i + 1) / total) * 100}%`;

        if (address) {
            const apiResult = await fetchJuso(address);
            results.push({ ...rawData[i], ...apiResult });
        } else {
            results.push({ 
                ...rawData[i], 
                "##roadAddr##": "주소 없음", 
                "##jibunAddr##": "", 
                "##adminNm##": "", 
                "##jibun##": "",
                "##PNU##": "",
                "##status##": 'Missing'
            });
        }
        
        // Small delay to respect API limits if needed
        await new Promise(r => setTimeout(r, 100));
    }

    displayResults(results);
    step3.classList.remove('hidden');
    processBtn.disabled = false;
});

async function fetchJuso(keyword) {
    return new Promise((resolve) => {
        const callbackName = 'jusoCallback_' + Math.floor(Math.random() * 1000000);
        window[callbackName] = (data) => {
            delete window[callbackName];
            document.body.removeChild(script);
            
            if (data.results.common.errorCode === "0" && data.results.juso.length > 0) {
                const first = data.results.juso[0];
                const refined = refineJibunData(first);
                const pnu = generatePNU(first.admCd, first.mtYn, first.lnbrMnnm, first.lnbrSlno);
                resolve({
                    "##roadAddr##": first.roadAddr,
                    "##jibunAddr##": first.jibunAddr,
                    "##adminNm##": refined.adminDistrict,
                    "##jibun##": refined.jibun,
                    "##PNU##": pnu,
                    "##status##": 'Success'
                });
            } else {
                resolve({
                    "##roadAddr##": "검색 실패",
                    "##jibunAddr##": "",
                    "##adminNm##": "",
                    "##jibun##": "",
                    "##PNU##": "",
                    "##status##": 'Fail (' + data.results.common.errorMessage + ')'
                });
            }
        };

        const script = document.createElement('script');
        const url = `https://business.juso.go.kr/addrlink/addrLinkApiJsonp.do?confmKey=${API_KEY}&keyword=${encodeURIComponent(keyword)}&resultType=json&callback=${callbackName}`;
        script.src = url;
        document.body.appendChild(script);
    });
}

function displayResults(results) {
    const resultHeaders = Object.keys(results[0]);
    
    // Header
    tableHeader.innerHTML = '';
    resultHeaders.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        tableHeader.appendChild(th);
    });

    // Body
    tableBody.innerHTML = '';
    results.forEach(row => {
        const tr = document.createElement('tr');
        resultHeaders.forEach(h => {
            const td = document.createElement('td');
            td.textContent = row[h];
            if (h === '##status##') {
                td.innerHTML = `<span class="status-badge ${row[h].startsWith('Success') ? 'status-success' : 'status-error'}">${row[h]}</span>`;
            }
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });

    // Store for download
    window.processResults = results;
}

downloadBtn.addEventListener('click', () => {
    if (!window.processResults) return;
    const worksheet = XLSX.utils.json_to_sheet(window.processResults);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
    XLSX.writeFile(workbook, "juso_results.xlsx");
});

/**
 * 지번 정제 함수 (plans.md 가이드 준수)
 * 1. 행정구역과 지번 분리
 * 2. 기타주소 제거
 */
function refineJibunData(first) {
    // 1. 행정구역 구성 (시도 + 시군구 + 읍면동 + 리)
    const adminDistrict = [first.siNm, first.sggNm, first.emdNm, first.liNm]
        .filter(v => v && v.trim() !== "")
        .join(" ");

    // 2. 지번 구성 (산여부 + 지번본번 + [-지번부번])
    const san = first.mtYn === '1' ? '산' : '';
    const main = first.lnbrMnnm || "";
    const sub = (first.lnbrSlno && first.lnbrSlno !== "0" && first.lnbrSlno !== "") ? `-${first.lnbrSlno}` : "";
    const jibunOnly = san + main + sub;

    return {
        adminDistrict: adminDistrict,
        jibun: jibunOnly
    };
}

/**
 * PNU 생성 함수
 * admCd(10) + 지번구분(1) + 본번(4) + 부번(4)
 */
function generatePNU(admCd, mtYn, mnnm, slno) {
    if (!admCd) return "";
    const landType = mtYn === '1' ? '2' : '1';
    const mnnmStr = (mnnm || "0").padStart(4, '0');
    const slnoStr = (slno || "0").padStart(4, '0');
    return admCd + landType + mnnmStr + slnoStr;
}
