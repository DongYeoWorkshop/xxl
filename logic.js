// logic.js
import { calculateCharacterStats, calculateDamage, calculateBaseStats, assembleFinalStats } from './calculations.js';
import { getSkillMultiplier, getDynamicDesc } from './formatter.js';
import { renderAppliedBuffsDisplay, setFormattedDesc, showToast, showSimpleTooltip } from './ui.js';
import { saveCharacterStats } from './storage.js';
import { getDisabledSkillIds, updateSkillStatesByBreakthrough } from './breakthrough.js';
import { state, constants } from './state.js';
import { charData } from './data.js';
import { getFormattedDamage } from './damage-calculator.js';
import { renderHeroTab, clearHeroTabRemnants } from './hero-tab.js';

let dom = {};

export function initLogic(domElements) {
    dom = domElements;
}

export function saveCurrentStats() {
    if (!state.currentId) return;
    
    // 모든 탭 ID(캐릭터, hero, simulator)를 마지막 선택 상태로 저장
    localStorage.setItem('lastSelectedCharId', state.currentId);
    
    if (state.currentId === 'hero' || state.currentId === 'simulator') return;

    if (!state.savedStats[state.currentId]) state.savedStats[state.currentId] = {};
    const char = state.savedStats[state.currentId];
    char.lv = dom.sliderInput.value;
    char.s1 = dom.extraSlider1.value;
    char.s2 = dom.extraSlider2.value;

    const charSkills = {};
    for (let i = 1; i <= 7; i++) {
        const slider = document.getElementById(`skill-slider-${state.currentId}-${i}`);
        if (slider) charSkills[`s${i}`] = slider.value;
    }
    char.skills = charSkills;
    char.stamp = document.getElementById(`stamp-check-${state.currentId}`)?.checked || false;

    const activeSkills = [];
    dom.skillContainer.querySelectorAll('.skill-card.active').forEach(card => {
        if (!card.classList.contains('always-open')) activeSkills.push(parseInt(card.dataset.skillIndex));
    });
    char.activeSkills = activeSkills;
    char.appliedBuffs = state.appliedBuffs; 
    char.damageRecords = state.damageRecords[state.currentId] || [];
    
    if (!char.customValues) char.customValues = {};
    
    const customInputs = dom.skillContainer.querySelectorAll('.skill-custom-input');
    customInputs.forEach(input => {
        const key = input.dataset.key;
        if (key) char.customValues[key] = parseInt(input.value);
    });

    saveCharacterStats(state.currentId, char);
    updateCharacterListIndicators();
}

