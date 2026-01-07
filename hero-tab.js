// hero-tab.js
import { state } from './state.js';
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
    
    // 이전 Hero 탭 잔상 제거
    clearHeroTabRemnants();

    // 1. 상단 그래프 영역 (하얀 박스 컨테이너)
    const graphContainer = document.createElement('div');
    graphContainer.id = 'hero-graph-container';
    graphContainer.className = 'hero-graph-container';
    if (contentDisplay) contentDisplay.prepend(graphContainer);

    const headerTab = document.createElement('div');
    headerTab.className = 'hero-tab-tag';
    headerTab.innerHTML = `<div class="hero-tag-content">기록 중인 캐릭터 (딜량 비교)</div>`;
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
            state.heroComparisonState = { slot1Id: null, slot2Id: null, nextTarget: 1 };
            saveSnapshots([]);
            updateStatsCallback(); 
        }
    };
    headerDiv.appendChild(clearAllBtn);
    contentPadding.appendChild(headerDiv);

    if (hasSnapshots) {
        const maxTotal = Math.max(...snapshots.map(s => s.totalDamage));
        const imgGrid = document.createElement('div');
        imgGrid.className = 'graph-img-grid';
        import('./handlers.js').then(mod => mod.setupDragScroll(imgGrid));

        snapshots.forEach(snapshot => {
            const totalDmg = snapshot.totalDamage;
            const barHeight = maxTotal > 0 ? (totalDmg / maxTotal) * 100 : 0;
            const wrapper = document.createElement('div');
            wrapper.className = 'snapshot-wrapper';
            if (state.heroComparisonState?.slot1Id === snapshot.id || state.heroComparisonState?.slot2Id === snapshot.id) wrapper.classList.add('selected');

            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '×';
            deleteBtn.className = 'snapshot-del-btn';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                state.comparisonSnapshots = state.comparisonSnapshots.filter(s => s.id !== snapshot.id);
                saveSnapshots(state.comparisonSnapshots);
                updateStatsCallback();
            };
            wrapper.appendChild(deleteBtn);

            // [수정] 캐릭터 이미지와 서포터를 묶는 컨테이너 추가
            const imgContainer = document.createElement('div');
            imgContainer.style.cssText = 'position: relative; width: 70px; height: 180px; margin-bottom: 8px; cursor: pointer;';
            imgContainer.onclick = (e) => {
                e.stopPropagation();
                if (!state.heroComparisonState) state.heroComparisonState = { nextTarget: 1 };
                if (state.heroComparisonState.nextTarget === 1) {
                    state.heroComparisonState.slot1Id = snapshot.id;
                    state.heroComparisonState.nextTarget = 2;
                } else {
                    state.heroComparisonState.slot2Id = snapshot.id;
                    state.heroComparisonState.nextTarget = 1;
                }
                updateStatsCallback(); 
            };

            const img = document.createElement('img');
            img.src = `images/${snapshot.charId}.webp`;
            img.className = 'snapshot-img';
            img.style.marginBottom = '0'; // 컨테이너에서 마진 관리
            imgContainer.appendChild(img);

            // [추가] 서포터 아이콘 표시 (이미지 컨테이너 기준 우측 하단)
            if (snapshot.supportId && snapshot.supportId !== 'none') {
                const supportIconArea = document.createElement('div');
                supportIconArea.style.cssText = `
                    position: absolute;
                    bottom: 2px;
                    right: 2px;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    border: 2px solid #6f42c1;
                    background: black;
                    overflow: hidden;
                    z-index: 5;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                `;
                supportIconArea.innerHTML = `<img src="images/${snapshot.supportId}.webp" style="width:100%; height:100%; object-fit:cover; object-position:top;">`;
                imgContainer.appendChild(supportIconArea);
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

    // 2. 그래프 영역 (별도의 흰색 박스)
    const graphWrapper = document.createElement('div');
    graphWrapper.id = 'hero-graph-wrapper';
    graphWrapper.className = 'hero-main-wrapper';
    graphWrapper.style.display = 'none'; // 초기에는 숨김
    if (contentDisplay) contentDisplay.appendChild(graphWrapper);

    const graphDiv = document.createElement('div');
    graphDiv.id = 'hero-comparison-graph';
    graphDiv.style.cssText = 'width: 100%; height: 250px; padding: 10px 0;';
    graphWrapper.appendChild(graphDiv);

    // 3. 하단 딜표 래퍼 (표가 나오는 흰 칸)
    const tablesWrapper = document.createElement('div');
    tablesWrapper.id = 'hero-tables-wrapper';
    tablesWrapper.className = 'hero-main-wrapper';
    if (contentDisplay) contentDisplay.appendChild(tablesWrapper);

    const tableContainer = document.createElement('div');
    tableContainer.id = 'hero-comparison-tables';
    tableContainer.className = 'comparison-tables-container';
    tablesWrapper.appendChild(tableContainer);

    // [추가] 그래프 데이터 생성 및 렌더링
    // 선택된 두 개의 스냅샷만 그래프에 표시 (없으면 표시 안 함)
    const s1Id = state.heroComparisonState?.slot1Id;
    const s2Id = state.heroComparisonState?.slot2Id;
    const activeSnapshots = state.comparisonSnapshots.filter(s => s.id === s1Id || s.id === s2Id);
    
    if (activeSnapshots.length > 0) {
        graphWrapper.style.display = 'block';
        createComparisonGraph(activeSnapshots, graphDiv);
    }

    renderUnifiedContent(tableContainer);
}

/**
 * 딜량 비교 꺾은선 그래프 생성 (SVG)
 */
function createComparisonGraph(snapshots, container) {
    if (!snapshots || snapshots.length === 0) return;

    // 데이터 전처리: 턴별 누적 데미지 계산
    const graphData = snapshots.map(snap => {
        const points = [];
        let cumDmg = 0;
        let currentTurn = 1;
        let turnDmg = 0;

        // 레코드 순회하며 턴별 합산 (턴 구분자 기준)
        snap.records.forEach(rec => {
            if (rec.isTurnSeparator) {
                // 이전 턴 저장 (1턴부터 시작하므로 구분자가 나오면 그 이전 턴이 끝난 것)
                // 하지만 구조상 구분자가 먼저 나오고 그 뒤에 데미지가 나옴 (1턴 구분자 -> 데미지 -> 2턴 구분자...)
                // 따라서 구분자를 만났을 때, '이전 턴'의 데이터를 저장해야 하는데
                // 첫 구분자(1턴)일 때는 저장할 게 없음.
                
                // 로직 수정: 구분자가 '새로운 턴의 시작'을 알림.
                // 직전 턴까지의 데미지를 누적에 더하고 포인트 추가.
                if (rec.turnNumber > 1) { 
                     // 1턴 데이터는 2턴 구분자가 나올 때 저장됨.
                     // 마지막 턴 데이터는 루프 끝나고 저장해야 함.
                     cumDmg += turnDmg;
                     points.push({ t: currentTurn, d: cumDmg });
                     turnDmg = 0;
                }
                currentTurn = rec.turnNumber;
            } else {
                const dmgVal = parseInt((rec.damage || "0").replace(/,/g, '')) || 0;
                turnDmg += dmgVal * (rec.count || 1);
            }
        });
        // 마지막 턴 처리
        cumDmg += turnDmg;
        points.push({ t: currentTurn, d: cumDmg });

        return { id: snap.id, charId: snap.charId, points };
    });

    // 축 범위 계산
    const allPoints = graphData.flatMap(d => d.points);
    const maxTurn = Math.max(...allPoints.map(p => p.t), 1);
    const maxDmg = Math.max(...allPoints.map(p => p.d), 100); // 최소값 보정

    // [수정] 화면 너비에 따라 내부 그리기 높이 동기화 (늘려짐 방지)
    const screenWidth = window.innerWidth;
    const height = screenWidth >= 1100 ? 350 : 250;
    
    const width = container.clientWidth || 600; 
    const padding = { top: 20, right: 40, bottom: 30, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33F6', '#F6FF33', '#33FFF6', '#FF8C00', '#8A2BE2'];
    // 캐릭터 ID별 고정 색상을 쓰고 싶다면 매핑 필요, 여기서는 순서대로 할당
    
    let svgHtml = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="overflow:visible;">`;

    // Y축 그리드 & 라벨
    for (let i = 0; i <= 5; i++) {
        const yVal = (maxDmg / 5) * i;
        const yPos = padding.top + chartH - (chartH * (i / 5));
        const label = yVal >= 1000 ? (yVal / 1000).toFixed(0) + 'K' : Math.floor(yVal);
        
        svgHtml += `<line x1="${padding.left}" y1="${yPos}" x2="${width - padding.right}" y2="${yPos}" stroke="#eee" stroke-dasharray="4" />`;
        svgHtml += `<text x="${padding.left - 5}" y="${yPos + 4}" text-anchor="end" font-size="10" fill="#888">${label}</text>`;
    }

    // X축 라벨
    for (let t = 1; t <= maxTurn; t++) {
        // 턴이 너무 많으면 간격 조절
        if (maxTurn > 15 && t % 2 !== 0 && t !== maxTurn) continue;
        if (maxTurn > 30 && t % 5 !== 0 && t !== maxTurn) continue;

        const xPos = padding.left + (chartW * ((t - 1) / (maxTurn - 1 || 1)));
        svgHtml += `<text x="${xPos}" y="${height - 5}" text-anchor="middle" font-size="10" fill="#888">${t}</text>`;
    }

    // 데이터 라인 그리기
    graphData.forEach((g, idx) => {
        const color = colors[idx % colors.length];
        let pathD = "";
        
        g.points.forEach((p, i) => {
            const x = padding.left + (chartW * ((p.t - 1) / (maxTurn - 1 || 1)));
            const y = padding.top + chartH - (chartH * (p.d / maxDmg));
            
            if (i === 0) pathD += `M ${x} ${y}`;
            else pathD += ` L ${x} ${y}`;
            
            // 데이터 포인트 (원)
            svgHtml += `<circle cx="${x}" cy="${y}" r="3" fill="${color}" stroke="#fff" stroke-width="1" />`;
        });

        svgHtml += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" />`;
        
        // 범례 (Legend) - 상단 우측
        const legendX = width - padding.right - 100;
        const legendY = padding.top + (idx * 15);
        const charName = charData[g.charId]?.title || g.charId;
        svgHtml += `<rect x="${legendX}" y="${legendY - 6}" width="8" height="8" fill="${color}" rx="2" />`;
        svgHtml += `<text x="${legendX + 12}" y="${legendY + 2}" font-size="10" fill="#555" font-weight="bold">${charName}</text>`;
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

    // 데이터가 하나도 없을 때 (슬롯 숨김 및 안내 문구만 표시)
    if (!snap1 && !snap2) {
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.minHeight = '200px'; // 세로 중앙을 위한 높이 확보

        const msgDiv = document.createElement('div');
        msgDiv.style.cssText = `
            text-align: center;
            color: #999;
            font-weight: bold;
            font-size: 1.1em;
        `;
        msgDiv.innerText = "비교기록을 선택해주세요.";
        container.appendChild(msgDiv);
        return;
    }

    // 데이터가 있을 때는 다시 기본 레이아웃으로 (flex 해제 필요 시 처리)
    container.style.display = 'block'; 
    container.style.minHeight = '';

    // 최상단 캐릭터 프로필 요약 (데이터가 있을 때만 생성)
    const headerRow = document.createElement('div');
    headerRow.className = 'unified-turn-content';
    headerRow.style.marginBottom = '-20px'; // 간격 더 줄임
    
    headerRow.appendChild(createProfileHeader(snap1, true));
    headerRow.appendChild(createProfileHeader(snap2, false));
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
        
        contentRow.appendChild(createRecordColumn(turnData1[t], true));
        contentRow.appendChild(createRecordColumn(turnData2[t], false));
        
        turnBlock.appendChild(contentRow);
        container.appendChild(turnBlock);
    }
}

function createProfileHeader(snapshot, isLeft) {
    const slot = document.createElement('div');
    // 레이아웃 유지를 위해 comparison-slot 클래스는 쓰되, 배경과 글로우는 제거
    slot.className = 'comparison-slot'; 
    slot.style.background = 'transparent';
    slot.style.border = 'none';
    slot.style.boxShadow = 'none';
    slot.style.padding = '5px 10px';
    slot.style.minHeight = '60px'; // 60px로 복구
    slot.style.visibility = 'visible';

    if (!snapshot) {
        return slot;
    }

    const charTitle = charData[snapshot.charId]?.title || snapshot.charId;
    const { lv, s1, s2 } = snapshot.stats || { lv: 1, s1: 0, s2: 0 };
    let brText = (s1 >= 75) ? "5성" : (s1 >= 50) ? `4성 ${s1-50}단` : (s1 >= 30) ? `3성 ${s1-30}단` : (s1 >= 15) ? `2성 ${s1-15}단` : (s1 >= 5) ? `1성 ${s1-5}단` : `0성 ${s1}단`;
    const spec = `Lv.${lv} / ${brText} / 적합:${s2}`;

    slot.innerHTML = `
        <div class="comp-header" style="border-bottom:none; margin-bottom:0; background:transparent; box-shadow:none;">
            <div class="comp-char-info">
                <img src="images/${snapshot.charId}.webp" class="comp-char-img">
                <div class="comp-text-wrapper">
                    <span class="comp-name" style="font-size:0.9em; color:#333; font-weight:bold;">${charTitle}</span>
                    <span class="comp-spec" style="font-size:0.65em; color:#666;">${spec}</span>
                </div>
            </div>
            <div class="comp-total-dmg" style="color:#333; font-weight:bold;">${snapshot.totalDamage.toLocaleString()}</div>
        </div>
    `;
    return slot;
}

function createRecordColumn(records, isLeft) {
    const slot = document.createElement('div');
    slot.className = 'comparison-slot ' + (isLeft ? 'comp-slot-left' : 'comp-slot-right');
    if (!records || records.length === 0) {
        slot.style.background = 'transparent';
        slot.style.border = 'none';
        slot.style.boxShadow = 'none';
        return slot;
    }

    const list = document.createElement('div');
    list.className = 'comp-record-list';
    records.forEach(rec => {
        const row = document.createElement('div');
        row.className = 'comp-record-row';
        const damageVal = (rec.damage || "0").replace(/,/g, '');
        const totalRowDmg = (parseInt(damageVal) || 0) * (rec.count || 1);
        const typeTag = rec.type ? `<span style="color:#999; margin-right:4px;">[${rec.type}]</span>` : '';
        row.innerHTML = `<div class="comp-record-name">${typeTag}${rec.name} ${rec.count > 1 ? `<span class="comp-record-count">x${rec.count}</span>` : ''}</div><div class="comp-record-val">${totalRowDmg.toLocaleString()}</div>`;
        list.appendChild(row);
    });
    slot.appendChild(list);
    return slot;
}

export function clearHeroTabRemnants() {
    const idsToRemove = ['hero-graph-container', 'hero-tab-main-wrapper', 'hero-tables-wrapper', 'hero-comparison-tables', 'hero-graph-wrapper'];
    idsToRemove.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
}
