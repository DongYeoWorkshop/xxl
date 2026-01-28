// simulator-ui.js
import { state, constants } from './state.js';
import { charData } from './data.js';
import { getDefaultActionPattern } from './simulator-common.js';

/**
 * [추가] 서포터의 행동 패턴을 가져옴 (행동 수정 탭 데이터 우선)
 */
export function getSupportAction(charId, turn) {
    try {
        const savedPattern = JSON.parse(localStorage.getItem(`sim_pattern_${charId}`));
        if (savedPattern && savedPattern[turn - 1]) return savedPattern[turn - 1];
    } catch (e) {}
    return getDefaultActionPattern(charId, turn);
}

/**
 * [추가] 행동 패턴 에디터 업데이트 (simulator.js에서 이동)
 */
export function updateActionEditor(charId) {
    const turnsSelect = document.getElementById('sim-turns'), listContainer = document.getElementById('sim-action-list');
    if (!turnsSelect || !listContainer) return;
    const turns = parseInt(turnsSelect.value), data = charData[charId];
    let pattern = []; try { pattern = JSON.parse(localStorage.getItem(`sim_pattern_${charId}`)) || []; } catch(e) {}
    listContainer.innerHTML = '';
    const CD = (() => { const m = data.skills[1].desc?.match(/\(쿨타임\s*:\s*(\d+)턴\)/); return m ? parseInt(m[1]) : 3; })();
    
    // [추가] 임부언 서포터 여부 확인
    const supportId1 = localStorage.getItem(`sim_last_support_1_${charId}`) || 'none';
    const supportId2 = localStorage.getItem(`sim_last_support_2_${charId}`) || 'none';
    const isBossrenIn = (supportId1 === 'bossren' || supportId2 === 'bossren');

    const actions = [
        { id: 'normal', label: '보통', activeStyle: 'background:#e8f5e9; color:#2e7d32; border-color:#a5d6a7;' },
        { id: 'defend', label: '방어', activeStyle: 'background:#e3f2fd; color:#1565c0; border-color:#90caf9;' },
        { id: 'ult', label: '필살', activeStyle: 'background:#ffebee; color:#c62828; border-color:#ef9a9a;' }
    ];

    const updateEditBtnStyle = () => {
        const editBtn = document.getElementById('sim-edit-actions-btn');
        if (!editBtn) return;
        let hasPattern = false;
        const savedPatternJson = localStorage.getItem(`sim_pattern_${charId}`);
        const extraPatternJson = localStorage.getItem(`sim_pattern_extra_${charId}`);
        if (savedPatternJson || extraPatternJson) {
            // [수정] 커스텀 패턴이 하나라도 있으면 강조
            hasPattern = true;
        }
        editBtn.style.background = hasPattern ? '#f9f5ff' : '#f0f0f0';
        editBtn.style.borderColor = hasPattern ? '#6f42c1' : '#ccc';
        editBtn.style.color = hasPattern ? '#6f42c1' : '#666';
        editBtn.style.fontWeight = hasPattern ? 'bold' : 'normal';
    };

    // [헬퍼] 행 생성 함수
    const createActionRow = (tLabel, patternKey, turnIdx, isExtra = false) => {
        const currentPattern = JSON.parse(localStorage.getItem(patternKey)) || {};
        // 기본값: 2턴 주기 규칙 적용 또는 추가행동은 기본 'ult'
        let currentAction = isExtra ? (currentPattern[turnIdx] || 'ult') : (pattern[turnIdx] || (turnIdx > 0 && (turnIdx % CD === 0) ? 'ult' : 'normal'));
        
        const row = document.createElement('div'); 
        row.style.cssText = `display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #eee;`;
        
        let html = `<span style="font-size:0.75em; font-weight:bold; min-width:45px; color:${isExtra ? '#6f42c1' : '#888'};">${tLabel}</span><div style="display:flex; flex:1; gap:4px;">`;
        
        actions.forEach(act => {
            const isActive = currentAction === act.id;
            // [수정] X-2턴(isExtra)일 경우 활성 버튼은 연보라 배경+보라 테두리/텍스트
            let style = '';
            if (isExtra) {
                style = isActive ? 'background:#f3e5f5; color:#6f42c1; border-color:#6f42c1;' : 'background:#f9f5ff; color:#d1c4e9; border-color:#e9e0f9;';
            } else {
                style = isActive ? act.activeStyle : 'background:#f5f5f5; color:#bbb; border-color:#ddd;';
            }
            
            let overlay = '';
            // 임부언 아이콘 오버레이 (필살 버튼에만, 메인 턴 슬롯 한정)
            if (!isExtra && isBossrenIn && act.id === 'ult' && ((supportId1 === 'bossren' && getSupportAction('bossren', turnIdx + 1) === 'ult') || (supportId2 === 'bossren' && getSupportAction('bossren', turnIdx + 1) === 'ult'))) {
                overlay = `<img src="images/bossren.webp" style="position:absolute; top:-6px; right:-4px; width:18px; height:18px; border-radius:50%; border:1px solid #6f42c1; background:black; z-index:5; pointer-events:none; box-shadow: 0 2px 4px rgba(0,0,0,0.3); object-fit:cover; object-position:top;">`;
            }

            html += `<div style="position:relative; flex:1; display:flex;">
                        <button class="sim-action-btn" data-key="${patternKey}" data-turn="${turnIdx}" data-value="${act.id}" style="width:100%; font-size:0.75em; padding:6px 0; border-radius:6px; border:1px solid; font-weight:bold; cursor:pointer; transition:all 0.1s; ${style}">${act.label}</button>
                        ${overlay}
                     </div>`;
        });
        html += `</div>`; 
        row.innerHTML = html;
        return row;
    };

    for (let t = 1; t <= turns; t++) {
        listContainer.appendChild(createActionRow(`${t}턴`, `sim_pattern_${charId}`, t - 1));
        
        let isBossrenUltThisTurn = false;
        if (isBossrenIn) {
            // [수정] 임부언의 도장 활성 상태까지 체크
            const bStats1 = (supportId1 === 'bossren') ? (state.savedStats['bossren'] || {}) : {};
            const bStats2 = (supportId2 === 'bossren') ? (state.savedStats['bossren'] || {}) : {};
            const isStampActive = bStats1.stamp || bStats2.stamp;

            if (isStampActive) {
                if (supportId1 === 'bossren' && getSupportAction('bossren', t) === 'ult') isBossrenUltThisTurn = true;
                if (supportId2 === 'bossren' && getSupportAction('bossren', t) === 'ult') isBossrenUltThisTurn = true;
            }
        }
        if (isBossrenUltThisTurn) {
            listContainer.appendChild(createActionRow(`${t}-2턴`, `sim_pattern_extra_${charId}`, t - 1, true));
        }
    }

    listContainer.querySelectorAll('.sim-action-btn').forEach(btn => {
        btn.onclick = (e) => {
            const key = btn.dataset.key;
            const turnIdx = btn.dataset.turn;
            const newValue = btn.dataset.value;
            
            let p = JSON.parse(localStorage.getItem(key)) || (key.includes('extra') ? {} : []);
            p[turnIdx] = newValue;
            localStorage.setItem(key, JSON.stringify(p));
            
            // UI 즉시 갱신을 위해 에디터 리렌더링
            updateActionEditor(charId);
        };
    });
    updateEditBtnStyle();
}

