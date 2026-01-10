// simulator.js
import { state, constants } from './state.js';
import { charData } from './data.js';
import { simCharData } from './sim_data.js';
import { runSimulationCore } from './simulator-engine.js';
import { calculateBaseStats } from './calculations.js';
import { getCharacterSelectorHtml, getSimulatorLayoutHtml, showDetailedLogModal } from './simulator-ui.js';
import { getCharacterCommonControls } from './simulator-common.js';
import { showSimpleTooltip } from './ui.js';

/**
 * 행동 패턴 에디터 업데이트
 */
function updateActionEditor(charId) {
    const turnsSelect = document.getElementById('sim-turns'), listContainer = document.getElementById('sim-action-list');
    if (!turnsSelect || !listContainer) return;
    const turns = parseInt(turnsSelect.value), data = charData[charId];
    let pattern = []; try { pattern = JSON.parse(localStorage.getItem(`sim_pattern_${charId}`)) || []; } catch(e) {}
    listContainer.innerHTML = '';
    const CD = (() => { const m = data.skills[1].desc?.match(/\(쿨타임\s*:\s*(\d+)턴\)/); return m ? parseInt(m[1]) : 3; })();
    
    const actions = [
        { id: 'normal', label: '보통', activeStyle: 'background:#e8f5e9; color:#2e7d32; border-color:#a5d6a7;' },
        { id: 'defend', label: '방어', activeStyle: 'background:#e3f2fd; color:#1565c0; border-color:#90caf9;' },
        { id: 'ult', label: '필살', activeStyle: 'background:#ffebee; color:#c62828; border-color:#ef9a9a;' }
    ];

    for (let t = 1; t <= turns; t++) {
        const currentAction = pattern[t-1] || (t > 1 && (t - 1) % CD === 0 ? 'ult' : 'normal');
        const row = document.createElement('div'); 
        row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #eee;';
        
        let html = `<span style="font-size:0.75em; font-weight:bold; min-width:30px; color:#888;">${t}턴</span>`;
        html += `<div style="display:flex; flex:1; gap:4px;">`;
        
        actions.forEach(act => {
            const isActive = currentAction === act.id;
            const style = isActive ? act.activeStyle : 'background:#f5f5f5; color:#bbb; border-color:#ddd;';
            html += `<button class="sim-action-btn" data-turn="${t-1}" data-value="${act.id}" style="flex:1; font-size:0.75em; padding:6px 0; border-radius:6px; border:1px solid; font-weight:bold; cursor:pointer; transition:all 0.1s; ${style}">${act.label}</button>`;
        });
        
        html += `</div>`;
        row.innerHTML = html;
        listContainer.appendChild(row);
    }

    // 클릭 이벤트 리스너
    listContainer.querySelectorAll('.sim-action-btn').forEach(btn => {
        btn.onclick = (e) => {
            const turnIdx = parseInt(btn.dataset.turn);
            const newValue = btn.dataset.value;
            
            // 패턴 업데이트 및 저장
            const currentPattern = Array.from({ length: turns }, (_, i) => {
                const activeBtn = listContainer.querySelector(`.sim-action-btn[data-turn="${i}"][style*="background: rgb"]`) || 
                                 listContainer.querySelector(`.sim-action-btn[data-turn="${i}"][style*="background:#"]`);
                // 버튼 스타일로 체크하는 것보다 현재 클릭한 버튼을 반영한 새 배열을 만드는게 안전
                let p = JSON.parse(localStorage.getItem(`sim_pattern_${charId}`)) || [];
                // 만약 빈 배열이면 기본값들로 채워줘야함
                if (p.length === 0) {
                    for(let k=0; k<turns; k++) p[k] = (k > 0 && k % CD === 0) ? 'ult' : 'normal';
                }
                p[turnIdx] = newValue;
                return p;
            })[0]; // 로직상 첫번째 실행에서 완성됨

            localStorage.setItem(`sim_pattern_${charId}`, JSON.stringify(currentPattern));
            
            // UI 즉시 갱신 (해당 턴의 버튼들만 다시 그리기)
            const siblingBtns = btn.parentElement.querySelectorAll('.sim-action-btn');
            siblingBtns.forEach(sBtn => {
                const act = actions.find(a => a.id === sBtn.dataset.value);
                const isActive = sBtn === btn;
                sBtn.style.cssText = `flex:1; font-size:0.75em; padding:6px 0; border-radius:6px; border:1px solid; font-weight:bold; cursor:pointer; transition:all 0.1s; ${isActive ? act.activeStyle : 'background:#f5f5f5; color:#bbb; border-color:#ddd;'}`;
            });
        };
    });
}