export function updateCharacterListIndicators() {
    // [수정] 헤더의 모든 메인 이미지 순회 (동적으로 래퍼 생성 및 정보 오버레이 추가)
    document.querySelectorAll('.header-left .main-image').forEach(img => {
        const id = img.dataset.id;
        // 특수 아이콘('hero', 'simulator', 'nav-hero-btn' 등) 제외
        if (!id || id === 'hero' || id === 'simulator') return;

        // 1. 래퍼(Wrapper) 확인 및 생성
        let wrapper = img.parentElement;
        
        // 이미지가 아직 래퍼 안에 없다면 생성 (헤더 영역인 경우에만)
        if (!wrapper.classList.contains('char-slot-wrapper')) {
            wrapper = document.createElement('div');
            wrapper.className = 'char-slot-wrapper';
            
            // 기존 위치에 래퍼 삽입 후 이미지를 내부로 이동
            img.parentNode.insertBefore(wrapper, img);
            wrapper.appendChild(img);
        }

        // 2. 오버레이(Overlay) 확인 및 생성
        let overlay = wrapper.querySelector('.char-info-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'char-info-overlay';
            wrapper.appendChild(overlay);
        }

        let topOverlay = wrapper.querySelector('.char-top-overlay');
        if (!topOverlay) {
            topOverlay = document.createElement('div');
            topOverlay.className = 'char-top-overlay';
            wrapper.appendChild(topOverlay);
        }

        let gradeTag = wrapper.querySelector('.char-grade-tag');
        if (!gradeTag) {
            gradeTag = document.createElement('div');
            gradeTag.className = 'char-grade-tag';
            wrapper.appendChild(gradeTag);
        }

        let bottomLine = wrapper.querySelector('.char-bottom-line');
        if (!bottomLine) {
            bottomLine = document.createElement('div');
            bottomLine.className = 'char-bottom-line';
            wrapper.appendChild(bottomLine);
        }

        const data = charData[id];

        // 2. 속성 및 등급 클래스 적용
        // 기존 클래스 제거
        topOverlay.classList.remove('attr-0', 'attr-1', 'attr-2', 'attr-3', 'attr-4');
        img.classList.remove('attr-0', 'attr-1', 'attr-2', 'attr-3', 'attr-4');
        gradeTag.classList.remove('grade-xl');
        bottomLine.classList.remove('grade-xl');
        
        if (data && data.info && data.info.속성 !== undefined) {
            const attrClass = `attr-${data.info.속성}`;
            topOverlay.classList.add(attrClass);
            img.classList.add(attrClass);
        }

        if (data && data.grade === 'XL') {
            img.classList.add('grade-xl');
            gradeTag.classList.add('grade-xl');
            bottomLine.classList.add('grade-xl');
        } else {
            img.classList.remove('grade-xl');
        }

        // 3. 저장된 스탯 가져오기 및 텍스트 포맷팅
        const saved = state.savedStats[id] || {};
        const lv = saved.lv || 1;
        
        const brVal = parseInt(saved.s1 || 0);
        let brText = (brVal < 5) ? "0성" : 
                     (brVal < 15) ? "1성" : 
                     (brVal < 30) ? "2성" : 
                     (brVal < 50) ? "3성" : 
                     (brVal < 75) ? "4성" : "5성";

        // 별(★) 기호 사용 시: 
        // const stars = (brVal < 5) ? 0 : (brVal < 15) ? 1 : (brVal < 30) ? 2 : (brVal < 50) ? 3 : (brVal < 75) ? 4 : 5;
        // brText = `★${stars}`;

        const fit = parseInt(saved.s2 || 0);
        const fitImg = fit > 0 ? `heart${fit}.png` : `heart.png`;
        const fitHtml = `<img src="icon/${fitImg}" style="width: 20px; height: 20px; object-fit: contain; margin-left: 2px; vertical-align: middle;" alt="${fit}">`;
        
        // 오버레이 내용 업데이트 (좌우 분리 구조)
        overlay.innerHTML = `
            <div class="info-left-col">
                <span class="overlay-row-item">${brText}</span>
                <span class="overlay-row-item">Lv.${lv}</span>
            </div>
            <div class="info-right-col">
                ${fitHtml}
            </div>
        `;

        // 4. 변경 사항 표시 (테두리 등)
        let isModified = false;
        if (state.savedStats[id]) {
            const isLvDefault = (parseInt(saved.lv || 1) === 1);
            const isS1Default = (parseInt(saved.s1 || 0) === 0);
            const isS2Default = (parseInt(saved.s2 || 0) === 0);
            let areSkillsDefault = true;
            if (saved.skills) areSkillsDefault = Object.values(saved.skills).every(val => parseInt(val) === 1);
            const isStampDefault = (saved.stamp === false);
            if (!isLvDefault || !isS1Default || !isS2Default || !areSkillsDefault || !isStampDefault) isModified = true;
        }
        img.classList.toggle('modified', isModified);
    });
}

/**
 * [메인 함수] 캐릭터 스탯 및 화면 정보를 통합 업데이트합니다.
 */
