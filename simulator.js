// simulator.js
import { state, constants } from './state.js';
import { charData } from './data.js';
import { simCharData } from './sim_data.js?v=20260119';
import { runSimulationCore, collectSimulationConfig } from './simulator-engine.js';
import { calculateBaseStats } from './calculations.js';
import { getCharacterSelectorHtml, getSimulatorLayoutHtml, showDetailedLogModal, renderAxisLabels, renderDamageLineChart, displaySimResult, updateActionEditor } from './simulator-ui.js';
import { getCharacterCommonControls } from './simulator-common.js';
import { showSimpleTooltip } from './ui.js';

export function initSimulator() {
    const simPage = document.getElementById('simulator-page'), mainColumn = document.querySelector('.main-content-column'), contentDisplay = document.getElementById('content-display');
    if (simPage) simPage.style.setProperty('display', 'block', 'important'); if (mainColumn) mainColumn.style.setProperty('display', 'block', 'important');
    if (contentDisplay) { contentDisplay.style.setProperty('display', 'block', 'important'); contentDisplay.classList.add('hero-mode'); }
    const container = document.getElementById('simulator-content'); if (!container) return;
    const savedCharId = localStorage.getItem('sim_last_char_id'); if (savedCharId && charData[savedCharId]?.base) renderSimulatorUI(savedCharId); else renderCharacterSelector();
}