/**
 * 시각화 로직 (유지)
 */
function renderAxisLabels(axisData, yMax, type = 'dist', drawHeight = 220) {
    const yAxis = document.getElementById('sim-y-axis'), xAxis = document.getElementById('sim-x-axis'), grid = document.getElementById('sim-grid-lines');
    if (yAxis && yMax) {
        yAxis.innerHTML = type === 'dist' ? axisData.y.map(val => { const label = val >= 10000 ? (val/1000).toFixed(0)+'K' : val.toLocaleString(); const bp = (val / yMax) * 100; return `<div style="position:absolute;bottom:${bp}%;right:8px;transform:translateY(50%);white-space:nowrap;">${label}</div>`; }).join('') : '';
        if (grid) grid.innerHTML = axisData.y.map(val => val === 0 ? '' : `<div style="position:absolute;bottom:${(val/yMax)*100}%;width:100%;border-top:1px dashed #e0e0e0;"></div>`).join('');
    }
    if (xAxis) {
        xAxis.innerHTML = axisData.x.map(val => `<div style="position:absolute;left:${val.pos}%;top:0;width:0;overflow:visible;"><div style="width:1px;height:6px;background:#ddd;position:absolute;top:0;left:0;"><div style="position:absolute;bottom:6px;left:0;width:1px;height:${drawHeight}px;border-left:1px dashed #ccc;pointer-events:none;"></div></div><div style="transform:rotate(-60deg);transform-origin:right top;font-size:0.55em;color:#999;white-space:nowrap;margin-top:10px;text-align:right;width:100px;position:absolute;right:0;">${val.label}</div></div>`).join('');
    }
}

/**
 * 시뮬레이션 결과 데이터를 특정 타입(min, avg, max)에 맞춰 UI에 렌더링함
 */
