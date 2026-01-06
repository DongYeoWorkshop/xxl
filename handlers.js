// handlers.js (가장 안정적이었던 로직으로 수동 복구)
import { state, constants } from './state.js';
import { charData } from './data.js';
import { updateSkillStatesByBreakthrough } from './breakthrough.js';
import { renderBuffSearchResults, displayBuffSkills, renderAppliedBuffsDisplay } from './ui.js';
import { renderSkills } from './render-skills.js';
import { addAppliedBuff, removeAppliedBuff } from './buffs.js';
import { getDynamicDesc } from './formatter.js';
import { updateSkillDetailDisplay, renderGlobalTargetControl, renderSkillIconList, renderCustomControls } from './detail-view.js';
import { renderDamageRecords } from './records.js';
import { backgroundConfigs } from './background-configs.js';

let dom = {};
let logic = {};

export function initHandlers(domElements, logicFunctions) {
    dom = domElements;
    logic = logicFunctions;
    setupSortListeners();
    setupHeaderListeners();

    window.addEventListener('scroll', () => {
        if (state.currentId) {
            localStorage.setItem(`scroll_pos_${state.currentId}`, window.scrollY);
        }
    });

    if (dom.sliderInput) {
        dom.sliderInput.addEventListener('input', (e) => {
            let val = parseInt(e.target.value);
            if (val > 1) {
                const snapped = Math.round(val / 5) * 5;
                const finalVal = Math.max(1, Math.min(60, snapped));
                if (Math.abs(val - finalVal) <= 2) e.target.value = finalVal;
            }
        });
    }

    const simulatorBtn = document.getElementById('nav-simulator-btn');
    if (simulatorBtn) simulatorBtn.onclick = () => handleImageClick(simulatorBtn);

    window.triggerDetailUpdate = (idx) => {
        if (state.selectedSkillIndex === idx) {
            const data = charData[state.currentId];
            if (data && data.skills[idx]) updateSkillDetailDisplay(data.skills[idx], idx, dom, logic);
        }
    };

    window.triggerIconListUpdate = () => {
        if (state.currentId && !['hero', 'simulator'].includes(state.currentId)) {
            const brVal = parseInt(dom.extraSlider1.value) || 0;
            renderSkillIconList(state.currentId, brVal, dom, logic);
        }
    };

    window.addEventListener('resize', () => {
        if (state.currentId && !['hero', 'simulator'].includes(state.currentId)) {
            logic.updateStats();
        }
    });
}

export function onExtraSliderChange() {
    if (!state.currentId || ['hero', 'simulator'].includes(state.currentId)) return;
    const brVal = parseInt(dom.extraSlider1.value) || 0;
    const brText = (brVal < 5) ? `0성 ${brVal}단계` : (brVal < 15) ? `1성 ${brVal - 5}단계` : (brVal < 30) ? `2성 ${brVal - 15}단계` : (brVal < 50) ? `3성 ${brVal - 30}단계` : (brVal < 75) ? `4성 ${brVal - 50}단계` : "5성";
    if (dom.extraVal1) dom.extraVal1.innerText = brText;
    if (dom.extraVal2) dom.extraVal2.innerText = dom.extraSlider2.value;
    if (dom.levelVal) dom.levelVal.innerText = dom.sliderInput.value;
    updateSkillStatesByBreakthrough(brVal, dom.skillContainer, state.currentId, state.savedStats);
    renderSkillIconList(state.currentId, brVal, dom, logic);
    renderGlobalTargetControl(state.currentId, charData[state.currentId], logic);
    logic.updateStats();
    logic.saveCurrentStats();
}