function renderCharacterSelector() {
    localStorage.removeItem('sim_last_char_id');
    
    const container = document.getElementById('simulator-content'), 
          validChars = Object.keys(charData).filter(id => charData[id].base && id !== 'hero' && id !== 'test_dummy');

    // [추가] 마지막 렌더링 기록 초기화 (재진입 시 토스트 트리거용)
    container.removeAttribute('data-last-char-id');

    const disabledIds = constants.disabledSimChars;
    container.innerHTML = getCharacterSelectorHtml(validChars, disabledIds, charData, state.savedStats);
    container.querySelectorAll('.sim-char-pick-item').forEach(item => { 
        if (item.style.pointerEvents !== 'none') item.onclick = () => { 
            const charId = item.dataset.id;
            localStorage.setItem('sim_last_char_id', charId); 
            // [신규] 사용자 클릭 시에만 기록
            history.pushState({ id: 'simulator', subId: charId }, "", window.location.pathname);
            renderSimulatorUI(charId); 
        }; 
    });
}
function renderSimAttributePicker(charId) {
    const container = document.getElementById('sim-attribute-picker-container'); if (!container) return;
    const myAttrIdx = charData[charId]?.info?.속성 ?? 0, currentAttrIdx = parseInt(localStorage.getItem(`sim_last_enemy_attr_${charId}`) || String(myAttrIdx));
    let displayIdxs = new Set([myAttrIdx, currentAttrIdx]); const rels = { 0: [2, 1], 1: [0, 2], 2: [1, 0], 3: [4, 4], 4: [3, 3] };
    if (rels[myAttrIdx]) rels[myAttrIdx].forEach(idx => displayIdxs.add(idx));
    
    let othersHtml = ''; displayIdxs.forEach(idx => {
        if (idx === currentAttrIdx) return;
        const attrName = constants.attributeList[idx]; let gc = '';
        const wins = { 0: 2, 1: 0, 2: 1, 3: 4, 4: 3 }, loses = { 0: 1, 1: 2, 2: 0, 3: 4, 4: 3 };
        if (wins[myAttrIdx] === idx) gc = '#00ff00'; else if (loses[myAttrIdx] === idx) gc = (myAttrIdx <= 2 && idx <= 2) ? '#ff0000' : '#00ff00';
        othersHtml += `<div class="attr-control-item" style="width:24px;height:24px;margin:1px;position:relative;display:flex;align-items:center;justify-content:center;"><img src="${constants.attributeImageMap[attrName]}" class="sim-other-attr-icon" data-idx="${idx}" style="width:20px;height:20px;cursor:pointer;opacity:1;z-index:10;position:relative;">${gc ? `<div style="position:absolute;width:14px;height:14px;background:${gc};box-shadow:0 0 8px ${gc};filter:blur(3px);opacity:0.7;transform:rotate(45deg);z-index:0;pointer-events:none;"></div>` : ''}</div>`;
    });
    const currName = constants.attributeList[currentAttrIdx]; let cgc = ''; if (myAttrIdx >= 0 && currentAttrIdx !== myAttrIdx) { const wins = { 0: 2, 1: 0, 2: 1, 3: 4, 4: 3 }, loses = { 0: 1, 1: 2, 2: 0, 3: 4, 4: 3 }; if (wins[myAttrIdx] === currentAttrIdx) cgc = '#00ff00'; else if (loses[myAttrIdx] === currentAttrIdx) cgc = (myAttrIdx <= 2 && currentAttrIdx <= 2) ? '#ff0000' : '#00ff00'; }
    container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;scale:0.8;"><div style="display:flex;justify-content:center;">${othersHtml}</div><div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;position:relative;">${cgc ? `<div style="position:absolute;width:24px;height:24px;background:${cgc};box-shadow:0 0 12px ${cgc};filter:blur(4px);opacity:0.8;transform:rotate(45deg);z-index:1;pointer-events:none;"></div>` : ''}<img src="${constants.attributeImageMap[currName]}" style="width:32px;height:32px;z-index:2;position:relative;"></div></div>`;
    container.querySelectorAll('.sim-other-attr-icon').forEach(icon => { icon.onclick = () => { localStorage.setItem(`sim_last_enemy_attr_${charId}`, icon.dataset.idx); renderSimAttributePicker(charId); }; });
}

function renderSimulatorUI(charId) {
    const container = document.getElementById('simulator-content'), data = charData[charId], sData = simCharData[charId] || {}, stats = state.savedStats[charId] || {};
    
    container.setAttribute('data-last-char-id', charId);

    const brVal = parseInt(stats.s1||0), brText = (brVal < 5) ? `0성 ${brVal}단계` : (brVal < 15) ? `1성 ${brVal-5}단계` : (brVal < 30) ? `2성 ${brVal-15}단계` : (brVal < 50) ? `3성 ${brVal-30}단계` : (brVal < 75) ? `4성 ${brVal-50}단계` : "5성";
    const hasMulti = data.skills.some(s => s.isMultiTarget || (s.damageDeal && s.damageDeal.some(d => d.isMultiTarget || d.stampIsMultiTarget)));
    const savedTurns = localStorage.getItem('sim_last_turns') || "10", savedIters = localStorage.getItem('sim_last_iters') || "100";
    // [수정] 서포터 1, 2 설정 로드
    const supportKey1 = `sim_last_support_1_${charId}`;
    const supportKey2 = `sim_last_support_2_${charId}`;
    const savedSupport1 = localStorage.getItem(supportKey1) || "none";
    const savedSupport2 = localStorage.getItem(supportKey2) || "none";

    container.innerHTML = getSimulatorLayoutHtml(charId, data, stats, brText, hasMulti, savedTurns, savedIters);

    // [수정] 2개 서포터 슬롯 UI 로직
    const btn1 = document.getElementById('sim-support-1-toggle-btn');
    const btn2 = document.getElementById('sim-support-2-toggle-btn');
    const panel = document.getElementById('sim-support-selector-panel');
    const selectorTitle = document.getElementById('sim-support-selector-title');
    
    // 현재 선택 중인 슬롯 번호 (1 또는 2, 없으면 0)
    let activeSlot = 0;

    const updateSlotDisplay = (slotNum, id) => {
        const iconEl = document.getElementById(`sim-selected-support-${slotNum}-icon`);
        const nameEl = document.getElementById(`sim-selected-support-${slotNum}-name`);
        const info = constants.supportList.find(s => s.id === id) || { name: '선택 안 함', id: 'none' };
        
        nameEl.textContent = info.name;
        if (id === 'none') {
            iconEl.innerHTML = `<span style="font-size:0.8em; color:#888;">${slotNum}</span>`;
            iconEl.style.border = '1px solid #bbb';
            iconEl.style.cursor = 'default';
            iconEl.onclick = null;
        } else {
            iconEl.innerHTML = `<img src="images/${id}.webp" style="width:100%; height:100%; object-fit:cover; object-position:top;" onerror="this.src='icon/main.png'">`;
            iconEl.style.border = '2px solid #6f42c1';
            iconEl.style.cursor = 'pointer';
            iconEl.onclick = (e) => {
                e.stopPropagation();
                window.scrollTo(0, 0);
                localStorage.setItem('sim_last_char_id', id);
                renderSimulatorUI(id);
            };
        }
    };

    const openPanel = (slotNum) => {
        if (activeSlot === slotNum) {
            // 이미 열려있으면 닫기
            panel.style.display = 'none';
            activeSlot = 0;
            btn1.style.background = '#f9f9f9'; btn1.style.borderColor = '#ccc';
            btn2.style.background = '#f9f9f9'; btn2.style.borderColor = '#ccc';
        } else {
            // 열기
            activeSlot = slotNum;
            panel.style.display = 'block';
            selectorTitle.textContent = `${slotNum}순위 서포터 선택`;
            
            // 버튼 스타일 활성화
            if (slotNum === 1) {
                btn1.style.background = '#f3e5f5'; btn1.style.borderColor = '#6f42c1';
                btn2.style.background = '#f9f9f9'; btn2.style.borderColor = '#ccc';
            } else {
                btn1.style.background = '#f9f9f9'; btn1.style.borderColor = '#ccc';
                btn2.style.background = '#f3e5f5'; btn2.style.borderColor = '#6f42c1';
            }
            
            // 현재 선택된 옵션 강조
            const currentId = (slotNum === 1) ? localStorage.getItem(supportKey1) : localStorage.getItem(supportKey2);
            container.querySelectorAll('.sim-support-option').forEach(opt => {
                const isSel = opt.dataset.id === (currentId || 'none');
                opt.querySelector('div, img').style.borderColor = isSel ? '#6f42c1' : '#ddd';
                opt.querySelector('div, img').style.boxShadow = isSel ? '0 0 5px rgba(111, 66, 193, 0.5)' : 'none';
                
                // [중요] 이미 다른 슬롯에 선택된 서포터는 중복 선택 불가 처리 (흐리게)
                const otherId = (slotNum === 1) ? localStorage.getItem(supportKey2) : localStorage.getItem(supportKey1);
                if (opt.dataset.id !== 'none' && opt.dataset.id === otherId) {
                    opt.style.opacity = '0.3';
                    opt.style.pointerEvents = 'none';
                } else {
                    opt.style.opacity = '1';
                    opt.style.pointerEvents = 'auto';
                }
            });
        }
    };

    if (btn1 && btn2 && panel) {
        updateSlotDisplay(1, savedSupport1);
        updateSlotDisplay(2, savedSupport2);

        btn1.onclick = () => openPanel(1);
        btn2.onclick = () => openPanel(2);

        container.querySelectorAll('.sim-support-option').forEach(opt => {
            opt.onclick = () => {
                if (activeSlot === 0) return;
                const newId = opt.dataset.id;
                const key = (activeSlot === 1) ? supportKey1 : supportKey2;
                localStorage.setItem(key, newId);
                
                updateSlotDisplay(activeSlot, newId);
                panel.style.display = 'none';
                
                // 스타일 초기화
                activeSlot = 0;
                btn1.style.background = '#f9f9f9'; btn1.style.borderColor = '#ccc';
                btn2.style.background = '#f9f9f9'; btn2.style.borderColor = '#ccc';
                
                // UI 갱신 (서포터 컨트롤 및 임부언 안내 문구)
                renderSimulatorUI(charId);
            };
        });
    }

    // [복구] 임부언 안내 문구 업데이트 함수
    const updateBossrenNotice = () => {
        const noticeArea = document.getElementById('sim-notice-area');
        if (!noticeArea) return;
        const s1 = localStorage.getItem(supportKey1);
        const s2 = localStorage.getItem(supportKey2);
        if (charId === 'bossren' || s1 === 'bossren' || s2 === 'bossren') {
            noticeArea.innerHTML = "💡 임부언 쿨타임 감소 효과는 직접 행동수정으로 조정해야합니다.";
            noticeArea.style.display = 'block';
        } else {
            noticeArea.style.display = 'none';
        }
    };
    updateBossrenNotice();

    renderSimAttributePicker(charId);
    // 캐릭터 아이콘은 상세 정보 탭으로 이동
    container.querySelector('.sim-char-profile-img').onclick = () => {
        document.querySelector(`.main-image[data-id="${charId}"]`)?.click();
    };
    
    const infoIcon = document.getElementById('sim-info-icon');
    if (infoIcon) { 
        const tooltipText = sData.tooltipDesc || `<div style="text-align: left;">・서포터는 시뮬탭 내부에 지정한 본인의 행동과 설정을 그대로 따라하며 메인 캐릭터가 가진 아군 행동에 영향받는 스킬에는 영향을 주지 않습니다.<br><br> ・아군과 적군은 매턴 보통공격을 사용하며 방어를 사용하지않고 3턴 쿨타임의 필살기를 가졌다고 가정합니다.</div>`;
        infoIcon.onclick = (e) => { 
            e.stopPropagation(); 
            import(`./ui.js?v=${Date.now()}`).then(ui => { 
                const existing = document.querySelector('.buff-tooltip');
                if (existing) existing.remove();

                const control = ui.showSimpleTooltip(infoIcon, tooltipText); 
                const timeoutId = setTimeout(() => control.remove(), 10000);

                const closeOnOutside = () => { 
                    control.remove(); 
                    clearTimeout(timeoutId);
                    document.removeEventListener('click', closeOnOutside); 
                }; 
                setTimeout(() => document.addEventListener('click', closeOnOutside), 50);
            }); 
        };
    }

    const supportId1 = localStorage.getItem(supportKey1) || 'none';
    const supportId2 = localStorage.getItem(supportKey2) || 'none';
    
    const editBtn = document.getElementById('sim-edit-actions-btn');
    
    // [수정] 강제 고정 로직 삭제, 모든 상황에서 버튼 활성화 (기존 스타일 유지)
    if (editBtn) {
        editBtn.disabled = false;
        editBtn.style.pointerEvents = 'auto';
        editBtn.style.opacity = '1';
        editBtn.innerHTML = "⚙️ 행동 수정";
    }

    const sSupportData1 = simCharData[supportId1] || {};
    const sSupportData2 = simCharData[supportId2] || {};
    
    // [수정] 서포터 컨트롤 자동 생성 로직 제거 (사용자가 직접 가서 설정하게 함)
    const combinedControls = [
        ...(sData.customControls || []),
        ...getCharacterCommonControls(sData.commonControls)
    ];

    if (combinedControls.length > 0) {
        const wrapper = document.getElementById('sim-custom-controls'), list = document.getElementById('sim-custom-list');
        wrapper.style.display = 'block'; list.innerHTML = '';
        combinedControls.forEach(ctrl => {
            const storageKey = `sim_ctrl_${charId}_${ctrl.id}`;
            const savedVal = localStorage.getItem(storageKey);
            const isSpecialToggle = ['self_extra_dmg_active', 'self_buff_mode', 'self_sleep_active', 'pos3_fixed'].includes(ctrl.id);
            const bgColor = isSpecialToggle ? '#f9f5ff' : '#f8f9fa';
            const borderColor = isSpecialToggle ? '#e9e0f9' : '#eee';

            const item = document.createElement('div'); item.style.cssText = `display:flex; flex-direction:column; align-items:center; justify-content:center; background:${bgColor}; padding:8px 5px; border-radius:8px; border:1px solid ${borderColor}; flex: 0 0 calc(33.33% - 10px); min-width:80px; box-sizing:border-box;`;
            item.innerHTML = `<span style="font-size:0.6em; color:#888; font-weight:bold; margin-bottom:4px; text-align:center; width:100%;" title="${ctrl.description || ''}">${ctrl.label}</span>`;
            const ctrlEl = document.createElement('div');
            
            if (ctrl.type === 'input') { 
                const input = document.createElement('input'); 
                input.type = 'number'; 
                input.value = (savedVal !== null) ? parseInt(savedVal) : ctrl.initial; 
                input.style.cssText = `width:45px; padding:3px; border:1px solid #6f42c1; border-radius:4px; text-align:center; font-weight:bold; outline:none; font-size:0.8em;`; 
                // [수정] onchange -> oninput 변경 (실시간 저장)
                input.oninput = () => localStorage.setItem(storageKey, input.value); 
                ctrlEl.appendChild(input); 

                if (ctrl.hasAuto) {
                    const isMobile = window.innerWidth <= 600;
                    const autoLabel = document.createElement('label');
                    // 모바일일 때만 zoom 0.7 적용
                    const zoomStyle = isMobile ? 'zoom: 0.7;' : 'zoom: 1;';
                    autoLabel.style.cssText = `font-size:12px; color:#666; margin-left:4px; display:flex; align-items:center; gap:0px; cursor:pointer; font-weight:bold; white-space:nowrap; letter-spacing:-0.5px; ${zoomStyle}`;
                    const autoCheck = document.createElement('input');
                    autoCheck.type = 'checkbox';
                    autoCheck.style.margin = '0';
                    const autoKey = `sim_ctrl_${charId}_${ctrl.autoId}`;
                    const isAutoChecked = (localStorage.getItem(autoKey) === 'true');
                    autoCheck.checked = isAutoChecked;
                    
                    // 초기 상태 설정
                    if (isAutoChecked) {
                        input.disabled = true;
                        input.style.backgroundColor = '#e9ecef';
                        input.style.color = '#adb5bd';
                    }

                    autoCheck.onchange = (e) => {
                        const checked = e.target.checked;
                        localStorage.setItem(autoKey, checked);
                        input.disabled = checked;
                        input.style.backgroundColor = checked ? '#e9ecef' : '#ffffff';
                        input.style.color = checked ? '#adb5bd' : '#000000';
                    };
                    autoLabel.appendChild(autoCheck);
                    autoLabel.appendChild(document.createTextNode('자동'));
                    ctrlEl.appendChild(autoLabel);
                    ctrlEl.style.display = 'flex';
                    ctrlEl.style.alignItems = 'center';
                    ctrlEl.style.justifyContent = 'center';
                }
            }
            else if (ctrl.type === 'toggle') { 
                const check = document.createElement('input'); 
                check.type = 'checkbox'; 
                check.checked = (savedVal === 'true' || (savedVal === null && ctrl.initial === true)); 
                check.onchange = (e) => localStorage.setItem(storageKey, e.target.checked); 
                ctrlEl.appendChild(check); 
            }
            else { 
                const btn = document.createElement('button'); 
                btn.style.cssText = `background:#fff; border:1px solid #6f42c1; color:#6f42c1; font-weight:bold; font-size:0.85em; padding:3px 10px; border-radius:20px; cursor:pointer; min-width:35px;`; 
                btn.textContent = (savedVal !== null) ? parseInt(savedVal) : ctrl.initial; 
                btn.onclick = () => { 
                    let next = parseInt(btn.textContent) + 1; 
                    if (next > ctrl.max) next = ctrl.min; 
                    btn.textContent = next; 
                    localStorage.setItem(storageKey, next); 
                }; 
                ctrlEl.appendChild(btn); 
            }
            item.appendChild(ctrlEl); list.appendChild(item);
        });
    }

    const savedRes = localStorage.getItem(`sim_last_result_${charId}`); 
    if (savedRes) { 
        try { 
            const res = JSON.parse(savedRes); 
            document.getElementById('simulation-result-area').style.display='block'; 
            document.getElementById('sim-empty-msg').style.display='none'; 
            document.getElementById('sim-min-dmg').innerText = res.p05 || res.min; 
            document.getElementById('sim-avg-dmg').innerText = res.avg; 
            document.getElementById('sim-max-dmg').innerText = res.p95 || res.max; 
            
            // [수정] 오차 수치 복구
            const avgNum = parseFloat(res.avg.replace(/,/g, ''));
            const p05Num = parseFloat((res.p05 || res.min).replace(/,/g, ''));
            const p95Num = parseFloat((res.p95 || res.max).replace(/,/g, ''));
            const minDiffEl = document.getElementById('sim-min-diff');
            const maxDiffEl = document.getElementById('sim-max-diff');

            if (avgNum > 0) {
                const minDiff = Math.floor(p05Num - avgNum);
                const maxDiff = Math.floor(p95Num - avgNum);
                const minPercent = ((minDiff / avgNum) * 100).toFixed(1);
                const maxPercent = ((maxDiff / avgNum) * 100).toFixed(1);
                
                const minDiffK = (minDiff / 1000).toFixed(0);
                const maxDiffK = (maxDiff / 1000).toFixed(0);
                
                minDiffEl.innerText = `${Number(minDiffK).toLocaleString()}K (${minPercent}%)`;
                maxDiffEl.innerText = `+${Number(maxDiffK).toLocaleString()}K (+${maxPercent}%)`;
                minDiffEl.style.visibility = 'visible';
                maxDiffEl.style.visibility = 'visible';
            }

            // [수정] 새로운 표시 함수 호출
            displaySimResult(charId, res, 'avg', { renderActionButtons });
            
            // [수정] 그래프 막대 복구 (분포도용 메타데이터 사용)
            const distGraph = document.getElementById('sim-dist-graph');
            if (distGraph && res.graphData) {
                distGraph.innerHTML = res.graphData.map(b => `<div class="bar-grow-item" style="flex:1; height:${b.h}%; background:${b.isAvg ? '#6f42c1' : '#e0e0e0'};"></div>`).join('');
            }
            // [수정] 화면 너비에 맞는 높이 계산하여 축 라벨 복구
            const screenWidth = window.innerWidth;
            const drawHeight = screenWidth >= 1100 ? 320 : (screenWidth <= 600 ? 150 : 220);
            renderAxisLabels(res.axisData, res.yMax, 'dist', drawHeight); 
        } catch(e) { console.error('결과 복구 실패:', e); } 
    }
    document.getElementById('sim-turns').oninput = (e) => { document.getElementById('sim-turns-val').innerText = e.target.value; localStorage.setItem('sim_last_turns', e.target.value); updateActionEditor(charId); };
    document.getElementById('sim-iterations').oninput = (e) => { 
        const steps = [30, 100, 300, 500, 750, 1000];
        let val = parseInt(e.target.value);
        // 가장 가까운 단계값 찾기
        const closest = steps.reduce((prev, curr) => {
            return (Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
        });
        e.target.value = closest;
        document.getElementById('sim-iterations-val').innerText = closest;
        localStorage.setItem('sim_last_iters', closest); 
    };
    
    // 상단 버튼은 캐릭터 선택창으로 이동
    document.getElementById('sim-back-to-list').onclick = () => {
        // [수정] 목록으로 돌아갈 때 히스토리 스택을 재구성하여 
        // 시뮬 목록에서 뒤로가기 시 무조건 메인 메뉴(랜딩 페이지)로 가게 함
        localStorage.removeItem('sim_last_char_id');
        history.replaceState({ id: 'main' }, "", window.location.pathname);
        history.pushState({ id: 'simulator', subId: 'list' }, "", window.location.pathname);
        initSimulator();
    };
    if (hasMulti) document.getElementById('sim-target-btn').onclick = (e) => { 
        let c = (parseInt(e.target.innerText)%5)+1; 
        e.target.innerText=c; 
        localStorage.setItem(`sim_last_target_${charId}`,c); 
    };
    document.getElementById('sim-edit-actions-btn').onclick = () => { const ed = document.getElementById('sim-action-editor'); ed.style.display = ed.style.display==='block' ? 'none' : 'block'; if(ed.style.display==='block') updateActionEditor(charId); };
    document.getElementById('sim-reset-pattern-btn').onclick = () => { 
        if (confirm('패턴을 초기화하시겠습니까?')) { 
            localStorage.removeItem(`sim_pattern_${charId}`); 
            updateActionEditor(charId); 
            // [추가] 초기화 시 버튼 스타일도 즉시 복구
            const editBtn = document.getElementById('sim-edit-actions-btn');
            if (editBtn) {
                editBtn.style.background = '#f0f0f0';
                editBtn.style.borderColor = '#ccc';
                editBtn.style.color = '#666';
                editBtn.style.fontWeight = 'normal';
            }
        } 
    };
    document.getElementById('run-simulation-btn').onclick = () => runSimulation(charId);

    // [추가] 분포도 / 딜 그래프 전환 버튼 이벤트 연결
    const btnDist = document.getElementById('btn-show-dist');
    const btnDmg = document.getElementById('btn-show-dmg');
    const distGraph = document.getElementById('sim-dist-graph');
    const lineGraph = document.getElementById('sim-line-graph');

    if (btnDist && btnDmg) {
        btnDist.onclick = () => {
            btnDist.style.background = '#6f42c1'; btnDist.style.color = 'white';
            btnDmg.style.background = '#f0f0f0'; btnDmg.style.color = '#666';
            if (distGraph) distGraph.style.display = 'flex';
            if (lineGraph) lineGraph.style.display = 'none';
            
            // [추가] 분포도로 돌아갈 때 저장된 최신 결과로 축 라벨 및 예측 구간 갱신
            const lastRes = JSON.parse(localStorage.getItem(`sim_last_result_${charId}`));
            if (lastRes) {
                // [수정] 현재 화면 너비에 맞는 높이 재계산
                const screenWidth = window.innerWidth;
                const drawHeight = screenWidth >= 1100 ? 320 : (screenWidth <= 600 ? 150 : 220);
                if (lastRes.axisData) renderAxisLabels(lastRes.axisData, lastRes.yMax, 'dist', drawHeight);
                // 예측 구간 다시 보이기
                const predictionZone = document.getElementById('sim-prediction-zone');
                const predictionLabel = document.getElementById('sim-prediction-label');
                if (predictionZone && predictionLabel && lastRes.p05 && lastRes.p95) {
                    predictionZone.style.display = 'block';
                    predictionLabel.style.display = 'block';
                }
            }
        };
        btnDmg.onclick = () => {
            btnDmg.style.background = '#6f42c1'; btnDmg.style.color = 'white';
            btnDist.style.background = '#f0f0f0'; btnDist.style.color = '#666';
            if (distGraph) distGraph.style.display = 'none';
            // [추가] 딜 그래프에서는 예측 구간 숨기기
            const predictionZone = document.getElementById('sim-prediction-zone');
            const predictionLabel = document.getElementById('sim-prediction-label');
            if (predictionZone) predictionZone.style.display = 'none';
            if (predictionLabel) predictionLabel.style.display = 'none';
            
            if (lineGraph) { 
                lineGraph.style.display = 'block'; 
                renderDamageLineChart(charId); 
            }
        };
    }
}

