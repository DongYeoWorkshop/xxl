// secret.js
// 사용하지 않는 ui.js import 제거 (기능상 alert만 사용)

export function initSecretModule() {
    const reportModal = document.getElementById('report-modal');
    const reportOpenBtn = document.getElementById('report-open-btn');
    const reportCloseBtn = document.getElementById('report-close-btn');
    const reportSubmitBtn = document.getElementById('report-submit-btn');
    const reportText = document.getElementById('report-text');
    const charCount = document.getElementById('char-count');

    const openReportModal = () => {
        if (!reportModal) return;
        reportModal.style.display = 'flex';
        if (reportText) reportText.value = '';
        if (charCount) charCount.textContent = '0 / 200';
        // 열 때 기록 추가
        history.pushState({ id: 'modal', modalId: 'report-modal' }, "", window.location.pathname);
    };

    const closeReportModal = () => {
        if (!reportModal) return;
        if (reportModal.style.display === 'flex') {
            reportModal.style.display = 'none';
            // 현재 기록이 이 모달의 기록일 때만 뒤로가기 실행 (꼬임 방지)
            if (history.state?.modalId === 'report-modal') {
                history.back();
            }
        }
    };

    if (reportOpenBtn) reportOpenBtn.onclick = openReportModal;
    const landingReportBtn = document.getElementById('landing-report-btn');
    if (landingReportBtn) landingReportBtn.onclick = openReportModal;

    if (reportText && charCount) {
        reportText.oninput = () => {
            const len = reportText.value.length;
            charCount.textContent = `${len} / 200`;
            charCount.style.color = len >= 200 ? '#dc3545' : '#888';
        };
    }

    if (reportCloseBtn) reportCloseBtn.onclick = closeReportModal;

    if (reportSubmitBtn) {
        reportSubmitBtn.onclick = () => {
            const text = reportText.value.trim();
            if (!text) return alert("내용을 입력해주세요.");
            sendToGoogleSheet(text);
            alert("제보가 성공적으로 전송되었습니다. 감사합니다!");
            closeReportModal();
        };
    }

    function sendToGoogleSheet(message) {
        const scriptUrl = "https://script.google.com/macros/s/AKfycbylIIRa4S2awrK9weUMRitrz6NI6r6mMpsnobvyZgcm9aZgSQhnNZlj4rNzvyotAe21dw/exec"; 
        fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: new Date().toLocaleString(),
                content: message,
                charId: window.state?.currentId || 'unknown'
            })
        });
    }

    // [중요] 사용자가 브라우저 '뒤로가기' 버튼을 눌렀을 때 처리
    window.addEventListener('popstate', (event) => {
        if (reportModal && reportModal.style.display === 'flex') {
            reportModal.style.display = 'none';
        }
    });
}

export function initCloudSharing() {
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwdcMybPn0A98Ed47H34egawd0sL1j4ZHaRDW0gW3Ifyo_DT09oDdom3U8LIxSoyxbMlw/exec";
    const modal = document.getElementById('cloud-save-modal');
    const openBtn = document.getElementById('landing-cloud-btn');
    const closeBtn = document.getElementById('cloud-modal-close-btn');
    const saveBtn = document.getElementById('cloud-save-btn');
    const loadBtn = document.getElementById('cloud-load-btn');
    const loadInput = document.getElementById('cloud-load-id');
    const issuedArea = document.getElementById('cloud-issued-code-area');
    const issuedVal = document.getElementById('cloud-issued-code-val');

    const openCloudModal = () => {
        if (!modal) return;
        modal.style.display = 'flex';
        if (issuedArea) issuedArea.style.display = 'none'; 
        history.pushState({ id: 'modal', modalId: 'cloud-save-modal' }, "", window.location.pathname);
    };

    const closeCloudModal = () => {
        if (!modal) return;
        if (modal.style.display === 'flex') {
            modal.style.display = 'none';
            if (history.state?.modalId === 'cloud-save-modal') {
                history.back();
            }
        }
    };

    if (openBtn) openBtn.onclick = openCloudModal;
    if (closeBtn) closeBtn.onclick = closeCloudModal;

    if (modal) {
        modal.onclick = (e) => { 
            if(e.target === modal) closeCloudModal();
        };
    }

    if (saveBtn) {
        saveBtn.onclick = async () => {
            if (!confirm("현재 계산기 설정을 저장하고 공유 코드를 발급받으시겠습니까?")) return;
            saveBtn.disabled = true;
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<span>⏳</span> 처리 중...';
            try {
                const randomId = Math.floor(10000000 + Math.random() * 90000000);
                const dataToSave = {
                    stats: JSON.parse(localStorage.getItem('dyst_stats') || '{}'),
                    snapshots: JSON.parse(localStorage.getItem('dyst_snapshots') || '[]'),
                    config: { sheetUrl: localStorage.getItem('dyst_google_sheet_url') || '' },
                    meta: { version: '1.2.1', date: new Date().toLocaleString() }
                };
                const response = await fetch(SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ id: "'" + randomId, data: dataToSave })
                });
                const json = await response.json();
                if (json.result === 'success') {
                    if (issuedArea && issuedVal) {
                        issuedVal.textContent = randomId;
                        issuedArea.style.display = 'block';
                    }
                } else {
                    alert("발급 실패: " + (json.message || "알 수 없는 오류"));
                }
            } catch (err) {
                console.error(err);
                alert("통신 중 오류가 발생했습니다.");
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
            }
        };
    }

    if (loadBtn && loadInput) {
        loadBtn.onclick = async () => {
            const id = loadInput.value.replace(/[^0-9]/g, '');
            if (id.length < 8) return alert("올바른 8자리 코드를 입력해주세요.");
            if (!confirm("데이터를 불러오면 현재 기기의 설정이 덮어씌워집니다.\n계속하시겠습니까?")) return;
            loadBtn.disabled = true;
            loadBtn.textContent = '불러오는 중...';
            try {
                const response = await fetch(`${SCRIPT_URL}?id=${id}`);
                const json = await response.json();
                if (json.result === 'success') {
                    const data = json.data;
                    if (data.stats) localStorage.setItem('dyst_stats', JSON.stringify(data.stats));
                    if (data.snapshots) localStorage.setItem('dyst_snapshots', JSON.stringify(data.snapshots));
                    alert("데이터 복원이 완료되었습니다. 페이지를 새로고침합니다.");
                    location.reload();
                } else {
                    alert("불러오기 실패: " + (json.message || "데이터를 찾을 수 없습니다."));
                }
            } catch (err) {
                console.error(err);
                alert("통신 중 오류가 발생했습니다.");
            } finally {
                loadBtn.disabled = false;
                loadBtn.textContent = '불러오기';
            }
        };
    }

    // [중요] 사용자가 브라우저 '뒤로가기' 버튼을 눌렀을 때 처리
    window.addEventListener('popstate', (event) => {
        if (modal && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });
}
