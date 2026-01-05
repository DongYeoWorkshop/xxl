// sim_support.js
import { charData } from './data.js';
import { getDefaultActionPattern } from './simulator-common.js';
import { state, constants } from './state.js';
import { getSkillValue } from './sim_ctx.js';
import { getSkillMultiplier } from './formatter.js';
import { simParams } from './sim_params.js';
import { calculateBaseStats } from './calculations.js';

/**
 * [핵심 헬퍼] 서포터의 스킬 수치를 동적으로 계산
 * 사용자가 해당 캐릭터 탭에서 설정하고 저장한 실제 레벨, 돌파 단계, 스킬 레벨을 기반으로 계산합니다.
 * 저장된 데이터가 없을 경우에만 기본값(Lv.1)을 사용합니다.
 */
function getSupportVal(charId, skillIdx, effectKey, targetCharData = null, isStamp = false) {
    const data = charData[charId];
    if (!data) return 0;

    // [수정] 사용자가 저장한 실제 스펙 사용 (없으면 기본값 1레벨/0성)
    const stats = state.savedStats[charId] || { lv: 1, s1: 0, s2: 0, skills: {} };
    
    // 대상 캐릭터의 속성을 임시 주입하여 getSkillValue의 속성 체크 로직 통과 유도
    if (targetCharData && targetCharData.info) {
        const originalInfo = data.info;
        const tempInfo = { ...data.info, 속성: targetCharData.info.속성 };
        data.info = tempInfo;
        const val = getSkillValue(data, stats, skillIdx, effectKey, isStamp);
        data.info = originalInfo;
        return val;
    }
    return getSkillValue(data, stats, skillIdx, effectKey, isStamp);
}

/**
 * [핵심 헬퍼] 서포터의 버프/디버프 가중치 계산
 * 단일 대상 디버프인 경우, 메인 캐릭터의 타겟 수에 따라 효율을 보정합니다. (1/N)
 */
function getWeightedSupportVal(ctx, supportId, skillIdx, effectKey, targetCharData, isMultiParam = false) {
    const val = getSupportVal(supportId, skillIdx, effectKey, targetCharData);
    if (val === 0) return 0;

    // [수정] 서포터 본인의 스킬이 광역인지 data.js에서 한 번 더 확인
    const supportSkill = charData[supportId].skills[skillIdx];
    const isAOESkill = supportSkill?.isMultiTarget || isMultiParam;

    // 디버프(적에게 거는 효과)인 경우 가중치 적용 여부 판단
    if (effectKey.includes("디버프") || effectKey === "추가데미지") {
        // 현재 딜러 공격이 광역이고, 서포터 효과는 단일 대상일 때만 1/N 가중치 적용
        if (ctx.isMulti && !isAOESkill && ctx.targetCount > 1) {
            return val / ctx.targetCount;
        }
    }
    // 단일 공격이거나 서포터 효과 자체가 광역이면 수치 그대로 적용
    return val;
}

/**
 * [핵심 헬퍼] sim_params의 설정을 읽어와서 확률적으로 버프 타이머 작동 및 로그 기록
 */