export function updateStats(level = parseInt(dom.sliderInput.value), skipBuffRender = false) {
    if (typeof charData === 'undefined') return;
    
    updateStickyHeader(level);

    if (!state.currentId) {
        clearHeroTabRemnants();
        return; 
    }
    const data = charData[state.currentId];
    if (!data) return;

    if (!data.base) {
        renderHeroTab(dom, updateStats);
        return; 
    }
    clearHeroTabRemnants();

    // [복구] 캐릭터 이름 및 정보 업데이트
    const displayTitle = document.getElementById('display-title');
    const infoDisplay = document.getElementById('info-display');
    const contentDisplay = document.getElementById('content-display');

    if (displayTitle && data.title) {
        displayTitle.innerText = data.title;
    }
    if (infoDisplay && data.info) {
        infoDisplay.style.setProperty('display', 'flex', 'important');
        const attrName = constants.attributeList[data.info.속성];
        const posImg = constants.positionImageMap[data.info.포지션];
        infoDisplay.innerHTML = `
            <img src="${constants.attributeImageMap[attrName]}" style="width: 36px; height: 36px;" title="${attrName} 속성">
            <img src="${posImg}" style="width: 36px; height: 36px;" title="${data.info.포지션}">
        `;
    }

    // 등급 로고 이미지 관리 (상세 탭 왼쪽 상단)
    let gradeLogo = document.getElementById('char-grade-logo');
    if (!gradeLogo && contentDisplay) {
        gradeLogo = document.createElement('img');
        gradeLogo.id = 'char-grade-logo';
        // content-display의 가장 처음에 삽입
        contentDisplay.insertBefore(gradeLogo, contentDisplay.firstChild);
    }

    if (gradeLogo) {
        if (state.currentId && data) {
            // XL이면 xl.webp, 아니면 xxl.webp
            const isXL = (data.grade === 'XL');
            gradeLogo.src = isXL ? 'icon/xl.webp' : 'icon/xxl.webp';
            gradeLogo.style.display = 'block';
        } else {
            gradeLogo.style.display = 'none';
        }
    }

    const brVal = parseInt(dom.extraSlider1.value) || 0;
    const fitVal = parseInt(dom.extraSlider2.value) || 0;
    
    const baseStats = calculateBaseStats(data.base, level, brVal, fitVal, constants.defaultGrowth, data.grade);

    for (let i = 1; i <= 7; i++) {
        state.currentSkillLevels[i] = parseInt(document.getElementById(`skill-slider-${state.currentId}-${i}`)?.value || 1);
    }
    
    if (state.currentId === 'duncan') {
        if (!state.appliedBuffs['duncan']) state.appliedBuffs['duncan'] = [];
        const isUltSelected = (state.selectedSkillIndex === 1);
        let ultBuff = state.appliedBuffs['duncan'].find(b => b.skillId === 'duncan_skill2');
        if (isUltSelected) {
            if (!ultBuff) state.appliedBuffs['duncan'].push({ skillId: 'duncan_skill2', isAppliedStamped: true, count: 1 });
            else ultBuff.isAppliedStamped = true;
        } else if (ultBuff) {
            ultBuff.isAppliedStamped = false;
        }
    }

    const isUltStamped = document.getElementById(`stamp-check-${state.currentId}`)?.checked || false;
    const liveContext = {
        liveLv: level, liveBr: brVal, liveFit: fitVal,
        liveTargetCount: state.savedStats[state.currentId]?.commonMultiTargetCount || 1,
        liveCustomValues: state.savedStats[state.currentId]?.customValues || {},
        liveStamp: isUltStamped
    };
    
    let subStats = calculateCharacterStats(state.currentId, data, state.currentSkillLevels, isUltStamped, getSkillMultiplier, JSON.parse(JSON.stringify(state.appliedBuffs)), charData, state.savedStats, liveContext);
    state.currentExtraDamages = subStats.extraDamages || [];

    if (state.selectedSkillIndex === 1) {
        applyBoosterToSubStats(subStats, data);
    }

    const finalStats = assembleFinalStats(baseStats, subStats);
    const { 기초공격력, 최종공격력, 기초HP, 최종HP } = finalStats;
    
    updateMainStatDisplay(기초공격력, 최종공격력, 기초HP, 최종HP, baseStats);
    updateSubStatList(subStats);
    
    if (!skipBuffRender) {
        const disabledIds = getDisabledSkillIds(brVal, state.currentId);
        renderAppliedBuffsDisplay(state.appliedBuffs, charData, state.currentId, state.currentSkillLevels, getDynamicDesc, dom.appliedBuffsList, dom.currentlyAppliedBuffsDiv, updateStats, saveCurrentStats, disabledIds, state.savedStats, 기초공격력);
    }

    updateSkillCardsDisplay(data, subStats, 기초공격력, 최종공격력, 최종HP, isUltStamped);
    updateDetailViewDisplay(data, subStats, 기초공격력, 최종공격력, 최종HP, isUltStamped);
}