/**
 * 캐릭터 선택 화면 HTML 생성
 */
export function getCharacterSelectorHtml(validChars, disabledIds, charData, savedStats = {}) {
    return `
        <div style="text-align: center; padding: 20px 0;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 30px;">
                <h3 style="margin: 0; color: #333;">분석할 캐릭터를 선택하세요</h3>
            </div>
            <div class="sim-char-grid">
                ${validChars.map(id => {
                    const isDisabled = disabledIds.includes(id);
                    const saved = savedStats[id];
                    const isFav = saved?.isFavorite;

                    const filterStyle = isDisabled ? 'filter: grayscale(100%); opacity: 0.5; pointer-events: none; cursor: default;' : '';
                    
                    return `
                    <div class="sim-char-pick-item" data-id="${id}" style="${filterStyle} position: relative;">
                        <img src="images/${id}.webp">
                        ${isFav ? '<div style="position:absolute; bottom:20px; left:15px; color:#ffcb05; font-size:14px; text-shadow:0 0 3px rgba(0,0,0,0.9); z-index:2; pointer-events:none;">★</div>' : ''}
                        <div class="sim-char-name">${charData[id].title}</div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

/**
 * 시뮬레이터 메인 레이아웃 HTML 생성
 */
export function getSimulatorLayoutHtml(charId, data, stats, brText, hasMulti, savedTurns, savedIters, useHitProb = false) {
    return `
        <div style="margin-bottom:10px; display: flex; justify-content: flex-end; align-items: center;">
            <button id="sim-back-to-list" style="background:#f9f5ff;border:1px solid #6f42c1;color:#6f42c1;cursor:pointer;font-size:0.8em;font-weight:bold;padding:5px 12px;border-radius:4px;">← 캐릭터 선택창</button>
        </div>
        <div class="sim-main-container">
            <div class="sim-pane-settings">
                <!-- [추가] 캐릭터별 안내 메시지 영역 -->
                <div id="sim-notice-area" style="display:none; margin-bottom:10px; padding:10px; background:#f9f5ff; border:1px solid #e9e0f9; border-radius:8px; font-size:0.75em; color:#6f42c1; line-height:1.4; font-weight:bold;"></div>
                
                <div style="position: relative; display:flex;align-items:center;gap:10px;margin-bottom:20px;padding:12px;background:#fff;border:1px solid #eee0d0;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.05);overflow:hidden;">
                    <img src="images/${charId}.webp" class="sim-char-profile-img" style="width:55px;height:55px;border-radius:10px;object-fit:cover;border:2px solid #6f42c1;background:black;object-position:top;flex-shrink:0;cursor:pointer;" title="상세 정보로 이동">
                    <div style="flex-grow:1;display:flex;align-items:center;justify-content:space-between;min-width:0;">
                        <div style="min-width:0;flex:1;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <h3 style="margin:0;font-size:1.1em;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.title}</h3>
                                ${stats.stamp ? `<div style="background:black;border-radius:4px;padding:2px;display:flex;align-items:center;border:1px solid #444;flex-shrink:0;"><img src="images/sigilwebp/sigil_${charId}.webp" style="width:18px;height:18px;object-fit:contain;"></div>` : ''}
                            </div>
                            <div style="font-size:0.75em;color:#888;margin-top:2px;">Lv.${stats.lv || 1} / ${brText} / 적합도 ${stats.s2 || 0}</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                            ${hasMulti ? `
                                <div style="display:flex;flex-direction:column;align-items:center;scale:0.9;flex-shrink:0;">
                                    <div style="font-size:0.65em;color:#888;margin-bottom:2px;">대상 수</div>
                                    <button id="sim-target-btn" style="width:30px;height:30px;border-radius:50%;border:1px solid #6f42c1;background:#fff;color:#6f42c1;font-weight:bold;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${localStorage.getItem(`sim_last_target_${charId}`)||1}</button>
                                </div>` : ''}
                            <div id="sim-attribute-picker-container"></div>
                        </div>
                    </div>
                </div>
                <div id="sim-custom-controls" style="display:none;background:#fff;border:1px solid #ddd;border-radius:12px;padding:15px;margin-bottom:15px;"><div id="sim-custom-list" style="display:flex;flex-wrap:wrap;gap:10px;"></div></div>

                <div style="background:#fff;border:1px solid #ddd;border-radius:12px;padding:20px;margin-bottom:15px;">
                    <!-- [수정] 서포터 선택 섹션 (이미지 그리드 방식) -->
                    <div style="margin-bottom: 30px;">
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                            <label style="font-size:0.8em;font-weight:bold;color:#555;">서포터 추가</label>
                            <div id="sim-info-icon" style="width: 16px; height: 16px; border-radius: 50%; border: 1px solid #999; color: #999; font-size: 11px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: #fff; font-weight: bold;">i</div>
                        </div>
                        
                        <!-- 2개의 서포터 슬롯 -->
                        <div style="display:flex; gap:10px;">
                            <!-- 서포터 1 슬롯 -->
                            <div id="sim-support-1-toggle-btn" style="flex:1; display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid #ccc; border-radius:8px; background:#f9f9f9; cursor:pointer; transition:all 0.2s;">
                                <div id="sim-selected-support-1-icon" style="width:32px; height:32px; border-radius:6px; background:#ddd; display:flex; align-items:center; justify-content:center; overflow:hidden; border:1px solid #bbb; flex-shrink:0;">
                                    <span style="font-size:0.8em; color:#888;">1</span>
                                </div>
                                <div style="display:flex; flex-direction:column; overflow:hidden;">
                                    <span style="font-size:0.65em; color:#888;">1순위</span>
                                    <span id="sim-selected-support-1-name" style="font-weight:bold; color:#333; font-size:0.8em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">선택 안 함</span>
                                </div>
                            </div>

                            <!-- 서포터 2 슬롯 -->
                            <div id="sim-support-2-toggle-btn" style="flex:1; display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid #ccc; border-radius:8px; background:#f9f9f9; cursor:pointer; transition:all 0.2s;">
                                <div id="sim-selected-support-2-icon" style="width:32px; height:32px; border-radius:6px; background:#ddd; display:flex; align-items:center; justify-content:center; overflow:hidden; border:1px solid #bbb; flex-shrink:0;">
                                    <span style="font-size:0.8em; color:#888;">2</span>
                                </div>
                                <div style="display:flex; flex-direction:column; overflow:hidden;">
                                    <span style="font-size:0.65em; color:#888;">2순위</span>
                                    <span id="sim-selected-support-2-name" style="font-weight:bold; color:#333; font-size:0.8em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">선택 안 함</span>
                                </div>
                            </div>
                        </div>

                        <!-- 서포터 선택 패널 (공용) -->
                        <div id="sim-support-selector-panel" style="display:none; margin-top:10px; padding:10px; border:1px solid #eee; border-radius:8px; background:#fff;">
                            <div style="font-size:0.75em; color:#6f42c1; margin-bottom:8px; font-weight:bold;" id="sim-support-selector-title">서포터 선택</div>
                            <div class="sim-support-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap:10px;">
                                <!-- 선택 안 함 옵션 -->
                                <div class="sim-support-option" data-id="none" style="display:flex; flex-direction:column; align-items:center; gap:5px; cursor:pointer;">
                                    <div style="width:48px; height:48px; border-radius:8px; background:#f0f0f0; border:2px solid #ddd; display:flex; align-items:center; justify-content:center; color:#888; font-weight:bold;">X</div>
                                    <span style="font-size:0.75em; color:#666;">해제</span>
                                </div>
                                ${constants.supportList.filter(s => s.id !== 'none' && s.id !== charId).map(s => `
                                    <div class="sim-support-option" data-id="${s.id}" style="display:flex; flex-direction:column; align-items:center; gap:5px; cursor:pointer;">
                                        <img src="images/${s.id}.webp" style="width:48px; height:48px; border-radius:8px; object-fit:cover; object-position:top; border:2px solid #ddd; background:black;" onerror="this.src='icon/main.png'">
                                        <span style="font-size:0.75em; color:#666; text-align:center; word-break:keep-all;">${s.name}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="sim-turns-wrapper" style="position: relative; margin-top: 10px;">
                        <div style="display:flex; align-items: center; gap:8px; margin-bottom: 0;">
                            <label class="sim-turns-label" style="font-size:0.8em;font-weight:bold;color:#555;">턴 수</label>
                            <div class="sim-turns-val-text" style="font-size:1.1em; font-weight:900; color:#6f42c1;"><span id="sim-turns-val">${savedTurns}</span>턴</div>
                        </div>
                        <div class="sim-slider-button-row" style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px; margin-top: -5px;">
                            <div id="sim-turns-slider-container" style="flex: 1; padding: 0;">
                                <input type="range" id="sim-turns" min="1" max="30" value="${savedTurns}" step="1" list="sim-turns-ticks" style="width:100%; cursor:pointer; accent-color: #6f42c1;">
                                <datalist id="sim-turns-ticks"><option value="1"></option><option value="5"></option><option value="10"></option><option value="15"></option><option value="20"></option><option value="25"></option><option value="30"></option></datalist>
                            </div>
                            ${(() => {
                                const hasPattern = !!localStorage.getItem(`sim_pattern_${charId}`);
                                const btnBg = hasPattern ? '#f9f5ff' : '#f0f0f0';
                                const btnBorder = hasPattern ? '#6f42c1' : '#ccc';
                                const btnColor = hasPattern ? '#6f42c1' : '#666';
                                return `<button id="sim-edit-actions-btn" class="sim-edit-btn" style="background:${btnBg}; border:1px solid ${btnBorder}; color:${btnColor}; border-radius:4px; font-size:0.75em; padding:4px 10px; cursor:pointer; white-space: nowrap; font-weight: ${hasPattern ? 'bold' : 'normal'};">⚙️ 행동 수정</button>`;
                            })()}
                        </div>
                    </div>

                    <div id="sim-action-editor" style="display:none;background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:15px;max-height:280px;overflow-y:auto;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
                            <span style="font-weight:bold;color:#6f42c1;font-size:0.8em;">⚙️ 행동 직접 지정</span>
                            <button id="sim-reset-pattern-btn" style="background:#fff;border:1px solid #dc3545;color:#dc3545;cursor:pointer;font-size:0.75em;font-weight:bold;padding:2px 8px;border-radius:4px;">초기화</button>
                        </div>
                        <div id="sim-action-list" style="display:flex;flex-direction:column;gap:5px;"></div>
                    </div>
                    <div style="display:flex; justify-content:flex-start; align-items:center; margin-bottom:4px;">
                        <div class="sim-iters-val-text" style="font-size:1.1em; font-weight:900; color:#6f42c1;">n=<span id="sim-iterations-val">${savedIters}</span></div>
                    </div>
                    <div style="padding: 0; margin-top: -10px;">
                        <input type="range" id="sim-iterations" min="30" max="1000" value="${savedIters}" step="1" list="sim-iterations-ticks" style="width:100%; cursor:pointer; accent-color: #6f42c1;">
                        <datalist id="sim-iterations-ticks">
                            <option value="30"></option>
                            <option value="100"></option>
                            <option value="300"></option>
                            <option value="500"></option>
                            <option value="750"></option>
                            <option value="1000"></option>
                        </datalist>
                    </div>
                </div>
                <button id="run-simulation-btn" style="width:100%;padding:16px;background:#6f42c1;color:white;border:none;border-radius:12px;font-weight:bold;cursor:pointer;font-size:1.1em;display:flex;align-items:center;justify-content:center;gap:8px;">분석 시작 <img src="icon/bolt.png" style="width:20px; height:20px; filter: brightness(0) invert(1);"></button>
            </div>
            <div class="sim-pane-display">
                <div id="simulation-result-area" style="display:none;">
                    <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                            <h4 style="margin:0;color:#333;padding-left:10px;">분석 리포트</h4>
                            <div style="display:flex; gap:5px;">
                                <button id="btn-show-dist" style="background:#6f42c1; color:white; border:none; padding:4px 10px; border-radius:4px; font-size:0.75em; cursor:pointer;">분포도</button>
                                <button id="btn-show-dmg" style="background:#f0f0f0; color:#666; border:1px solid #ccc; padding:4px 10px; border-radius:4px; font-size:0.75em; cursor:pointer;">딜 그래프</button>
                            </div>
                        </div>
                        <div id="sim-graph-area" class="sim-graph-container-fixed" style="display:flex; margin-bottom:60px; padding-right:15px; padding-left:0px; position:relative;">
                            <div id="sim-y-axis" style="width: 25px; position: relative; font-size: 0.7em; color: #bbb; text-align: right; border-right: 1px solid #eee; height: 100%;"></div>
                            <div style="flex: 1; display: flex; flex-direction: column; position: relative; height: 100%;">
                                <!-- [추가] 예측 구간 표시용 배경 레이어 (그리드보다 뒤) -->
                                <div id="sim-prediction-zone" style="position: absolute; top: 0; bottom: 0; background: rgba(111, 66, 193, 0.1); border-left: 1px dashed rgba(111, 66, 193, 0.3); border-right: 1px dashed rgba(111, 66, 193, 0.3); pointer-events: none; z-index: 0; display: none;"></div>
                                <!-- [추가] 예측 구간 라벨 (막대보다 앞) -->
                                <div id="sim-prediction-label" style="position: absolute; top: 5px; font-size: 0.7em; color: #6f42c1; font-weight: bold; opacity: 0.8; z-index: 10; pointer-events: none; display: none;">α = 0.1</div>
                                <div id="sim-grid-lines" style="position: absolute; width: 100%; height: 100%; pointer-events: none; z-index: 1;"></div>
                                <div id="sim-dist-graph" style="flex: 1; display: flex; align-items: flex-end; gap: 1px; border-bottom: 1px solid #eee; position: relative; z-index: 2; height: 100%;"></div>
                                <div id="sim-line-graph" style="display:none; flex: 1; position:relative; border-bottom: 1px solid #eee; z-index: 2; overflow: visible; height: 100%;"></div>
                                <div id="sim-x-axis" style="height: 0px; position: relative; width: 100%; z-index: 1;"></div>
                            </div>
                        </div>
                        <!-- 오차 비율 표시 영역 (카드 상단 정렬) -->
                        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; box-sizing: border-box; margin-bottom: 2px;">
                            <div id="sim-min-diff" style="text-align:center; font-size:0.65em; font-weight:bold; color:#dc3545; visibility: hidden;">-0.0%</div>
                            <div></div> <!-- 평균 위는 비워둠 -->
                            <div id="sim-max-diff" style="text-align:center; font-size:0.65em; font-weight:bold; color:#28a745; visibility: hidden;">+0.0%</div>
                        </div>
                        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; box-sizing: border-box;">
                            <div style="background:#f8f9fa; padding: 10px 5px; border-radius:10px; text-align:center;">
                                <div style="font-size:0.65em; color:#888; margin-bottom:2px;">최소 (P05)</div>
                                <div id="sim-min-dmg" style="font-weight:bold; color:#333; font-size:0.9em;">0</div>
                            </div>
                            <div style="background:#f8f9fa; padding: 10px 5px; border-radius:10px; text-align:center;">
                                <div style="font-size:0.65em; color:#888; margin-bottom:2px;">평균</div>
                                <div id="sim-avg-dmg" style="font-weight:bold; color:#333; font-size:0.9em;">0</div>
                            </div>
                            <div style="background:#f8f9fa; padding: 10px 5px; border-radius:10px; text-align:center;">
                                <div style="font-size:0.65em; color:#888; margin-bottom:2px;">최대 (P95)</div>
                                <div id="sim-max-dmg" style="font-weight:bold; color:#333; font-size:0.9em;">0</div>
                            </div>
                        </div>
                    </div>
                    <div style="background:#fff; border:1px solid #eee; border-radius:12px; padding:20px; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                        <h4 style="margin:0 0 15px 0; color:#333; padding-left:10px;">분석 로그 <span id="sim-total-dmg-header" style="font-size:0.8em; color:#6f42c1; margin-left:10px; font-weight:bold;"></span></h4>
                        <div id="sim-log" style="max-height:400px; overflow-y:auto; font-family:'Cascadia Code', 'Courier New', monospace; font-size:0.85em; line-height:1.6; color:#4af626; padding:15px; background:#1a1a1a; border-radius:8px; border:1px solid #333; box-shadow: inset 0 0 10px rgba(0,0,0,0.5);"></div>
                        <div id="sim-result-actions"></div>
                    </div>
                </div>
                <div id="sim-empty-msg" style="text-align:center; padding:60px 0; color:#aaa; background:#fff; border:1px solid #eee; border-radius:12px;">
                    <img src="icon/main.png" style="width:48px; opacity:0.2; margin-bottom:15px;">
                    <p style="font-size:0.9em;">분석 실행 버튼을 눌러 시뮬레이션을 시작하세요</p>
                </div>
            </div>
        </div>`;
}

/**
 * 상세 로그 분석 모달 팝업 생성
 */
export function showDetailedLogModal(resultToSave) {
    const modal = document.createElement('div');
    modal.className = 'sim-detailed-log-modal'; // [추가] 클래스 부여로 일괄 관리 가능하게
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;';
    
    // [추가] 모달 열 때 히스토리 상태 추가
    history.pushState({ id: 'modal', modalId: 'sim-detailed-log-modal' }, "", window.location.pathname);

    const closeModal = () => {
        if (document.body.contains(modal)) {
            modal.remove();
            if (history.state?.id === 'modal') history.back();
        }
    };
    
    const content = document.createElement('div');
    content.className = 'sim-detailed-log-content';
    content.style.cssText = 'width: 95%; max-width: 800px; max-height: 85%; background: #fff; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;';
    
    let combinedLogsHtml = '';
    for (let t = 1; t <= resultToSave.turnData.length; t++) {
        const turnDetails = (resultToSave.closestDetailedLogs || []).filter(d => d.t === t);
        const buffs = resultToSave.closestStateLogs ? resultToSave.closestStateLogs[t-1] : [];
        const turnInfo = resultToSave.closestTurnInfoLogs ? resultToSave.closestTurnInfoLogs[t-1] : {};
        
        let turnLabelExtra = '';
        if (turnInfo.enemyHp !== undefined) {
            turnLabelExtra = `<span style="font-size:0.7em; color:#dc3545; font-weight:normal; margin-left:5px;">(적 HP: ${turnInfo.enemyHp}%)</span>`;
        }

        const buffListHtml = buffs.length > 0 ? buffs.map(b => `
            <div style="display:flex; align-items:center; gap:3px; background:#fff; border:1px solid #ddd; padding:1px 5px; border-radius:4px; font-size: 0.9em;">
                <img src="${b.icon}" style="width:12px; height:12px; object-fit:contain; background:black; border-radius:2px;">
                <span>${b.name} / ${b.duration}</span>
            </div>`).join('') : '<span style="color:#ccc;">-</span>';

        combinedLogsHtml += `
            <div style="padding: 12px 15px; border-bottom: 1px solid #eee; ${t % 2 === 0 ? 'background: #fcfcfc;' : ''}">
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 8px;">
                    <div style="font-weight: bold; color: #6f42c1; font-size: 1.1em; min-width: 40px; white-space:nowrap;">${t}턴${turnLabelExtra}</div>
                    <div style="display:flex; flex-wrap:wrap; gap:4px; font-size: 0.75em; color: #666;">${buffListHtml}</div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px; padding-left: 5px; border-left: 2px solid #f0f0f0;">
                    ${turnDetails.map(d => {
                        if (!d.msg) return ''; // 빈 메시지면 아무것도 렌더링 안 함
                        let color = '#333', bgColor = 'transparent';
                        let msg = d.msg;
                        let iconHtml = '';

                        // ICON: 접두사가 있는 경우 이미지로 변환
                        if (msg.startsWith('ICON:')) {
                            const parts = msg.split('|');
                            const iconPath = parts[0].replace('ICON:', '');
                            msg = parts[1];
                            iconHtml = `<img src="${iconPath}" style="width:16px; height:16px; border-radius:3px; margin-right:6px; object-fit:cover; border:1px solid #ddd; background:black;">`;
                        } else {
                            // 기본 이모티콘 유지
                            let prefix = '•';
                            if (d.type === 'hit') { color = '#28a745'; prefix = '⚔️'; }
                            else if (d.type === 'extra') { color = '#fd7e14'; prefix = '✨'; }
                            
                            // 방어일 경우 불필요한 도트 제거
                            if (msg === '[방어]') prefix = '';
                            
                            iconHtml = prefix ? `<span style="margin-right: 5px;">${prefix}</span>` : '';
                        }

                        const statsInfo = d.statMsg ? `<span class="sim-detail-stat-info" style="font-size: 0.9em; color: #666; margin-left: auto; padding-left: 15px; font-family: 'Cascadia Code', monospace; font-weight: bold;">${d.statMsg}</span>` : '';
                        
                        if (d.type === 'action' || msg.includes('피격 발생')) {
                            let actionColor = '#666', actionBorder = '#ccc';
                            const lowerMsg = msg.toLowerCase();
                            
                            if (lowerMsg.includes('보통')) { actionColor = '#2e7d32'; actionBorder = '#a5d6a7'; }
                            else if (lowerMsg.includes('필살')) { actionColor = '#c62828'; actionBorder = '#ef9a9a'; }
                            else if (lowerMsg.includes('방어')) { actionColor = '#1565c0'; actionBorder = '#90caf9'; }
                            else if (lowerMsg.includes('피격 발생')) { actionColor = '#6f42c1'; actionBorder = '#c3a6ff'; } // 보라색 추가
                            
                            return `<div class="sim-log-row" data-stat="${d.statMsg || ''}" style="display: flex; align-items: center; font-size: 0.85em; color: ${actionColor}; padding: 4px 12px; border-left: 4px solid ${actionBorder}; margin: 6px 0; font-weight: bold; background: transparent; cursor: pointer;">
                                ${iconHtml}<span style="flex-shrink: 0;">${msg}</span>${statsInfo}
                            </div>`;
                        }
                        return `<div class="sim-log-row" data-stat="${d.statMsg || ''}" style="display: flex; align-items: center; font-size: 0.85em; color: ${color}; padding: 3px 8px; border-radius: 4px; line-height: 1.6; cursor: pointer;">${iconHtml}<span>${msg}</span>${statsInfo}</div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    let hintText = "이 로그는 평균치에 가장 가까운 실행 데이터입니다.";
    if (resultToSave.selectedType === 'min') {
        hintText = "이 로그는 90% 범위 최솟값에 가장 가까운 실행 데이터입니다.";
    } else if (resultToSave.selectedType === 'max') {
        hintText = "이 로그는 90% 범위 최댓값에 가장 가까운 실행 데이터입니다.";
    }

    const helpText = "Coef: 총 계수 / Atk: 최종공격력 / Dmg: 공통뎀증 / N-Dmg: 평타뎀증 / U-Dmg: 필살뎀증 / T-Dmg: 발동뎀증 / Vul: 받뎀증 / A-Vul: 속성받뎀증";
    content.innerHTML = `
        <div class="sim-modal-header" style="padding: 15px; background: #6f42c1; color: #fff; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
            <span>시뮬레이션 상세 로그</span>
            <div style="display:flex; align-items:center; gap:12px;">
                <div id="modal-info-icon" style="width:20px; height:20px; border-radius:50%; border:1px solid #fff; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px;">i</div>
                <button id="modal-close" class="sim-modal-close-btn" style="background: none; border: none; color: #fff; font-size: 24px; cursor: pointer; line-height: 1;">&times;</button>
            </div>
        </div>
        <div style="flex: 1; overflow-y: auto; background: #fff;">${combinedLogsHtml}</div>
        <div class="sim-modal-footer-hint" style="padding: 12px; text-align: center; font-size: 0.8em; color: #999; border-top: 1px solid #eee; background: #f9f9f9;">
            ${hintText}
        </div>`;

    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // [수정] 정의된 closeModal 함수 사용
    modal.onclick = (e) => { if(e.target === modal) closeModal(); };
    const closeBtn = content.querySelector('#modal-close');
    if (closeBtn) closeBtn.onclick = closeModal;

    // [추가] 모바일 환경에서 로그 클릭 시 툴팁으로 수치 표시
    if (window.innerWidth <= 600) {
        content.querySelectorAll('.sim-log-row').forEach(row => {
            const stat = row.dataset.stat;
            if (stat) {
                row.onclick = (e) => {
                    e.stopPropagation();
                    import('./ui.js').then(ui => {
                        ui.showSimpleTooltip(row, stat);
                    });
                };
            }
        });
    }
    
    // [추가] 모달 내부 정보 아이콘 클릭 이벤트
    const infoIcon = content.querySelector('#modal-info-icon');
    if (infoIcon) {
        infoIcon.onclick = (e) => {
            e.stopPropagation();
            import('./ui.js').then(ui => {
                const control = ui.showSimpleTooltip(infoIcon, helpText);
                setTimeout(() => control.remove(), 3000);
            });
        };
    }
}

/**
 * 시각화 로직: 축 라벨 렌더링
 */
export function renderAxisLabels(axisData, yMax, type = 'dist', drawHeight = 220) {
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
 * 시각화 로직: 딜 그래프(SVG) 그리기
 */
export function renderDamageLineChart(charId, specificResult = null) {
    const container = document.getElementById('sim-line-graph');
    if (!container) return;
    
    const fullResult = JSON.parse(localStorage.getItem(`sim_last_result_${charId}`));
    if (!fullResult) return;

    let globalMaxTrn = 0;
    let globalMaxCum = 0;

    if (fullResult.results) {
        ['min', 'avg', 'max'].forEach(type => {
            const data = fullResult.results[type];
            const tData = data ? (data.turnData || data.perTurnDmg) : null;
            if (tData) {
                const trn = Math.max(...tData.map(d => d.dmg));
                const cum = Math.max(...tData.map(d => d.cumulative));
                if (trn > globalMaxTrn) globalMaxTrn = trn;
                if (cum > globalMaxCum) globalMaxCum = cum;
            }
        });
    }

    let res = specificResult;
    if (!res) {
        let activeType = 'avg';
        const boxes = {
            min: document.getElementById('sim-min-dmg')?.parentElement,
            avg: document.getElementById('sim-avg-dmg')?.parentElement,
            max: document.getElementById('sim-max-dmg')?.parentElement
        };
        for (const [key, box] of Object.entries(boxes)) {
            if (box && (box.style.background === 'rgb(111, 66, 193)' || box.style.opacity === '1')) {
                activeType = key;
                break;
            }
        }
        if (fullResult.results && fullResult.results[activeType]) res = fullResult.results[activeType];
        else res = fullResult.results ? fullResult.results.avg : fullResult;
    }
    
    const turnData = res.turnData || res.perTurnDmg, 
          maxCum = globalMaxCum || Math.max(...turnData.map(d => d.cumulative)), 
          maxTrn = globalMaxTrn || Math.max(...turnData.map(d => d.dmg)), 
          turnCount = turnData.length;
    
    let maxDmgIdx = -1, maxDmgVal = -1;
    turnData.forEach((d, i) => { if (d.dmg > maxDmgVal) { maxDmgVal = d.dmg; maxDmgIdx = i; } });

    const screenWidth = window.innerWidth;
    const drawWidth = container.clientWidth || 400; 
    const drawHeight = screenWidth >= 1100 ? 320 : (screenWidth <= 600 ? 150 : 220);

    let html = `<svg width="100%" height="100%" viewBox="0 0 ${drawWidth} ${drawHeight}" preserveAspectRatio="none" style="overflow:visible;"><defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6f42c1" stop-opacity="0.3"/><stop offset="100%" stop-color="#6f42c1" stop-opacity="0"/></linearGradient></defs>`;
    
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

    turnData.forEach((d, i) => { 
        const x = turnCount > 1 ? (i / (turnCount - 1)) * drawWidth : 0; 
        const h = maxTrn > 0 ? (d.dmg / maxTrn) * (drawHeight * 0.5) : 0; 
        const isMax = (i === maxDmgIdx);
        const color = isMax ? '#6f42c1' : '#e0e0e0';
        html += `<rect x="${x-3}" y="${drawHeight-h}" width="6" height="${h}" fill="${color}" rx="2" style="pointer-events:none;" />`;
        html += `<rect class="svg-bar-grow sim-dmg-bar" x="${x-5}" y="${drawHeight-h}" width="10" height="${h}" fill="transparent" data-dmg="${d.dmg}" data-turn="${i+1}" style="pointer-events:all;" />`; 
        if (isMax) {
            const labelVal = d.dmg >= 1000 ? (d.dmg/1000).toFixed(0)+'K' : d.dmg;
            html += `<text x="${x}" y="${drawHeight-h-5}" text-anchor="middle" font-size="10" font-weight="bold" fill="#6f42c1" style="pointer-events:none;">${labelVal}</text>`;
        }
    });
    
    html += `<text id="sim-bar-label" x="0" y="0" text-anchor="middle" font-size="11" font-weight="bold" fill="#333" style="opacity:0; pointer-events:none; text-shadow: 0px 0px 3px white; transition: opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28); transform: translateY(5px);"></text>`;
    container.innerHTML = html + `</svg>`;

    const labelText = container.querySelector('#sim-bar-label');
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    let hideTimeout = null;

    container.querySelectorAll('.sim-dmg-bar').forEach(bar => {
        if (bar.getAttribute('fill') === '#6f42c1') return;
        const showLabel = (e) => {
            e.stopPropagation();
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
            const rawDmg = parseInt(bar.dataset.dmg);
            const dmgText = rawDmg >= 1000 ? (rawDmg / 1000).toFixed(0) + 'K' : rawDmg.toLocaleString();
            const x = parseFloat(bar.getAttribute('x')) + parseFloat(bar.getAttribute('width')) / 2;
            const y = parseFloat(bar.getAttribute('y')) - 5;
            labelText.textContent = dmgText;
            labelText.setAttribute('x', x);
            labelText.setAttribute('y', y);
            labelText.style.transition = 'none';
            labelText.style.opacity = '0';
            labelText.style.transform = 'translateY(5px)';
            void labelText.offsetWidth;
            labelText.style.transition = 'opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
            labelText.style.opacity = '1';
            labelText.style.transform = 'translateY(0)';
        };
        bar.onclick = showLabel;
        if (!isTouch) {
            bar.onmouseenter = showLabel;
            bar.onmouseleave = () => { 
                hideTimeout = setTimeout(() => {
                    labelText.style.opacity = '0';
                    labelText.style.transform = 'translateY(5px)';
                }, 1000); 
            };
        }
    });

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

/**
 * 시각화 로직: 결과 표시 메인 함수 (탭 전환 포함)
 */
export function displaySimResult(charId, fullResult, type = 'avg', extraRenderers = {}) {
    if (!fullResult.results) {
        fullResult.results = { avg: { logs: fullResult.closestLogs || [], total: fullResult.closestTotal || 0, detailedLogs: fullResult.closestDetailedLogs || [], stateLogs: fullResult.closestStateLogs || [], turnInfoLogs: fullResult.closestTurnInfoLogs || [], perTurnDmg: fullResult.turnData || [] } };
        fullResult.results.min = fullResult.results.avg; fullResult.results.max = fullResult.results.avg;
    }
    const res = fullResult.results[type];
    const stats = state.savedStats[charId] || {};
    const boxes = { min: document.getElementById('sim-min-dmg').parentElement, avg: document.getElementById('sim-avg-dmg').parentElement, max: document.getElementById('sim-max-dmg').parentElement };
    
    Object.keys(boxes).forEach(key => {
        const isTarget = (key === type), box = boxes[key], label = box.querySelector('div:first-child'), value = box.querySelector('div:last-child');
        if (isTarget) { box.style.background = '#6f42c1'; box.style.boxShadow = '0 4px 10px rgba(111, 66, 193, 0.2)'; box.style.opacity = '1'; if (label) { label.style.color = 'rgba(255,255,255,0.9)'; label.style.fontWeight = 'bold'; } if (value) { value.style.color = 'white'; value.style.fontSize = '1.1em'; value.style.fontWeight = '900'; } }
        else { box.style.background = '#f8f9fa'; box.style.boxShadow = 'none'; box.style.opacity = '0.7'; if (label) { label.style.color = '#888'; label.style.fontWeight = 'normal'; } if (value) { value.style.color = '#333'; value.style.fontSize = '0.9em'; value.style.fontWeight = 'bold'; } }
        if (key === 'min' && fullResult.p05) value.innerText = fullResult.p05;
        if (key === 'max' && fullResult.p95) value.innerText = fullResult.p95;
        box.onclick = () => displaySimResult(charId, fullResult, key, extraRenderers);
    });

    document.getElementById('sim-log').innerHTML = res.logs.join('');
    const totalHeader = document.getElementById('sim-total-dmg-header');
    if (totalHeader) totalHeader.innerText = `: ${res.total.toLocaleString()}`;

    const mergedResult = { ...fullResult, selectedType: type, closestTotal: res.total, closestLogs: res.logs, closestDetailedLogs: res.detailedLogs, closestStateLogs: res.stateLogs, closestTurnInfoLogs: res.turnInfoLogs, turnData: res.perTurnDmg };
    
    if (extraRenderers.renderActionButtons) extraRenderers.renderActionButtons(charId, mergedResult, stats);

    const distGraph = document.getElementById('sim-dist-graph');
    if (distGraph && fullResult.graphData) {
        const minVal = parseFloat(fullResult.min.replace(/,/g, '')), maxVal = parseFloat(fullResult.max.replace(/,/g, '')), currentVal = res.total, range = maxVal - minVal, binCount = distGraph.children.length;
        let targetIdx = (range === 0) ? Math.floor(binCount / 2) : Math.floor(((currentVal - minVal) / range) * (binCount - 1));
        targetIdx = Math.max(0, Math.min(binCount - 1, targetIdx));
        Array.from(distGraph.children).forEach((bar, idx) => { bar.style.background = (idx === targetIdx) ? '#6f42c1' : '#e0e0e0'; });
        const predictionZone = document.getElementById('sim-prediction-zone'), predictionLabel = document.getElementById('sim-prediction-label');
        if (predictionZone && predictionLabel && fullResult.p05 && fullResult.p95) {
            const p05Val = parseFloat(fullResult.p05.replace(/,/g, '')), p95Val = parseFloat(fullResult.p95.replace(/,/g, ''));
            if (range > 0) {
                const leftPercent = ((p05Val - minVal) / range) * 100, widthPercent = ((p95Val - p05Val) / range) * 100;
                predictionZone.style.left = `${leftPercent}%`; predictionZone.style.width = `${widthPercent}%`; predictionLabel.style.left = `${leftPercent + 1}%`;
                const isDistVisible = (distGraph && distGraph.style.display !== 'none');
                predictionZone.style.display = isDistVisible ? 'block' : 'none'; predictionLabel.style.display = isDistVisible ? 'block' : 'none';
            } else { predictionZone.style.display = 'none'; predictionLabel.style.display = 'none'; }
        }
    }
    if (document.getElementById('sim-line-graph').style.display !== 'none') renderDamageLineChart(charId, mergedResult);
}