function displaySimResult(charId, fullResult, type = 'avg') {
    // [추가] 구버전 데이터 호환성 처리
    if (!fullResult.results) {
        fullResult.results = {
            avg: {
                logs: fullResult.closestLogs || [],
                total: fullResult.closestTotal || 0,
                detailedLogs: fullResult.closestDetailedLogs || [],
                stateLogs: fullResult.closestStateLogs || [],
                turnInfoLogs: fullResult.closestTurnInfoLogs || [],
                perTurnDmg: fullResult.turnData || []
            }
        };
        fullResult.results.min = fullResult.results.avg;
        fullResult.results.max = fullResult.results.avg;
    }

    const res = fullResult.results[type];
    const stats = state.savedStats[charId] || {};
    
    // 1. 요약 정보 업데이트 (활성화 표시 포함)
    const boxes = {
        min: document.getElementById('sim-min-dmg').parentElement,
        avg: document.getElementById('sim-avg-dmg').parentElement,
        max: document.getElementById('sim-max-dmg').parentElement
    };
    
    Object.keys(boxes).forEach(key => {
        const isTarget = (key === type);
        const box = boxes[key];
        const label = box.querySelector('div:first-child');
        const value = box.querySelector('div:last-child');

        if (isTarget) {
            box.style.background = '#6f42c1';
            box.style.boxShadow = '0 4px 10px rgba(111, 66, 193, 0.2)';
            box.style.opacity = '1';
            if (label) {
                label.style.color = 'rgba(255,255,255,0.9)';
                label.style.fontWeight = 'bold';
            }
            if (value) {
                value.style.color = 'white';
                value.style.fontSize = '1.1em';
                value.style.fontWeight = '900';
            }
        } else {
            box.style.background = '#f8f9fa';
            box.style.boxShadow = 'none';
            box.style.opacity = '0.7';
            if (label) {
                label.style.color = '#888';
                label.style.fontWeight = 'normal';
            }
            if (value) {
                value.style.color = '#333';
                value.style.fontSize = '0.9em';
                value.style.fontWeight = 'bold';
            }
        }
        
        // [추가] 카드 텍스트가 항상 P05, P95를 유지하도록 강제 갱신
        if (key === 'min' && fullResult.p05) value.innerText = fullResult.p05;
        if (key === 'max' && fullResult.p95) value.innerText = fullResult.p95;

        box.style.border = 'none';
        box.style.cursor = 'pointer';
        box.style.transition = 'all 0.2s';
        box.onclick = () => displaySimResult(charId, fullResult, key);
    });

    // 2. 로그 업데이트
    document.getElementById('sim-log').innerHTML = res.logs.join('');
    const totalHeader = document.getElementById('sim-total-dmg-header');
    if (totalHeader) totalHeader.innerText = `: ${res.total.toLocaleString()}`;

    // 3. 버튼 및 상세 데이터 갱신 (비교탭 추가 등)
    // simulator-engine.js에서 반환한 최상위 메타데이터와 현재 선택된 세부 데이터를 병합하여 전달
    const mergedResult = {
        ...fullResult,
        selectedType: type, // 현재 선택된 타입(min, avg, max) 추가
        closestTotal: res.total,
        closestLogs: res.logs,
        closestDetailedLogs: res.detailedLogs,
        closestStateLogs: res.stateLogs,
        closestTurnInfoLogs: res.turnInfoLogs,
        turnData: res.perTurnDmg
    };
    
    renderActionButtons(charId, mergedResult, stats);

    // 4. 그래프 막대 강조 업데이트 (분포도 기준)
    const distGraph = document.getElementById('sim-dist-graph');
    if (distGraph && fullResult.graphData) {
        const minVal = parseFloat(fullResult.min.replace(/,/g, ''));
        const maxVal = parseFloat(fullResult.max.replace(/,/g, ''));
        const currentVal = res.total;
        const range = maxVal - minVal;
        const binCount = distGraph.children.length;
        
        // 현재 데미지가 속한 막대 인덱스 계산
        let targetIdx = (range === 0) ? Math.floor(binCount / 2) : Math.floor(((currentVal - minVal) / range) * (binCount - 1));
        targetIdx = Math.max(0, Math.min(binCount - 1, targetIdx));

        Array.from(distGraph.children).forEach((bar, idx) => {
            bar.style.background = (idx === targetIdx) ? '#6f42c1' : '#e0e0e0';
        });

        // [추가] 예측 구간 배경 및 라벨 렌더링
        const predictionZone = document.getElementById('sim-prediction-zone');
        const predictionLabel = document.getElementById('sim-prediction-label');
        
        if (predictionZone && predictionLabel && fullResult.p05 && fullResult.p95) {
            const minVal = parseFloat(fullResult.min.replace(/,/g, ''));
            const maxVal = parseFloat(fullResult.max.replace(/,/g, ''));
            const p05Val = parseFloat(fullResult.p05.replace(/,/g, ''));
            const p95Val = parseFloat(fullResult.p95.replace(/,/g, ''));
            const range = maxVal - minVal;

            if (range > 0) {
                const leftPercent = ((p05Val - minVal) / range) * 100;
                const widthPercent = ((p95Val - p05Val) / range) * 100;
                
                predictionZone.style.left = `${leftPercent}%`;
                predictionZone.style.width = `${widthPercent}%`;
                predictionLabel.style.left = `${leftPercent + 1}%`; // 배경 안쪽으로 살짝 이동
                
                // [수정] 분포도 그래프가 보일 때만 예측 구간을 노출함
                const isDistVisible = (distGraph && distGraph.style.display !== 'none');
                predictionZone.style.display = isDistVisible ? 'block' : 'none';
                predictionLabel.style.display = isDistVisible ? 'block' : 'none';
            } else {
                predictionZone.style.display = 'none';
                predictionLabel.style.display = 'none';
            }
        }
    }

    // 5. 딜 그래프 업데이트 (현재 보고 있는 타입이 딜 그래프일 경우에만)
    if (document.getElementById('sim-line-graph').style.display !== 'none') {
        renderDamageLineChart(charId, mergedResult);
    }
}