function updateStickyHeader(level) {
    const stickyHeader = document.getElementById('sticky-header');
    if (!stickyHeader) return;

    const infoSpans = ['sticky-name', 'sticky-attr', 'sticky-lv', 'sticky-br', 'sticky-fit'];
    const headerTitle = document.getElementById('sticky-header-title');
    const toggleIcon = document.getElementById('header-toggle-icon');
    
    // [수정] 홈 버튼(main.png)은 어떤 상황에서도 항상 표시
    if (toggleIcon) toggleIcon.style.setProperty('display', 'block', 'important');

    if (!state.currentId || state.currentId === 'hero' || state.currentId === 'simulator') {
        if (headerTitle) {
            headerTitle.style.setProperty('display', 'flex', 'important');
            headerTitle.innerHTML = `동여성 공방`;
        }
        infoSpans.forEach(id => { 
            const el = document.getElementById(id); 
            if (el) {
                el.style.setProperty('display', 'none', 'important');
                el.innerText = '';
            }
        });
    } else {
        const data = charData[state.currentId];
        if (data) {
            if (headerTitle) headerTitle.style.setProperty('display', 'none', 'important');
            infoSpans.forEach(id => { 
                const el = document.getElementById(id); 
                // [수정] 속성 아이콘(sticky-attr)은 이제 숨김
                if (el) {
                    if (id === 'sticky-attr') el.style.setProperty('display', 'none', 'important');
                    else el.style.setProperty('display', 'flex', 'important');
                }
            });
            const nameEl = document.getElementById('sticky-name');
            if (nameEl) nameEl.innerText = data.title;
            
            // [제거] 속성 아이콘 렌더링 로직 (더 이상 필요 없음)
            // const attrName = constants.attributeList[data.info?.속성];
            // const attrEl = document.getElementById('sticky-attr');
            // if (attrEl) attrEl.innerHTML = `<img src="${constants.attributeImageMap[attrName]}" class="sticky-attr-icon">`;
            
            const brVal = parseInt(dom.extraSlider1.value) || 0;
            const brText = (brVal < 5) ? `0성 ${brVal}단` : (brVal < 15) ? `1성 ${brVal - 5}단` : (brVal < 30) ? `2성 ${brVal - 15}단` : (brVal < 50) ? `3성 ${brVal - 30}단` : (brVal < 75) ? `4성 ${brVal - 50}단` : "5성";
            if (document.getElementById('sticky-lv')) document.getElementById('sticky-lv').innerText = `Lv.${level}`;
            if (document.getElementById('sticky-br')) document.getElementById('sticky-br').innerText = brText;
            if (document.getElementById('sticky-fit')) document.getElementById('sticky-fit').innerText = `적합:${dom.extraSlider2.value}`;
        }
    }
}

