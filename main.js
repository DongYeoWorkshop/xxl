// main.js

import { renderBuffSearchResults, displayBuffSkills, renderAppliedBuffsDisplay, setFormattedDesc } from './ui.js';
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
                                    const img = document.createElement('img');
                                    img.src = `images/${id}.webp`;
                                    img.style.width = '100%';
                                    img.style.aspectRatio = '1 / 2.2'; /* 세로 비율 대폭 상향 */
                                    img.style.objectFit = 'cover';
                                    img.style.borderRadius = '8px';
                    
                    img.style.cursor = 'pointer';
                    img.style.border = '1px solid #444';
                    img.style.backgroundColor = 'black';
                    
                    // 즐겨찾기 표시 (테두리 등)
                    if (state.savedStats[id]?.isFavorite) {
                        img.style.borderColor = '#ffcb05';
                        img.style.boxShadow = '0 0 5px rgba(255, 203, 5, 0.5)';
                    }
    
                    img.onclick = () => {
                        const originalImg = document.querySelector(`.main-image[data-id="${id}"]`);
                        if (originalImg) handleImageClick(originalImg);
                    };
                    landingCharGrid.appendChild(img);
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
            const heroImg = document.querySelector('.main-image[data-id="hero"]');
            if (heroImg) handleImageClick(heroImg);
        };
    }
    if (landingSimBtn) {
        landingSimBtn.onclick = () => {
            const simImg = document.querySelector('.main-image[data-id="simulator"]');
            if (simImg) handleImageClick(simImg);
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

    // 초기 상태 설정 (저장된 상태 불러오기)
    const isListHidden = localStorage.getItem('charListHidden') === 'true';
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