function setupHeaderListeners() {
    const toggleIcon = document.getElementById('header-toggle-icon');
    if (toggleIcon) {
        toggleIcon.onclick = () => {
            const headerTitle = document.getElementById('sticky-header-title');
            if (headerTitle) headerTitle.click();
        };
    }

    const headerTitle = document.getElementById('sticky-header-title');
    if (headerTitle) {
        headerTitle.onclick = () => {
            state.currentId = null;
            localStorage.removeItem('lastSelectedCharId');
            window.scrollTo(0, 0);

            // [수정] 클래스 교체를 명확하게 수행
            document.body.classList.remove('hero-mode-active', 'char-page-active', 'sub-page-active');
            document.body.classList.add('landing-page-active');
            
            const contentDisplay = document.getElementById('content-display');
            if (contentDisplay) { 
                contentDisplay.className = 'landing-mode'; 
                // [추가] 배경 스타일 초기화 (잔여물 제거)
                contentDisplay.style.removeProperty('--bg-url');
            }

            hideAllSections();
            const landingPage = document.getElementById('landing-page');
            if (landingPage) landingPage.style.setProperty('display', 'block', 'important');
            const mainCol = document.querySelector('.main-content-column');
            if (mainCol) mainCol.style.setProperty('display', 'block', 'important');
            
            import('./hero-tab.js').then(mod => mod.clearHeroTabRemnants());
            document.querySelector('.main-image.selected')?.classList.remove('selected');
            forceMainHeader();
            logic.updateStats();
        };
    }
    const stickyName = document.getElementById('sticky-name');
    if (stickyName) {
        stickyName.onclick = () => {
            if (!state.currentId) return;
            const visibleImgs = Array.from(dom.images).filter(img => { const style = window.getComputedStyle(img); return style.display !== 'none' && img.dataset.id !== 'hero' && img.dataset.id !== 'simulator'; });
            if (visibleImgs.length > 1) { const currentIdx = visibleImgs.findIndex(img => img.dataset.id === state.currentId); const nextIdx = (currentIdx + 1) % visibleImgs.length; handleImageClick(visibleImgs[nextIdx]); }
        };
    }
    const stickyAttr = document.getElementById('sticky-attr');
    if (stickyAttr) stickyAttr.onclick = () => {
        const headerTitle = document.getElementById('sticky-header-title');
        if (headerTitle) headerTitle.click();
    };
    document.getElementById('sticky-lv')?.addEventListener('click', () => cycleValue(dom.sliderInput, 1, 60, 5));
    document.getElementById('sticky-br')?.addEventListener('click', () => cycleThresholds(dom.extraSlider1, [0, 5, 15, 30, 50, 75]));
    document.getElementById('sticky-fit')?.addEventListener('click', () => cycleValue(dom.extraSlider2, 0, 5, 1));
    document.getElementById('br-up-btn')?.addEventListener('click', () => adjustSlider(dom.extraSlider1, 1, 75));
    document.getElementById('br-down-btn')?.addEventListener('click', () => adjustSlider(dom.extraSlider1, -1, 75));
}

export function forceMainHeader() {
    const headerTitle = document.getElementById('sticky-header-title');
    const toggleIcon = document.getElementById('header-toggle-icon');
    if (toggleIcon) { toggleIcon.style.setProperty('display', 'block', 'important'); }
    if (headerTitle) { headerTitle.style.setProperty('display', 'flex', 'important'); headerTitle.innerHTML = `동여성 공방`; }
    ['sticky-name', 'sticky-attr', 'sticky-lv', 'sticky-br', 'sticky-fit'].forEach(id => { const el = document.getElementById(id); if (el) { el.style.setProperty('display', 'none', 'important'); el.innerText = ''; } });
}

export function hideAllSections() {
    const ids = ['landing-page', 'simulator-page', 'new-section-area', 'buff-application-area', 'skill-container', 'calc-and-stats-row', 'sub-stats-wrapper', 'info-display'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.setProperty('display', 'none', 'important'); });
    const mainCol = document.querySelector('.main-content-column');
    const sideCol = document.querySelector('.side-content-column');
    if (mainCol) mainCol.style.setProperty('display', 'none', 'important');
    if (sideCol) sideCol.style.setProperty('display', 'none', 'important');
    const charHeader = document.querySelector('.char-header-row');
    if (charHeader) charHeader.style.setProperty('display', 'none', 'important');

    // [추가] 캐릭터 전용 UI 요소 초기화
    const favBtn = document.querySelector('.char-fav-btn');
    const simShortcutBtn = document.querySelector('.sim-shortcut-btn');
    if (favBtn) favBtn.style.setProperty('display', 'none', 'important');
    if (simShortcutBtn) simShortcutBtn.style.setProperty('display', 'none', 'important');

    const contentDisplay = document.getElementById('content-display');
    if (contentDisplay) {
        contentDisplay.style.removeProperty('display'); // [추가] 인라인 display 스타일 제거 (그리드 복구용)
        contentDisplay.style.setProperty('--bg-url', 'none');
        contentDisplay.style.removeProperty('--bg-align-mob');
        contentDisplay.style.removeProperty('--bg-x-mob');
        contentDisplay.style.removeProperty('--bg-y-mob');
        contentDisplay.style.removeProperty('--bg-size-mob');
    }
}

