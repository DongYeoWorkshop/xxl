// simulator-common.js

import { charData } from './data.js';

/**
 * 시뮬레이터 전역에서 재사용 가능한 공통 컨트롤 정의
 */
export const commonControls = {
    "hp_100_prob": {
        id: "hp_100_prob",
        type: "input",
        label: "HP 100% 유지율(%)",
        min: 0,
        max: 100,
        initial: 40,
        description: "매 턴 HP가 100%로 유지될 확률입니다."
    },
    "hit_prob": {
        id: "hit_prob",
        type: "input",
        label: "턴당 피격 확률(%)",
        min: 0,
        max: 100,
        initial: 50,
        description: "캐릭터가 적에게 공격받을 확률입니다."
    },
    "normal_hit_prob": {
        id: "normal_hit_prob",
        type: "input",
        label: "보통공격 피격 확률(%)",
        min: 0,
        max: 100,
        initial: 40,
        description: "캐릭터가 적의 보통공격에 피격될 확률입니다."
    },
    "ally_ult_count": {
        id: "ally_ult_count",
        type: "counter",
        label: "아군 필살 횟수",
        min: 0,
        max: 3,
        initial: 3,
        description: "아군이 필살기를 사용하는 횟수입니다.",
        // 이 설정이 작동하는 기본 주기 (1+3n, 1턴 제외)
        isTurn: (t) => t > 1 && (t - 1) % 3 === 0
    },
    "ally_warrior_debuffer_count": {
        id: "ally_warrior_debuffer_count",
        type: "counter",
        label: "아군 전사/방해 수",
        min: 0,
        max: 4,
        initial: 2,
        description: "파티 내 전사 및 방해 포지션 아군의 수입니다."
    },
    "is_paralysis_immune": {
        id: "is_paralysis_immune",
        type: "toggle",
        label: "마비 면역",
        initial: true,
        description: "공격 대상이 마비 효과에 면역인지 여부입니다."
    },
    "orem_hit_count": {
        id: "orem_hit_count",
        type: "counter",
        label: "[배리어]피격 수",
        min: 0,
        max: 5,
        initial: 1,
        description: "[오렘] 배리어 상태에서 피격되어 반사 데미지가 발생하는 횟수입니다."
    }
};

/**
 * 캐릭터 데이터에 정의된 commonControls 키 배열을 실제 컨트롤 객체 배열로 변환
 */
export function getCharacterCommonControls(keys) {
    if (!keys || !Array.isArray(keys)) return [];
    return keys.map(key => commonControls[key]).filter(Boolean);
}

/**
 * 스킬 인덱스 상수 (도장은 위치가 가변적이므로 제외)
 */
export const SKILL_IDX = {
    NORMAL: 0,      // 스킬1 (보통공격)
    ULT: 1,         // 스킬2 (필살기)
    PASSIVE_1: 2,   // 스킬3
    PASSIVE_2: 3,   // 스킬4
    PASSIVE_3: 4,   // 스킬5 (해금 30)
    PASSIVE_4: 5,   // 스킬6 (해금 50)
    PASSIVE_5: 6    // 스킬7 (해금 75)
};

/**
 * 패시브 스킬 해금 조건 (돌파 단계)
 */
export const UNLOCK_REQ = {
    [SKILL_IDX.PASSIVE_3]: 30,
    [SKILL_IDX.PASSIVE_4]: 50,
    [SKILL_IDX.PASSIVE_5]: 75
};

// [추가] 등급별 특수 해금 조건
export const GRADE_UNLOCK_REQ = {
    'XL': {
        [SKILL_IDX.PASSIVE_2]: 15
    }
};

/**
 * 캐릭터의 기본 행동(쿨타임 기반)을 반환합니다.
 * @param {string} charId 캐릭터 ID
 * @param {number} turn 현재 턴 (1부터 시작)
 * @returns {'ult'|'normal'} 행동 타입
 */
export function getDefaultActionPattern(charId, turn) {
    const data = charData[charId];
    if (!data) return 'normal';

    // 쿨타임 파싱 (기본값 3턴)
    const cdMatch = data.skills[1].desc?.match(/\(쿨타임\s*:\s*(\d+)턴\)/);
    const CD = cdMatch ? parseInt(cdMatch[1]) : 3;

    // 1턴은 무조건 평타 (초기 쿨타임 고려: 대부분 1턴 궁 불가)
    // 쿨타임 N턴 -> 1턴(평), 2턴(평)... N턴(평), N+1턴(궁)
    // 예: CD=3 -> 1,2,3(평), 4(궁)
    // 예: CD=4 -> 1,2,3,4(평), 5(궁)
    
    // [중요] 기존 시뮬레이터 로직과의 통일성 확인 필요
    // simulator.js: (t > 1 && (t - 1) % CD === 0 ? 'ult' : 'normal')
    // CD=3일 때: 
    // t=1: false -> normal
    // t=2: (1)%3!=0 -> normal
    // t=3: (2)%3!=0 -> normal
    // t=4: (3)%3==0 -> ult (맞음!)
    
    // CD=2일 때 (바드):
    // t=1: normal
    // t=2: (1)%2!=0 -> normal
    // t=3: (2)%2==0 -> ult (맞음!)

    return (turn > 1 && (turn - 1) % CD === 0) ? 'ult' : 'normal';
}
