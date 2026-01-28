// state.js
import { loadAllStats, loadSnapshots } from './storage.js';

export const state = {
    APP_VERSION: '1.2.1', // 데이터 버전 관리용
    currentId: null,
    lastClickedSkillCard: null,
    selectedSkillIndex: null,
    selectedIsExternal: false, // 추가: 현재 선택된 상세 아이콘이 외부 버프인지 여부
    currentExtraDamages: [],   // 추가: 현재 캐릭터가 받고 있는 추가데미지 정보 리스트
    appliedBuffs: {},
    currentSkillLevels: {},
    currentDisplayedAttribute: '불',
    damageRecords: {}, // 캐릭터별 데미지 기록 저장 { charId: [ { name, damage, color }, ... ] }
    comparisonSnapshots: loadSnapshots(), // [수정] 저장된 스냅샷 불러오기
    heroComparisonState: { slot1: null, slot2: null, nextTarget: 1 }, // Hero 탭 비교 표 상태 저장
    savedStats: loadAllStats()
};

export const constants = {
    defaultGrowth: 1.05, // [추가] 모든 캐릭터 공통 성장률
    disabledSimChars: ['kyrian', 'meng', 'leo', 'izuminosuke'],
    attributeList: ["불", "물", "나무", "빛", "어둠"],
    attributeImageMap: {
        "불": "icon/fire.webp",
        "물": "icon/water.webp",
        "나무": "icon/wood.webp",
        "빛": "icon/light.webp",
        "어둠": "icon/dark.webp"
    },
    positionImageMap: {
        "전사": "icon/attacker.webp",
        "보조": "icon/buffer.webp",
        "힐러": "icon/heal.webp",
        "방해": "icon/debuffer.webp",
        "수호": "icon/knight.webp"
    },
    // [추가] 시뮬레이터 서포터 목록 (사용자가 직접 편집 가능)
    supportList: [
        { id: 'none', name: '선택 안 함' },
        { id: 'khafka', name: '카푸카' },
        { id: 'anuberus', name: '아누비로스' },
        { id: 'codeb', name: '코드B' },
        { id: 'beernox', name: '비어녹스' },
        { id: 'orem', name: '오렘' },
        { id: 'tyrantino', name: '타란디오' },
        { id: 'wang', name: '멍' },
        { id: 'tamrang', name: '탐랑' },
        { id: 'jetblack', name: '제트블랙' },
        { id: 'rutenix', name: '루테닉스' },
        { id: 'duncan', name: '던컨 찰스' },
        { id: 'famido', name: '파미도' },
        { id: 'rikano', name: '리카노' },
        { id: 'bossren', name: '임부언' },
        { id: 'dallawan', name: '다라완' }
    ]
};