export function handleImageClick(img) {
    const id = img.dataset.id;
    if (!id) return;
    
    // [수정] 스크롤 위치 복원 로직
    const savedScroll = localStorage.getItem(`scroll_pos_${id}`);
    if (savedScroll) {
        // 약간의 지연 후 스크롤 복원 (DOM 렌더링 대기)
        setTimeout(() => window.scrollTo(0, parseInt(savedScroll)), 0);
    } else {
        window.scrollTo(0, 0);
    }
    
    // [보강] 모든 페이지 상태 클래스 초기화 후 현재 상태 적용
    document.body.classList.remove('landing-page-active', 'hero-mode-active', 'char-page-active');
    document.body.classList.add('sub-page-active');
    
    document.querySelector('.main-image.selected')?.classList.remove('selected');
    img.classList.add('selected');
    img.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    state.currentId = id;
    const contentDisplay = document.getElementById('content-display');
    if (contentDisplay) { contentDisplay.setAttribute('data-char-id', id); }
    hideAllSections();

    if (id === 'hero') {
        contentDisplay.className = 'hero-mode'; 
        document.body.classList.add('hero-mode-active'); // 히어로/시뮬 공통 클래스
        forceMainHeader();
        import('./hero-tab.js').then(mod => { mod.clearHeroTabRemnants(); mod.renderHeroTab(dom, logic.updateStats); });
    } else if (id === 'simulator') {
        contentDisplay.className = 'hero-mode';
        document.body.classList.add('hero-mode-active'); // 히어로/시뮬 공통 클래스
        document.querySelector('.main-content-column').style.setProperty('display', 'block', 'important');
        document.getElementById('simulator-page').style.setProperty('display', 'block', 'important');
        forceMainHeader();
        import('./hero-tab.js').then(mod => mod.clearHeroTabRemnants());
        import('./simulator.js').then(mod => mod.initSimulator());
    } else {
        document.body.classList.add('char-page-active'); // [추가] 일반 캐릭터 탭 전용 클래스
        contentDisplay.className = '';
        const charHeader = document.querySelector('.char-header-row');
        if (charHeader) charHeader.style.setProperty('display', 'block', 'important');
        
        const mainCol = document.querySelector('.main-content-column');
        const sideCol = document.querySelector('.side-content-column');
        if (mainCol) mainCol.style.setProperty('display', 'block', 'important');
        if (sideCol) sideCol.style.setProperty('display', 'block', 'important');
        
        const show = (target, type = 'block') => { const el = document.getElementById(target); if (el) el.style.setProperty('display', type, 'important'); };
        ['new-section-area', 'buff-application-area', 'info-display', 'calc-area', 'bonus-sliders', 'sub-stats-wrapper'].forEach(s => show(s));
        
        const data = charData[id], saved = state.savedStats[id] || {};

        // 상세 정보 영역 기본 뼈대 주입
        if (dom.newSectionArea) {
            const initialIdx = saved.lastSelectedSkillIndex;
            
            dom.newSectionArea.innerHTML = `
                <div class="skill-detail-display">
                    ${initialIdx === undefined ? `
                        <div class="skill-detail-tab-tag">
                            <div class="skill-detail-tab-content">스킬 데미지 계산</div>
                        </div>
                        <div style="text-align:center; padding: 30px 20px; color: #aaa; font-size: 0.85em; font-weight: bold;">
                            <img src="icon/main.png" style="width: 24px; opacity: 0.3; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto;">
                            분석할 스킬 아이콘을 클릭하세요
                        </div>
                    ` : ''}
                </div>
                <div class="icon-list-row">
                    <div class="detail-icon-list"></div>
                    <div class="controls-wrapper">
                        <div id="global-target-control"></div>
                        <div id="custom-controls-container" style="display: flex; gap: 10px;"></div>
                    </div>
                </div>
            `;
            
            // 저장된 기록이 있을 때만 즉시 렌더링
            if (initialIdx !== undefined && data.skills && data.skills[initialIdx]) {
                state.selectedSkillIndex = initialIdx;
                state.selectedIsExternal = false;
                updateSkillDetailDisplay(data.skills[initialIdx], initialIdx, dom, logic);
            } else {
                state.selectedSkillIndex = null;
                state.selectedIsExternal = false;
            }
        }

        if (charHeader) {
            const infoDisplay = document.getElementById('info-display');
            if (infoDisplay) infoDisplay.style.setProperty('display', 'flex', 'important');
        }

        show('skill-container', 'grid'); show('calc-and-stats-row', 'flex');
        
        const applyBackground = (charId, favStatus) => {
            if (!contentDisplay) return;
            const charBg = document.getElementById('internal-char-bg');
            
            if (favStatus) {
                const def = backgroundConfigs["default"], spec = backgroundConfigs[charId] || {};
                
                // 모바일/태블릿/PC 설정 통합 (기본값 + 개별설정)
                const config = {
                    mobile: { ...def.mobile, ...(spec.mobile || {}) },
                    tablet: { ...def.tablet, ...(spec.tablet || {}) },
                    pc:     { ...def.pc,     ...(spec.pc || {}) }
                };

                contentDisplay.style.setProperty('--bg-url', `url('../images/background/${charId}.webp')`);
                
                // 1. 모바일 (기본 550px)
                const mobSize = 550 * config.mobile.scale;
                contentDisplay.style.setProperty('--bg-size-mob', `auto ${mobSize}px`);
                const mobX = config.mobile.xOffset; // 일괄 -200px 제거
                contentDisplay.style.setProperty('--bg-x-mob', `calc(100% - ${mobX}px) 100%`);

                // 2. 태블릿 (기본 750px)
                const tabSize = 750 * config.tablet.scale;
                contentDisplay.style.setProperty('--bg-size-tab', `auto ${tabSize}px`);
                contentDisplay.style.setProperty('--bg-x-tab', `calc(100% - ${config.tablet.xOffset}px) 100%`);

                // 3. PC (기본 900px, 기본 오프셋 200px)
                const pcSize = 900 * config.pc.scale;
                contentDisplay.style.setProperty('--bg-size-pc', `auto ${pcSize}px`);
                const pcX = 200 + config.pc.xOffset;
                contentDisplay.style.setProperty('--bg-x-pc', `calc(100% - ${pcX}px) 100%`); // y축 100% 명시

                // 애니메이션 트리거
                if (charBg) {
                    charBg.classList.remove('animate');
                    void charBg.offsetWidth;
                    charBg.classList.add('animate');
                }
            } else { 
                contentDisplay.style.setProperty('--bg-url', 'none'); 
                if (charBg) charBg.classList.remove('animate');
            }
        };

        const favBtn = document.querySelector('#content-display .char-fav-btn');
        const simShortcutBtn = document.querySelector('#content-display .sim-shortcut-btn');

        if (simShortcutBtn) {
            simShortcutBtn.style.display = 'flex'; // 다시 보이기
            simShortcutBtn.onclick = (e) => {
                e.stopPropagation();
                // 현재 캐릭터 ID를 시뮬레이터용 데이터로 저장하고 시뮬레이터 탭 클릭
                localStorage.setItem('sim_last_char_id', id);
                const simBtn = document.getElementById('nav-simulator-btn');
                if (simBtn) handleImageClick(simBtn);
            };
        }

        if (favBtn) {
            const isFav = saved.isFavorite || false;
            favBtn.style.display = 'flex';
            favBtn.className = `char-fav-btn ${isFav ? 'active' : ''}`;
            favBtn.innerText = isFav ? '★' : '☆';
            favBtn.onclick = (e) => {
                e.stopPropagation();
                const nowFav = !favBtn.classList.contains('active');
                favBtn.classList.toggle('active', nowFav);
                favBtn.innerText = nowFav ? '★' : '☆';
                if (!state.savedStats[id]) state.savedStats[id] = {};
                state.savedStats[id].isFavorite = nowFav;
                applyBackground(id, nowFav);
                logic.saveCurrentStats();
            };
            applyBackground(id, isFav);
        }

        dom.sliderInput.value = saved.lv || 1; dom.extraSlider1.value = saved.s1 || 0; dom.extraSlider2.value = saved.s2 || 0;
        state.appliedBuffs = {};
        if (data.defaultBuffSkills) data.defaultBuffSkills.forEach(sid => addAppliedBuff(id, sid, true, false, state.appliedBuffs));
        if (saved.appliedBuffs) {
            for (const bId in saved.appliedBuffs) {
                if (!charData[bId]) continue;
                if (!state.appliedBuffs[bId]) state.appliedBuffs[bId] = [];
                saved.appliedBuffs[bId].forEach(sb => { const ex = state.appliedBuffs[bId].find(b => b.skillId === sb.skillId); if (ex) Object.assign(ex, sb); else state.appliedBuffs[bId].push({ ...sb }); });
            }
        }
        renderSkills(id, charData, state.savedStats, state.currentSkillLevels, dom.skillContainer, logic.updateStats, logic.saveCurrentStats, dom.sliderInput);
        onExtraSliderChange(); logic.updateStats();
    }
    logic.saveCurrentStats();
}

