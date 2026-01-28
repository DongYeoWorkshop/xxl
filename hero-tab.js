// hero-tab.js
import { state, constants } from './state.js';
import { charData } from './data.js';
import { saveSnapshots } from './storage.js';

/**
 * 스냅샷 데이터를 턴별로 그룹화합니다.
 */
function getRecordsByTurn(snapshot) {
    if (!snapshot || !snapshot.records) return {};
    const groups = {};
    let currentTurn = 1;
    snapshot.records.forEach(rec => {
        if (rec.isTurnSeparator) {
            currentTurn = rec.turnNumber;
        } else {
            if (!groups[currentTurn]) groups[currentTurn] = [];
            groups[currentTurn].push(rec);
        }
    });
    return groups;
}

/**
 * Hero 탭(딜량 비교 그래프 및 표)을 렌더링합니다.
 */
export function renderHeroTab(dom, updateStatsCallback) {
    dom.statsArea.innerHTML = '';
    if (dom.newSectionArea) dom.newSectionArea.innerHTML = ''; 

    const snapshots = state.comparisonSnapshots || [];
    const hasSnapshots = snapshots.length > 0;

    const contentDisplay = document.getElementById('content-display');
    
    // 1. 상단 그래프 영역 (이미 있으면 재사용, 없으면 생성)
    let graphContainer = document.getElementById('hero-graph-container');
    if (!graphContainer) {
        graphContainer = document.createElement('div');
        graphContainer.id = 'hero-graph-container';
        graphContainer.className = 'hero-graph-container';
        if (contentDisplay) contentDisplay.prepend(graphContainer);
    }
    graphContainer.innerHTML = ''; // 내부만 초기화

    const headerTab = document.createElement('div');
    headerTab.className = 'hero-tab-tag';
    headerTab.innerHTML = `<div class="hero-tag-content">캐릭터 기록</div>`;
    graphContainer.appendChild(headerTab);

    const contentPadding = document.createElement('div');
    contentPadding.className = 'hero-content-padding';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'snapshot-header-tools';
    
    const clearAllBtn = document.createElement('button');
    clearAllBtn.textContent = '전체 기록 삭제';
    clearAllBtn.className = 'header-btn-sub'; 
    
    if (!hasSnapshots) clearAllBtn.style.display = 'none';
    clearAllBtn.onclick = () => {
        if (confirm('모든 비교 기록을 삭제하시겠습니까?')) {
            state.comparisonSnapshots = [];
            state.heroComparisonState = { slot1Id: null, slot2Id: null, nextTarget: 1, selectedIds: [] };
            saveSnapshots([]);
            updateStatsCallback(); 
            renderHeroTab(dom, updateStatsCallback);
        }
    };
    headerDiv.appendChild(clearAllBtn);
    contentPadding.appendChild(headerDiv);

    if (hasSnapshots) {
        const maxTotal = Math.max(...snapshots.map(s => s.totalDamage));
        const imgGrid = document.createElement('div');
        imgGrid.className = 'graph-img-grid';
        
        // [개선] 스크롤 복원을 import 전에 즉시 시도 (깜빡임 감소)
        const savedScroll = localStorage.getItem('hero_grid_scroll');
        if (savedScroll) {
            imgGrid.scrollLeft = parseInt(savedScroll);
            // 레이아웃 렌더링 후 다시 한 번 보정
            requestAnimationFrame(() => { imgGrid.scrollLeft = parseInt(savedScroll); });
        }
        
        import('./handlers.js').then(mod => mod.setupDragScroll(imgGrid, 'hero_grid_scroll'));

        snapshots.forEach(snapshot => {
            const totalDmg = snapshot.totalDamage;
            const barHeight = maxTotal > 0 ? (totalDmg / maxTotal) * 100 : 0;
            const wrapper = document.createElement('div');
            wrapper.className = 'snapshot-wrapper';
            
            // [수정] 선택 상태 확인 로직 (selectedIds 기반)
            const selectedIds = state.heroComparisonState?.selectedIds || [];
            if (selectedIds.includes(snapshot.id)) wrapper.classList.add('selected');

            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '×';
            deleteBtn.className = 'snapshot-del-btn';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                
                // 애니메이션 시작
                wrapper.classList.add('deleting');
                
                // 약간의 지연 후 실제 삭제 및 재렌더링
                setTimeout(() => {
                    state.comparisonSnapshots = state.comparisonSnapshots.filter(s => s.id !== snapshot.id);
                    if (state.heroComparisonState?.selectedIds) {
                        state.heroComparisonState.selectedIds = state.heroComparisonState.selectedIds.filter(id => id !== snapshot.id);
                    }
                    saveSnapshots(state.comparisonSnapshots);
                    updateStatsCallback();
                    renderHeroTab(dom, updateStatsCallback);
                }, 120); 
            };
            wrapper.appendChild(deleteBtn);

            // [수정] 캐릭터 이미지와 서포터를 묶는 컨테이너 추가
            const imgContainer = document.createElement('div');
            imgContainer.style.cssText = 'position: relative; width: 70px; height: 180px; margin-bottom: 8px; cursor: pointer;';
            imgContainer.onclick = (e) => {
                e.stopPropagation();
                if (!state.heroComparisonState) state.heroComparisonState = { selectedIds: [] };
                if (!state.heroComparisonState.selectedIds) state.heroComparisonState.selectedIds = [];
                
                let sIds = state.heroComparisonState.selectedIds;
                const existingIdx = sIds.indexOf(snapshot.id);

                if (existingIdx !== -1) {
                    // 이미 선택됨 -> 선택 해제
                    sIds.splice(existingIdx, 1);
                } else {
                    // 신규 선택 (최대 5개)
                    if (sIds.length >= 5) sIds.shift(); // 가장 오래된 선택 제거
                    sIds.push(snapshot.id);
                }

                // 하단 표 비교를 위해 slot1, slot2 업데이트 (마지막 2개)
                state.heroComparisonState.slot1Id = sIds.length >= 2 ? sIds[sIds.length - 2] : (sIds.length === 1 ? sIds[0] : null);
                state.heroComparisonState.slot2Id = sIds.length >= 2 ? sIds[sIds.length - 1] : null;

                // [수정] 즉시 렌더링을 위해 자기 자신 재호출
                renderHeroTab(dom, updateStatsCallback);
            };

            const img = document.createElement('img');
            img.src = `images/${snapshot.charId}.webp`;
            img.className = 'snapshot-img';
            img.style.marginBottom = '0'; // 컨테이너에서 마진 관리
            imgContainer.appendChild(img);

            // [추가] 서포터 아이콘 표시 (2개 지원)
            const sIds = snapshot.supportIds || (snapshot.supportId && snapshot.supportId !== 'none' ? [snapshot.supportId] : []);
            
            if (sIds.length > 0) {
                // 서포터 1 (우측 하단)
                if (sIds[0] && sIds[0] !== 'none') {
                    const s1 = document.createElement('div');
                    s1.style.cssText = `position:absolute; bottom:2px; right:2px; width:32px; height:32px; border-radius:50%; border:2px solid #6f42c1; background:black; overflow:hidden; z-index:6; box-shadow:0 2px 8px rgba(0,0,0,0.4);`;
                    s1.innerHTML = `<img src="images/${sIds[0]}.webp" style="width:100%; height:100%; object-fit:cover; object-position:top;" onerror="this.src='icon/main.png'">`;
                    imgContainer.appendChild(s1);
                }
                // 서포터 2 (서포터 1 바로 위)
                if (sIds[1] && sIds[1] !== 'none') {
                    const s2 = document.createElement('div');
                    s2.style.cssText = `position:absolute; bottom:36px; right:2px; width:32px; height:32px; border-radius:50%; border:2px solid #28a745; background:black; overflow:hidden; z-index:5; box-shadow:0 2px 8px rgba(0,0,0,0.4);`;
                    s2.innerHTML = `<img src="images/${sIds[1]}.webp" style="width:100%; height:100%; object-fit:cover; object-position:top;" onerror="this.src='icon/main.png'">`;
                    imgContainer.appendChild(s2);
                }
            }
            
            wrapper.appendChild(imgContainer);

            const dmgLabel = document.createElement('div');
            dmgLabel.className = 'snapshot-dmg-label';
            const shortDmg = totalDmg >= 1000 ? (totalDmg / 1000).toFixed(0) + 'K' : totalDmg;
            dmgLabel.textContent = shortDmg;
            
            const barContainer = document.createElement('div');
            barContainer.className = 'snapshot-bar-container';
            const bar = document.createElement('div');
            bar.className = 'snapshot-bar';
            bar.style.height = `${barHeight}px`;
            
            barContainer.appendChild(bar);
            wrapper.appendChild(dmgLabel); 
            wrapper.appendChild(barContainer); 
            imgGrid.appendChild(wrapper);
        });
        contentPadding.appendChild(imgGrid);
    } else {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = `padding: 10px; text-align: center; color: #666; font-size: 1em;`;
        emptyMsg.textContent = '저장된 비교 기록이 없습니다.';
        contentPadding.appendChild(emptyMsg);
    }
    graphContainer.appendChild(contentPadding);

    // 2. 그래프 영역 (별도의 흰색 박스) - 재사용 로직
    const screenW = window.innerWidth;
    const isMobile = screenW < 768;

    let graphWrapper = document.getElementById('hero-graph-wrapper');
    if (!graphWrapper) {
        graphWrapper = document.createElement('div');
        graphWrapper.id = 'hero-graph-wrapper';
        graphWrapper.className = 'hero-main-wrapper';
        // [수정] 오버레이 배치를 위해 relative 포지션 재추가
        graphWrapper.style.position = 'relative';
        if (contentDisplay) contentDisplay.appendChild(graphWrapper);
    }
    graphWrapper.innerHTML = ''; // 내부 초기화
    graphWrapper.style.display = 'none'; // 초기에는 숨김
    // [추가] 모바일 하단 마진 축소
    if (isMobile) graphWrapper.style.marginBottom = '10px';
    else graphWrapper.style.marginBottom = ''; 

    // [수정] 그래프 모드 전환 버튼 (토글 그룹 스타일 - 더 작고 슬림하게)
    const modeContainer = document.createElement('div');
    modeContainer.style.cssText = `position: absolute; top: 5px; right: 10px; display: flex; background: #f5f5f5; border-radius: 15px; padding: 1px; z-index: 10; border: 1px solid #eee;`;
    
    if (!state.heroComparisonState) state.heroComparisonState = { graphMode: 'cumulative' };
    if (!state.heroComparisonState.graphMode) state.heroComparisonState.graphMode = 'cumulative';
    const currentMode = state.heroComparisonState.graphMode;

    const modes = [
        { id: 'cumulative', text: '누적' },
        { id: 'per_turn', text: '턴당딜' }
    ];

    modes.forEach(m => {
        const btn = document.createElement('button');
        btn.textContent = m.text;
        const isActive = currentMode === m.id;
        
        btn.style.cssText = `
            padding: ${isMobile ? '1px 8px' : '2px 12px'}; 
            font-size: ${isMobile ? '0.65em' : '0.7em'}; 
            border-radius: 13px; border: none; cursor: pointer; transition: all 0.2s;
            font-weight: bold;
            ${isActive 
                ? 'background: #6f42c1; color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.15);' 
                : 'background: transparent; color: #888;'
            }
        `;
        
        btn.onclick = () => {
            if (isActive) return;
            const scrollPos = window.scrollY;
            state.heroComparisonState.graphMode = m.id;
            renderHeroTab(dom, updateStatsCallback);
            requestAnimationFrame(() => {
                window.scrollTo(0, scrollPos);
            });
        };
        modeContainer.appendChild(btn);
    });

    graphWrapper.appendChild(modeContainer);

    const graphDiv = document.createElement('div');
    graphDiv.id = 'hero-comparison-graph';
    // [수정] 모바일 상단 패딩 추가 (버튼 공간 확보)
    const graphHeight = isMobile ? '200px' : '250px';
    const graphPadding = isMobile ? '15px 0 0' : '0';
    graphDiv.style.cssText = `width: 100%; height: ${graphHeight}; padding: ${graphPadding};`;
    graphWrapper.appendChild(graphDiv);

    // 3. 하단 딜표 래퍼 (표가 나오는 흰 칸) - 재사용 로직
    let tablesWrapper = document.getElementById('hero-tables-wrapper');
    if (!tablesWrapper) {
        tablesWrapper = document.createElement('div');
        tablesWrapper.id = 'hero-tables-wrapper';
        tablesWrapper.className = 'hero-main-wrapper';
        if (contentDisplay) contentDisplay.appendChild(tablesWrapper);
    }
    tablesWrapper.innerHTML = ''; // 내부 초기화

    const tableContainer = document.createElement('div');
    tableContainer.id = 'hero-comparison-tables';
    tableContainer.className = 'comparison-tables-container';
    tablesWrapper.appendChild(tableContainer);

    // [추가] 그래프 데이터 생성 및 렌더링
    // 사용자가 직접 선택한 최대 5개의 스냅샷을 그래프에 표시
    const selectedIds = state.heroComparisonState?.selectedIds || [];
    const graphSnapshots = snapshots.filter(s => selectedIds.includes(s.id));
    
    if (graphSnapshots.length > 0) {
        graphWrapper.style.display = 'block';
        createComparisonGraph(graphSnapshots, graphDiv);
    }

    renderUnifiedContent(tableContainer);
}

