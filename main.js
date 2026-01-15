// main.js

import { renderBuffSearchResults, displayBuffSkills, renderAppliedBuffsDisplay, setFormattedDesc, showSimpleTooltip } from './ui.js';
import { getDynamicDesc } from './formatter.js';
import { addAppliedBuff, removeAppliedBuff } from './buffs.js';
import { state, constants } from './state.js';
import { charData } from './data.js'; // 추가
import { initLogic, updateStats, saveCurrentStats, updateCharacterListIndicators } from './logic.js';
import { initHandlers, onExtraSliderChange, handleImageClick, setupDragScroll, setupBuffSearchListeners, hideAllSections, forceMainHeader } from './handlers.js';
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
                // 1. 메뉴 숨기고 리스트 영역 보이기
                landingMenuGroup.style.display = 'none';
                landingCharListArea.style.display = 'block';
    
                // 2. 캐릭터 그리드 렌더링 (이미 렌더링된 경우 스킵 가능하지만, 즐겨찾기 상태 반영을 위해 매번 렌더링 추천)
                landingCharGrid.innerHTML = '';
                
                // 모든 캐릭터 ID 추출 (특수 ID 제외)
                const validChars = Object.keys(charData).filter(id => id !== 'hero' && id !== 'simulator' && id !== 'test_dummy');
                
                // 정렬: 즐겨찾기 우선, 그 다음 이름순(혹은 데이터 순서)
                validChars.sort((a, b) => {
                    const aFav = state.savedStats[a]?.isFavorite ? 1 : 0;
                    const bFav = state.savedStats[b]?.isFavorite ? 1 : 0;
                    if (aFav !== bFav) return bFav - aFav; // 즐겨찾기 내림차순
                    return 0; // 원래 순서 유지
                });
    
                validChars.forEach(id => {
                const data = charData[id];

                // [수정] 이미지와 별을 감싸는 래퍼 생성
                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.flexDirection = 'column';
                wrapper.style.alignItems = 'center';
                wrapper.style.cursor = 'pointer';
                wrapper.style.position = 'relative';

                const img = document.createElement('img');
                img.src = `images/${id}.webp`;
                img.style.width = '100%';
                img.style.aspectRatio = '1 / 2.2'; /* 세로 비율 대폭 상향 */
                img.style.objectFit = 'cover';
                img.style.borderRadius = '8px';
                
                img.style.border = '1px solid #444';
                img.style.backgroundColor = '#30363d';
                
                // 클릭 이벤트는 래퍼에 연결
                wrapper.onclick = () => {
                    const originalImg = document.querySelector(`.main-image[data-id="${id}"]`);
                    if (originalImg) handleImageClick(originalImg);
                };

                wrapper.appendChild(img);

                // [추가] 즐겨찾기 별 표시 (이미지 왼쪽 하단 내부)
                if (state.savedStats[id]?.isFavorite) {
                    const star = document.createElement('div');
                    star.textContent = '★';
                    star.style.position = 'absolute';
                    star.style.bottom = '4px';
                    star.style.left = '6px';
                    star.style.color = '#ffcb05';
                    star.style.fontSize = '16px';
                    star.style.textShadow = '0 0 3px rgba(0,0,0,0.9)'; // 이미지 위에서 잘 보이도록 그림자 강화
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
                    img.style.border = `1px solid #ffa500`;
                    img.style.backgroundColor = '#56c5b1';
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
                landingCharListArea.style.display = 'none';
                landingMenuGroup.style.display = 'flex'; // flex로 복구
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
            // [수정] 시뮬레이터 버튼 클릭 시 캐릭터 선택창으로 바로 이동
            localStorage.removeItem('sim_last_char_id'); // 이전 선택 기록 제거하여 목록부터 시작
            
            // 기존 handleImageClick('simulator')와 유사한 화면 전환 로직 수행
            const contentDisplay = document.getElementById('content-display');
            if (contentDisplay) {
                contentDisplay.className = 'hero-mode';
                contentDisplay.setAttribute('data-char-id', 'simulator');
            }
            
            document.body.classList.remove('landing-page-active', 'char-page-active', 'sub-page-active');
            document.body.classList.add('hero-mode-active');
            
            hideAllSections();
            const mainCol = document.querySelector('.main-content-column');
            if (mainCol) mainCol.style.setProperty('display', 'block', 'important');
            const simPage = document.getElementById('simulator-page');
            if (simPage) simPage.style.setProperty('display', 'block', 'important');
            
            forceMainHeader();
            
            // 시뮬레이터 초기화 (목록 화면 렌더링)
            import(`./simulator.js?v=${Date.now()}`).then(mod => mod.initSimulator());
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

    // 4. 초기화 실행
    const lastCharId = localStorage.getItem('lastSelectedCharId');
    if (lastCharId) {
        const initialImage = document.querySelector(`.main-image[data-id="${lastCharId}"]`);
        if (initialImage) {
            handleImageClick(initialImage);
        } else {
            updateStats();
        }
    } else {
        updateStats();
    }

    // 변경 사항 표시 업데이트
    updateCharacterListIndicators();
});