function runSimulation(rawCharId) {
    const charId = rawCharId ? rawCharId.trim() : ""; // [!] ID 공백 제거
    const runBtn = document.getElementById('run-simulation-btn');
    if (!runBtn || !charId) return;

    // [수정] 분석 시작 전 로컬스토리지 동기화
    try {
        const stored = localStorage.getItem('dyst_stats');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed[charId]) {
                state.savedStats[charId] = parsed[charId];
            }
        }
    } catch (e) {
        console.error("스탯 동기화 실패", e);
    }

    // 로딩 상태 표시
    const originalText = runBtn.innerHTML;
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner"></span> 분석 중...';

    // 브라우저가 스피너를 렌더링할 시간을 준 뒤 계산 시작
    setTimeout(() => {
        const data = charData[charId];
        const sData = simCharData[charId] || {}; // 이제 공백이 제거된 ID로 정확히 찾음
        const stats = state.savedStats[charId] || {};
        
        // [수정] 데이터 수집 로직 통합 함수 사용
        const config = collectSimulationConfig(charId, charData, simCharData);

        const result = runSimulationCore({ 
            charId, 
            charData: data, 
            sData, 
            stats, 
            ...config,
            defaultGrowthRate: constants.defaultGrowth 
        });
        
        localStorage.setItem(`sim_last_result_${charId}`, JSON.stringify(result));
        
        // [추가] 분석 시작 시 기존 그래프 및 버튼 상태를 '분포도' 기준으로 리셋
        const btnDist = document.getElementById('btn-show-dist');
        const btnDmg = document.getElementById('btn-show-dmg');
        if (btnDist && btnDmg) {
            btnDist.style.background = '#6f42c1'; btnDist.style.color = 'white';
            btnDmg.style.background = '#f0f0f0'; btnDmg.style.color = '#666';
        }
        const distGraph = document.getElementById('sim-dist-graph'); 
        const lineGraph = document.getElementById('sim-line-graph');
        if (distGraph) distGraph.style.display = 'flex';
        if (lineGraph) lineGraph.style.display = 'none';

        document.getElementById('simulation-result-area').style.display = 'block';
        document.getElementById('sim-min-dmg').innerText = result.p05; 
        document.getElementById('sim-avg-dmg').innerText = result.avg; 
        document.getElementById('sim-max-dmg').innerText = result.p95; 
        
        // [수정] 카드별 오차 퍼센트 계산 및 표시
        const avgNum = parseFloat(result.avg.replace(/,/g, '')) || 0;
        const p05Num = parseFloat(result.p05.replace(/,/g, '')) || 0;
        const p95Num = parseFloat(result.p95.replace(/,/g, '')) || 0;
        
        const minDiffEl = document.getElementById('sim-min-diff');
        const maxDiffEl = document.getElementById('sim-max-diff');
        
        if (avgNum > 0) {
            const minDiff = Math.floor(p05Num - avgNum);
            const maxDiff = Math.floor(p95Num - avgNum);
            const minPercent = ((minDiff / avgNum) * 100).toFixed(1);
            const maxPercent = ((maxDiff / avgNum) * 100).toFixed(1);
            
            const minDiffK = (minDiff / 1000).toFixed(0);
            const maxDiffK = (maxDiff / 1000).toFixed(0);
            
            minDiffEl.innerText = `${Number(minDiffK).toLocaleString()}K (${minPercent}%)`;
            maxDiffEl.innerText = `+${Number(maxDiffK).toLocaleString()}K (+${maxPercent}%)`;
        } else {
            minDiffEl.innerText = `0 (0.0%)`;
            maxDiffEl.innerText = `+0 (+0.0%)`;
        }            
        minDiffEl.style.visibility = 'visible';
        maxDiffEl.style.visibility = 'visible';
        
        displaySimResult(charId, result, 'avg', { renderActionButtons });
        
        document.getElementById('sim-empty-msg').style.display = 'none';
        
        distGraph.innerHTML = result.graphData.map(b => `<div class="bar-grow-item" style="flex:1; height:${b.h}%; background:${b.isAvg ? '#6f42c1' : '#e0e0e0'};"></div>`).join('');
        
        // [수정] 새 분석 결과에 맞는 높이 계산하여 축 라벨 렌더링
        const screenWidth = window.innerWidth;
        const drawHeight = screenWidth >= 1100 ? 320 : (screenWidth <= 600 ? 150 : 220);
        renderAxisLabels(result.axisData, result.yMax, 'dist', drawHeight);

        // [추가] 예측 구간 배경 및 라벨 렌더링 (분석 직후)
        const predictionZone = document.getElementById('sim-prediction-zone');
        const predictionLabel = document.getElementById('sim-prediction-label');
        if (predictionZone && predictionLabel && result.p05 && result.p95) {
            const minVal = parseFloat(result.min.replace(/,/g, ''));
            const maxVal = parseFloat(result.max.replace(/,/g, ''));
            const p05Val = parseFloat(result.p05.replace(/,/g, ''));
            const p95Val = parseFloat(result.p95.replace(/,/g, ''));
            const range = maxVal - minVal;

            if (range > 0) {
                const leftPercent = ((p05Val - minVal) / range) * 100;
                const widthPercent = ((p95Val - p05Val) / range) * 100;
                predictionZone.style.left = `${leftPercent}%`;
                predictionZone.style.width = `${widthPercent}%`;
                predictionLabel.style.left = `${leftPercent + 1}%`;
                predictionZone.style.display = 'block';
                predictionLabel.style.display = 'block';
            } else {
                predictionZone.style.display = 'none';
                predictionLabel.style.display = 'none';
            }
        }

        // [추가] 로딩 상태 해제
        runBtn.disabled = false;
        runBtn.innerHTML = originalText;
    }, 10);
}