/**
 * 딜량 비교 꺾은선 그래프 생성 (SVG)
 */
function createComparisonGraph(snapshots, container) {
    if (!snapshots || snapshots.length === 0) return;

    // [추가] 그래프 모드 확인 (기본값: 누적)
    const mode = state.heroComparisonState?.graphMode || 'cumulative';

    // 데이터 전처리: 턴별 데미지 계산
    const graphData = snapshots.map(snap => {
        const points = [];
        let cumDmg = 0;
        let currentTurn = 1;
        let turnDmg = 0;

        // 레코드 순회하며 턴별 합산 (턴 구분자 기준)
        snap.records.forEach(rec => {
            if (rec.isTurnSeparator) {
                if (rec.turnNumber > 1) { 
                     // [수정] 모드에 따라 누적 혹은 단일 턴 데미지 추가
                     if (mode === 'cumulative') {
                         cumDmg += turnDmg;
                         points.push({ t: currentTurn, d: cumDmg });
                     } else {
                         points.push({ t: currentTurn, d: turnDmg });
                     }
                     turnDmg = 0;
                }
                currentTurn = rec.turnNumber;
            } else {
                const dmgVal = parseInt((rec.damage || "0").replace(/,/g, '')) || 0;
                turnDmg += dmgVal * (rec.count || 1);
            }
        });
        
        // 마지막 턴 처리
        if (mode === 'cumulative') {
            cumDmg += turnDmg;
            points.push({ t: currentTurn, d: cumDmg });
        } else {
            points.push({ t: currentTurn, d: turnDmg });
        }

        return { id: snap.id, charId: snap.charId, points };
    });

    const allPoints = graphData.flatMap(d => d.points);
    const maxTurn = Math.max(...allPoints.map(p => p.t), 1);
    const maxDmg = Math.max(...allPoints.map(p => p.d), 100);

    const screenWidth = window.innerWidth;
    const height = screenWidth >= 1100 ? 320 : (screenWidth >= 768 ? 350 : 200);
    container.style.height = `${height}px`;
    
    const isTablet = (screenWidth >= 768 && screenWidth < 1100);
    const isMobile = (screenWidth < 768);
    
    const fontSizeAxis = isTablet ? 14 : (isMobile ? 10 : 11);
    const fontSizeLegend = isTablet ? 15 : (isMobile ? 11 : 12);
    const lineWidth = isTablet ? 3.5 : 2;
    const pointRadius = isTablet ? 6 : 3;
    const legendSpacing = isTablet ? 22 : 16;

    let width = container.clientWidth || 600;
    if (isTablet || isMobile) {
        width = Math.max(width, screenWidth * 1.05);
    }
    
    const padding = { top: isMobile ? 20 : 25, right: isMobile ? 20 : 40, bottom: isMobile ? 25 : 35, left: isTablet ? 65 : 50 }; 
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33F6', '#FFC300', '#33FFF6', '#FF8C00', '#8A2BE2'];
    
    let svgHtml = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow:visible;">`;

    for (let i = 0; i <= 5; i++) {
        const yVal = (maxDmg / 5) * i;
        const yPos = padding.top + chartH - (chartH * (i / 5));
        const label = yVal >= 1000 ? (yVal / 1000).toFixed(0) + 'K' : Math.floor(yVal);
        
        svgHtml += `<line x1="${padding.left}" y1="${yPos}" x2="${width - padding.right}" y2="${yPos}" stroke="#eee" stroke-dasharray="4" />`;
        svgHtml += `<text x="${padding.left - 10}" y="${yPos + 5}" text-anchor="end" font-size="${fontSizeAxis}" fill="#888">${label}</text>`;
    }

    for (let t = 1; t <= maxTurn; t++) {
        if (maxTurn > 15 && t % 2 !== 0 && t !== maxTurn) continue;
        if (maxTurn > 30 && t % 5 !== 0 && t !== maxTurn) continue;

        const xPos = padding.left + (chartW * ((t - 1) / (maxTurn - 1 || 1)));
        // [수정] 텍스트 위치를 아래쪽 경계에서 조금 더 위로 (height-10)
        svgHtml += `<text x="${xPos}" y="${height - 10}" text-anchor="middle" font-size="${fontSizeAxis}" fill="#888">${t}</text>`;
    }

    graphData.forEach((g, idx) => {
        const color = colors[idx % colors.length];
        let pathD = "";
        
        g.points.forEach((p, i) => {
            const x = padding.left + (chartW * ((p.t - 1) / (maxTurn - 1 || 1)));
            const y = padding.top + chartH - (chartH * (p.d / maxDmg));
            
            if (i === 0) pathD += `M ${x} ${y}`;
            else pathD += ` L ${x} ${y}`;
            
            svgHtml += `<circle cx="${x}" cy="${y}" r="${pointRadius}" fill="${color}" stroke="#fff" stroke-width="${isTablet ? 2 : 1}" />`;
        });

        svgHtml += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="${lineWidth}" />`;
        
        // [수정] 범례를 왼쪽 상단으로 이동 및 왼쪽 정렬 보정 (모바일에서 위로 더 이동)
        const legendX = padding.left + 5;
        const legendY = (isMobile ? padding.top - 15 : padding.top) + (idx * legendSpacing);
        
        const mainName = charData[g.charId]?.title || g.charId;
        const snapshot = snapshots.find(s => s.id === g.id);
        const sIds = snapshot?.supportIds || (snapshot?.supportId && snapshot.supportId !== 'none' ? [snapshot.supportId] : []);
        const supportNames = sIds
            .map(sid => {
                const info = constants.supportList.find(s => s.id === sid);
                return (info && info.id !== 'none') ? info.name : null;
            })
            .filter(name => name && name !== '선택 안 함' && name !== '-');

        let displayName = mainName;
        if (supportNames.length > 0) displayName += ` (${supportNames.join(', ')})`;

        svgHtml += `<rect x="${legendX}" y="${legendY - (isTablet ? 10 : 8)}" width="${isTablet ? 12 : 10}" height="${isTablet ? 12 : 10}" fill="${color}" rx="2" />`;
        svgHtml += `<text x="${legendX + (isTablet ? 20 : 16)}" y="${legendY + 2}" font-size="${fontSizeLegend}" fill="#333" font-weight="bold">${displayName}</text>`;
    });

    svgHtml += `</svg>`;
    container.innerHTML = svgHtml;
}

/**
 * 두 슬롯의 데이터를 통합하여 렌더링합니다.
 */
function renderUnifiedContent(container) {
    const s1Id = state.heroComparisonState?.slot1Id;
    const s2Id = state.heroComparisonState?.slot2Id;
    
    const snap1 = state.comparisonSnapshots.find(s => s.id === s1Id);
    const snap2 = state.comparisonSnapshots.find(s => s.id === s2Id);

    if (!snap1 && !snap2) {
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.minHeight = '200px';

        const msgDiv = document.createElement('div');
        msgDiv.style.cssText = `text-align: center; color: #999; font-weight: bold; font-size: 1.1em;`;
        msgDiv.innerText = "비교기록을 선택해주세요.";
        container.appendChild(msgDiv);
        return;
    }

    container.style.display = 'block'; 
    container.style.minHeight = '';

    const headerRow = document.createElement('div');
    headerRow.className = 'unified-turn-content';
    headerRow.style.marginBottom = '-20px';
    
    // [수정] 상대방 총 데미지 전달
    const totalDmg1 = snap1 ? snap1.totalDamage : 0;
    const totalDmg2 = snap2 ? snap2.totalDamage : 0;

    headerRow.appendChild(createProfileHeader(snap1, true, totalDmg2));
    headerRow.appendChild(createProfileHeader(snap2, false, totalDmg1));
    container.appendChild(headerRow);

    const turnData1 = getRecordsByTurn(snap1);
    const turnData2 = getRecordsByTurn(snap2);
    
    const turns1 = Object.keys(turnData1).map(Number);
    const turns2 = Object.keys(turnData2).map(Number);
    const maxTurn = Math.max(0, ...turns1, ...turns2);

    for (let t = 1; t <= maxTurn; t++) {
        const turnBlock = document.createElement('div');
        turnBlock.className = 'unified-turn-block';

        const turnHeader = document.createElement('div');
        turnHeader.className = 'unified-turn-header';
        turnHeader.innerHTML = `<div class="unified-turn-line"></div><span>${t}턴</span><div class="unified-turn-line"></div>`;
        turnBlock.appendChild(turnHeader);

        const contentRow = document.createElement('div');
        contentRow.className = 'unified-turn-content';
        
        // [수정] 양쪽 턴 합계 미리 계산
        let total1 = 0;
        if (turnData1[t]) {
            turnData1[t].forEach(r => total1 += (parseInt((r.damage || "0").replace(/,/g, '')) || 0) * (r.count || 1));
        }
        let total2 = 0;
        if (turnData2[t]) {
            turnData2[t].forEach(r => total2 += (parseInt((r.damage || "0").replace(/,/g, '')) || 0) * (r.count || 1));
        }

        // [추가] 양쪽 토글 동기화를 위한 처리
        const col1 = createRecordColumn(turnData1[t], true, total2);
        const col2 = createRecordColumn(turnData2[t], false, total1);
        
        // 커스텀 이벤트를 통해 양쪽 싱크 맞춤
        const syncToggle = () => {
            const isHidden = col1.dataset.hidden === 'true';
            const newState = !isHidden;
            col1.dispatchEvent(new CustomEvent('toggleDetail', { detail: { hide: newState } }));
            col2.dispatchEvent(new CustomEvent('toggleDetail', { detail: { hide: newState } }));
        };

        col1.querySelector('.turn-total-header').onclick = syncToggle;
        col2.querySelector('.turn-total-header').onclick = syncToggle;

        contentRow.appendChild(col1);
        contentRow.appendChild(col2);
        
        turnBlock.appendChild(contentRow);
        container.appendChild(turnBlock);
    }
}

function createProfileHeader(snapshot, isLeft, opponentTotalDamage = 0) {
    const slot = document.createElement('div');
    slot.className = 'comparison-slot'; 
    slot.style.background = 'transparent';
    slot.style.border = 'none';
    slot.style.boxShadow = 'none';
    slot.style.padding = '5px 10px';
    slot.style.minHeight = '60px';
    slot.style.visibility = 'visible';

    if (!snapshot) return slot;

    const charTitle = charData[snapshot.charId]?.title || snapshot.charId;
    const { lv, s1, s2 } = snapshot.stats || { lv: 1, s1: 0, s2: 0 };
    let brText = (s1 >= 75) ? "5성" : (s1 >= 50) ? `4성 ${s1-50}단` : (s1 >= 30) ? `3성 ${s1-30}단` : (s1 >= 15) ? `2성 ${s1-15}단` : (s1 >= 5) ? `1성 ${s1-5}단` : `0성 ${s1}단`;
    const spec = `Lv.${lv} / ${brText} / 적합:${s2}`;

    const sIds = snapshot.supportIds || (snapshot.supportId && snapshot.supportId !== 'none' ? [snapshot.supportId] : []);
    let supportHtml = '';
    
    if (sIds.length > 0) {
        supportHtml = `<div style="position:absolute; top:-6px; right:-4px; display:flex; gap:2px; z-index:10;">`;
        if (sIds[0] && sIds[0] !== 'none') {
            supportHtml += `<div style="width:18px; height:18px; border-radius:50%; border:1.5px solid #6f42c1; background:black; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.3);"><img src="images/${sIds[0]}.webp" style="width:100%; height:100%; object-fit:cover; object-position:top;" onerror="this.src='icon/main.png'"></div>`;
        }
        if (sIds[1] && sIds[1] !== 'none') {
            supportHtml += `<div style="width:18px; height:18px; border-radius:50%; border:1.5px solid #28a745; background:black; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.3);"><img src="images/${sIds[1]}.webp" style="width:100%; height:100%; object-fit:cover; object-position:top;" onerror="this.src='icon/main.png'"></div>`;
        }
        supportHtml += `</div>`;
    }

    // 총 데미지 비교 로직
    let diffHtml = '';
    const myTotal = snapshot.totalDamage;
    if (opponentTotalDamage > 0 && myTotal > 0) {
        const diff = myTotal - opponentTotalDamage;
        const percent = ((diff / opponentTotalDamage) * 100).toFixed(1);
        const isPositive = diff > 0;
        const color = isPositive ? '#28a745' : (diff < 0 ? '#dc3545' : '#888');
        const arrow = isPositive ? '↑' : (diff < 0 ? '↓' : '');
        diffHtml = `<div class="comp-total-diff" style="font-size:0.8em; color:${color}; font-weight:normal;">(${percent}%${arrow})</div>`;
    }

    // 반응형 레이아웃 결정 (JS 기반)
    const isMobile = window.innerWidth < 768;
    
    slot.innerHTML = `
        <div class="comp-header" style="border-bottom:none; margin-bottom:0; background:transparent; box-shadow:none; overflow:visible;">
            <div class="comp-char-info" style="overflow:visible;">
                <div style="position:relative; flex-shrink:0; display:flex; align-items:center; padding:4px;">
                    <img src="images/${snapshot.charId}.webp" class="comp-char-img" style="margin:0;">
                    ${supportHtml}
                </div>
                <div class="comp-text-wrapper" style="display:flex; flex-direction:column; justify-content:center;">
                    <span class="comp-name" style="font-size:0.9em; color:#333; font-weight:bold; line-height:1.2;">${charTitle}</span>
                    <span class="comp-spec" style="font-size:0.65em; color:#666; margin-top:2px;">${spec}</span>
                </div>
            </div>
            <div class="comp-total-dmg" style="color:#333; display:flex; flex-direction:${isMobile ? 'row' : 'column-reverse'}; align-items:${isMobile ? 'center' : 'flex-end'}; gap:${isMobile ? '6px' : '0'};">
                <div style="font-weight:bold; line-height:1;">${myTotal.toLocaleString()}</div>
                ${diffHtml}
            </div>
        </div>
    `;
    return slot;
}

function createRecordColumn(records, isLeft, opponentTotal = 0) {
    const slot = document.createElement('div');
    slot.className = 'comparison-slot ' + (isLeft ? 'comp-slot-left' : 'comp-slot-right');
    
    // [수정] records가 없어도(0딜) 상대방 비교를 위해 빈 리스트라도 생성
    const safeRecords = records || [];
    
    const list = document.createElement('div');
    list.className = 'comp-record-list';
    
    // [수정] 턴 합계 미리 계산
    let turnTotal = 0;
    safeRecords.forEach(rec => {
        const damageVal = (rec.damage || "0").replace(/,/g, '');
        turnTotal += (parseInt(damageVal) || 0) * (rec.count || 1);
    });

    // [추가] 비교 수치 텍스트 생성
    let diffHtml = '';
    if (opponentTotal > 0 && turnTotal > 0) {
        const diff = turnTotal - opponentTotal;
        const percent = ((diff / opponentTotal) * 100).toFixed(1);
        const isPositive = diff > 0;
        const color = isPositive ? '#28a745' : (diff < 0 ? '#dc3545' : '#888');
        const arrow = isPositive ? '↑' : (diff < 0 ? '↓' : '');
        // [수정] 폰트 크기를 0.8em으로 키움
        diffHtml = `<span style="font-size:0.8em; color:${color}; font-weight:normal; margin-left:6px;">(${percent}%${arrow})</span>`;
    }

    // [추가] 턴 합계 행을 상단에 렌더링 (수치는 중앙, 비교는 우측 정렬)
    const totalRow = document.createElement('div');
    totalRow.className = 'comp-record-row turn-total-header';
    // [수정] 클릭 가능하도록 커서 변경 및 스타일 조정
    totalRow.style.cssText = 'border-bottom: 1.5px solid #eee; margin-bottom: 8px; padding-bottom: 4px; font-weight: bold; display: flex; align-items: center; width: 100%; cursor: pointer; user-select: none;';
    
    // 왼쪽 여백(flex:1) + 중앙값 + 오른쪽비교(flex:1) 구조로 수치를 정중앙에 고정
    totalRow.innerHTML = `
        <div style="flex: 1; font-size: 0.8em; color: #999; display: flex; align-items: center; gap: 4px;">
            <span class="toggle-icon">▼</span>
        </div>
        <div class="comp-record-val" style="color:#000; font-size:1.1em; white-space: nowrap;">${turnTotal.toLocaleString()}</div>
        <div style="flex: 1; text-align: right;">${diffHtml}</div>
    `;
    list.appendChild(totalRow);

    const detailRows = [];
    safeRecords.forEach(rec => {
        const row = document.createElement('div');
        row.className = 'comp-record-row';
        // [수정] 상세 기록의 폰트 크기를 줄여서 합계와 구분
        row.style.fontSize = '0.82em'; 
        const damageVal = (rec.damage || "0").replace(/,/g, '');
        const totalRowDmg = (parseInt(damageVal) || 0) * (rec.count || 1);
        const typeTag = rec.type ? `<span class="comp-record-type" style="color:#999; margin-right:4px;">[${rec.type}]</span>` : '';
        row.innerHTML = `<div class="comp-record-name">${typeTag}<span class="comp-skill-name">${rec.name}</span> ${rec.count > 1 ? `<span class="comp-record-count">x${rec.count}</span>` : ''}</div><div class="comp-record-val">${totalRowDmg.toLocaleString()}</div>`;
        list.appendChild(row);
        detailRows.push(row);
    });

    // [추가] 아코디언 토글 로직
    const performToggle = (hide) => {
        detailRows.forEach(r => r.style.display = hide ? 'none' : 'flex');
        const icon = totalRow.querySelector('.toggle-icon');
        if (icon) icon.textContent = hide ? '▶' : '▼';
        totalRow.style.marginBottom = hide ? '0' : '8px';
        totalRow.style.borderBottom = hide ? 'none' : '1.5px solid #eee';
        slot.dataset.hidden = hide ? 'true' : 'false';
    };

    // 초기 상태 설정
    slot.dataset.hidden = 'false';

    // 외부 싱크를 위한 이벤트 리스너
    slot.addEventListener('toggleDetail', (e) => {
        performToggle(e.detail.hide);
    });

    // 헤더 클릭 시에는 renderUnifiedContent에서 할당한 syncToggle이 동작하도록 함 (여기서는 기본 할당 제거)
    // totalRow.onclick = ... (상위에서 처리)

    slot.appendChild(list);
    return slot;
}

export function clearHeroTabRemnants() {
    const idsToRemove = ['hero-graph-container', 'hero-tab-main-wrapper', 'hero-tables-wrapper', 'hero-comparison-tables', 'hero-graph-wrapper'];
    idsToRemove.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });

    const gradeLogo = document.getElementById('char-grade-logo');
    if (gradeLogo) gradeLogo.style.display = 'none';
}