function tryApplySupportParam(ctx, sState, param, stateKey) {
    if (!param) return false;
    
    // 서포터의 실제 저장된 레벨 가져오기
    const supportStats = state.savedStats[ctx.supportId] || { skills: {} };
    const supportData = charData[ctx.supportId];
    const sIdx = supportData.skills.findIndex(s => s.id === param.originalId);
    
    let finalProb = param.prob !== undefined ? param.prob : 1.0;

    // 실제 레벨에 따른 확률 보정 적용 (scaleProb 또는 startRate 설정이 있는 경우)
    if (sIdx !== -1 && (param.scaleProb || param.startRate !== undefined)) {
        const skill = supportData.skills[sIdx];
        const sLv = parseInt(supportStats.skills?.[`s${sIdx + 1}`] || 1);
        const rate = getSkillMultiplier(sLv, param.startRate || skill.startRate || 0.6);
        finalProb *= rate;
    }
    
    if (Math.random() < finalProb) {
        sState[stateKey] = param.duration || 1;
        
        const supportData = charData[ctx.supportId];
        const sIdx = supportData.skills.findIndex(s => s.id === param.originalId);
        
        if (sIdx !== -1) {
            let skill = supportData.skills[sIdx];
            let isStamp = (param.customTag === "도장");
            let targetSIdx = sIdx;

            // [비어녹스 예외 처리] 도장 효과는 필살기(스킬2, 인덱스 1)의 수치를 그대로 사용
            if (ctx.supportId === 'beernox' && isStamp) {
                targetSIdx = 1; 
                skill = supportData.skills[1];
                isStamp = false; 
            }

            const effects = isStamp ? (skill.stampBuffEffects || {}) : (skill.buffEffects || {});
            let effectKey = Object.keys(effects)[0];
            if (!effectKey && skill.ratioEffects) effectKey = Object.keys(skill.ratioEffects)[0];
            if (!effectKey) effectKey = "공증";

            const val = getSupportVal(ctx.supportId, targetSIdx, effectKey, ctx.charData, isStamp);
            
            // [수정] 가산 수치(+XXXX) 계산 로직: 실제 저장된 스펙(stats) 사용
            let boostText = "";
            if (param.showAtkBoost || skill.ratioEffects) {
                const supportStats = state.savedStats[ctx.supportId] || { lv: 1, s1: 0, s2: 0 };
                const sLv = parseInt(supportStats.lv || 1);
                const sBr = parseInt(supportStats.s1 || 0);
                const sFit = parseInt(supportStats.s2 || 0);

                // 실제 기초공격력 계산 (calculations.js의 로직과 동일)
                const baseAtkRaw = supportData.base["공격력"] * Math.pow(1.05, sLv - 1);
                const brBonus = 1 + (sBr * 0.02);
                const fitBonus = 1 + (sFit * 0.04);
                
                // 패시브(스킬6) 기초공증 확인 (50단 이상 해금)
                let baseAtkBoostRate = 0;
                if (sBr >= 50) {
                    baseAtkBoostRate = getSupportVal(ctx.supportId, 5, '기초공증');
                }
                
                // 타임체크 스택 기초공증 확인 (이름을 skill7_stacks로 통일했으므로 수정)
                if (sState.skill7_stacks) {
                    baseAtkBoostRate += sState.skill7_stacks * getSupportVal(ctx.supportId, 6, '기초공증');
                }
                
                const currentBaseAtk = baseAtkRaw * brBonus * fitBonus * (1 + baseAtkBoostRate / 100);
                const boostVal = Math.floor(currentBaseAtk * (val / 100));
                boostText = ` (+${boostVal.toLocaleString()} 가산)`;
            }
            
            const probLog = (finalProb < 1.0) ? ` (${Math.floor(finalProb * 100)}%)` : "";
            // [수정] ctx.log를 원래의 인자 구조로 호출
            ctx.log(`[서포터] ${supportData.title}: ㄴ [${param.customTag || "버프"}] ${param.label || skill.name} 부여${boostText}${probLog}`);
        }
        return true;
    }
    return false;
}