// 기존 renderDamageLineChart 함수 수정 (결과 데이터를 인자로 받도록)
export function renderDamageLineChart(charId, specificResult = null) {
    const container = document.getElementById('sim-line-graph');
    let res = specificResult;
    
    if (!res) {
        const full = JSON.parse(localStorage.getItem(`sim_last_result_${charId}`));
        if (!full) return;
        // 저장된 결과가 이전 방식이면 호환성을 위해 처리, 아니면 현재 선택된 세부 데이터 찾기
        res = full.results ? full.results.avg : full; 
    }
    
    const turnData = res.turnData || res.perTurnDmg, maxCum = Math.max(...turnData.map(d => d.cumulative)), maxTrn = Math.max(...turnData.map(d => d.dmg)), turnCount = turnData.length;
    
    // [추가] 최대 데미지 턴 인덱스 찾기
    let maxDmgIdx = -1;
    let maxDmgVal = -1;
    turnData.forEach((d, i) => {
        if (d.dmg > maxDmgVal) {
            maxDmgVal = d.dmg;
            maxDmgIdx = i;
        }
    });

    // [수정] 화면 너비에 따라 내부 그리기 높이 및 너비 동기화 (글자 왜곡 방지)
    const screenWidth = window.innerWidth;
    const drawWidth = container.clientWidth || 400; 
    const drawHeight = screenWidth >= 1100 ? 320 : (screenWidth <= 600 ? 150 : 220);

    let html = `<svg width="100%" height="100%" viewBox="0 0 ${drawWidth} ${drawHeight}" preserveAspectRatio="none" style="overflow:visible;"><defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6f42c1" stop-opacity="0.3"/><stop offset="100%" stop-color="#6f42c1" stop-opacity="0"/></linearGradient></defs>`;
    
    // [수정] 모든 좌표 계산에 drawWidth, drawHeight 적용
    let areaPath = `M 0,${drawHeight} `; 
    turnData.forEach((d, i) => { 
        const x = turnCount > 1 ? (i / (turnCount - 1)) * drawWidth : 0; 
        const y = maxCum > 0 ? drawHeight - (d.cumulative / maxCum) * drawHeight : drawHeight; 
        areaPath += `L ${x},${y} `; 
    }); 
    areaPath += `L ${turnCount > 1 ? drawWidth : 0},${drawHeight} Z`; 
    html += `<path class="svg-bar-grow" d="${areaPath}" fill="url(#areaGrad)" style="pointer-events:none;" />`;
    
    let pts = ""; 
    turnData.forEach((d, i) => { 
        const x = turnCount > 1 ? (i / (turnCount - 1)) * drawWidth : 0; 
        const y = maxCum > 0 ? drawHeight - (d.cumulative / maxCum) * drawHeight : drawHeight; 
        pts += (i === 0 ? "M " : "L ") + `${x},${y} `; 
    }); 
    html += `<path class="svg-bar-grow" d="${pts}" fill="none" stroke="#6f42c1" stroke-width="3" stroke-opacity="0.5" style="pointer-events:none;" />`;

    // [수정] 막대 높이 계산도 drawHeight 기준
    turnData.forEach((d, i) => { 
        const x = turnCount > 1 ? (i / (turnCount - 1)) * drawWidth : 0; 
        const h = maxTrn > 0 ? (d.dmg / maxTrn) * (drawHeight * 0.5) : 0; 
        const isMax = (i === maxDmgIdx);
        const color = isMax ? '#6f42c1' : '#e0e0e0';
        
        // 1) 시각용 얇은 막대
        html += `<rect x="${x-3}" y="${drawHeight-h}" width="6" height="${h}" fill="${color}" rx="2" style="pointer-events:none;" />`;
        
        // 2) 클릭용 투명 넓은 막대
        html += `<rect class="svg-bar-grow sim-dmg-bar" x="${x-5}" y="${drawHeight-h}" width="10" height="${h}" fill="transparent" data-dmg="${d.dmg}" data-turn="${i+1}" style="pointer-events:all;" />`; 
        
        if (isMax) {
            const labelVal = d.dmg >= 1000 ? (d.dmg/1000).toFixed(0)+'K' : d.dmg;
            html += `<text x="${x}" y="${drawHeight-h-5}" text-anchor="middle" font-size="10" font-weight="bold" fill="#6f42c1" style="pointer-events:none;">${labelVal}</text>`;
        }
    });
    
    // [추가] 동적 라벨 표시용 텍스트 요소 (초기엔 숨김)
    // transition 속성 추가 (opacity와 transform 함께 적용)
    html += `<text id="sim-bar-label" x="0" y="0" text-anchor="middle" font-size="11" font-weight="bold" fill="#333" style="opacity:0; pointer-events:none; text-shadow: 0px 0px 3px white; transition: opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28); transform: translateY(5px);"></text>`;
    
    container.innerHTML = html + `</svg>`;

    // [수정] 막대 인터랙션 로직 개선
    const labelText = container.querySelector('#sim-bar-label');
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    let hideTimeout = null;

    container.querySelectorAll('.sim-dmg-bar').forEach(bar => {
        // 이미 최대치 라벨이 있는 막대(보라색)는 건너뜀
        if (bar.getAttribute('fill') === '#6f42c1') return;

        const showLabel = (e) => {
            e.stopPropagation();
            // 기존에 예약된 숨김 타이머가 있으면 취소
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }

            const rawDmg = parseInt(bar.dataset.dmg);
            const dmgText = rawDmg >= 1000 ? (rawDmg / 1000).toFixed(0) + 'K' : rawDmg.toLocaleString();
            
            const x = parseFloat(bar.getAttribute('x')) + parseFloat(bar.getAttribute('width')) / 2;
            const y = parseFloat(bar.getAttribute('y')) - 5;

            // 내용과 위치 업데이트
            labelText.textContent = dmgText;
            labelText.setAttribute('x', x);
            labelText.setAttribute('y', y);
            
            // 애니메이션 초기화 (잠깐 숨겼다가 다시 나타나게 하여 애니메이션 리플레이 효과)
            labelText.style.transition = 'none';
            labelText.style.opacity = '0';
            labelText.style.transform = 'translateY(5px)';
            
            // 강제 리플로우 (브라우저가 스타일 변경을 인지하게 함)
            void labelText.offsetWidth;

            // 애니메이션 적용 및 표시
            labelText.style.transition = 'opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
            labelText.style.opacity = '1';
            labelText.style.transform = 'translateY(0)';
        };

        // 클릭 이벤트 (모바일/PC 공통)
        bar.onclick = showLabel;

        // 마우스 오버 이벤트 (터치 기기가 아닌 경우만)
        if (!isTouch) {
            bar.onmouseenter = showLabel;
            bar.onmouseleave = () => { 
                // 1초 뒤에 페이드 아웃 및 아래로 살짝 내려가며 사라짐
                hideTimeout = setTimeout(() => {
                    labelText.style.opacity = '0';
                    labelText.style.transform = 'translateY(5px)';
                }, 1000); 
            };
        }
    });

    // 그래프 배경 클릭 시 라벨 숨기기
    container.onclick = () => {
        if (labelText) {
            labelText.style.opacity = '0';
            labelText.style.transform = 'translateY(5px)';
        }
    };

    const turnLabels = []; 
    for (let i = 0; i < turnCount; i++) { 
        const turnNum = i + 1; 
        if (i === 0 || (turnCount >= 30 ? turnNum % 5 === 0 : (turnCount >= 16 ? turnNum % 2 === 0 : true))) {
            const pos = turnCount > 1 ? (i / (turnCount - 1)) * 100 : 0;
            turnLabels.push({ pos, label: turnNum + '턴' }); 
        }
    }
    renderAxisLabels({ y: [maxCum, Math.floor(maxCum / 2), 0], x: turnLabels }, maxCum, 'line', drawHeight);
}

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
    const disabledIds = constants.disabledSimChars;
    container.innerHTML = getCharacterSelectorHtml(validChars, disabledIds, charData, state.savedStats);
    container.querySelectorAll('.sim-char-pick-item').forEach(item => { if (item.style.pointerEvents !== 'none') item.onclick = () => { localStorage.setItem('sim_last_char_id', item.dataset.id); renderSimulatorUI(item.dataset.id); }; });
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
        othersHtml += `<div class="attr-control-item" style="width:24px;height:24px;margin:1px;position:relative;display:flex;align-items:center;justify-content:center;">${gc ? `<div style="position:absolute;width:14px;height:14px;background:${gc};box-shadow:0 0 8px ${gc};filter:blur(3px);opacity:0.7;transform:rotate(45deg);"></div>` : ''}<img src="${constants.attributeImageMap[attrName]}" class="sim-other-attr-icon" data-idx="${idx}" style="width:20px;height:20px;cursor:pointer;opacity:0.6;z-index:1;"></div>`;
    });
    const currName = constants.attributeList[currentAttrIdx]; let cgc = ''; if (myAttrIdx >= 0 && currentAttrIdx !== myAttrIdx) { const wins = { 0: 2, 1: 0, 2: 1, 3: 4, 4: 3 }, loses = { 0: 1, 1: 2, 2: 0, 3: 4, 4: 3 }; if (wins[myAttrIdx] === currentAttrIdx) cgc = '#00ff00'; else if (loses[myAttrIdx] === currentAttrIdx) cgc = (myAttrIdx <= 2 && currentAttrIdx <= 2) ? '#ff0000' : '#00ff00'; }
    container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;scale:0.8;"><div style="display:flex;justify-content:center;">${othersHtml}</div><div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;position:relative;">${cgc ? `<div style="position:absolute;width:24px;height:24px;background:${cgc};box-shadow:0 0 12px ${cgc};filter:blur(4px);opacity:0.8;transform:rotate(45deg);"></div>` : ''}<img src="${constants.attributeImageMap[currName]}" style="width:32px;height:32px;z-index:1;"></div></div>`;
    container.querySelectorAll('.sim-other-attr-icon').forEach(icon => { icon.onclick = () => { localStorage.setItem(`sim_last_enemy_attr_${charId}`, icon.dataset.idx); renderSimAttributePicker(charId); }; });
}

function renderSimulatorUI(charId) {
    const container = document.getElementById('simulator-content'), data = charData[charId], sData = simCharData[charId] || {}, stats = state.savedStats[charId] || {};
    const brVal = parseInt(stats.s1||0), brText = (brVal < 5) ? `0성 ${brVal}단계` : (brVal < 15) ? `1성 ${brVal-5}단계` : (brVal < 30) ? `2성 ${brVal-15}단계` : (brVal < 50) ? `3성 ${brVal-30}단계` : (brVal < 75) ? `4성 ${brVal-50}단계` : "5성";
    const hasMulti = data.skills.some(s => s.isMultiTarget || (s.damageDeal && s.damageDeal.some(d => d.isMultiTarget || d.stampIsMultiTarget)));
    const savedTurns = localStorage.getItem('sim_last_turns') || "10", savedIters = localStorage.getItem('sim_last_iters') || "100";
    // [수정] 캐릭터별 서포터 설정 저장/로드
    const supportStorageKey = `sim_last_support_${charId}`;
    const savedSupport = localStorage.getItem(supportStorageKey) || "none";

    container.innerHTML = getSimulatorLayoutHtml(charId, data, stats, brText, hasMulti, savedTurns, savedIters);

    // [수정] 서포터 선택 UI 로직
    const supportToggleBtn = document.getElementById('sim-support-toggle-btn');
    const supportPanel = document.getElementById('sim-support-selector-panel');
    const selectedIcon = document.getElementById('sim-selected-support-icon');
    const selectedName = document.getElementById('sim-selected-support-name');

    // 초기 상태 설정 함수
    const updateSupportDisplay = (id) => {
        const supportInfo = constants.supportList.find(s => s.id === id) || { name: '선택 안 함', id: 'none' };
        selectedName.textContent = supportInfo.name;
        if (id === 'none') {
            selectedIcon.innerHTML = '<span style="font-size:0.8em; color:#888;">-</span>';
            selectedIcon.style.border = '1px solid #bbb';
            selectedIcon.style.cursor = 'default';
            selectedIcon.onclick = null;
        } else {
            selectedIcon.innerHTML = `<img src="images/${id}.webp" style="width:100%; height:100%; object-fit:cover; object-position:top;" onerror="this.src='icon/main.png'">`;
            selectedIcon.style.border = '2px solid #6f42c1';
            selectedIcon.style.cursor = 'pointer';
            selectedIcon.title = `${supportInfo.name} 분석 화면으로 이동`;
            // 아이콘 클릭 시 해당 캐릭터의 시뮬레이터 설정으로 전환
            selectedIcon.onclick = (e) => {
                e.stopPropagation(); // 토글 버튼 이벤트 전파 방지
                window.scrollTo(0, 0);
                localStorage.setItem('sim_last_char_id', id);
                renderSimulatorUI(id); // 해당 캐릭터의 시뮬레이터 UI로 즉시 전환
            };
        }
        
        // 패널 내 선택 표시 업데이트
        container.querySelectorAll('.sim-support-option').forEach(opt => {
            const isSelected = opt.dataset.id === id;
            opt.querySelector('div, img').style.borderColor = isSelected ? '#6f42c1' : '#ddd';
            opt.querySelector('div, img').style.boxShadow = isSelected ? '0 0 5px rgba(111, 66, 193, 0.5)' : 'none';
        });
    };

    if (supportToggleBtn && supportPanel) {
        // 초기화
        updateSupportDisplay(savedSupport);

        // 토글 버튼 클릭
        supportToggleBtn.onclick = () => {
            const isHidden = supportPanel.style.display === 'none';
            supportPanel.style.display = isHidden ? 'block' : 'none';
            supportToggleBtn.querySelector('span:last-child').textContent = isHidden ? '▲' : '▼';
        };

        // 옵션 클릭
        container.querySelectorAll('.sim-support-option').forEach(opt => {
            opt.onclick = () => {
                const newId = opt.dataset.id;
                // [수정] 캐릭터별 키에 저장
                localStorage.setItem(supportStorageKey, newId);
                updateSupportDisplay(newId);
                supportPanel.style.display = 'none'; // 선택 후 닫기
                supportToggleBtn.querySelector('span:last-child').textContent = '▼';
                
                // [추가] 서포터가 바뀌면 전용 컨트롤 갱신을 위해 UI 전체 다시 그리기
                renderSimulatorUI(charId);
            };
        });
    }

    renderSimAttributePicker(charId);
    // 캐릭터 아이콘은 상세 정보 탭으로 이동
    container.querySelector('.sim-char-profile-img').onclick = () => {
        document.querySelector(`.main-image[data-id="${charId}"]`)?.click();
    };
    
    const infoIcon = document.getElementById('sim-info-icon');
    if (infoIcon) { 
        const tooltipText = sData.tooltipDesc || `<div style="text-align: left;">・서포터는 시뮬탭 내부에 지정한 본인의 행동과 설정을 그대로 따라하며 메인 캐릭터가 가진 아군 행동에 영향받는 스킬에는 영향을 주지 않습니다.<br><br> ・아군 행동에 영향 받는 스킬은 방어를 사용하지않고 3턴 쿨타임의 필살기를 가진 아군이라 가정합니다.</div>`;
        infoIcon.onclick = (e) => { e.stopPropagation(); import(`./ui.js?v=${Date.now()}`).then(ui => { const control = ui.showSimpleTooltip(infoIcon, tooltipText); setTimeout(() => control.remove(), 3000); }); };
    }

    const supportId = localStorage.getItem(supportStorageKey) || 'none';
    const sSupportData = simCharData[supportId] || {};
    
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
            const isSpecialToggle = ['self_extra_dmg_active', 'self_buff_mode', 'self_sleep_active'].includes(ctrl.id);
            const bgColor = isSpecialToggle ? '#f9f5ff' : '#f8f9fa'; // 더 연한 보라색
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
            displaySimResult(charId, res, 'avg');
            
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
    document.getElementById('sim-back-to-list').onclick = () => renderCharacterSelector();
    if (hasMulti) document.getElementById('sim-target-btn').onclick = (e) => { 
        let c = (parseInt(e.target.innerText)%5)+1; 
        e.target.innerText=c; 
        localStorage.setItem(`sim_last_target_${charId}`,c); 
    };
    document.getElementById('sim-edit-actions-btn').onclick = () => { const ed = document.getElementById('sim-action-editor'); ed.style.display = ed.style.display==='block' ? 'none' : 'block'; if(ed.style.display==='block') updateActionEditor(charId); };
    document.getElementById('sim-reset-pattern-btn').onclick = () => { if (confirm('패턴을 초기화하시겠습니까?')) { localStorage.removeItem(`sim_pattern_${charId}`); updateActionEditor(charId); } };
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

function runSimulation(charId) {
    const runBtn = document.getElementById('run-simulation-btn');
    if (!runBtn) return;

    // [추가] 로딩 상태 표시
    const originalText = runBtn.innerHTML;
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner"></span> 분석 중...';

    // 브라우저가 스피너를 렌더링할 시간을 준 뒤 계산 시작
    setTimeout(() => {
        const data = charData[charId], sData = simCharData[charId] || {}, stats = state.savedStats[charId] || {};
        const turns = parseInt(document.getElementById('sim-turns').value), iterations = parseInt(document.getElementById('sim-iterations').value);
        const targetCount = parseInt(document.getElementById('sim-target-btn')?.innerText || "1");
        const enemyAttrIdx = parseInt(localStorage.getItem(`sim_last_enemy_attr_${charId}`) || String(data.info?.속성 ?? 0));
        
        // 커스텀 컨트롤 + 공통 컨트롤 통합값 수집
        const combinedControls = [
            ...(sData.customControls || []),
            ...getCharacterCommonControls(sData.commonControls)
        ];
        
        const customValues = {}; 
        combinedControls.forEach(c => { 
            const v = localStorage.getItem(`sim_ctrl_${charId}_${c.id}`); 
            
            if (c.type === 'toggle') {
                customValues[c.id] = (v !== null) ? (v === 'true') : (c.initial === true);
            } else {
                customValues[c.id] = (v !== null) ? parseInt(v) : (c.initial || 0);
            }

            if (c.hasAuto && c.autoId) {
                const av = localStorage.getItem(`sim_ctrl_${charId}_${c.autoId}`);
                customValues[c.autoId] = (av === 'true');
            }
        });

        // [수정] 서포터 ID 추가 (캐릭터별 저장된 값 사용)
        const supportId = localStorage.getItem(`sim_last_support_${charId}`) || 'none';

        const result = runSimulationCore({ charId, charData: data, sData, stats, turns, iterations, targetCount, manualPattern: JSON.parse(localStorage.getItem(`sim_pattern_${charId}`)) || [], enemyAttrIdx, customValues, defaultGrowthRate: constants.defaultGrowth, supportId });
        
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
                        } else {                    minDiffEl.innerText = `0 (0.0%)`;
                    maxDiffEl.innerText = `+0 (+0.0%)`;
                }            
        minDiffEl.style.visibility = 'visible';
        maxDiffEl.style.visibility = 'visible';
        
        displaySimResult(charId, result, 'avg');
        
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
        const supportId = localStorage.getItem(`sim_last_support_${charId}`) || 'none';
        state.comparisonSnapshots.push({ 
            id: Date.now(), 
            charId, 
            supportId, // 서포터 ID 저장
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