function cycleValue(slider, min, max, step) { let val = parseInt(slider.value); let next = (val < step && step > 1) ? step : (Math.floor(val / step) * step + step); if (next > max) next = min; slider.value = next; onExtraSliderChange(); }
function cycleThresholds(slider, thresholds) { let val = parseInt(slider.value); let next = thresholds.find(t => t > val); slider.value = next !== undefined ? next : thresholds[0]; onExtraSliderChange(); }
function adjustSlider(slider, delta, max) { let val = parseInt(slider.value) + delta; if (val >= 0 && val <= max) { slider.value = val; onExtraSliderChange(); } }

export function setupSortListeners() {
    const imageRow = document.querySelector('.image-row');
    const applyFilter = (type, value = null) => {
        imageRow.querySelectorAll('.main-image').forEach(img => { const charId = img.dataset.id; if (charId === 'hero' || charId === 'simulator') { img.style.display = 'block'; return; }
            if (type === 'all') img.style.display = 'block'; else if (type === 'fav') img.style.display = state.savedStats[charId]?.isFavorite ? 'block' : 'none'; else if (type === 'attr') img.style.display = (charData[charId]?.info?.속성 === value) ? 'block' : 'none'; });
    };
    document.querySelector('.sort-icon-all')?.addEventListener('click', () => applyFilter('all')); document.querySelector('.sort-icon-fav')?.addEventListener('click', () => applyFilter('fav'));
    document.querySelectorAll('.sort-icon').forEach(icon => { icon.onclick = () => applyFilter('attr', parseInt(icon.dataset.attr)); });
}