function updateMainStatDisplay(기초공격력, 최종공격력, 기초HP, 최종HP, baseStats) {
    dom.statsArea.innerHTML = '';
    const addStatLi = (label, val, tooltipText = null) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="stat-label">${label}</span> <span>${Math.floor(val).toLocaleString()}</span>`;
        if (tooltipText) {
            li.addEventListener('mouseenter', () => { if (!('ontouchstart' in window) && (navigator.maxTouchPoints <= 0)) { const tooltipControl = showSimpleTooltip(li, tooltipText); li.addEventListener('mouseleave', tooltipControl.onMouseLeave); } });
            li.addEventListener('click', (e) => {
                 e.stopPropagation();
                 const existing = document.querySelector('.buff-tooltip');
                 if (existing) { if (existing.timeoutId) clearTimeout(existing.timeoutId); existing.remove(); }
                 const tooltipControl = showSimpleTooltip(li, tooltipText);
                 const tooltipEl = document.querySelector('.buff-tooltip');
                 if (tooltipEl) { tooltipEl.timeoutId = setTimeout(() => { tooltipControl.remove(); }, 3000); }
                 const closeOnOutside = () => { tooltipControl.remove(); document.removeEventListener('click', closeOnOutside); };
                 setTimeout(() => document.addEventListener('click', closeOnOutside), 50);
            });
        }
        dom.statsArea.appendChild(li);
        return li;
    };
    addStatLi("기초공격력", 기초공격력, `초기공격력 : ${baseStats["공격력"].toLocaleString()}`);
    addStatLi("공격력", 최종공격력);
    if (최종HP > 0) {
        addStatLi("HP", 최종HP, `기초 HP : ${기초HP.toLocaleString()} (초기 HP : ${baseStats["HP"].toLocaleString()})`);
    }
}

function updateSubStatList(subStats) {
    const subWrapper = document.getElementById('sub-stats-wrapper');
    if (!subWrapper) return;
    subWrapper.innerHTML = ''; 
    
    const subStatToggleHeader = document.createElement('div');
    subStatToggleHeader.className = 'sub-stat-toggle-header';
    subStatToggleHeader.innerHTML = `<span>부가 스탯</span><span id="sub-stat-toggle-icon" style="font-size: 0.65em;">▼</span>`;
    subWrapper.appendChild(subStatToggleHeader);
    
    const subStatsContainer = document.createElement('div');
    subStatsContainer.className = 'sub-stats-container';
    
    const subStatsList = document.createElement('ul');
    subStatsList.id = 'sub-stats-list';
    
    // 초기 표시 여부 설정
    const isVisible = state.savedStats[state.currentId]?.subStatsListVisible === true;
    if (isVisible) subStatsContainer.style.display = 'block';
    subStatToggleHeader.querySelector('span:last-child').textContent = isVisible ? '▲' : '▼';
    
    subStatToggleHeader.addEventListener('click', () => {
        const nowVisible = subStatsContainer.style.display !== 'block';
        subStatsContainer.style.display = nowVisible ? 'block' : 'none';
        subStatToggleHeader.querySelector('span:last-child').textContent = nowVisible ? '▲' : '▼';
        state.savedStats[state.currentId].subStatsListVisible = nowVisible;
        saveCharacterStats(state.currentId, state.savedStats[state.currentId]);
    });
    const subStatDescriptions = { "뎀증": "고정데미지 형태를 제외한 모든 공격의 데미지가 증가합니다.", "평타뎀증": "고정수치 형태를 제외한 보통공격의 데미지, 힐, 배리어량이 증가합니다.", "필살기뎀증": "고정수치 형태를 제외한 필살기의 데미지, 힐, 배리어량이 증가합니다.", "트리거뎀증": "고정수치 형태를 제외한 추가발동의 데미지, 힐, 배리어량이 증가합니다.", "뎀증디버프": "적이 가진 받는 데미지 증가 수치입니다.", "속성디버프": "적이 가진 받는 속성 데미지 증가 수치입니다.", "공증": "기초공증이 계산된 이후 곱해지는 수치입니다.", "고정공증": "기초공증, 공증이 계산된 이후 가산되는 공격력입니다.", "기초공증": "레벨, 돌파, 적합을 계산한 이후 곱해지는 수치입니다."};
    const subStatDisplayNames = { "뎀증": "데미지 증가", "평타뎀증": "보통공격 효과", "필살기뎀증": "필살기 효과", "트리거뎀증": "발동 효과", "뎀증디버프": "데미지 디버프", "속성디버프": "속성 디버프", "공증": "공격력", "고정공증": "고정공격력", "기초공증": "기초공격력", "HP증가": "최대 HP", "기초HP증가": "기초 HP", "회복증가": "회복", "배리어증가": "배리어", "지속회복증가": "지속회복" };
    ["뎀증", "평타뎀증", "필살기뎀증", "트리거뎀증", "뎀증디버프", "속성디버프", "공증", "고정공증", "기초공증", "HP증가", "기초HP증가", "회복증가", "배리어증가", "지속회복증가"].forEach(cat => {
        const li = document.createElement('li');
        
        let val = subStats[cat] || 0;
        if (cat === "고정공증") {
            val = Math.floor(val); 
        } else {
            // 소수점 최대 2자리까지만 표시 (불필요한 .00 제거를 위해 parseFloat 사용)
            val = parseFloat(Number(val).toFixed(2));
        }

        const displayName = subStatDisplayNames[cat] || cat;
        li.innerHTML = `<span class="stat-label" style="font-size: 0.75em; font-weight: normal; color: #aaa;">${displayName}</span> <span style="font-size: 1.1em; font-weight: bold; color: #fff;">${val}${cat !== "고정공증" ? '%' : ''}</span>`;
        
        const tooltipText = subStatDescriptions[cat];
        if (tooltipText) {
            li.addEventListener('mouseenter', () => { if (!('ontouchstart' in window) && (navigator.maxTouchPoints <= 0)) { const tooltipControl = showSimpleTooltip(li, tooltipText); li.addEventListener('mouseleave', tooltipControl.onMouseLeave); } });
            li.addEventListener('click', (e) => { e.stopPropagation(); const existing = document.querySelector('.buff-tooltip'); if (existing) { if (existing.timeoutId) clearTimeout(existing.timeoutId); existing.remove(); } const tooltipControl = showSimpleTooltip(li, tooltipText); const tooltipEl = document.querySelector('.buff-tooltip'); if (tooltipEl) { tooltipEl.timeoutId = setTimeout(() => { tooltipControl.remove(); }, 3000); } const closeOnOutside = () => { tooltipControl.remove(); document.removeEventListener('click', closeOnOutside); }; setTimeout(() => document.addEventListener('click', closeOnOutside), 50); });
        }
        subStatsList.appendChild(li);
    });
    subStatsContainer.appendChild(subStatsList);
    subWrapper.appendChild(subStatsContainer);
}

function updateSkillCardsDisplay(data, subStats, 기초공격력, 최종공격력, 최종HP, isUltStamped) {
    dom.skillContainer.querySelectorAll('.skill-card').forEach(skillDiv => {
        const idx = parseInt(skillDiv.dataset.skillIndex);
        const skill = data.skills[idx];
        const lv = state.currentSkillLevels[idx + 1] || 1;
        const embeddedDesc = skillDiv.querySelector('.embedded-skill-desc');
        if (embeddedDesc && (skillDiv.classList.contains('active') || skillDiv.classList.contains('always-open'))) {
            setFormattedDesc(embeddedDesc, getDynamicDesc(skill, lv, (idx === 1 && isUltStamped)));
        }
        const dmgTextDiv = skillDiv.querySelector('.skill-damage-text');
        if (!skill.damageDeal && !skill.healDeal && !skill.barrierDeal && !(skill.ratioEffects && skill.ratioEffects["고정공증"])) { 
            dmgTextDiv.innerText = ''; dmgTextDiv.style.display = 'none'; return; 
        }
        dmgTextDiv.style.display = 'block'; 
        const dmgInfo = getFormattedDamage(skill, lv, isUltStamped, true, undefined, undefined, subStats, 기초공격력, 최종공격력, 최종HP, idx);
        dmgTextDiv.innerText = dmgInfo.text;
        dmgTextDiv.style.fontSize = dmgInfo.text.length > 25 ? '0.72em' : '0.82em';
    });
}

function updateDetailViewDisplay(data, subStats, 기초공격력, 최종공격력, 최종HP, isUltStamped) {
    if (!dom.newSectionArea || state.selectedSkillIndex === null) return;
    const idx = state.selectedSkillIndex;
    const isExternal = state.selectedIsExternal;
    const skill = isExternal ? state.currentExtraDamages[idx] : data.skills[idx];
    if (!skill) return;
    let lv = isExternal ? skill.level : (state.currentSkillLevels[idx + 1] || 1);
    if (!isExternal) {
        if (skill.syncLevelWith) {
            const targetIdx = data.skills.findIndex(s => s.id === skill.syncLevelWith);
            if (targetIdx !== -1) lv = state.currentSkillLevels[targetIdx + 1] || 1;
        } else if (skill.isUltExtra) { lv = state.currentSkillLevels[2] || 1; }
    }
    const detailHeaderRow = dom.newSectionArea.querySelector('.skill-detail-header-row');
    if (!detailHeaderRow) return;
    const bigIcon = detailHeaderRow.querySelector('.skill-detail-main-icon');
    if (bigIcon) bigIcon.src = skill.icon;
    const typeDiv = detailHeaderRow.querySelector('.skill-detail-type-label');
    if (typeDiv && skill.damageDeal) {
        const uniqueTypes = Array.from(new Set(skill.damageDeal.map(d => d.type)));
        typeDiv.textContent = (isExternal ? "[외부버프] " : "") + uniqueTypes.join(', ');
    }
    const nameEl = detailHeaderRow.querySelector('.skill-detail-title');
    if (nameEl) nameEl.innerHTML = `${skill.name} <span class="skill-detail-level-span">(Lv.${lv})</span>`;
    const detailDamageP = detailHeaderRow.querySelector('.skill-detail-damage-val');
    if (detailDamageP) {
        const attackerAttr = data.info?.속성;
        const targetAttr = constants.attributeList.indexOf(state.currentDisplayedAttribute);
        let displayText = "";
        if (isExternal) {
            let totalExtraDamage = 0;
            skill.damageDeal.forEach(d => { totalExtraDamage += calculateDamage(d.type, 최종공격력, subStats, d.val, false, attackerAttr, targetAttr); });
            displayText = Math.floor(totalExtraDamage).toLocaleString();
        } else {
            const dmgInfo = getFormattedDamage(skill, lv, isUltStamped, false, attackerAttr, targetAttr, subStats, 기초공격력, 최종공격력, 최종HP, idx);
            displayText = (skill.ratioEffects && skill.ratioEffects["고정공증"]) ? dmgInfo.text : dmgInfo.pureDmgText;
        }
        let damageColor = '#000'; 
        if (!isExternal && attackerAttr !== undefined && targetAttr !== -1) {
             const wins = { 0: 2, 1: 0, 2: 1, 3: 4, 4: 3 }, loses = { 0: 1, 1: 2, 2: 0, 3: 4, 4: 3 };
             if (wins[attackerAttr] === targetAttr) damageColor = '#28a745';
             else if (loses[attackerAttr] === targetAttr) {
                 if (attackerAttr <= 2 && targetAttr <= 2) damageColor = '#dc3545';
                 if ((attackerAttr === 3 && targetAttr === 4) || (attackerAttr === 4 && targetAttr === 3)) damageColor = '#28a745';
             }
        }
        detailDamageP.style.color = damageColor;
        detailDamageP.textContent = displayText;
        const iconContainer = detailHeaderRow.querySelector('.skill-detail-icon-column');
        if (iconContainer) {
            iconContainer.querySelectorAll('.extra-dmg-icon').forEach(el => el.remove());
            const dmgInfo = getFormattedDamage(skill, lv, isUltStamped, false, attackerAttr, targetAttr, subStats, 기초공격력, 최종공격력, 최종HP, idx);
            if (dmgInfo.extraIcons) {
                dmgInfo.extraIcons.forEach(iconSrc => {
                    const img = document.createElement('img');
                    img.src = iconSrc;
                    img.className = 'extra-dmg-icon';
                    iconContainer.appendChild(img);
                });
            }
        }
    }
}

function applyBoosterToSubStats(subStats, charDataObj) {
    const boosterSkillIdx = charDataObj.skills.findIndex(s => s.isUltBooster);
    const currentBreakthrough = parseInt(dom.extraSlider1.value) || 0;
    const isUnlocked = (boosterSkillIdx === 6) ? (currentBreakthrough >= 75) : true; 
    if (boosterSkillIdx !== -1 && isUnlocked) {
        const boosterSkill = charDataObj.skills[boosterSkillIdx];
        const boosterLv = state.currentSkillLevels[boosterSkillIdx + 1] || 1;
        if (boosterSkill.calc && boosterSkill.calc.length > 0) {
            const maxVal = boosterSkill.calc[0].max;
            if (maxVal) {
                const rate = getSkillMultiplier(boosterLv, boosterSkill.startRate);
                subStats["뎀증"] = (subStats["뎀증"] || 0) + (maxVal * rate);
            }
        }
    }
}