function renderActionButtons(charId, result, stats) {
    const actionsArea = document.getElementById('sim-result-actions'); if (!actionsArea) return;
    actionsArea.innerHTML = ''; actionsArea.style.cssText = 'display: flex; gap: 8px; margin-top: 10px;';
    
    const addBtn = document.createElement('button'); addBtn.innerHTML = '<span style="font-size:1.1em; margin-right:3px;">+</span> 비교탭 추가'; addBtn.className = 'sim-action-btn-main';
    addBtn.style.cssText = 'flex: 1; padding: 12px; background: #6f42c1; color: white; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 0.85em;';
    addBtn.onclick = () => {
        const recs = []; let lastT = 0;
        result.closestLogs.forEach(log => {
            // 새 구분선에서 턴 번호 추출 (data-turn="N")
            const m = log.match(/data-turn="(\d+)"/); 
            if (m && parseInt(m[1]) > lastT) { 
                recs.push({ isTurnSeparator: true, turnNumber: (lastT = parseInt(m[1])) }); 
                return; // 구분선 자체는 데미지 레코드가 아니므로 건너뜀
            }

            // [수정] HTML 태그 제거 후 텍스트 기반으로 정확하게 파싱
            const text = log.replace(/<[^>]*>?/gm, '');
            const typeM = text.match(/\[(.*?)\]/), 
                  nameM = text.match(/\]\s+(.*?):\s*\+/), 
                  dmgM = text.match(/\+([\d,]+)/);

            if (dmgM) {
                recs.push({ 
                    name: (nameM ? nameM[1].trim() : "스킬").replace(/\[전의:\d+\]/g, ""), 
                    damage: dmgM[1], 
                    type: (typeM ? typeM[1] : "기타"), 
                    count: 1, 
                    isTurnSeparator: false 
                });
            } else if (text.includes('[방어]')) {
                recs.push({ name: "방어", damage: "0", type: "방어", count: 1, isTurnSeparator: false });
            }
        });
        
        // [수정] 서포터 2명 정보 저장
        const supportId1 = localStorage.getItem(`sim_last_support_1_${charId}`) || 'none';
        const supportId2 = localStorage.getItem(`sim_last_support_2_${charId}`) || 'none';
        
        state.comparisonSnapshots.push({ 
            id: Date.now(), 
            charId, 
            supportId: supportId1, // 구형 호환성 (메인 서포터)
            supportIds: [supportId1, supportId2], // 신규 배열 구조
            timestamp: new Date().toISOString(), 
            totalDamage: result.closestTotal, 
            records: recs, 
            stats: { lv: stats.lv || 1, s1: parseInt(stats.s1 || 0), s2: parseInt(stats.s2 || 0) } 
        });
        import('./storage.js').then(mod => mod.saveSnapshots(state.comparisonSnapshots));
        addBtn.innerHTML = '✓ 추가됨'; addBtn.style.background = '#28a745'; setTimeout(() => { addBtn.innerHTML = '+ 비교탭 추가'; addBtn.style.background = '#6f42c1'; }, 2000);
    };

    const detailBtn = document.createElement('button'); detailBtn.innerHTML = '🔍 상세 로그 분석';
    detailBtn.style.cssText = 'flex: 1; padding: 12px; background: #fff; border: 1px solid #6f42c1; color: #6f42c1; border-radius: 10px; font-size: 0.85em; font-weight: bold; cursor: pointer;';
    detailBtn.onclick = () => showDetailedLogModal(result);
    
    actionsArea.appendChild(addBtn); actionsArea.appendChild(detailBtn);
}