export function setupBuffSearchListeners() {
    const searchInput = document.getElementById('buff-char-search'); if (!searchInput) return;
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase(); const resultsEl = document.getElementById('buff-search-results'); if (!query) { if (resultsEl) resultsEl.style.display = 'none'; return; }
        const matches = Object.keys(charData).filter(id => id !== state.currentId && charData[id].title?.toLowerCase().includes(query));
        renderBuffSearchResults(matches, charData, resultsEl, searchInput, document.getElementById('buff-skill-selection-area'), displayBuffSkills, state.appliedBuffs, addAppliedBuff, removeAppliedBuff, renderAppliedBuffsDisplay, logic.updateStats, dom.sliderInput, state.currentSkillLevels, getDynamicDesc, state.savedStats, logic.saveCurrentStats);
    });
}

export function setupDragScroll(slider, storageKey = null) {
    let isDown = false, startX, scrollLeft;
    if (storageKey) { const saved = localStorage.getItem(storageKey); if (saved) slider.scrollLeft = parseInt(saved); }
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) { slider.addEventListener('scroll', () => { if (storageKey) localStorage.setItem(storageKey, slider.scrollLeft); }); return; }
    slider.onmousedown = e => { isDown = true; startX = e.pageX - slider.offsetLeft; scrollLeft = slider.scrollLeft; };
    slider.onmouseup = () => { isDown = false; };
    slider.onmouseleave = () => { isDown = false; };
    slider.onmousemove = e => { if (!isDown) return; const x = e.pageX - slider.offsetLeft; slider.scrollLeft = scrollLeft - (x - startX) * 0.8; if (storageKey) localStorage.setItem(storageKey, slider.scrollLeft); };
}