// main.js

import { renderBuffSearchResults, displayBuffSkills, renderAppliedBuffsDisplay, setFormattedDesc, showSimpleTooltip } from './ui.js';
import { getDynamicDesc } from './formatter.js';
import { addAppliedBuff, removeAppliedBuff } from './buffs.js';
import { state, constants } from './state.js';
import { charData } from './data.js'; // 추가
import { initLogic, updateStats, saveCurrentStats, updateCharacterListIndicators } from './logic.js';
import { initHandlers, onExtraSliderChange, handleImageClick, setupDragScroll, setupBuffSearchListeners, hideAllSections, forceMainHeader, closeAllModals } from './handlers.js';
import { initSecretModule, initCloudSharing } from './secret.js';

document.addEventListener('DOMContentLoaded', function() {
    // 1. DOM 요소 선택
    const dom = {
        images: document.querySelectorAll('.main-image'),
        titleArea: document.getElementById('display-title'),
        statsWrapper: document.getElementById('stats-wrapper'),
        statsArea: document.getElementById('display-stats'),
        sliderInput: document.getElementById('level-slider'),
        levelVal: document.getElementById('level-val'),
        calcArea: document.getElementById('calc-area'),
        extraSlidersDiv: document.getElementById('bonus-sliders'),
        extraSlider1: document.getElementById('extra1-slider'),
        extraVal1: document.getElementById('extra1-val'),
        extraSlider2: document.getElementById('extra2-slider'),
        extraVal2: document.getElementById('extra2-val'),
        skillContainer: document.getElementById('skill-container'),
        buffApplicationArea: document.getElementById('buff-application-area'),
        buffCharSearch: document.getElementById('buff-char-search'),
        buffSearchResults: document.getElementById('buff-search-results'),
        buffSkillSelectionArea: document.getElementById('buff-skill-selection-area'),
        currentlyAppliedBuffsDiv: document.getElementById('currently-applied-buffs'),
        appliedBuffsList: document.getElementById('applied-buffs-list'),
        newSectionArea: document.getElementById('new-section-area'),
        imageRow: document.querySelector('.image-row')
    };

    // 2. 모듈 초기화 (DOM 주입)
    initLogic(dom);
    
    // [추가] 초기 로딩 시 랜딩 모드 활성화 (PC에서 1열 보기)
    if (!state.currentId) {
        document.getElementById('content-display').classList.add('landing-mode');
        document.body.classList.add('landing-page-active');
        
        // 레이아웃 강제 초기화 (새로고침 시에도 버튼 클릭과 동일한 상태 보장)
        hideAllSections();
        const landingPage = document.getElementById('landing-page');
        if (landingPage) landingPage.style.setProperty('display', 'block', 'important');
        const mainCol = document.querySelector('.main-content-column');
        if (mainCol) mainCol.style.setProperty('display', 'block', 'important');
        forceMainHeader();

        // 랜딩 페이지일 때 즐겨찾기 버튼 숨김
        const favBtn = document.querySelector('#content-display .char-fav-btn');
        if (favBtn) favBtn.style.setProperty('display', 'none', 'important');
    } else {
        document.body.classList.add('sub-page-active');
    }

            initHandlers(dom, { updateStats, saveCurrentStats });

            initSecretModule(); // 비밀 모듈 초기화

            initCloudSharing(); // [추가] 클라우드 공유 모듈 초기화

        

            // [추가] 랜딩 페이지 바로가기 버튼 이벤트

        

    
        // 기존 버튼 ID는 유지하되, 기능만 변경 (랜덤 이동 -> 리스트 표시)
        const landingRandomCharBtn = document.getElementById('landing-char-list-btn') || document.getElementById('landing-random-char-btn');
        const landingHeroBtn = document.getElementById('landing-hero-btn');
        const landingSimBtn = document.getElementById('landing-sim-btn');
        
        // 신규 추가된 랜딩 페이지 요소
        const landingMenuGroup = document.getElementById('landing-menu-group');
        const landingCharListArea = document.getElementById('landing-char-list-area');
        const landingCharGrid = document.getElementById('landing-char-grid');
        const landingCharBackBtn = document.getElementById('landing-char-back-btn');
    
        if (landingRandomCharBtn && landingMenuGroup && landingCharListArea) {
            landingRandomCharBtn.onclick = () => {
                // 히스토리 추가
                history.pushState({ id: 'char-list' }, "", window.location.pathname);

                // 1. 메뉴 숨기고 리스트 영역 보이기
                landingMenuGroup.style.display = 'none';
                landingCharListArea.style.display = 'block';
    
                // 2. 캐릭터 그리드 렌더링 (이미 렌더링된 경우 스킵 가능하지만, 즐겨찾기 상태 반영을 위해 매번 렌더링 추천)
                landingCharGrid.innerHTML = '';
                
                // 모든 캐릭터 ID 추출 (특수 ID 제외)
                const validChars = Object.keys(charData).filter(id => id !== 'hero' && id !== 'simulator' && id !== 'test_dummy');
                
                // 정렬: NEW 최상단 > 즐겨찾기 > 데이터 역순
                validChars.sort((a, b) => {
                    const aImg = document.querySelector(`.main-image[data-id="${a}"]`);
                    const bImg = document.querySelector(`.main-image[data-id="${b}"]`);
                    const aNew = aImg?.dataset.new === 'true' ? 1 : 0;
                    const bNew = bImg?.dataset.new === 'true' ? 1 : 0;
                    
                    if (aNew !== bNew) return bNew - aNew; // NEW 내림차순 (1 우선)

                    const aFav = state.savedStats[a]?.isFavorite ? 1 : 0;
                    const bFav = state.savedStats[b]?.isFavorite ? 1 : 0;
                    if (aFav !== bFav) return bFav - aFav; // 즐겨찾기 내림차순 (1 우선)
                    
                    // 데이터상의 인덱스를 기준으로 역순 정렬 (데이터 뒤에 있는게 앞으로)
                    const allKeys = Object.keys(charData);
                    return allKeys.indexOf(b) - allKeys.indexOf(a);
                });
    
                validChars.forEach(id => {
                const data = charData[id];
                const charImgEl = document.querySelector(`.main-image[data-id="${id}"]`);
                const isNew = charImgEl?.dataset.new === 'true';

                // [수정] 이미지와 별을 감싸는 래퍼 생성
                const wrapper = document.createElement('div');
                wrapper.className = 'sim-char-pick-item'; // CSS 적용을 위한 클래스 추가
                if (data.grade === 'XL') wrapper.classList.add('grade-xl');
                if (data.info && data.info.속성 !== undefined) {
                    wrapper.classList.add(`attr-${data.info.속성}`);
                }
                wrapper.style.display = 'flex';
                wrapper.style.flexDirection = 'column';
                wrapper.style.alignItems = 'center';
                wrapper.style.cursor = 'pointer';
                wrapper.style.position = 'relative';

                const img = document.createElement('img');
                img.src = `images/${id}.webp`;
                img.loading = 'lazy'; // [추가] 지연 로딩 적용
                img.draggable = false; // [추가] 드래그 방지
                img.style.width = '100%';
                img.style.aspectRatio = '1 / 2.2'; /* 세로 비율 원복 */
                img.style.objectFit = 'cover';
                
                if (data.info && data.info.속성 !== undefined) {
                    img.classList.add(`attr-${data.info.속성}`);
                }
                
                img.style.border = '1px solid #444';
                
                // 클릭 이벤트는 래퍼에 연결
                wrapper.onclick = () => {
                    const originalImg = document.querySelector(`.main-image[data-id="${id}"]`);
                    if (originalImg) handleImageClick(originalImg);
                };

                wrapper.appendChild(img);

                // [추가] NEW 뱃지 표시
                if (isNew) {
                    const newBadge = document.createElement('div');
                    newBadge.className = 'landing-new-badge';
                    newBadge.textContent = 'NEW';
                    wrapper.appendChild(newBadge);
                }

                // [추가] 하단 색상 라인 추가 (헤더와 동일 스타일)
                const bottomLine = document.createElement('div');
                bottomLine.className = 'char-bottom-line';
                if (data.grade === 'XL') bottomLine.classList.add('grade-xl');
                wrapper.appendChild(bottomLine);

                // [추가] 속성 아이콘 오버레이 추가
                if (data.info && data.info.속성 !== undefined) {
                    const attrIcon = document.createElement('img');
                    const attrName = ['fire', 'water', 'wood', 'light', 'dark'][data.info.속성];
                    attrIcon.src = `icon/${attrName}.webp`;
                    attrIcon.className = 'landing-char-attr-icon';
                    wrapper.appendChild(attrIcon);
                }

                // [추가] 즐겨찾기 별 표시 (이미지 오른쪽 하단 내부)
                if (state.savedStats[id]?.isFavorite) {
                    const star = document.createElement('div');
                    star.textContent = '★';
                    star.style.position = 'absolute';
                    star.style.bottom = '4px';
                    star.style.right = '6px'; // left에서 right로 변경
                    star.style.color = '#ffcb05';
                    star.style.fontSize = '16px';
                    // 그림자 범위를 살짝 더 넓혀서 가독성 보강
                    star.style.textShadow = '0 0 6px #000, 0 0 10px rgba(0,0,0,0.8)';
                    wrapper.appendChild(star);
                }

                // [추가] 변경 사항(수정됨) 확인 및 테두리 적용
                const saved = state.savedStats[id];
                let isModified = false;
                if (saved) {
                    const isLvDefault = (parseInt(saved.lv || 1) === 1);
                    const isS1Default = (parseInt(saved.s1 || 0) === 0);
                    const isS2Default = (parseInt(saved.s2 || 0) === 0);
                    let areSkillsDefault = true;
                    if (saved.skills) areSkillsDefault = Object.values(saved.skills).every(val => parseInt(val) === 1);
                    const isStampDefault = (saved.stamp === false); // stamp가 undefined면 false 취급
                    
                    if (!isLvDefault || !isS1Default || !isS2Default || !areSkillsDefault || !isStampDefault) {
                        isModified = true;
                    }
                }

                if (isModified) {
                    // 수정된 상태의 테두리 설정 제거
                }

                // [추가] 마우스 오버 시 중앙 오버레이 툴팁 표시
                wrapper.addEventListener('mouseenter', () => {
                    if (!('ontouchstart' in window) && (navigator.maxTouchPoints <= 0)) {
                        const sLv = saved?.lv || 1;
                        const sBr = parseInt(saved?.s1 || 0);
                        const sFit = parseInt(saved?.s2 || 0);
                        
                        const brText = (sBr < 5) ? `0성 ${sBr}단` : 
                                     (sBr < 15) ? `1성 ${sBr - 5}단` : 
                                     (sBr < 30) ? `2성 ${sBr - 15}단` : 
                                     (sBr < 50) ? `3성 ${sBr - 30}단` : 
                                     (sBr < 75) ? `4성 ${sBr - 50}단` : "5성";

                        // 오버레이 툴팁 생성
                        const tooltip = document.createElement('div');
                        tooltip.className = 'landing-char-tooltip'; // 나중에 스타일 제어 용이하게 클래스 부여
                        tooltip.style.position = 'absolute';
                        tooltip.style.top = '50%';
                        tooltip.style.left = '50%';
                        tooltip.style.transform = 'translate(-50%, -50%)';
                        tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
                        tooltip.style.color = '#fff';
                        tooltip.style.padding = '6px 10px';
                        tooltip.style.borderRadius = '6px';
                        tooltip.style.fontSize = '0.85em';
                        tooltip.style.textAlign = 'center';
                        tooltip.style.whiteSpace = 'nowrap';
                        tooltip.style.pointerEvents = 'none'; // 마우스 이벤트 투과
                        tooltip.style.zIndex = '10';
                        tooltip.style.backdropFilter = 'blur(2px)';
                        tooltip.style.border = '1px solid rgba(255,255,255,0.2)';
                        
                        tooltip.innerHTML = `
                            <div style="margin-bottom:2px;">Lv.${sLv}</div>
                            <div style="font-size:0.9em;">${brText}</div>
                            <div style="font-size:0.9em;">적합도: ${sFit}</div>
                        `;
                        
                        wrapper.appendChild(tooltip);

                        // 마우스가 나가면 제거
                        wrapper.addEventListener('mouseleave', () => {
                            tooltip.remove();
                        }, { once: true });
                    }
                });

                landingCharGrid.appendChild(wrapper);

                landingCharGrid.appendChild(wrapper);
            });
            };
        }
    
        if (landingCharBackBtn) {
            landingCharBackBtn.onclick = () => {
                history.back();
            };
        }
    
        if (landingHeroBtn) {
            landingHeroBtn.onclick = () => {
                let heroImg = document.querySelector('.main-image[data-id="hero"]');
                if (!heroImg) {
                    heroImg = {
                        dataset: { id: 'hero' },
                        classList: {
                            add: () => {},
                            remove: () => {},
                            contains: () => false,
                            toggle: () => {}
                        },
                        scrollIntoView: () => {},
                        style: {}
                    };
                }
                handleImageClick(heroImg);
            };
        }
    if (landingSimBtn) {
        landingSimBtn.onclick = () => {
            localStorage.removeItem('sim_last_char_id'); 
            
            // [신규] 시뮬레이터 진입 시 '목록' 상태 기록 (직접 클릭 시에만)
            if (history.state?.id !== 'simulator') {
                history.pushState({ id: 'simulator', subId: 'list' }, "", window.location.pathname);
            }

            let simImg = document.querySelector('.main-image[data-id="simulator"]');
            if (!simImg) {
                simImg = { dataset: { id: 'simulator' }, classList: { add:()=>{}, remove:()=>{}, contains:()=>false, toggle:()=>{} }, scrollIntoView:()=>{}, style:{} };
            }
            handleImageClick(simImg, false); // 시뮬레이터 진입 자체는 여기서 push 했으므로 false
        };
    }

    // 3. 이벤트 리스너 연결

    // 레벨 슬라이더
    dom.sliderInput.addEventListener('input', function() {
        dom.levelVal.innerText = this.value;
        if (state.currentId) {
            updateStats();
            saveCurrentStats();
        }
    });

    // 보너스 슬라이더
    dom.extraSlider1.addEventListener('input', onExtraSliderChange);
    dom.extraSlider2.addEventListener('input', onExtraSliderChange);

    // 캐릭터 이미지 클릭
    dom.images.forEach(img => {
        img.addEventListener('click', () => handleImageClick(img));
        img.addEventListener('dragstart', (e) => e.preventDefault()); // 이미지 드래그 방지
    });

    // 드래그 스크롤
    setupDragScroll(dom.imageRow, 'charListScrollLeft');

    // 버프 검색 관련
    setupBuffSearchListeners();

    // [추가] 초기화면 리셋 버튼
    const landingResetBtn = document.getElementById('landing-reset-btn');
    if (landingResetBtn) {
        landingResetBtn.addEventListener('click', () => {
            if (confirm('모든 캐릭터의 스탯, 기록, 버프 설정이 초기화됩니다. 정말 진행하시겠습니까?')) {
                localStorage.clear();
                alert('데이터가 완전히 초기화되었습니다. 페이지를 새로고침합니다.');
                location.reload();
            }
        });
    }

    // [추가] 버프 초기화 버튼
    const resetBuffsBtn = document.getElementById('reset-buffs-btn');
    if (resetBuffsBtn) {
        resetBuffsBtn.addEventListener('click', () => {
            if (state.currentId && confirm('현재 캐릭터의 모든 버프를 초기화하시겠습니까? (외부 버프 찌꺼기 제거)')) {
                state.appliedBuffs = {};
                // 데이터 파일에서 기본 버프 다시 로드
                const data = charData[state.currentId];
                if (data && data.defaultBuffSkills) {
                    data.defaultBuffSkills.forEach(skillId => {
                        addAppliedBuff(state.currentId, skillId, true, false, state.appliedBuffs);
                    });
                }
                updateStats();
                saveCurrentStats();
                alert('버프가 초기화되었습니다.');
            }
        });
    }

    // 캐릭터 목록 토글 버튼
    const listToggleBtn = document.getElementById('char-list-toggle-btn');
    if (listToggleBtn) {
        listToggleBtn.addEventListener('click', () => {
            const listContainer = document.getElementById('char-list-container');
            const isHidden = listContainer.classList.toggle('hidden');
            document.body.classList.toggle('list-open', !isHidden);
            
            // 상태 저장
            localStorage.setItem('charListHidden', isHidden);
        });
    }

    // 초기 상태 설정 (저장된 상태 불러오기 - 기본값은 닫힘(true))
    const storedHidden = localStorage.getItem('charListHidden');
    const isListHidden = (storedHidden === null) ? true : (storedHidden === 'true');
    const listContainer = document.getElementById('char-list-container');
    if (isListHidden) {
        listContainer.classList.add('hidden');
        document.body.classList.remove('list-open');
    } else {
        listContainer.classList.remove('hidden');
        document.body.classList.add('list-open');
    }

    // 4. 초기화 및 히스토리 베이스 설정
    // 사이트 접속 즉시 가장 첫 상태를 'main'으로 기록
    if (!history.state) {
        history.replaceState({ id: 'main' }, "", window.location.pathname);
    }

    const lastCharId = localStorage.getItem('lastSelectedCharId');
    if (lastCharId) {
        const initialImage = document.querySelector(`.main-image[data-id="${lastCharId}"]`);
        if (initialImage) {
            // 상세 페이지로 바로 복구되는 경우, 중간 단계인 'char-list'를 히스토리에 끼워넣음
            history.pushState({ id: 'char-list' }, "", window.location.pathname);
            // 그 후 캐릭터 상세 상태를 추가
            handleImageClick(initialImage, true); 
        }
    }
    
    // [신규] 통합 내비게이션 제어 로직 (UI 업데이트만 수행)
    window.addEventListener('popstate', (event) => {
        const s = event.state || {};
        const stateId = s.id || 'main';
        const subId = s.subId;
        
        // [추가] 뒤로가기 시 모든 모달/툴팁 닫기
        closeAllModals();

        // 딜량비교(hero) 탭에서 뒤로가기 시 바로 메인으로
        if (state.currentId === 'hero' && stateId === 'char-list') {
            history.back();
            return;
        }

        // 시뮬레이터(simulator) 탭 내부 내비게이션
        if (stateId === 'simulator') {
            state.currentId = 'simulator'; // [추가] 상태 초기화로 로고 등 잔상 제거
            import('./simulator.js').then(mod => {
                // UI 레이아웃 강제 설정 (시뮬레이터 탭 활성화)
                document.body.classList.remove('landing-page-active', 'char-page-active');
                document.body.classList.add('sub-page-active', 'hero-mode-active');
                const contentDisplay = document.getElementById('content-display');
                if (contentDisplay) {
                    contentDisplay.className = 'hero-mode';
                    contentDisplay.style.setProperty('display', 'block', 'important');
                }
                hideAllSections();
                document.getElementById('simulator-page').style.setProperty('display', 'block', 'important');
                document.querySelector('.main-content-column').style.setProperty('display', 'block', 'important');
                forceMainHeader();

                if (subId === 'list') {
                    localStorage.removeItem('sim_last_char_id');
                    mod.initSimulator();
                } else if (subId) {
                    localStorage.setItem('sim_last_char_id', subId);
                    mod.initSimulator();
                }
            });
            return;
        }

        if (stateId === 'main') {
            // 메인 메뉴 UI 강제 노출 (history.pushState 없는 순수 UI 함수 호출)
            if (typeof forceGoToMainUI === 'function') {
                forceGoToMainUI();
            } else {
                // 만약 함수가 아직 로드 안됐다면 클릭으로 대체하되, pushState 중복 방지는 handlers.js에서 처리
                const headerTitle = document.getElementById('sticky-header-title');
                if (headerTitle) headerTitle.click();
            }
        } else if (stateId === 'char-list') {
            state.currentId = null; // [추가] 상태 초기화로 로고 등 잔상 제거
            // 캐릭터 목록(그리드) UI 강제 노출
            const lArea = document.getElementById('landing-char-list-area');
            const lGroup = document.getElementById('landing-menu-group');
            
            if (!document.body.classList.contains('landing-page-active')) {
                // 상세 페이지 등에서 온 경우 메인으로 리셋 (함수 호출 즉시 아래 스타일 적용으로 깜빡임 방지)
                if (typeof forceGoToMainUI === 'function') forceGoToMainUI();
            }

            // [수정] setTimeout 없이 즉시 실행하여 깜빡임 제거
            if (lArea) lArea.style.display = 'block';
            if (lGroup) lGroup.style.display = 'none';
            
            // 만약 그리드가 비어있다면 렌더링 트리거
            const landingCharGrid = document.getElementById('landing-char-grid');
            if (landingCharGrid && landingCharGrid.children.length === 0) {
                const landingRandomCharBtn = document.getElementById('landing-char-list-btn');
                if (landingRandomCharBtn) landingRandomCharBtn.click();
            }
        } else if (stateId) {
            let targetImg = document.querySelector(`.main-image[data-id="${stateId}"]`);
            if (!targetImg) {
                targetImg = { dataset: { id: stateId }, classList: { add:()=>{}, remove:()=>{}, contains:()=>false, toggle:()=>{} }, scrollIntoView:()=>{}, style:{} };
            }
            handleImageClick(targetImg, false); // popstate에 의한 이동은 히스토리 추가 안함
        }
    });

    // 캐릭터 버튼 클릭 시 히스토리 관리 수정
    if (landingRandomCharBtn) {
        const originalOnClick = landingRandomCharBtn.onclick;
        landingRandomCharBtn.onclick = () => {
            if (originalOnClick) originalOnClick();
            // 목록으로 들어올 때 히스토리 추가
            if (history.state?.id !== 'char-list') {
                history.pushState({ id: 'char-list' }, "", window.location.pathname);
            }
        };
    }

    // 뒤로가기 버튼 클릭 시 동작 수정
    if (landingCharBackBtn) {
        landingCharBackBtn.onclick = () => {
            history.back(); // 이제 브라우저 뒤로가기와 동일하게 작동
        };
    }

    // 변경 사항 표시 업데이트
    updateCharacterListIndicators();

    // [추가] 전역 우클릭 및 모바일 롱탭 메뉴 방지
    document.addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'IMG' || e.target.closest('.sim-char-pick-item')) {
            e.preventDefault();
        }
    }, false);
});