// 서포터별 상태 초기화 및 로직 정의
export const supportLogic = {
    // =================================================================
    // [카푸카] Khafka
    // =================================================================
    "khafka": {
        getInitialState: () => ({ passive2_timer: 0, passive3_timer: 0, passive5_timer: 0 }),
        onTurn: (ctx, sState) => {
            const p = simParams.khafka; ctx.supportId = 'khafka';
            if (sState.passive2_timer > 0) sState.passive2_timer--;
            if (sState.passive3_timer > 0) sState.passive3_timer--;
            if (sState.passive5_timer > 0) sState.passive5_timer--;
            let actionType = 'normal';
            try {
                const savedPattern = JSON.parse(localStorage.getItem('sim_pattern_khafka'));
                actionType = (savedPattern && savedPattern[ctx.t - 1]) ? savedPattern[ctx.t - 1] : getDefaultActionPattern('khafka', ctx.t);
            } catch (e) { actionType = getDefaultActionPattern('khafka', ctx.t); }
            if (actionType === 'ult') {
                ctx.log(`[서포터] 카푸카: <span class="sim-log-tag" style="color:#c62828">[필살기]</span> 쾌감의 구속 사용`);
                tryApplySupportParam(ctx, sState, p.skill7_buff, 'passive5_timer');
                tryApplySupportParam(ctx, sState, p.skill4_buff, 'passive2_timer');
            } else if (actionType === 'defend') {
                ctx.log(`[서포터] 카푸카: <span class="sim-log-tag" style="color:#1565c0">[방어]</span>`);
                tryApplySupportParam(ctx, sState, p.skill5_buff, 'passive3_timer');
            } else {
                ctx.log(`[서포터] 카푸카: <span class="sim-log-tag" style="color:#2e7d32">[보통공격]</span> 밧줄 조작 제압 사용`);
                tryApplySupportParam(ctx, sState, p.skill4_buff, 'passive2_timer');
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "뎀증디버프": 0, "공증": 0 };
            const p = simParams.khafka;
            bonuses["공증"] += getSupportVal('khafka', 2, '공증', targetCharData);
            if (sState.passive2_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'khafka', 3, '뎀증디버프', targetCharData, p.skill4_buff.isMulti);
            if (sState.passive3_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'khafka', 4, '뎀증디버프', targetCharData, p.skill5_buff.isMulti);
            if (sState.passive5_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'khafka', 6, '뎀증디버프', targetCharData, p.skill7_buff.isMulti);
            return bonuses;
        }
    },

    // =================================================================
    // [아누비로스] Anuberus
    // =================================================================
    "anuberus": {
        getInitialState: () => ({ dog_black_timer: 0, dog_white_timer: 0, vuln_timers: [] }),
        onTurn: (ctx, sState) => {
            const p = simParams.anuberus; ctx.supportId = 'anuberus';
            if (sState.dog_black_timer > 0) sState.dog_black_timer--;
            if (sState.dog_white_timer > 0) sState.dog_white_timer--;
            sState.vuln_timers = sState.vuln_timers.map(t => t - 1).filter(t => t > 0);
            let actionType = 'normal';
            try {
                const savedPattern = JSON.parse(localStorage.getItem('sim_pattern_anuberus'));
                actionType = (savedPattern && savedPattern[ctx.t - 1]) ? savedPattern[ctx.t - 1] : getDefaultActionPattern('anuberus', ctx.t);
            } catch (e) { actionType = getDefaultActionPattern('anuberus', ctx.t); }
            if (actionType !== 'defend') {
                if (actionType === 'ult') ctx.log(`[서포터] 아누비로스: <span class="sim-log-tag" style="color:#c62828">[필살기]</span> 니히히~ 우리도 왔다! 사용`);
                else ctx.log(`[서포터] 아누비로스: <span class="sim-log-tag" style="color:#2e7d32">[보통공격]</span> 삼위일체・봉 회오리 사용`);
                const activeDogs = (sState.dog_black_timer > 0 ? 1 : 0) + (sState.dog_white_timer > 0 ? 1 : 0);
                if (activeDogs > 0) {
                    for (let k = 0; k < activeDogs; k++) { if (sState.vuln_timers.length < 4) sState.vuln_timers.push(3); }
                    ctx.log(`ㄴ [디버프] 어둠속성 받뎀증 부여 (현재 ${sState.vuln_timers.length}중첩)`);
                }
                if (Math.random() < (p.black_dog.prob || 0.5)) { sState.dog_black_timer = p.black_dog.duration || 2; ctx.log(`ㄴ [패시브] 흑구 발동 (다음 턴 협공 가능)`); }
                if (Math.random() < (p.white_dog.prob || 0.5)) { sState.dog_white_timer = p.white_dog.duration || 2; ctx.log(`ㄴ [패시브] 백구 발동 (다음 턴 협공 가능)`); }
            } else ctx.log(`[서포터] 아누비로스: <span class="sim-log-tag" style="color:#1565c0">[방어]</span>`);
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "속성디버프": 0, "공증": 0 };
            const p = simParams.anuberus;
            bonuses["공증"] += getSupportVal('anuberus', 2, '공증', targetCharData);
            if (sState.vuln_timers.length > 0) {
                const unitVal = getWeightedSupportVal(ctx, 'anuberus', 3, '속성디버프', targetCharData, p.skill4_vuln.isMulti);
                bonuses["속성디버프"] += sState.vuln_timers.length * unitVal;
            }
            return bonuses;
        }
    },

    // =================================================================
    // [리카노] Rikano
    // =================================================================
    "rikano": {
        getInitialState: () => ({ passive1_timer: 0, passive2_timer: 0, passive8_timer: 0 }),
        onTurn: (ctx, sState) => {
            const p = simParams.rikano; ctx.supportId = 'rikano';
            if (sState.passive1_timer > 0) sState.passive1_timer--;
            if (sState.passive2_timer > 0) sState.passive2_timer--;
            if (sState.passive8_timer > 0) sState.passive8_timer--;
            let actionType = 'normal';
            try {
                const savedPattern = JSON.parse(localStorage.getItem('sim_pattern_rikano'));
                actionType = (savedPattern && savedPattern[ctx.t - 1]) ? savedPattern[ctx.t - 1] : getDefaultActionPattern('rikano', ctx.t);
            } catch (e) { actionType = getDefaultActionPattern('rikano', ctx.t); }
            if (actionType === 'ult') {
                ctx.log(`[서포터] 리카노: <span class="sim-log-tag" style="color:#c62828">[필살기]</span> 스타 강아지☆출첵 사용`);
                tryApplySupportParam(ctx, sState, p.skill2_debuff, 'passive2_timer');
                tryApplySupportParam(ctx, sState, p.skill8_debuff, 'passive8_timer');
            } else if (actionType === 'defend') ctx.log(`[서포터] 리카노: <span class="sim-log-tag" style="color:#1565c0">[방어]</span>`);
            else {
                ctx.log(`[서포터] 리카노: <span class="sim-log-tag" style="color:#2e7d32">[보통공격]</span> 분위기 띄우기! 사용`);
                tryApplySupportParam(ctx, sState, p.skill1_debuff, 'passive1_timer');
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "뎀증디버프": 0, "공증": 0, "필살기뎀증": 0 };
            const p = simParams.rikano;
            bonuses["공증"] += getSupportVal('rikano', 2, '공증', targetCharData);
            bonuses["필살기뎀증"] += getSupportVal('rikano', 3, '필살기뎀증', targetCharData);
            if (sState.passive1_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'rikano', 0, '뎀증디버프', targetCharData, p.skill1_debuff.isMulti);
            if (sState.passive2_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'rikano', 1, '뎀증디버프', targetCharData, p.skill2_debuff.isMulti);
            if (sState.passive8_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'rikano', 7, '뎀증디버프', targetCharData, p.skill8_debuff.isMulti);
            return bonuses;
        }
    },

    // =================================================================
    // [타란디오] Tyrantino
    // =================================================================
    "tyrantino": {
        getInitialState: () => ({}),
        onTurn: (ctx, sState) => {
            ctx.supportId = 'tyrantino';
            let actionType = 'normal';
            try {
                const savedPattern = JSON.parse(localStorage.getItem('sim_pattern_tyrantino'));
                actionType = (savedPattern && savedPattern[ctx.t - 1]) ? savedPattern[ctx.t - 1] : getDefaultActionPattern('tyrantino', ctx.t);
            } catch (e) { actionType = getDefaultActionPattern('tyrantino', ctx.t); }
            if (actionType === 'ult') ctx.log(`[서포터] 타란디오: <span class="sim-log-tag" style="color:#c62828">[필살기]</span> 전율의 용의 위압 사용`);
            else if (actionType === 'defend') ctx.log(`[서포터] 타란디오: <span class="sim-log-tag" style="color:#1565c0">[방어]</span>`);
            else ctx.log(`[서포터] 타란디오: <span class="sim-log-tag" style="color:#2e7d32">[보통공격]</span> 광란의 발톱 사용`);
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0 };
            bonuses["공증"] += getSupportVal('tyrantino', 2, '공증', targetCharData);
            return bonuses;
        }
    },

    // =================================================================
    // [던컨 찰스] Duncan
    // =================================================================
    "duncan": {
        getInitialState: () => ({ ult_timer: 0, normal_timer: 0, prob_timer: 0 }),
        onTurn: (ctx, sState) => {
            const p = simParams.duncan; ctx.supportId = 'duncan';
            if (sState.ult_timer > 0) sState.ult_timer--;
            if (sState.normal_timer > 0) sState.normal_timer--;
            if (sState.prob_timer > 0) sState.prob_timer--;
            let actionType = 'normal';
            try {
                const savedPattern = JSON.parse(localStorage.getItem('sim_pattern_duncan'));
                actionType = (savedPattern && savedPattern[ctx.t - 1]) ? savedPattern[ctx.t - 1] : getDefaultActionPattern('duncan', ctx.t);
            } catch (e) { actionType = getDefaultActionPattern('duncan', ctx.t); }
            if (actionType === 'ult') {
                ctx.log(`[서포터] 던컨 찰스: <span class="sim-log-tag" style="color:#c62828">[필살기]</span> 지팡이보다 먹힌다구! 사용`);
                tryApplySupportParam(ctx, sState, p.skill2_buff, 'ult_timer');
            } else if (actionType === 'defend') ctx.log(`[서포터] 던컨 찰스: <span class="sim-log-tag" style="color:#1565c0">[방어]</span>`);
            else {
                ctx.log(`[서포터] 던컨 찰스: <span class="sim-log-tag" style="color:#2e7d32">[보통공격]</span> 마탄 심문법 사용`);
                tryApplySupportParam(ctx, sState, p.skill4_buff, 'normal_timer');
                tryApplySupportParam(ctx, sState, p.skill9_buff, 'prob_timer');
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0 };
            bonuses["공증"] += getSupportVal('duncan', 2, '공증', targetCharData);
            if (sState.ult_timer > 0) bonuses["공증"] += getSupportVal('duncan', 1, '공증', targetCharData);
            if (sState.normal_timer > 0) bonuses["공증"] += getSupportVal('duncan', 3, '공증', targetCharData);
            if (sState.prob_timer > 0) bonuses["공증"] += getSupportVal('duncan', 8, '공증', targetCharData);
            return bonuses;
        }
    },

    // =================================================================
    // [비어녹스] Beernox
    // 역할: 공격력 가산 서포터 (기초 공격력 비례)
    // =================================================================
    "beernox": {
        getInitialState: () => ({
            skill7_stacks: 0,
            skill1_timer: 0,
            skill2_timer: 0,
            skill2_stamp_timer: 0
        }),

        onTurn: (ctx, sState) => {
            const p = simParams.beernox;
            ctx.supportId = 'beernox';

            // 1. 타이머 감소
            if (sState.skill1_timer > 0) sState.skill1_timer--;
            if (sState.skill2_timer > 0) sState.skill2_timer--;
            if (sState.skill2_stamp_timer > 0) sState.skill2_stamp_timer--;

            // 2. 타임 체크 스택 획득 (2턴부터)
            if (ctx.t > 1 && sState.skill7_stacks < 15) {
                sState.skill7_stacks++;
                // [수정] 서포터의 타임 체크 스택 획득 로그는 삭제 (공격력은 내부적으로 계속 쌓임)
            }

            // [추가] 나무속성 파티원 조건 체크 (비어녹스 시뮬 설정 연동)
            const woodActive = localStorage.getItem('sim_ctrl_beernox_wood_party_active') === 'true';
            if (woodActive && ctx.t === 1) {
                ctx.log(`[서포터] 비어녹스: ㄴ [패시브] 나무속성 파티원 조건 충족 (뎀증 활성)`);
            }

            // 이번 턴에 사용할 기초공격력을 미리 한 번만 계산하여 저장
            const supportStats = state.savedStats['beernox'] || { lv: 1, s1: 0, s2: 0 };

            // 3. 행동 결정
            let actionType = 'normal';
            try {
                const savedPattern = JSON.parse(localStorage.getItem('sim_pattern_beernox'));
                actionType = (savedPattern && savedPattern[ctx.t - 1]) ? savedPattern[ctx.t - 1] : getDefaultActionPattern('beernox', ctx.t);
            } catch (e) {
                actionType = getDefaultActionPattern('beernox', ctx.t);
            }

            if (actionType === 'ult') {
                ctx.log(`[서포터] 비어녹스: <span class="sim-log-tag" style="color:#c62828">[필살기]</span> 임박 상품 쟁탈전 사용`);
                tryApplySupportParam(ctx, sState, p.skill2_buff, 'skill2_timer');
                // 도장 2배 효과 체크
                tryApplySupportParam(ctx, sState, p.skill2_stamp_buff, 'skill2_stamp_timer');
            } else if (actionType === 'defend') {
                ctx.log(`[서포터] 비어녹스: <span class="sim-log-tag" style="color:#1565c0">[방어]</span>`);
            } else {
                ctx.log(`[서포터] 비어녹스: <span class="sim-log-tag" style="color:#2e7d32">[보통공격]</span> 노동 부하 사용`);
                tryApplySupportParam(ctx, sState, p.skill1_buff, 'skill1_timer');
            }
        },

        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0, "고정공증": 0, "뎀증": 0 };
            
            // 1. 상시 파티 공증 (스킬3)
            bonuses["공증"] += getSupportVal('beernox', 2, '공증', targetCharData);

            // [추가] 나무속성 파티원 조건 체크 (스킬4 뎀증 15%)
            const woodActive = localStorage.getItem('sim_ctrl_beernox_wood_party_active') === 'true';
            if (woodActive) {
                bonuses["뎀증"] += getSupportVal('beernox', 3, '뎀증', targetCharData);
            }

            // 2. 비어녹스 본인의 기초 공격력 계산
            const supportStats = state.savedStats['beernox'] || { lv: 1, s1: 0, s2: 0 };
            const baseResult = calculateBaseStats(charData['beernox'].base, parseInt(supportStats.lv || 1), parseInt(supportStats.s1 || 0), parseInt(supportStats.s2 || 0), constants.defaultGrowth);
            const initialBaseAtk = baseResult["공격력"];
            
            // 실시간 기초공증(%) 합산
            let baseAtkBoostRate = 0;
            if (parseInt(supportStats.s1 || 0) >= 50) baseAtkBoostRate += getSupportVal('beernox', 5, '기초공증');
            if (sState.skill7_stacks) {
                baseAtkBoostRate += sState.skill7_stacks * getSupportVal('beernox', 6, '기초공증');
            }
            
            const currentBaseAtk = initialBaseAtk * (1 + baseAtkBoostRate / 100);

            // 3. 고정공증 합산
            if (sState.skill1_timer > 0) {
                bonuses["고정공증"] += currentBaseAtk * (getSupportVal('beernox', 0, 0) / 100);
            }
            if (sState.skill2_timer > 0) {
                bonuses["고정공증"] += currentBaseAtk * (getSupportVal('beernox', 1, 0) / 100);
            }
            if (sState.skill2_stamp_timer > 0) {
                bonuses["고정공증"] += currentBaseAtk * (getSupportVal('beernox', 1, 0) / 100);
            }
            
            return bonuses;
        }
    }
};

// [공통 함수] 서포터 처리 메인 진입점
export function processSupportTurn(ctx, supportId, supportState) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId]) return;
    supportLogic[supportId].onTurn(ctx, supportState);
}

export function getSupportBonuses(supportId, supportState, targetCharData, ctx) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId]) return {};
    return supportLogic[supportId].getBonuses(supportState, targetCharData, ctx);
}

export function initSupportState(supportId) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId]) return {};
    return supportLogic[supportId].getInitialState();
}
