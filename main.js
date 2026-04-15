let rawData = [];
let headers = [];
let API_KEY = "";
let startTime = 0;
let timerInterval = null;

// DOM Elements
const fileInput = document.getElementById('fileInput');
const columnSelect = document.getElementById('columnSelect');
const processBtn = document.getElementById('processBtn');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const sourceFileName = document.getElementById('sourceFileName');

const pipelineSection = document.getElementById('pipelineSection');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const processedText = document.getElementById('processedText');
const timeElapsed = document.getElementById('timeElapsed');
const timeRemaining = document.getElementById('timeRemaining');

const tableHeader = document.getElementById('tableHeader');
const tableBody = document.getElementById('tableBody');
const step3 = document.getElementById('step3');
const downloadBtn = document.getElementById('downloadBtn');

// Initial setup
window.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    lucide.createIcons();
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

    fileNameDisplay.textContent = file.name;
    sourceFileName.textContent = `Source: ${file.name}`;

    const reader = new FileReader();
    reader.onload = (event) => {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rawData = XLSX.utils.sheet_to_json(firstSheet);
        
        if (rawData.length > 0) {
            headers = Object.keys(rawData[0]);
            populateColumnSelect();
            processBtn.disabled = false;
        }
    };
    reader.readAsArrayBuffer(file);
});

function populateColumnSelect() {
    columnSelect.innerHTML = '<option value="">Select source field</option>';
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

    // Start UI State
    processBtn.disabled = true;
    pipelineSection.classList.remove('hidden');
    step3.classList.add('hidden');
    
    // Generate Random Transaction ID
    const trId = document.getElementById('transactionId');
    if (trId) trId.textContent = Math.floor(Math.random() * 90000 + 10000);
    
    // Reset Stats
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    startTime = Date.now();
    startTimer();

    const results = [];
    const total = rawData.length;

    for (let i = 0; i < total; i++) {
        const address = rawData[i][selectedField];
        const currentCount = i + 1;
        const percent = Math.floor((currentCount / total) * 100);
        
        processedText.textContent = `${currentCount.toLocaleString()}개의 데이터 처리 중...`;
        progressPercent.textContent = `${percent}%`;
        progressFill.style.width = `${percent}%`;

        // Estimate time remaining
        const elapsed = (Date.now() - startTime) / 1000;
        const avgTime = elapsed / currentCount;
        const remainingTime = avgTime * (total - currentCount);
        timeRemaining.textContent = formatTime(remainingTime);

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
        
        // Small delay
        await new Promise(r => setTimeout(r, 50));
    }

    stopTimer();
    displayResults(results);
    step3.classList.remove('hidden');
    processBtn.disabled = false;
});

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        timeElapsed.textContent = formatTime(elapsed);
    }, 1000);
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "--:--:--";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

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
                    "##status##": 'Validated'
                });
            } else {
                resolve({
                    "##roadAddr##": "Search Failed",
                    "##jibunAddr##": "",
                    "##adminNm##": "",
                    "##jibun##": "",
                    "##PNU##": "",
                    "##status##": 'Error'
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
            if (h === '##status##') {
                const statusClass = row[h] === 'Validated' ? 'success' : 'error';
                td.innerHTML = `<span class="status-tag ${statusClass}">${row[h]}</span>`;
            } else {
                td.textContent = row[h];
            }
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });

    window.processResults = results;
}

downloadBtn.addEventListener('click', () => {
    if (!window.processResults) return;
    const worksheet = XLSX.utils.json_to_sheet(window.processResults);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
    XLSX.writeFile(workbook, "juso_results.xlsx");
});

function refineJibunData(first) {
    const adminDistrict = [first.siNm, first.sggNm, first.emdNm, first.liNm]
        .filter(v => v && v.trim() !== "")
        .join(" ");

    const san = first.mtYn === '1' ? '산' : '';
    const main = first.lnbrMnnm || "";
    const sub = (first.lnbrSlno && first.lnbrSlno !== "0" && first.lnbrSlno !== "") ? `-${first.lnbrSlno}` : "";
    const jibunOnly = san + main + sub;

    return {
        adminDistrict: adminDistrict,
        jibun: jibunOnly
    };
}

function generatePNU(admCd, mtYn, mnnm, slno) {
    if (!admCd) return "";
    const landType = mtYn === '1' ? '2' : '1';
    const mnnmStr = (mnnm || "0").padStart(4, '0');
    const slnoStr = (slno || "0").padStart(4, '0');
    return admCd + landType + mnnmStr + slnoStr;
}

